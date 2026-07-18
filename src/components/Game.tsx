"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState, LogKind } from "@/lib/game/types";
import {
  act,
  ActionId,
  bragCard,
  canLaunch,
  catchUp,
  initialState,
  LAUNCH_MIN_TRAINING,
  LAUNCH_MIN_WEIGHT,
  ORBIT_STAGES,
  SALVAGE_PROP_COST,
  settleSortie,
  SORTIE_PROP_COST,
  stageName,
  tick,
  type SortieOutcome,
} from "@/lib/game/engine";
import { clearState, loadState, saveState } from "@/lib/game/storage";
import PixelView from "./PixelView";
import SortieGame from "./SortieGame";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

/** 크롬 계열의 PWA 설치 프롬프트 이벤트 (표준 타입 미제공) */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const LOG_COLORS: Record<LogKind, string> = {
  info: "text-[#c7cde6]",
  gain: "text-[#7ee8a2]",
  warn: "text-[#ff6b6b]",
  evo: "text-[#f4b860]",
  sys: "text-[#7dd3fc]",
};

function fmtRemain(ms: number): string {
  const mm = String(Math.floor(ms / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
  return `${mm}:${ss}`;
}

function stageLabel(s: GameState): string {
  if (s.phase === "egg") return "스텔라 알";
  if (s.phase === "launching") return "발사 중!";
  if (s.phase === "orbit") return stageName(s);
  return "아기 스텔라펫";
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] text-[#8b93b5]">{label}</span>
      <div className="h-3 flex-1 border border-[#1c2440] bg-[#0b0f1e]">
        <div className="h-full seg-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 shrink-0 text-right text-[11px]" style={{ color }}>
        {Math.round(value)}
      </span>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  remainMs,
  disabled,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  remainMs: number;
  disabled?: boolean;
}) {
  const onCd = remainMs > 0;
  return (
    <button
      onClick={onClick}
      disabled={onCd || disabled}
      className="pixel-btn flex flex-col items-center gap-0.5 py-2.5 text-[13px] leading-tight active:translate-y-px disabled:opacity-40"
    >
      <span className="text-lg leading-none">{icon}</span>
      <span>{onCd ? `${Math.ceil(remainMs / 1000)}s` : label}</span>
    </button>
  );
}

function Intro({ onStart }: { onStart: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center gap-6 px-6 py-10">
      <h1 className="text-center text-2xl tracking-widest text-[#7ee8a2]">
        STELLAPET
        <span className="mt-1 block text-xs tracking-normal text-[#8b93b5]">궤도 청소 다마고치</span>
      </h1>
      <div className="space-y-3 border-2 border-[#1c2440] bg-[#0b0f1e] p-4 text-[13px] leading-relaxed text-[#c7cde6]">
        <p className="text-[#7dd3fc]">— 2031년, 케슬러 신드롬 발생 —</p>
        <p>
          연쇄 충돌로 저궤도는 파편의 바다가 되었고, 인류의 우주 진출은 봉쇄되었다.
        </p>
        <p>
          그래서 우리는 <span className="text-[#7ee8a2]">스텔라펫</span>을 만들었다. 우주 쓰레기를
          먹고 자라는 생체 위성. 이제 모든 시민이 한 마리씩 키워 궤도로 보낸다.
        </p>
        <p className="text-[#f4b860]">당신에게 알 하나가 배정되었습니다.</p>
      </div>
      <div className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 10))}
          placeholder="펫 이름 (최대 10자)"
          className="w-full border-2 border-[#1c2440] bg-[#0b0f1e] px-3 py-3 text-center text-base text-[#e8ecff] outline-none placeholder:text-[#5a6284] focus:border-[#7ee8a2]"
        />
        <button
          onClick={() => name.trim() && onStart(name.trim())}
          disabled={!name.trim()}
          className="pixel-btn w-full py-3 text-base disabled:opacity-40"
        >
          🥚 배정받기
        </button>
      </div>
    </main>
  );
}

