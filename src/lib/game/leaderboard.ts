// ============================================================================
// leaderboard.ts — Supabase 리더보드 연동
//
// 공유 프로젝트라 모든 서버 객체는 jd03_ 접두사 (supabase/jd03_schema.sql).
// 식별: 익명 인증(기기별 uid). 쓰기는 본인 행만(RLS), 읽기는 공개.
// 실패는 전부 조용히 처리 — 오프라인 게임성을 해치지 않는다.
// supabase-js는 동적 import로 메인 번들에서 제외한다.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Branch, GameState } from "./types";
import { weekKey } from "./engine";

const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY_ENV = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** 환경변수가 없으면 리더보드 기능 전체가 조용히 꺼진다 */
export const leaderboardEnabled = Boolean(URL_ENV && KEY_ENV);

let clientPromise: Promise<SupabaseClient | null> | null = null;
function getSb(): Promise<SupabaseClient | null> {
  if (!leaderboardEnabled) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(URL_ENV!, KEY_ENV!),
    );
  }
  return clientPromise;
}

// ---------------------------------------------------------------------------
// 참가 동의 — 이름·기록이 공개되므로 최초 1회 명시적으로 묻는다
// ---------------------------------------------------------------------------
const CONSENT_KEY = "stellapet-lb-consent";

/** true 동의 / false 거부 / null 아직 안 물어봄 */
export function getConsent(): boolean | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function setConsent(v: boolean): void {
  try {
    localStorage.setItem(CONSENT_KEY, v ? "1" : "0");
  } catch {
    // ignore
  }
}

async function ensureSession(sb: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await sb.auth.getSession();
    if (data.session) return data.session.user.id;
    const { data: signed, error } = await sb.auth.signInAnonymously();
    if (error) return null;
    return signed.user?.id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 동기화 (쓰기)
// ---------------------------------------------------------------------------

/** 동의한 유저의 현재 상태를 업서트한다. 성공 여부 반환, 실패는 조용히 */
export async function syncLeaderboard(s: GameState): Promise<boolean> {
  if (getConsent() !== true || s.phase !== "orbit") return false;
  const sb = await getSb();
  if (!sb) return false;
  try {
    const uid = await ensureSession(sb);
    if (!uid) return false;
    const { error } = await sb.from("jd03_pets").upsert({
      id: uid,
      name: s.name,
      stage: s.stage,
      branch: s.branch,
      debris_kg: Math.min(99_999_999, Math.round(s.debrisKg)),
      total_encounters: s.totalEncounters,
      sortie_best_kg: Math.min(999_999, s.sortieBestKg),
      mission_started_at: new Date(s.createdAt).toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) return false;
    // 이번 주 기록이 있으면 주간 보드에도 업서트
    if (s.sortieWeekBestKg > 0 && s.sortieWeek === weekKey(Date.now())) {
      await sb.from("jd03_weekly_sorties").upsert({
        pet_id: uid,
        week: s.sortieWeek,
        best_kg: Math.min(999_999, s.sortieWeekBestKg),
        updated_at: new Date().toISOString(),
      });
    }
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 조회 (읽기 — 인증 불필요, RLS select 공개)
// ---------------------------------------------------------------------------

export interface LbPet {
  id: string;
  name: string;
  stage: number;
  branch: Branch;
  debris_kg: number;
  total_encounters: number;
  sortie_best_kg: number;
  mission_started_at: string | null;
}

export interface LbWeeklyRow {
  pet_id: string;
  week: string;
  best_kg: number;
  pet: LbPet | null;
}

export interface LbHallRow {
  week: string;
  best_kg: number;
  pet_id: string;
  name: string;
  stage: number;
  branch: Branch;
}

const PET_COLS =
  "id,name,stage,branch,debris_kg,total_encounters,sortie_best_kg,mission_started_at";

/** 이번 주 신기록 TOP N */
export async function fetchWeeklyTop(limit = 50): Promise<LbWeeklyRow[]> {
  const sb = await getSb();
  if (!sb) return [];
  const { data, error } = await sb
    .from("jd03_weekly_sorties")
    .select(`pet_id,week,best_kg,jd03_pets(${PET_COLS})`)
    .eq("week", weekKey(Date.now()))
    .order("best_kg", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({
    pet_id: r.pet_id as string,
    week: r.week as string,
    best_kg: r.best_kg as number,
    pet: (r as unknown as { jd03_pets: LbPet | null }).jd03_pets,
  }));
}

/** 누적 수거량 TOP N */
export async function fetchTotalTop(limit = 50): Promise<LbPet[]> {
  const sb = await getSb();
  if (!sb) return [];
  const { data, error } = await sb
    .from("jd03_pets")
    .select(PET_COLS)
    .order("debris_kg", { ascending: false })
    .limit(limit);
  return error || !data ? [] : (data as unknown as LbPet[]);
}

/** 명예의 전당 — 주차별 1위 */
export async function fetchHallOfFame(limit = 26): Promise<LbHallRow[]> {
  const sb = await getSb();
  if (!sb) return [];
  const { data, error } = await sb
    .from("jd03_hall_of_fame")
    .select("week,best_kg,pet_id,name,stage,branch")
    .order("week", { ascending: false })
    .limit(limit);
  return error || !data ? [] : (data as unknown as LbHallRow[]);
}

/** 내 순위 — 나보다 좋은 기록 수 + 1 (내 행이 동기화돼 있어야 유효) */
export async function fetchMyRanks(
  s: GameState,
): Promise<{ weekly: number | null; total: number | null }> {
  const sb = await getSb();
  if (!sb) return { weekly: null, total: null };
  const out: { weekly: number | null; total: number | null } = { weekly: null, total: null };
  try {
    const wk = weekKey(Date.now());
    if (s.sortieWeekBestKg > 0 && s.sortieWeek === wk) {
      const { count, error } = await sb
        .from("jd03_weekly_sorties")
        .select("*", { count: "exact", head: true })
        .eq("week", wk)
        .gt("best_kg", s.sortieWeekBestKg);
      if (!error && count !== null) out.weekly = count + 1;
    }
    const { count: c2, error: e2 } = await sb
      .from("jd03_pets")
      .select("*", { count: "exact", head: true })
      .gt("debris_kg", Math.round(s.debrisKg));
    if (!e2 && c2 !== null) out.total = c2 + 1;
  } catch {
    // 부분 실패 허용
  }
  return out;
}

/** 내 uid (동의·세션이 있을 때만) — 리더보드에서 내 행 하이라이트용 */
export async function myUid(): Promise<string | null> {
  if (getConsent() !== true) return null;
  const sb = await getSb();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}
