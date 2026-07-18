import type { GameState } from "./types";

const KEY = "stellapet-save-v1";

export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<GameState>;
    if (s.v !== 1 || typeof s.name !== "string") return null;
    // 진화 계열·궤도 이벤트 도입 이전 세이브 필드 보강
    return {
      ...s,
      branch: s.branch ?? "balanced",
      meteorUntil: s.meteorUntil ?? 0,
      flareUntil: s.flareUntil ?? 0,
      offer: s.offer ?? null,
      // 조종 모드 개편(연료 서바이벌 = 2세대) — 이전 세대의 30초 기록은 비교
      // 불가능하므로 리셋한다
      sortieBestKg: (s.sortieGen ?? 1) >= 2 ? (s.sortieBestKg ?? 0) : 0,
      sortieWeek: (s.sortieGen ?? 1) >= 2 ? (s.sortieWeek ?? "") : "",
      sortieWeekBestKg: (s.sortieGen ?? 1) >= 2 ? (s.sortieWeekBestKg ?? 0) : 0,
      sortieGen: 2,
    } as GameState;
  } catch {
    return null;
  }
}

export function saveState(s: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 저장 실패는 게임 진행을 막지 않는다
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
