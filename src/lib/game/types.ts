export type Phase = "egg" | "ground" | "awaiting" | "launching" | "orbit";

export type LogKind = "info" | "gain" | "warn" | "evo" | "sys";

export interface LogEntry {
  t: number;
  msg: string;
  kind: LogKind;
}

export interface GameState {
  v: 1;
  name: string;
  createdAt: number;
  phase: Phase;

  /** 알 품기 진행도 (0~3) */
  hatch: number;

  /** 지상 육성 스탯 */
  weightG: number;
  energy: number; // 0~100
  mood: number; // 0~100
  training: number; // 0~100

  /** 등록된 발사 윈도우 시각 (epoch ms) */
  windowAt: number | null;
  /** 발사 시퀀스 시작 시각 */
  launchT: number | null;
  /** 발사 시퀀스 로그 진행 단계 */
  launchStep: number;

  /** 궤도 스탯 */
  speed: number;
  pull: number;
  prop: number;
  propMax: number;
  debrisKg: number;
  stage: number; // 궤도 진화 단계 인덱스
  boostUntil: number;
  totalEncounters: number;

  /** 액션별 쿨다운 만료 시각 */
  cd: Record<string, number>;
  lastTick: number;
  log: LogEntry[];
}
