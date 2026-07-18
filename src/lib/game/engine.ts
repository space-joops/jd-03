import type { GameState, LogKind } from "./types";

/** 라이드셰어 공동 발사 윈도우 간격 (5분) */
export const WINDOW_MS = 5 * 60_000;
/** 발사 시퀀스 길이 */
export const LAUNCH_DURATION_MS = 13_000;
/** 발사 자격: 최소 체중(g) / 최소 훈련도 */
export const LAUNCH_MIN_WEIGHT = 500;
export const LAUNCH_MIN_TRAINING = 30;
/** 부재중 진행 상한 (8시간) */
const OFFLINE_CAP_MS = 8 * 3600_000;

export const ORBIT_STAGES = [
  { name: "궤도 유영체", atKg: 0 },
  { name: "데브리스 이터", atKg: 200 },
  { name: "클리너 노바", atKg: 1000 },
  { name: "가디언 오브 오빗", atKg: 5000 },
] as const;

export const COOLDOWNS: Record<string, number> = {
  incubate: 3_000,
  feed: 8_000,
  care: 6_000,
  train: 10_000,
  boost: 25_000,
  comm: 20_000,
  supply: 90_000,
};

interface DebrisType {
  name: string;
  kg: [number, number];
  w: number;
  bonus?: "speed" | "pull" | "prop";
}

const DEBRIS_TABLE: DebrisType[] = [
  { name: "페인트 조각 무리", kg: [2, 6], w: 28 },
  { name: "볼트·너트 파편", kg: [4, 10], w: 24 },
  { name: "다층단열재(MLI) 조각", kg: [6, 14], w: 14 },
  { name: "페어링 잔해", kg: [15, 40], w: 12, bonus: "speed" },
  { name: "폐기된 큐브샛", kg: [25, 60], w: 10, bonus: "pull" },
  { name: "로켓 상단부 연료탱크", kg: [80, 150], w: 6, bonus: "prop" },
  { name: "수수께끼의 파편", kg: [50, 120], w: 4 },
  { name: "낡은 기상위성", kg: [200, 400], w: 2, bonus: "pull" },
];

const DEBRIS_TOTAL_W = DEBRIS_TABLE.reduce((a, d) => a + d.w, 0);

function pickDebris(): DebrisType {
  let r = Math.random() * DEBRIS_TOTAL_W;
  for (const d of DEBRIS_TABLE) {
    r -= d.w;
    if (r <= 0) return d;
  }
  return DEBRIS_TABLE[0];
}

