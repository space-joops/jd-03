# 12장 — Supabase 리더보드

> 이 프로젝트의 **유일한 서버 기능**입니다. 백엔드 개발 없이 데이터베이스를 쓰는 법을 배웁니다.
> 관련 파일: `src/lib/game/leaderboard.ts`, `src/app/rank/page.tsx`, `supabase/jd03_schema.sql`

## 12.1 Supabase가 뭔가요

**PostgreSQL 데이터베이스 + 인증 + API를 한 번에 주는 서비스**입니다(Firebase의 오픈소스 대안).

보통 서버를 만들려면:
```
브라우저 → [내가 만든 API 서버] → [데이터베이스]
             ↑ Node.js, Express, 배포, 인증, 보안… 전부 직접
```

Supabase를 쓰면:
```
브라우저 → [Supabase] (DB + 인증 + 자동 생성 API + 권한 규칙)
```

서버 코드를 한 줄도 안 짜고 DB를 직접 다룹니다. **대신 보안을 DB 규칙(RLS)으로 지켜야 합니다.**

## 12.2 데이터베이스 기초 (SQL 처음이라면)

### 테이블 = 엑셀 시트

```sql
create table jd03_pets (
  id uuid primary key,        -- 각 행을 구분하는 고유 값
  name text not null,         -- 문자열, 비어있으면 안 됨
  stage int not null default 0,  -- 정수, 기본값 0
  debris_kg bigint not null default 0,
  updated_at timestamptz not null default now()
);
```

| id | name | stage | debris_kg |
| --- | --- | --- | --- |
| a1b2… | 코스모 | 2 | 4321 |
| c3d4… | 다다 | 1 | 1721 |

### 제약(constraint) — DB가 지켜주는 규칙

```sql
stage int not null default 0 check (stage between 0 and 3),
branch text not null default 'balanced' check (branch in ('balanced', 'speed', 'pull')),
sortie_best_kg int not null check (sortie_best_kg between 0 and 999999),
```

`check`를 걸면 **범위를 벗어난 값은 아예 저장되지 않습니다.** 앱 코드가 잘못돼도 DB가 최후 방어선이 됩니다. 공짜 보험이니 걸어두는 게 좋습니다.

### 인덱스 — 정렬을 빠르게

```sql
create index jd03_weekly_sorties_rank_idx on jd03_weekly_sorties (week, best_kg desc);
create index jd03_pets_debris_idx on jd03_pets (debris_kg desc);
```

책 뒤의 색인처럼, "이 열로 정렬해 찾는 일이 잦다"고 미리 알려주는 것입니다. 리더보드는 항상 정렬 조회를 하므로 인덱스가 필요합니다.

### 뷰(view) — 저장된 질문

```sql
create or replace view jd03_hall_of_fame with (security_invoker = on) as
select distinct on (w.week)
  w.week, w.best_kg, w.eaten, w.hits, w.pet_id, p.name, p.stage, p.branch
from jd03_weekly_sorties w
join jd03_pets p on p.id = w.pet_id
order by w.week desc, w.best_kg desc, w.updated_at asc;
```

**명예의 전당**(주차별 1위)입니다. 별도 테이블에 저장하지 않고, 조회할 때마다 계산합니다.

- `distinct on (w.week)` — 주차별로 **첫 행 하나만**
- `order by ... best_kg desc, updated_at asc` — 기록 높은 순, 동점이면 먼저 세운 사람
- `join` — 두 테이블을 연결(주간 기록 + 펫 정보)

**배치 작업(매주 1위를 계산해 저장하는 크론잡)이 필요 없습니다.** 데이터가 적을 때 뷰는 아주 좋은 선택입니다.

### 접두사 규칙 ⭐

이 프로젝트는 **다른 프로젝트와 Supabase를 공유**합니다. 그래서 모든 객체에 `jd03_`를 붙입니다.

```
jd03_pets, jd03_weekly_sorties, jd03_hall_of_fame,
jd03_pets_select_all(정책), jd03_pets_debris_idx(인덱스)
```

새 테이블·정책·인덱스를 만들 때 **반드시 이 접두사를 붙이세요.**

## 12.3 익명 인증 — 가입 없는 로그인

리더보드에는 "누가 내 기록인가"를 구분할 방법이 필요합니다. 하지만 가입 화면을 붙이면 유저가 떠납니다.

