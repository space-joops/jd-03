// ============================================================================
// sound.ts — Web Audio 신시사이저 (jd-02 사운드 시스템 참조)
//
// 오디오 파일 0개: 모든 소리는 오실레이터로 즉석에서 합성한다.
// 사운드 문법: 음이 올라가면 긍정, 내려가면 부정.
//             부드러운 파형(triangle)은 좋은 일, 거친 파형(sawtooth)은 나쁜 일.
//
// 브라우저 자동재생 정책: AudioContext 생성/재개는 반드시 사용자 제스처 안에서
// ensureAudio()로 한다. 실패하면 조용히 무음 — 게임을 절대 막지 않는다.
// ============================================================================

import type { LogKind } from "./types";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const MUTE_KEY = "stellapet-muted";

let audio: AudioContext | null = null;
let audioUnlocked = false;
let muted = false;

/** 부팅 시 1회: 저장된 뮤트 설정을 불러온다. */
export function initSound(): void {
  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    // 저장소 접근 실패는 무시
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  if (muted) updateThrustSound(0);
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    // ignore
  }
}

/** 사용자 제스처 핸들러 안에서 호출: 오디오를 켜거나 잠든 컨텍스트를 깨운다. */
export function ensureAudio(): void {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext!)();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    audio = null; // 미지원 환경 — 이후 재생 함수들이 전부 조용히 빠져나간다.
  }
}

/** 첫 터치/클릭에서 오디오 락을 확실히 푼다 (iOS Safari 대응, jd-02 방식). */
export function initAudioListener(): void {
  if (typeof window === "undefined") return;
  const unlock = () => {
    if (audioUnlocked) return;
    try {
      ensureAudio();
      if (!audio) return;
      // 더미 무음 오실레이터로 모바일 오디오 락 해제
      const osc = audio.createOscillator();
      const g = audio.createGain();
      g.gain.value = 0;
      osc.connect(g).connect(audio.destination);
      osc.start(0);
      osc.stop(audio.currentTime + 0.05);
      audioUnlocked = true;
    } catch {
      // 무시
    }
  };
  window.addEventListener("touchstart", unlock, { once: true, capture: true });
  window.addEventListener("touchend", unlock, { once: true, capture: true });
  window.addEventListener("click", unlock, { once: true, capture: true });
}

/**
 * 짧은 "삐" 하나를 합성한다. 주파수를 from→to로 지수 곡선으로 미끄러뜨리고
 * 음량도 지수로 감쇠시킨다 (귀는 로그 스케일로 듣는다).
 */
function chirp(
  type: OscillatorType,
  from: number,
  to: number,
  dur: number,
  gain = 0.06,
  delay = 0,
): void {
  if (!audio || muted) return;
  try {
    const t0 = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    // 실패하면 그냥 무음
  }
}

// ----------------------------------------------------------------------------
// 본편 — 이벤트 로그 kind별 공통 사운드
// 액션 성공·궤도 이벤트·진화 등 모든 사건은 로그를 남기므로, 이 매핑 하나로
// 게임 전 분야가 커버된다.
// ----------------------------------------------------------------------------

/** 획득(gain): 8-bit 코인 — 음 2개가 짧게 오른다 */
function playGain(): void {
  chirp("square", 988, 988, 0.05, 0.045);
  chirp("square", 1318, 1318, 0.14, 0.045, 0.05);
}

/** 경고(warn): 곤두박질치는 거친 버즈 */
function playWarn(): void {
  chirp("sawtooth", 220, 70, 0.22, 0.07);
  chirp("square", 260, 90, 0.25, 0.05);
}

/** 진화·대사건(evo): 상승 아르페지오 팡파르 */
function playEvo(): void {
  const notes = [523, 659, 784, 1046, 1318];
  notes.forEach((f, i) => {
    chirp("triangle", f, f, 0.16, 0.055, i * 0.07);
    chirp("square", f, f, 0.1, 0.02, i * 0.07);
  });
}

/** 시스템(sys): 관제 무전 비프 */
function playSys(): void {
  chirp("triangle", 880, 880, 0.06, 0.035);
  chirp("triangle", 1175, 1175, 0.08, 0.03, 0.07);
}

