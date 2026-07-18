"use client";

// ============================================================================
// /rank — 궤도 청소 리더보드
//
// 탭 3개: 이번 주 신기록 / 누적 수거량 / 명예의 전당.
// 캐릭터를 클릭하면 해당 펫의 업적 모달, 내 순위는 랭크 카드로 자랑 가능.
// 읽기는 비로그인도 가능(도전장 방문자 열람용), 쓰기는 게임 쪽 동의 후 동기화.
// ============================================================================

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Branch, GameState } from "@/lib/game/types";
import { STAGE_NAMES, weekKey } from "@/lib/game/engine";
import { kgAnalogy, shareRankImage } from "@/lib/game/bragImage";
import {
  fetchHallOfFame,
  fetchMyRanks,
  fetchTotalTop,
  fetchWeeklyTop,
  getConsent,
  leaderboardEnabled,
  myUid,
  setConsent,
  syncLeaderboard,
  type LbHallRow,
  type LbPet,
  type LbWeeklyRow,
} from "@/lib/game/leaderboard";
import { loadState } from "@/lib/game/storage";
import { ORBIT_SPRITES, drawSprite, spriteH, spriteW } from "@/lib/game/sprites";

const BRANCH_COLORS: Record<Branch, string> = {
  balanced: "#7ee8a2",
  speed: "#7dd3fc",
  pull: "#c4b5fd",
};

const stageLabel = (stage: number, branch: Branch) =>
  STAGE_NAMES[branch]?.[Math.min(stage, 3)] ?? STAGE_NAMES.balanced[0];

function SpriteIcon({ stage, size }: { stage: number; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const sprite = ORBIT_SPRITES[Math.min(Math.max(stage, 0), ORBIT_SPRITES.length - 1)];
    const px = 48; // 논리 해상도 — CSS로 확대해 도트 유지
    c.width = px;
    c.height = px;
    const sc = Math.max(1, Math.floor(px / Math.max(spriteW(sprite), spriteH(sprite))));
    ctx.clearRect(0, 0, px, px);
    drawSprite(
      ctx,
      sprite,
      Math.round((px - spriteW(sprite) * sc) / 2),
      Math.round((px - spriteH(sprite) * sc) / 2),
      sc,
    );
  }, [stage]);
  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      aria-hidden
    />
  );
}