**익명 인증**이 답입니다. 기기마다 자동으로 계정이 하나 생기고, 유저는 아무것도 안 합니다.

```ts
async function ensureSession(sb: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await sb.auth.getSession();
    if (data.session) return data.session.user.id;      // 이미 있으면 재사용
    const { data: signed, error } = await sb.auth.signInAnonymously();
    if (error) return null;
    return signed.user?.id ?? null;
  } catch { return null; }
}
```

| 장점 | 단점 |
| --- | --- |
| 가입 없음, 즉시 참여 | 기기를 바꾸면 기록과 연결이 끊김 |
| 구현이 단순 | 브라우저 저장소를 지우면 새 사람이 됨 |

캐주얼 게임에는 이 트레이드오프가 맞습니다. (Supabase 대시보드에서 **Anonymous sign-ins를 활성화**해야 동작합니다)

## 12.4 RLS — 보안의 핵심 ⭐⭐

브라우저에서 DB에 직접 접근하므로, **누구나 아무 데이터나 고칠 수 있으면 큰일**입니다. 이걸 막는 게 RLS(Row Level Security, 행 수준 보안)입니다.

```sql
alter table jd03_pets enable row level security;   -- 켜면 기본은 "전부 금지"

-- 읽기: 누구나 (리더보드는 공개)
create policy jd03_pets_select_all on jd03_pets
  for select using (true);

-- 쓰기: 자기 행만
create policy jd03_pets_insert_own on jd03_pets
  for insert with check (auth.uid() = id);
create policy jd03_pets_update_own on jd03_pets
  for update using (auth.uid() = id) with check (auth.uid() = id);
```

`auth.uid()`는 **지금 로그인한 사용자의 id**를 DB가 직접 확인한 값입니다. 브라우저가 보낸 값이 아니라 토큰에서 꺼낸 것이라 위조할 수 없습니다.

### 실제로 검증했습니다

익명 계정 두 개(A, B)를 만들어 B가 A의 기록을 조작해봤습니다.

```js
// B가 A의 누적 수거량을 9999만kg로 바꾸려 시도
await B.from("jd03_pets").update({ debris_kg: 99999998 }).eq("id", A_uid);
// → 0행 변경 (차단)

// B가 A 명의로 가짜 기록 삽입 시도
await B.from("jd03_weekly_sorties").insert({ pet_id: A_uid, week, best_kg: 999 });
// → 에러 42501 (권한 없음)
```

**보안 기능은 반드시 이렇게 뚫어보는 테스트를 해야 합니다.** "정책을 썼으니 되겠지"는 위험합니다.

> 💡 이 프로젝트는 **신뢰 기반**입니다. 자기 기록은 마음대로 올릴 수 있어(localStorage를 조작하면) 이론상 가짜 점수가 가능합니다. 캐주얼 게임이라 이 수준으로 두되, DB의 `check` 제약으로 말도 안 되는 값(음수, 100만kg 초과)은 막았습니다. 더 강하게 하려면 플레이 로그를 서버에서 재검증해야 하는데, MVP엔 과합니다.

## 12.5 클라이언트 코드 (`leaderboard.ts`)

### 기능 자체를 끌 수 있게

```ts
const URL_ENV = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY_ENV = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** 환경변수가 없으면 리더보드 기능 전체가 조용히 꺼진다 */
export const leaderboardEnabled = Boolean(URL_ENV && KEY_ENV);
```

환경변수가 없으면 랭킹 버튼도 안 보이고 게임은 정상 동작합니다. **외부 의존성이 없어도 앱이 죽지 않게** 하는 좋은 습관입니다.

### 동적 import로 번들 줄이기

```ts
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
```

supabase-js는 꽤 무거운 라이브러리입니다. 동적 import로 **리더보드를 쓸 때만** 내려받습니다. `clientPromise`에 담아두어 두 번 만들지 않습니다(싱글턴).

### anon key는 공개돼도 되나요?

네. `NEXT_PUBLIC_SUPABASE_ANON_KEY`는 브라우저에 노출되는 것이 정상입니다. **RLS가 보안을 담당**하기 때문입니다.

> ⚠️ 단, `service_role` 키는 절대 클라이언트에 넣으면 안 됩니다. 그건 RLS를 무시하는 만능 키입니다.

### 참가 동의

```ts
const CONSENT_KEY = "stellapet-lb-consent";
export function getConsent(): boolean | null {
  const v = localStorage.getItem(CONSENT_KEY);
  return v === "1" ? true : v === "0" ? false : null;   // null = 아직 안 물어봄
}
```