export default function Game() {
  const [state, setState] = useState<GameState | null>(null);
  const [booted, setBooted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [sortie, setSortie] = useState(false);
  const sortieRef = useRef(false);
  sortieRef.current = sortie;

  // PWA 설치 상태 감지 — 앱 모드로 실행 중이면 설치 버튼을 숨긴다
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);
    if (standalone) setInstalled(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // 부팅: 저장 데이터 로드 + 부재중 정산
  useEffect(() => {
    const saved = loadState();
    if (saved) setState(catchUp(saved, Date.now()));
    setBooted(true);
  }, []);

  // 1초 게임 틱 — 수동 조종 중에는 본편 진행을 멈춘다 (이중 수거 방지)
  useEffect(() => {
    const id = setInterval(() => {
      setState((s) => (s && !sortieRef.current ? tick(s, Date.now()) : s));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // 자동 저장
  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const dispatch = useCallback((a: ActionId) => {
    setState((s) => (s ? act(s, a, Date.now()) : s));
  }, []);

  const brag = useCallback(async () => {
    if (!state) return;
    const card = bragCard(state);
    try {
      await navigator.clipboard.writeText(card);
      showToast("✨ 자랑 카드가 클립보드에 복사됐어요!");
    } catch {
      showToast("클립보드 복사에 실패했어요 😢");
    }
  }, [state, showToast]);

  const reset = useCallback(() => {
    if (confirm("정말 처음부터 다시 키울까요? 지금 펫과는 작별입니다.")) {
      clearState();
      setState(null);
    }
  }, []);

  const endSortie = useCallback((r: SortieOutcome) => {
    setSortie(false);
    setState((s) => (s ? settleSortie(s, r, Date.now()) : s));
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const install = useCallback(async () => {
    if (installEvt) {
      await installEvt.prompt();
      await installEvt.userChoice;
      // 프롬프트는 1회용 — 수락/거절과 무관하게 비운다
      setInstallEvt(null);
      return;
    }
    // 프롬프트를 못 받는 환경: 플랫폼별 설치 방법 안내
    const ua = navigator.userAgent;
    const isIos =
      /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    showToast(
      isIos
        ? "Safari 공유 버튼 → '홈 화면에 추가'로 설치하세요!"
        : "크롬·엣지(HTTPS)에서 주소창의 설치 아이콘으로 설치할 수 있어요",
    );
  }, [installEvt, showToast]);

  if (!booted) return null;
  if (!state) {
    return <Intro onStart={(name) => setState(initialState(name, Date.now()))} />;
  }

  const now = state.lastTick;
  const cd = (a: string) => Math.max(0, (state.cd[a] ?? 0) - now);
  const nextStage = ORBIT_STAGES[state.stage + 1];

  const startSortie = () => {
    if (state.phase !== "orbit" || sortie) return;
    if (cd("sortie") > 0 || state.prop < SORTIE_PROP_COST) return;
    dispatch("sortie");
    setSortie(true);
    // 지원 브라우저에선 네이티브 전체화면까지 — 클릭 제스처 안에서 호출해야 한다
    try {
      document.documentElement.requestFullscreen?.()?.catch(() => {});
    } catch {
      // iOS Safari 등 미지원 환경 — CSS 오버레이만으로 충분
    }
  };

  return (
    <main className="mx-auto flex h-dvh max-w-[420px] flex-col gap-2 overflow-y-auto px-3 pb-3 pt-4">
      {/* 헤더 */}
      <header className="flex shrink-0 items-baseline justify-between px-1">
        <h1 className="text-sm tracking-widest text-[#7ee8a2]">STELLAPET</h1>
        <div className="text-right">
          <span className="text-base text-[#e8ecff]">{state.name}</span>
          <span className="ml-2 text-[11px] text-[#f4b860]">{stageLabel(state)}</span>
        </div>
      </header>

      {/* 수동 조종 미니게임 — 전체 화면 오버레이 */}
      {sortie && state.phase === "orbit" && <SortieGame state={state} onEnd={endSortie} />}

      {/* 픽셀 뷰 */}
      <div className="relative shrink-0 border-2 border-[#1c2440] bg-[#05060f]">
        <PixelView state={state} />
        {state.phase === "orbit" && !sortie && (
          <div className="absolute left-2 top-2 text-[11px] leading-4 text-[#7dd3fc]">
            <div>ALT 550km</div>
            <div className="text-[#7ee8a2]">{state.debrisKg.toLocaleString()}kg 수거</div>
          </div>
        )}
        {toast && (
          <div className="absolute inset-x-4 top-2 border border-[#f4b860] bg-[#0b0f1e]/95 px-3 py-2 text-center text-[12px] text-[#f4b860]">
            {toast}
          </div>
        )}
      </div>

      {/* 상태 패널 */}
      <section className="shrink-0 space-y-1.5 border-2 border-[#1c2440] bg-[#0b0f1e] p-3">
        {(state.phase === "egg" || state.phase === "ground" || state.phase === "awaiting") && (
          <>
            {state.phase === "egg" ? (
              <p className="text-[13px] text-[#c7cde6]">
                🥚 알 품기 <span className="text-[#f4b860]">{state.hatch}/3</span> — 품어주기를 눌러
                부화시키세요
              </p>
            ) : (
              <div className="flex justify-between text-[12px] text-[#c7cde6]">
                <span>
                  체중 <span className="text-[#7ee8a2]">{state.weightG}g</span>
                  <span className="text-[#5a6284]"> / {LAUNCH_MIN_WEIGHT}g</span>
                </span>
                <span>
                  훈련 <span className="text-[#7ee8a2]">{state.training}</span>
                  <span className="text-[#5a6284]"> / {LAUNCH_MIN_TRAINING}</span>
                </span>
              </div>
            )}
            <Bar label="에너지" value={state.energy} max={100} color="#f4b860" />
            <Bar label="기분" value={state.mood} max={100} color="#ef8fb8" />
            {state.phase === "awaiting" && state.windowAt !== null && (
              <p className="pt-1 text-center text-[13px] text-[#7dd3fc]">
                🚀 공동 발사 윈도우까지{" "}
                <span className="text-base text-[#f4b860]">
                  T-{fmtRemain(Math.max(0, state.windowAt - now))}
                </span>
              </p>
            )}
          </>
        )}

        {state.phase === "launching" && (
          <p className="text-center text-[13px] text-[#f4b860]">🚀 발사 시퀀스 진행 중…</p>
        )}

        {state.phase === "orbit" && (
          <>
            <div className="flex justify-between text-[12px] text-[#c7cde6]">
              <span>
                누적 수거 <span className="text-base text-[#7ee8a2]">{state.debrisKg.toLocaleString()}kg</span>
              </span>
              <span className="text-[#8b93b5]">잔해 {state.totalEncounters}개</span>
            </div>
            <div className="flex gap-2 text-[11px]">
              <span className="border border-[#1c2440] px-1.5 py-0.5 text-[#7dd3fc]">
                스피드 {state.speed}
              </span>
              <span className="border border-[#1c2440] px-1.5 py-0.5 text-[#7dd3fc]">
                당김 {state.pull}
              </span>
              {now < state.boostUntil && (
                <span className="border border-[#f4b860] px-1.5 py-0.5 text-[#f4b860] blink">
                  부스트!
                </span>
              )}
              {now < state.meteorUntil && (
                <span className="border border-[#f4b860] px-1.5 py-0.5 text-[#f4b860] blink">
                  ☄ 유성우
                </span>
              )}
              {now < state.flareUntil && (
                <span className="border border-[#ff6b6b] px-1.5 py-0.5 text-[#ff6b6b] blink">
                  🌞 플레어
                </span>
              )}
            </div>
            <Bar label="추진제" value={state.prop} max={state.propMax} color="#7dd3fc" />
            <Bar label="기분" value={state.mood} max={100} color="#ef8fb8" />
            {nextStage && (
              <Bar
                label="진화"
                value={state.debrisKg}
                max={nextStage.atKg}
                color="#f4b860"
              />
            )}
          </>
        )}
      </section>

      {/* 발사 등록 배너 */}
      {state.phase === "ground" && canLaunch(state) && (
        <button
          onClick={() => dispatch("register")}
          className="pixel-btn-accent w-full shrink-0 py-3 text-[14px] blink"
        >
          🚀 라이드셰어 발사 등록 (다음 윈도우 탑승)
        </button>
      )}

      {/* 대형 잔해 견인 배너 */}
      {state.phase === "orbit" && state.offer && !sortie && (
        <button
          onClick={() => dispatch("salvage")}
          disabled={state.prop < SALVAGE_PROP_COST}
          className="pixel-btn-accent w-full shrink-0 py-2.5 text-[13px] leading-snug disabled:opacity-40"
        >
          🪝 {state.offer.name} 견인! (약 {state.offer.kg}kg · 추진제 -{SALVAGE_PROP_COST}) ·{" "}
          {Math.ceil(Math.max(0, state.offer.expiresAt - now) / 1000)}s
        </button>
      )}

      {/* 이벤트 로그 */}
      <section className="min-h-[96px] flex-1 overflow-y-auto border-2 border-[#1c2440] bg-[#070a16] p-2.5">
        {state.log.map((e, i) => (
          <p key={`${e.t}-${i}`} className={`mb-1 text-[12px] leading-snug ${LOG_COLORS[e.kind]}`}>
            <span className="text-[#3a4468]">▸ </span>
            {e.msg}
          </p>
        ))}
      </section>

      {/* 액션 버튼 */}
      <nav
        className={`grid shrink-0 gap-2 ${
          state.phase === "orbit" && !sortie ? "grid-cols-5" : "grid-cols-4"
        }`}
      >
        {state.phase === "egg" && (
          <div className="col-span-4">
            <ActionButton label="품어주기" icon="🥚" onClick={() => dispatch("incubate")} remainMs={cd("incubate")} />
          </div>
        )}
        {(state.phase === "ground" || state.phase === "awaiting") && (
          <>
            <ActionButton label="먹이" icon="🍙" onClick={() => dispatch("feed")} remainMs={cd("feed")} />
            <ActionButton label="보살핌" icon="💚" onClick={() => dispatch("care")} remainMs={cd("care")} />
            <ActionButton label="훈련" icon="🏋️" onClick={() => dispatch("train")} remainMs={cd("train")} />
            <ActionButton label="자랑" icon="✨" onClick={brag} remainMs={0} />
          </>
        )}
        {state.phase === "launching" && (
          <p className="col-span-4 py-3 text-center text-[12px] text-[#8b93b5]">
            관제탑에 모든 것을 맡기세요…
          </p>
        )}
        {state.phase === "orbit" && sortie && (
          <p className="col-span-4 py-3 text-center text-[12px] text-[#8b93b5]">
            🕹 화면을 누르면 조그셔틀 — 드래그 거리로 3단 분사!
          </p>
        )}
        {state.phase === "orbit" && !sortie && (
          <>
            <ActionButton
              label="조종"
              icon="🕹"
              onClick={startSortie}
              remainMs={cd("sortie")}
              disabled={state.prop < SORTIE_PROP_COST}
            />
            <ActionButton label="부스트" icon="🔥" onClick={() => dispatch("boost")} remainMs={cd("boost")} />
            <ActionButton label="교신" icon="📡" onClick={() => dispatch("comm")} remainMs={cd("comm")} />
            <ActionButton label="보급" icon="📦" onClick={() => dispatch("supply")} remainMs={cd("supply")} />
            <ActionButton label="자랑" icon="✨" onClick={brag} remainMs={0} />
          </>
        )}
      </nav>

      {/* 푸터 */}
      <footer className="flex shrink-0 justify-between px-1 text-[10px] text-[#3a4468]">
        <span>
          KESSLER CLEANUP INITIATIVE <span className="text-[#2a3350]">v{APP_VERSION}</span>
        </span>
        <span className="flex gap-3">
          {!installed && (
            <button onClick={install} className="underline">
              앱 설치
            </button>
          )}
          <button onClick={reset} className="underline">
            초기화
          </button>
        </span>
      </footer>
    </main>
  );
}