const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}`);

type Tab = "weekly" | "total" | "hall";

/** 업적 모달에 띄울 공통 형태 */
interface Achievement {
  name: string;
  stage: number;
  branch: Branch;
  debrisKg?: number;
  encounters?: number;
  sortieBestKg?: number;
  missionStartedAt?: string | null;
  weeklyKg?: number;
  weekLabel?: string;
}

export default function RankPage() {
  const [tab, setTab] = useState<Tab>("weekly");
  const [weekly, setWeekly] = useState<LbWeeklyRow[] | null>(null);
  const [total, setTotal] = useState<LbPet[] | null>(null);
  const [hall, setHall] = useState<LbHallRow[] | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [me, setMe] = useState<GameState | null>(null);
  const [ranks, setRanks] = useState<{ weekly: number | null; total: number | null }>({
    weekly: null,
    total: null,
  });
  const [detail, setDetail] = useState<Achievement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [w, t, h, u] = await Promise.all([
      fetchWeeklyTop(),
      fetchTotalTop(),
      fetchHallOfFame(),
      myUid(),
    ]);
    setWeekly(w);
    setTotal(t);
    setHall(h);
    setUid(u);
    const saved = loadState();
    setMe(saved);
    if (saved && getConsent() === true) setRanks(await fetchMyRanks(saved));
  }, []);

  useEffect(() => {
    if (leaderboardEnabled) void reload();
  }, [reload]);

  const join = useCallback(async () => {
    const saved = loadState();
    if (!saved || saved.phase !== "orbit") {
      setNotice("궤도에 도착한 펫만 참가할 수 있어요. 먼저 펫을 궤도로 보내세요!");
      return;
    }
    setConsent(true);
    setNotice("동기화 중…");
    const ok = await syncLeaderboard(saved);
    setNotice(ok ? null : "동기화에 실패했어요. 잠시 후 다시 시도해 주세요.");
    if (ok) void reload();
  }, [reload]);

  const bragRank = useCallback(
    async (board: "weekly" | "total") => {
      if (!me) return;
      const rank = board === "weekly" ? ranks.weekly : ranks.total;
      if (!rank) return;
      try {
        const how = await shareRankImage(me, rank, board);
        if (how === "copied") setNotice("📸 랭크 카드가 클립보드에 복사됐어요!");
        else if (how === "downloaded") setNotice("📸 랭크 카드를 저장했어요!");
        else setNotice(null);
      } catch {
        setNotice("카드 생성에 실패했어요 😢");
      }
    },
    [me, ranks],
  );

  if (!leaderboardEnabled) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col items-center justify-center gap-4 px-6 text-center text-[13px] text-[#8b93b5]">
        <p>리더보드가 아직 설정되지 않았습니다.</p>
        <Link href="/" className="underline text-[#7ee8a2]">
          ← 게임으로
        </Link>
      </main>
    );
  }

  const consent = typeof window !== "undefined" ? getConsent() : null;
  const currentWeek = weekKey(Date.now());

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col gap-3 px-3 pb-6 pt-4">
      <header className="flex items-baseline justify-between px-1">
        <Link href="/" className="text-[12px] text-[#8b93b5] underline">
          ← 게임으로
        </Link>
        <h1 className="text-sm tracking-widest text-[#7ee8a2]">🏅 궤도 청소 리더보드</h1>
      </header>

      {/* 내 순위 */}
      <section className="space-y-2 border-2 border-[#1c2440] bg-[#0b0f1e] p-3 text-[12px]">
        {me && me.phase === "orbit" && consent === true ? (
          <>
            <div className="flex items-center gap-2">
              <SpriteIcon stage={me.stage} size={34} />
              <span className="text-[#e8ecff]">{me.name}</span>
              <span style={{ color: BRANCH_COLORS[me.branch] }}>
                「{stageLabel(me.stage, me.branch)}」
              </span>
            </div>
            <div className="flex gap-2">
              <span className="flex-1 border border-[#1c2440] px-2 py-1.5 text-[#c7cde6]">
                주간 신기록{" "}
                <b className="text-[#ffd166]">{ranks.weekly ? `#${ranks.weekly}` : "—"}</b>
                {ranks.weekly && (
                  <button onClick={() => bragRank("weekly")} className="ml-2 underline text-[#7dd3fc]">
                    자랑
                  </button>
                )}
              </span>
              <span className="flex-1 border border-[#1c2440] px-2 py-1.5 text-[#c7cde6]">
                누적 <b className="text-[#ffd166]">{ranks.total ? `#${ranks.total}` : "—"}</b>
                {ranks.total && (
                  <button onClick={() => bragRank("total")} className="ml-2 underline text-[#7dd3fc]">
                    자랑
                  </button>
                )}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#8b93b5]">
              {me ? "아직 리더보드에 참가하지 않았어요." : "키우는 펫이 없어요. 게임에서 알을 받아보세요!"}
            </span>
            {me && (
              <button onClick={join} className="pixel-btn-accent shrink-0 px-2.5 py-1.5 text-[12px]">
                참가하기
              </button>
            )}
          </div>
        )}
        {notice && <p className="text-[#f4b860]">{notice}</p>}
      </section>

      {/* 탭 */}
      <nav className="grid grid-cols-3 gap-1 text-[12px]">
        {(
          [
            ["weekly", `🕹 주간 신기록`],
            ["total", "🛰 누적 수거량"],
            ["hall", "🏛 명예의 전당"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-2 px-1 py-2 ${
              tab === t
                ? "border-[#7ee8a2] text-[#7ee8a2]"
                : "border-[#1c2440] text-[#8b93b5]"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "weekly" && (
        <p className="px-1 text-[11px] text-[#5a6284]">
          {currentWeek} · 매주 월요일(KST) 리셋 — 30초 수동 조종 최고 기록
        </p>
      )}

      {/* 리스트 */}
      <section className="flex-1 space-y-1.5">
        {tab === "weekly" &&
          (weekly === null ? (
            <p className="py-8 text-center text-[12px] text-[#5a6284]">불러오는 중…</p>
          ) : weekly.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-[#5a6284]">
              이번 주 기록이 아직 없어요. 첫 1위의 주인공이 되어보세요!
            </p>
          ) : (
            weekly.map((r, i) => (
              <button
                key={r.pet_id}
                onClick={() =>
                  r.pet &&
                  setDetail({
                    name: r.pet.name,
                    stage: r.pet.stage,
                    branch: r.pet.branch,
                    debrisKg: r.pet.debris_kg,
                    encounters: r.pet.total_encounters,
                    sortieBestKg: r.pet.sortie_best_kg,
                    missionStartedAt: r.pet.mission_started_at,
                    weeklyKg: r.best_kg,
                    weekLabel: r.week,
                  })
                }
                className={`flex w-full items-center gap-2 border-2 bg-[#0b0f1e] px-2 py-1.5 text-left text-[12px] ${
                  r.pet_id === uid ? "border-[#ffd166]" : "border-[#1c2440]"
                }`}
              >
                <span className="w-7 shrink-0 text-center text-[13px]">{medal(i + 1)}</span>
                <SpriteIcon stage={r.pet?.stage ?? 0} size={30} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-[#e8ecff]">{r.pet?.name ?? "???"}</span>{" "}
                  <span style={{ color: BRANCH_COLORS[r.pet?.branch ?? "balanced"] }}>
                    {stageLabel(r.pet?.stage ?? 0, r.pet?.branch ?? "balanced")}
                  </span>
                </span>
                <span className="shrink-0 text-[#7ee8a2]">{r.best_kg.toLocaleString()}kg</span>
              </button>
            ))
          ))}

        {tab === "total" &&
          (total === null ? (
            <p className="py-8 text-center text-[12px] text-[#5a6284]">불러오는 중…</p>
          ) : total.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-[#5a6284]">아직 참가한 펫이 없어요.</p>
          ) : (
            total.map((p, i) => (
              <button
                key={p.id}
                onClick={() =>
                  setDetail({
                    name: p.name,
                    stage: p.stage,
                    branch: p.branch,
                    debrisKg: p.debris_kg,
                    encounters: p.total_encounters,
                    sortieBestKg: p.sortie_best_kg,
                    missionStartedAt: p.mission_started_at,
                  })
                }
                className={`flex w-full items-center gap-2 border-2 bg-[#0b0f1e] px-2 py-1.5 text-left text-[12px] ${
                  p.id === uid ? "border-[#ffd166]" : "border-[#1c2440]"
                }`}
              >
                <span className="w-7 shrink-0 text-center text-[13px]">{medal(i + 1)}</span>
                <SpriteIcon stage={p.stage} size={30} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-[#e8ecff]">{p.name}</span>{" "}
                  <span style={{ color: BRANCH_COLORS[p.branch] }}>
                    {stageLabel(p.stage, p.branch)}
                  </span>
                </span>
                <span className="shrink-0 text-[#7ee8a2]">{p.debris_kg.toLocaleString()}kg</span>
              </button>
            ))
          ))}

        {tab === "hall" &&
          (hall === null ? (
            <p className="py-8 text-center text-[12px] text-[#5a6284]">불러오는 중…</p>
          ) : hall.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-[#5a6284]">
              아직 기록된 주가 없어요. 이번 주 1위가 첫 전당의 주인공!
            </p>
          ) : (
            hall.map((h) => (
              <div
                key={h.week}
                className="flex w-full items-center gap-2 border-2 border-[#1c2440] bg-[#0b0f1e] px-2 py-1.5 text-[12px]"
              >
                <span className="w-16 shrink-0 text-[#7dd3fc]">{h.week}</span>
                <SpriteIcon stage={h.stage} size={30} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-[#ffd166]">👑 {h.name}</span>{" "}
                  <span style={{ color: BRANCH_COLORS[h.branch] }}>
                    {stageLabel(h.stage, h.branch)}
                  </span>
                </span>
                <span className="shrink-0 text-[#7ee8a2]">{h.best_kg.toLocaleString()}kg</span>
              </div>
            ))
          ))}
      </section>

      {/* 업적 모달 */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-[340px] space-y-3 border-2 p-4"
            style={{ borderColor: BRANCH_COLORS[detail.branch], backgroundColor: "#0b0f1e" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <SpriteIcon stage={detail.stage} size={64} />
              <div>
                <p className="text-base text-[#e8ecff]">{detail.name}</p>
                <p className="text-[13px]" style={{ color: BRANCH_COLORS[detail.branch] }}>
                  「{stageLabel(detail.stage, detail.branch)}」
                </p>
              </div>
            </div>
            <ul className="space-y-1 text-[12px] text-[#c7cde6]">
              {detail.weeklyKg !== undefined && (
                <li>
                  🕹 이번 주 신기록 <b className="text-[#7ee8a2]">{detail.weeklyKg.toLocaleString()}kg</b>
                </li>
              )}
              {detail.sortieBestKg !== undefined && detail.sortieBestKg > 0 && (
                <li>
                  🏆 역대 수동 조종 최고{" "}
                  <b className="text-[#7ee8a2]">{detail.sortieBestKg.toLocaleString()}kg</b>
                </li>
              )}
              {detail.debrisKg !== undefined && (
                <li>
                  🛰 누적 수거 <b className="text-[#7ee8a2]">{detail.debrisKg.toLocaleString()}kg</b>
                  <span className="text-[#8b93b5]"> — {kgAnalogy(detail.debrisKg)} 분량</span>
                </li>
              )}
              {detail.encounters !== undefined && <li>🧲 잔해 {detail.encounters.toLocaleString()}개 처리</li>}
              {detail.missionStartedAt && (
                <li>
                  🚀 임무{" "}
                  {Math.max(
                    1,
                    Math.ceil((Date.now() - new Date(detail.missionStartedAt).getTime()) / 86_400_000),
                  )}
                  일차
                </li>
              )}
            </ul>
            <button
              onClick={() => setDetail(null)}
              className="pixel-btn w-full py-2 text-[12px]"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      <footer className="px-1 text-center text-[10px] text-[#3a4468]">
        KESSLER CLEANUP INITIATIVE — WEEKLY RANKING
      </footer>
    </main>
  );
}