펫 이름이 남에게 보이게 되므로 **한 번은 물어봐야** 합니다.

```tsx
// Game.tsx — 첫 기록을 세웠을 때 딱 한 번
if (state.sortieBestKg > 0 && !consentAskedRef.current && getConsent() === null) {
  consentAskedRef.current = true;
  const ok = confirm("첫 기록 달성! 리더보드에 올릴까요?\n펫 이름과 기록이 다른 플레이어에게 공개됩니다.");
  setConsent(ok);
}
```

3가지 상태(동의/거부/미확인)로 관리하는 게 포인트입니다. "거부"와 "아직 안 물어봄"을 구분해야 계속 묻지 않습니다.

### 동기화 — 언제 서버에 올리나

```tsx
// 핵심 값이 바뀌면 즉시, 그 외(누적 수거량)는 5분 간격
const key = `${state.sortieBestKg}|${state.sortieWeekBestKg}|${state.stage}|${state.branch}`;
const nowMs = Date.now();
if (key === lastSyncKeyRef.current && nowMs - lastSyncAtRef.current < 5 * 60_000) return;
lastSyncKeyRef.current = key;
lastSyncAtRef.current = nowMs;
void syncLeaderboard(state);
```

게임 상태는 1초마다 바뀝니다. 그때마다 서버에 쓰면 요청이 폭주합니다. **중요한 값(기록·진화)이 바뀌면 즉시, 나머지는 5분에 한 번**으로 조절합니다.

`void`는 "Promise를 기다리지 않고 보낸다"는 표시입니다(결과를 안 씀).

### upsert — 있으면 수정, 없으면 삽입

```ts
const { error } = await sb.from("jd03_pets").upsert({
  id: uid,
  name: s.name,
  stage: s.stage,
  branch: s.branch,
  debris_kg: Math.min(99_999_999, Math.round(s.debrisKg)),
  ...
});
```

`insert`와 `update`를 구분할 필요 없이 한 번에 처리합니다(기본키가 같으면 갱신).

값에 상한(`Math.min`)을 씌우는 이유: DB의 `check` 제약에 걸려 에러가 나느니, 클라이언트에서 미리 자르는 게 낫습니다.

### 조회 — 조인과 정렬

```ts
export async function fetchWeeklyTop(limit = 50): Promise<LbWeeklyRow[]> {
  const sb = await getSb();
  if (!sb) return [];
  const { data, error } = await sb
    .from("jd03_weekly_sorties")
    .select(`pet_id,week,best_kg,jd03_pets(${PET_COLS})`)   // ⭐ 관계 조인
    .eq("week", weekKey(Date.now()))                        // 이번 주만
    .order("best_kg", { ascending: false })                 // 높은 순
    .order("updated_at", { ascending: true })               // 동점이면 먼저 세운 순
    .limit(limit);
  if (error || !data) return [];
  return data.map(...);
}
```

`jd03_pets(...)`처럼 쓰면 **외래키 관계를 따라가 연결된 행을 함께** 가져옵니다. SQL의 JOIN을 문자열로 표현한 것입니다.

### 내 순위 구하기 — 영리한 방법

```ts
const { count } = await sb
  .from("jd03_pets")
  .select("*", { count: "exact", head: true })    // head: true = 데이터 없이 개수만
  .gt("sortie_best_kg", s.sortieBestKg);          // 나보다 높은 기록
// 내 순위 = count + 1
```

전체를 불러와 내 위치를 찾는 대신, **"나보다 잘한 사람 수 + 1"** 을 세면 됩니다. 참가자가 만 명이어도 빠릅니다.

### 에러를 조용히 삼키는 이유

```ts
try {
  ...
  return true;
} catch {
  return false;   // 실패해도 게임은 계속된다
}
```

리더보드는 **부가 기능**입니다. 서버가 죽거나 오프라인이어도 게임은 돌아가야 합니다. 이 파일의 모든 함수가 실패 시 빈 배열이나 `false`를 반환합니다.

## 12.6 리더보드 화면 (`rank/page.tsx`)

### 탭 4개

| 탭 | 데이터 | 리셋 |
| --- | --- | --- |
| 🕹 주간 | 이번 주 한 출격 최고 | 매주 월요일(KST) |
| 🏆 단판 | 역대 한 출격 최고 | 없음 |
| 🛰 누적 | 평생 수거량 | 없음 |
| 🏛 전당 | 주차별 1위 기록 | (누적됨) |