function pushLog(s: GameState, msg: string, kind: LogKind = "info") {
  s.log.unshift({ t: s.lastTick, msg, kind });
  if (s.log.length > 80) s.log.length = 80;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function nextWindow(now: number): number {
  return Math.ceil((now + 1) / WINDOW_MS) * WINDOW_MS;
}

export function canLaunch(s: GameState): boolean {
  return s.weightG >= LAUNCH_MIN_WEIGHT && s.training >= LAUNCH_MIN_TRAINING;
}

export function initialState(name: string, now: number): GameState {
  return {
    v: 1,
    name,
    createdAt: now,
    phase: "egg",
    hatch: 0,
    weightG: 120,
    energy: 60,
    mood: 70,
    training: 0,
    windowAt: null,
    launchT: null,
    launchStep: 0,
    speed: 4,
    pull: 3,
    prop: 60,
    propMax: 100,
    debrisKg: 0,
    stage: 0,
    boostUntil: 0,
    totalEncounters: 0,
    cd: {},
    lastTick: now,
    log: [
      { t: now, msg: "스텔라펫 배양 캡슐이 배정되었습니다.", kind: "sys" },
      { t: now, msg: "알이 도착했습니다. 품어서 부화시켜 주세요.", kind: "info" },
    ],
  };
}

/** 궤도 수확 배율: 기분이 좋을수록 효율 상승 */
const yieldMult = (s: GameState) => 0.6 + s.mood / 200;

/** 초당 잔해 조우 확률 */
function encounterP(s: GameState, now: number): number {
  let p = 0.03 + s.speed * 0.004;
  if (now < s.boostUntil) p *= 4;
  return Math.min(p, 0.9);
}

function gainDebris(s: GameState, d: DebrisType) {
  const base = d.kg[0] + Math.random() * (d.kg[1] - d.kg[0]);
  const kg = Math.round(base * (1 + s.pull * 0.08) * yieldMult(s));
  s.debrisKg += kg;
  s.totalEncounters += 1;
  pushLog(s, `${d.name} 포획! +${kg}kg`, "gain");
  if (d.bonus && Math.random() < 0.35) {
    if (d.bonus === "speed") {
      s.speed += 1;
      pushLog(s, "파편 분석 완료 — 스피드 +1", "evo");
    } else if (d.bonus === "pull") {
      s.pull += 1;
      pushLog(s, "부품 재활용 성공 — 당김 +1", "evo");
    } else {
      const refill = Math.min(30, s.propMax - s.prop);
      s.prop += refill;
      pushLog(s, `잔류 연료 회수 — 추진제 +${Math.round(refill)}`, "evo");
    }
  }
  checkEvolution(s);
}

function checkEvolution(s: GameState) {
  let target = s.stage;
  for (let i = ORBIT_STAGES.length - 1; i >= 0; i--) {
    if (s.debrisKg >= ORBIT_STAGES[i].atKg) {
      target = i;
      break;
    }
  }
  if (target > s.stage) {
    s.stage = target;
    s.speed += 2;
    s.pull += 2;
    s.propMax += 20;
    s.prop = s.propMax;
    pushLog(s, `✨ 진화! 「${ORBIT_STAGES[target].name}」 형태가 되었다!`, "evo");
  }
}

function orbitTick(s: GameState, now: number) {
  // 잔해 조우
  if (Math.random() < encounterP(s, now)) {
    gainDebris(s, pickDebris());
  }
  // 충돌 위기
  if (Math.random() < 0.008) {
    if (s.prop >= 8) {
      s.prop -= 8;
      pushLog(s, "⚠ 고속 파편 접근 — 회피 기동 성공 (추진제 -8)", "warn");
    } else {
      s.mood = clamp(s.mood - 12, 0, 100);
      const loss = Math.min(s.debrisKg, Math.round(5 + Math.random() * 15));
      s.debrisKg -= loss;
      pushLog(s, `💥 파편과 스치는 충돌! 수거물 -${loss}kg, 기분 저하`, "warn");
    }
  }
  // 완만한 기분 저하 (30초에 1)
  if (Math.random() < 1 / 30) s.mood = clamp(s.mood - 1, 0, 100);
}

function groundTick(s: GameState) {
  // 에너지는 10초에 1, 기분은 15초에 1씩 감소
  if (Math.random() < 1 / 10) s.energy = clamp(s.energy - 1, 0, 100);
  if (Math.random() < 1 / 15) s.mood = clamp(s.mood - 1, 0, 100);
}

const LAUNCH_SCRIPT: [number, string, LogKind][] = [
  [0, "📡 발사 시퀀스 개시 — 라이드셰어 파트너 큐브샛 12기 탑재 확인", "sys"],
  [3, "연료 주입 완료. T-5초 카운트다운 시작", "sys"],
  [6, "🚀 리프트오프! 스텔라펫이 하늘을 가른다!", "evo"],
  [9, "MAX-Q 통과… 페어링 분리", "sys"],
  [12, "2단 엔진 정지. 궤도 투입 기동 중…", "sys"],
];

function launchingTick(s: GameState, now: number) {
  const elapsed = now - (s.launchT ?? now);
  while (s.launchStep < LAUNCH_SCRIPT.length && elapsed >= LAUNCH_SCRIPT[s.launchStep][0] * 1000) {
    const [, msg, kind] = LAUNCH_SCRIPT[s.launchStep];
    pushLog(s, msg, kind);
    s.launchStep += 1;
  }
  if (elapsed >= LAUNCH_DURATION_MS) {
    s.phase = "orbit";
    // 지상 육성 결과가 궤도 스탯으로 환산됨
    s.speed = 4 + Math.floor(s.training / 10);
    s.pull = 3 + Math.floor(s.weightG / 250);
    s.prop = Math.round(60 + s.mood / 2);
    s.propMax = 100;
    pushLog(s, "🛰 고도 550km 궤도 안착 성공! 데브리스 수거 임무 개시", "evo");
    pushLog(s, `초기 스탯 — 스피드 ${s.speed} · 당김 ${s.pull} · 추진제 ${Math.round(s.prop)}`, "sys");
  }
}

/** 1초 단위 게임 틱. 새 상태 객체를 반환한다. */
export function tick(prev: GameState, now: number): GameState {
  const s: GameState = { ...prev, cd: { ...prev.cd }, log: [...prev.log] };
  s.lastTick = now;

  if (s.phase === "ground" || s.phase === "egg") groundTick(s);

  if (s.phase === "awaiting" && s.windowAt !== null && now >= s.windowAt) {
    s.phase = "launching";
    s.launchT = now;
    s.launchStep = 0;
  }
  if (s.phase === "launching") launchingTick(s, now);
  if (s.phase === "orbit") orbitTick(s, now);

  return s;
}

/** 부재중 경과 시간을 요약 정산한다. */
export function catchUp(prev: GameState, now: number): GameState {
  const s: GameState = { ...prev, cd: { ...prev.cd }, log: [...prev.log] };
  const elapsed = Math.min(now - s.lastTick, OFFLINE_CAP_MS);
  s.lastTick = now;
  if (elapsed < 60_000) return s;

  const min = Math.round(elapsed / 60_000);

  if (s.phase === "ground" || s.phase === "egg") {
    s.energy = clamp(s.energy - elapsed / 10_000, 5, 100);
    s.mood = clamp(s.mood - elapsed / 15_000, 10, 100);
    pushLog(s, `⏰ 부재중 ${min}분 — 펫이 당신을 기다렸어요 (에너지·기분 감소)`, "sys");
  } else if (s.phase === "awaiting" && s.windowAt !== null && now >= s.windowAt) {
    // 발사 윈도우를 자느라 놓치지 않도록, 부재중이어도 발사·궤도 안착 처리
    s.phase = "orbit";
    s.speed = 4 + Math.floor(s.training / 10);
    s.pull = 3 + Math.floor(s.weightG / 250);
    s.prop = Math.round(60 + s.mood / 2);
    s.propMax = 100;
    pushLog(s, "🚀 부재중 발사 완료 — 궤도 안착에 성공했습니다!", "evo");
  } else if (s.phase === "orbit") {
    const ticks = elapsed / 1000;
    const p = 0.03 + s.speed * 0.004;
    const encounters = Math.floor(ticks * p * (0.8 + Math.random() * 0.4));
    let kg = 0;
    for (let i = 0; i < encounters; i++) {
      const d = pickDebris();
      const base = d.kg[0] + Math.random() * (d.kg[1] - d.kg[0]);
      kg += Math.round(base * (1 + s.pull * 0.08) * yieldMult(s));
    }
    s.debrisKg += kg;
    s.totalEncounters += encounters;
    s.mood = clamp(s.mood - elapsed / 30_000, 20, 100);
    s.prop = clamp(s.prop - ticks * 0.008 * 8, 0, s.propMax);
    pushLog(s, `⏰ 부재중 ${min}분 — 잔해 ${encounters}개 수거 (+${kg}kg)`, "sys");
    checkEvolution(s);
  }
  return s;
}

export type ActionId =
  | "incubate"
  | "feed"
  | "care"
  | "train"
  | "register"
  | "boost"
  | "comm"
  | "supply";

/** 유저 액션 적용. 실패하면 원본 상태를 그대로 반환한다. */
export function act(prev: GameState, action: ActionId, now: number): GameState {
  const readyAt = prev.cd[action] ?? 0;
  if (now < readyAt) return prev;

  const s: GameState = { ...prev, cd: { ...prev.cd }, log: [...prev.log] };
  s.lastTick = now;
  const setCd = () => {
    s.cd[action] = now + (COOLDOWNS[action] ?? 0);
  };

  switch (action) {
    case "incubate": {
      if (s.phase !== "egg") return prev;
      s.hatch += 1;
      setCd();
      if (s.hatch >= 3) {
        s.phase = "ground";
        s.mood = 90;
        pushLog(s, "🐣 알이 부화했다! 아기 스텔라펫이 태어났습니다!", "evo");
        pushLog(s, "체중 500g·훈련 30을 달성하면 발사 등록이 가능합니다.", "sys");
      } else {
        pushLog(s, `알을 따뜻하게 품었다… (${s.hatch}/3)`, "info");
      }
      return s;
    }
    case "feed": {
      if (s.phase !== "ground" && s.phase !== "awaiting") return prev;
      s.energy = clamp(s.energy + 25, 0, 100);
      s.weightG += 40;
      setCd();
      pushLog(s, `우주식량 냠냠! 체중 +40g (현재 ${s.weightG}g)`, "gain");
      return s;
    }
    case "care": {
      if (s.phase !== "ground" && s.phase !== "awaiting") return prev;
      s.mood = clamp(s.mood + 20, 0, 100);
      setCd();
      pushLog(s, "쓰다듬어 주자 기분이 좋아졌다! 기분 +20", "info");
      return s;
    }
    case "train": {
      if (s.phase !== "ground" && s.phase !== "awaiting") return prev;
      if (s.energy < 15) {
        pushLog(s, "에너지가 부족해 훈련할 수 없다… (먹이가 필요)", "warn");
        return s;
      }
      s.energy -= 15;
      s.training = clamp(s.training + 10, 0, 100);
      setCd();
      pushLog(s, `무중력 적응 훈련 완료! 훈련도 +10 (현재 ${s.training})`, "gain");
      return s;
    }
    case "register": {
      if (s.phase !== "ground" || !canLaunch(s)) return prev;
      s.phase = "awaiting";
      s.windowAt = nextWindow(now);
      pushLog(s, "📋 라이드셰어 발사 등록 완료! 공동 발사 윈도우를 기다립니다.", "sys");
      return s;
    }
    case "boost": {
      if (s.phase !== "orbit") return prev;
      if (s.prop < 15) {
        pushLog(s, "추진제가 부족하다… (보급 필요)", "warn");
        return s;
      }
      s.prop -= 15;
      s.boostUntil = now + 12_000;
      setCd();
      pushLog(s, "🔥 추진 분사! 12초간 조우 확률 4배 상승!", "gain");
      return s;
    }
    case "comm": {
      if (s.phase !== "orbit") return prev;
      s.mood = clamp(s.mood + 15, 0, 100);
      setCd();
      pushLog(s, "📡 지상국과 교신 — 펫이 기뻐한다! 기분 +15", "info");
      return s;
    }
    case "supply": {
      if (s.phase !== "orbit") return prev;
      const refill = Math.min(40, s.propMax - s.prop);
      s.prop += refill;
      setCd();
      pushLog(s, `📦 보급 캡슐 도킹 성공 — 추진제 +${Math.round(refill)}`, "gain");
      return s;
    }
    default:
      return prev;
  }
}

/** 자랑 카드 텍스트 생성 */
export function bragCard(s: GameState): string {
  const stage = s.phase === "orbit" ? ORBIT_STAGES[s.stage].name : s.phase === "egg" ? "스텔라 알" : "아기 스텔라펫";
  const days = Math.max(1, Math.ceil((s.lastTick - s.createdAt) / 86_400_000));
  return [
    `🛰 STELLAPET 「${s.name}」`,
    `형태: ${stage}`,
    `누적 수거: ${s.debrisKg.toLocaleString()}kg (잔해 ${s.totalEncounters}개)`,
    `임무 ${days}일차 · 고도 550km`,
    `#스텔라펫 #케슬러신드롬청소반`,
  ].join("\n");
}