/** 정보(info): 아주 작은 블립 */
function playInfo(): void {
  chirp("triangle", 660, 720, 0.06, 0.03);
}

const LOG_SOUNDS: Record<LogKind, () => void> = {
  gain: playGain,
  warn: playWarn,
  evo: playEvo,
  sys: playSys,
  info: playInfo,
};

/** 새 로그 kind 우선순위 — 한 틱에 여러 로그가 쌓이면 가장 높은 것 하나만 울린다 */
export const LOG_SOUND_PRIORITY: Record<LogKind, number> = {
  evo: 5,
  gain: 4,
  warn: 3,
  sys: 2,
  info: 1,
};

export function playLogSound(kind: LogKind): void {
  LOG_SOUNDS[kind]();
}

// ----------------------------------------------------------------------------
// 개별 연출음
// ----------------------------------------------------------------------------

/** UI 잔손질(자랑·설치·복귀 등 로그 없는 버튼): 짧은 탭 */
export function playTap(): void {
  chirp("square", 700, 700, 0.04, 0.03);
}

/** 발사 리프트오프: 낮게 우르릉거리는 럼블 */
export function playLaunch(): void {
  chirp("sawtooth", 55, 28, 1.2, 0.09);
  chirp("square", 90, 40, 1.0, 0.06);
  chirp("sawtooth", 140, 60, 0.8, 0.04, 0.15);
}

// ----------------------------------------------------------------------------
// 미니게임 (jd-02 이식)
// ----------------------------------------------------------------------------

/** 먹이 획득: 코인 사운드 */
export function playEat(): void {
  chirp("square", 988, 988, 0.05, 0.04);
  chirp("square", 1318, 1318, 0.13, 0.04, 0.05);
}

/** 파편 피격: 빠르게 곤두박질치는 두 파형 믹스 */
export function playHit(): void {
  chirp("sawtooth", 150, 40, 0.2, 0.09);
  chirp("square", 200, 50, 0.25, 0.07);
}

/** 연료 셀 획득: 파워업 아르페지오 (jd-02 fuelUp) */
export function playFuelUp(): void {
  const notes = [261, 329, 392, 523, 659, 783];
  notes.forEach((f, i) => chirp("square", f, f, 0.1, 0.035, i * 0.04));
}

/** 연료 소진: 시동 꺼지는 하강음 */
export function playFuelEmpty(): void {
  chirp("sawtooth", 330, 110, 0.35, 0.06);
  chirp("square", 392, 130, 0.4, 0.04, 0.05);
}

/** 출격: 상승 휘리릭 */
export function playSortieStart(): void {
  chirp("sawtooth", 180, 620, 0.35, 0.05);
  chirp("square", 360, 900, 0.3, 0.03, 0.08);
}

/** 복귀: 마무리 징글 */
export function playSortieEnd(): void {
  chirp("triangle", 784, 784, 0.12, 0.05);
  chirp("triangle", 988, 988, 0.12, 0.05, 0.11);
  chirp("triangle", 1318, 1318, 0.22, 0.05, 0.22);
}

let thrustNode: OscillatorNode | null = null;
let thrustGain: GainNode | null = null;

/** 추진 엔진음: 낮은 사각파 루프 — level 0 정지, 1~3 분사 단계 */
export function updateThrustSound(level: number): void {
  if (!audio) return;
  try {
    if (!thrustNode || !thrustGain) {
      if (level === 0) return;
      thrustGain = audio.createGain();
      thrustGain.gain.value = 0;
      thrustGain.connect(audio.destination);
      thrustNode = audio.createOscillator();
      thrustNode.type = "square";
      thrustNode.frequency.value = 50;
      thrustNode.connect(thrustGain);
      thrustNode.start();
    }
    const on = level > 0 && !muted;
    thrustGain.gain.setTargetAtTime(on ? 0.012 + level * 0.012 : 0, audio.currentTime, 0.1);
    thrustNode.frequency.setTargetAtTime(40 + level * 20, audio.currentTime, 0.1);
  } catch {
    // 무음
  }
}