주간 리셋은 **DB를 지우는 게 아니라** 주차 키(`2026-W29`)로 필터링하는 것입니다. 과거 데이터는 남아 명예의 전당이 됩니다.

### 스프라이트를 리스트에 재사용

```tsx
function SpriteIcon({ stage, size }: { stage: number; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    const sprite = ORBIT_SPRITES[Math.min(Math.max(stage, 0), ORBIT_SPRITES.length - 1)];
    const px = 48;
    // 중앙 정렬해 그리기
    drawSprite(ctx, sprite, ..., sc);
  }, [stage]);
  return <canvas ref={ref} style={{ width: size, height: size, imageRendering: "pixelated" }} />;
}
```

게임에서 쓰던 스프라이트 데이터를 리더보드 목록의 작은 아이콘으로 그대로 씁니다. **데이터를 렌더링과 분리해둔 덕**입니다.

### 업적 모달

캐릭터를 클릭하면 그 펫의 업적이 뜹니다.

```tsx
interface Achievement {
  name: string; stage: number; branch: Branch;
  debrisKg?: number; encounters?: number; sortieBestKg?: number;
  missionStartedAt?: string | null; weeklyKg?: number; weekLabel?: string;
}
```

주간 탭에서 열면 주간 기록까지, 누적 탭에서 열면 누적 정보만 — 탭에 따라 다른 필드를 채웁니다(옵셔널 `?`).

## 12.7 운영 체크리스트

새 환경에 리더보드를 붙일 때:

1. Supabase 프로젝트 생성 (리전: Northeast Asia 추천)
2. SQL Editor에서 `supabase/jd03_schema.sql` 실행
3. Authentication → **Anonymous sign-ins 활성화** ← 자주 빠뜨림!
4. `.env.local`과 Vercel에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 설정
5. 확인: `/rank` 접속 → 목록 로딩 → 게임에서 기록 세우기 → 동의 → 순위 표시

### 자주 만나는 에러

| 증상 | 원인 |
| --- | --- |
| `Anonymous sign-ins are disabled` | 3번 안 함 |
| `Could not find the table in the schema cache` | 스키마 변경 후 API 캐시 미갱신 → `NOTIFY pgrst, 'reload schema';` 실행 |
| 랭킹 메뉴가 안 보임 | 환경변수 누락 (`leaderboardEnabled`가 false) |
| 조회는 되는데 저장이 안 됨 | RLS 정책 누락 또는 로그인 실패 |

### Node로 직접 확인하기

```js
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(URL, ANON_KEY, { auth: { persistSession: false } });

const { data, error } = await sb.from("jd03_pets").select("name,debris_kg").order("debris_kg", { ascending: false }).limit(5);
console.log(error ?? data);
```

브라우저를 열지 않고 데이터 상태를 확인할 수 있어 디버깅이 빠릅니다.

## 12.8 실습 과제

1. **랭킹 조회** — 위 Node 스크립트로 현재 리더보드를 출력해보세요
2. **TOP 10으로 줄이기** — `fetchWeeklyTop(10)`으로 바꿔보세요
3. **새 컬럼 추가 연습** — `jd03_pets`에 `total_sorties`(출격 횟수)를 추가하려면? → SQL `alter table` + `syncLeaderboard`에 필드 추가 + 화면 표시
4. **RLS 뚫어보기** — 12.4의 검증 스크립트를 직접 돌려 차단되는지 확인

---

## 정리

- Supabase = DB + 인증 + 자동 API. 서버 코드 없이 브라우저가 DB와 직접 대화
- **RLS가 보안의 전부**다. 읽기는 공개, 쓰기는 `auth.uid() = id`로 본인만. 반드시 뚫어보는 테스트를 하라
- 익명 인증으로 가입 없이 식별 (기기 바뀌면 끊기는 트레이드오프)
- 동기화는 **중요 값 변화 시 즉시, 나머지는 간격 제한**
- 내 순위는 "나보다 높은 기록 개수 + 1"
- 리더보드 실패가 게임을 멈추면 안 된다 — 전부 조용히 실패
- 공유 프로젝트이므로 **모든 객체에 `jd03_` 접두사**

다음: [13장 — 실습 과제와 디버깅](13-practice.md)
