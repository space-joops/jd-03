# 5장 — 저장과 마이그레이션 (`storage.ts`)

> 45줄짜리 작은 파일이지만, **여기를 이해 못 하면 기존 유저의 게임을 망가뜨립니다.**
> 상태 필드를 추가할 일이 있다면 이 장을 꼭 읽으세요.

## 5.1 저장의 전부

```ts
const KEY = "stellapet-save-v1";

export function saveState(s: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 저장 실패는 게임 진행을 막지 않는다
  }
}

export function clearState() {
  try { localStorage.removeItem(KEY); } catch {}
}
```

게임 상태 객체를 통째로 JSON 문자열로 만들어 브라우저에 넣습니다. 그게 전부입니다.

### `try/catch`로 감싼 이유

localStorage는 다음 상황에서 **예외를 던집니다**.
- 사파리 시크릿 모드 (일부 버전)
- 브라우저 설정에서 쿠키/저장소 차단
- 저장 용량 초과 (보통 5~10MB)

여기서 앱이 죽으면 안 되므로, 실패해도 조용히 넘어갑니다. **저장이 안 되는 것보다 게임이 멈추는 게 더 나쁩니다.**

### 언제 저장되나

`Game.tsx`에서 상태가 바뀔 때마다입니다.

```tsx
useEffect(() => {
  if (state) saveState(state);
}, [state]);
```

1초 틱마다 상태가 새로 생기므로 **사실상 1초마다 저장**됩니다. 부담스러워 보이지만, localStorage 쓰기는 매우 빠르고 데이터도 작아서(로그 80개 포함 수십 KB) 문제없습니다.

## 5.2 불러오기와 백필(backfill) ⭐

여기가 이 파일의 핵심입니다.

```ts
export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;                       // ① 저장된 게 없음 = 새 게임
    const s = JSON.parse(raw) as Partial<GameState>;
    if (s.v !== 1 || typeof s.name !== "string") return null;  // ② 형식 검증

    // ③ 백필: 나중에 추가된 필드에 기본값 채우기
    return {
      ...s,
      branch: s.branch ?? "balanced",
      meteorUntil: s.meteorUntil ?? 0,
      flareUntil: s.flareUntil ?? 0,
      offer: s.offer ?? null,
      // 조종 모드 개편(연료 서바이벌 = 2세대) — 이전 세대의 30초 기록은 비교 불가
      sortieBestKg: (s.sortieGen ?? 1) >= 2 ? (s.sortieBestKg ?? 0) : 0,
      sortieWeek: (s.sortieGen ?? 1) >= 2 ? (s.sortieWeek ?? "") : "",
      sortieWeekBestKg: (s.sortieGen ?? 1) >= 2 ? (s.sortieWeekBestKg ?? 0) : 0,
      sortieGen: 2,
    } as GameState;
  } catch {
    return null;   // 깨진 데이터면 새 게임
  }
}
```

### 백필이 왜 필요한가 — 실제로 일어나는 사고

상황을 그려봅시다.

1. 유저 A가 1월에 게임을 시작합니다. 그때 세이브에는 `branch` 필드가 없었습니다.
2. 3월에 개발자가 진화 계열 기능을 추가하며 `branch` 필드를 만듭니다.
3. 유저 A가 4월에 돌아옵니다. **그의 세이브에는 여전히 `branch`가 없습니다.**
4. 화면에서 `STAGE_NAMES[s.branch]`를 실행합니다 → `STAGE_NAMES[undefined]` → `undefined` → 그 다음 `[0]`을 읽으려다 **크래시**. 유저의 게임이 열리지 않습니다.

백필은 이 사고를 막습니다. **"불러올 때 없는 필드는 기본값으로 채운다."**

```ts
branch: s.branch ?? "balanced",
//              ↑ 있으면 쓰고, 없으면(undefined/null) 기본값
```

> ⚠️ **철칙**: `types.ts`의 `GameState`에 필드를 추가하면 **반드시 세 곳**을 함께 고칩니다.
> 1. `types.ts` — 타입 정의
> 2. `engine.ts`의 `initialState` — 새 게임의 초기값
> 3. `storage.ts`의 `loadState` — **기존 유저를 위한 백필** ← 잊기 쉬움!

### `Partial<GameState>`의 의미

```ts
const s = JSON.parse(raw) as Partial<GameState>;
```

`Partial<T>`는 "T의 모든 필드가 있을 수도, 없을 수도 있다"는 뜻입니다. 저장된 데이터는 옛날 버전일 수 있으니 이렇게 받아서, 백필로 빈 곳을 채운 뒤 완전한 `GameState`로 단언(`as GameState`)합니다.

### 형식 검증(②)이 하는 일

```ts
if (s.v !== 1 || typeof s.name !== "string") return null;
```

- 다른 게임의 데이터나 손상된 값이 들어왔을 때 방어
- `v`는 세이브 구조의 대버전입니다. 만약 구조를 완전히 갈아엎어야 한다면 `v: 2`로 올리고, 이 검사에서 옛날 것을 버리거나 변환하면 됩니다.

## 5.3 기록 세대(`sortieGen`) — 마이그레이션의 실전 사례

미니게임이 "30초 타임어택"에서 "연료 서바이벌"로 바뀌었을 때 문제가 생겼습니다.

- 옛날 기록: 30초 동안 모은 kg
- 새 기록: 연료가 다 떨어질 때까지 모은 kg (보통 훨씬 김)

**두 기록을 같은 순위표에 올리면 불공평합니다.** 그래서 "세대" 개념을 넣었습니다.

```ts
// types.ts
/** 수동 조종 기록 세대 — 1: 30초 타임어택, 2: 연료 서바이벌 */
sortieGen: number;

// storage.ts — 세대가 낮으면 기록을 0으로 리셋하고 세대를 올림
sortieBestKg: (s.sortieGen ?? 1) >= 2 ? (s.sortieBestKg ?? 0) : 0,
sortieGen: 2,
```

`s.sortieGen ?? 1`: 필드 자체가 없던 옛날 세이브는 자동으로 1세대로 간주됩니다.

서버 쪽 기록도 함께 지워야 하므로 SQL 파일을 하나 남겨두었습니다.
```sql
-- supabase/jd03_reset_sortie_records.sql
update jd03_pets set sortie_best_kg = 0, updated_at = now();
delete from jd03_weekly_sorties;
```

> 💡 **배운 점**: 게임 규칙을 바꿔 기존 기록이 무의미해질 땐, 조용히 섞지 말고 **세대를 나눠 명시적으로 리셋**하는 게 정직합니다. 유저에게도 "규칙이 바뀌어 새로 시작합니다"가 이해하기 쉽습니다.

## 5.4 다른 localStorage 키들

게임 세이브 외에도 몇 개를 씁니다.

| 키 | 저장하는 곳 | 내용 |
| --- | --- | --- |
| `stellapet-save-v1` | `storage.ts` | 게임 상태 전체 |
| `stellapet-muted` | `sound.ts` | 음소거 여부 (`"1"`/`"0"`) |
| `stellapet-lb-consent` | `leaderboard.ts` | 리더보드 참가 동의 (`"1"`/`"0"`) |

이들도 전부 `try/catch`로 감싸 실패해도 게임이 죽지 않게 합니다.

## 5.5 저장 관련 디버깅

### 게임을 처음부터 하고 싶을 때
- 화면 하단 **"초기화"** 버튼
- 또는 F12 → Application → Local Storage → 키 우클릭 삭제
- 또는 시크릿 창에서 열기 (매번 새 게임)

### 세이브 내용 들여다보기
F12 → Console에서:
```js
JSON.parse(localStorage.getItem("stellapet-save-v1"))
```
객체가 펼쳐집니다. 스탯이 이상할 때 여기부터 확인하세요.

### 특정 상황을 강제로 만들기 (테스트용)
```js
// 예: 궤도에 도착한 상태로 만들기
const s = JSON.parse(localStorage.getItem("stellapet-save-v1"));
s.phase = "orbit";
s.debrisKg = 990;      // 진화 직전
s.stage = 1;
localStorage.setItem("stellapet-save-v1", JSON.stringify(s));
location.reload();
```

진화 연출이나 궤도 이벤트를 테스트할 때 몇 시간 플레이할 필요가 없습니다. **개발할 때 아주 자주 쓰게 됩니다.**

> ⚠️ 이렇게 값을 바꾸면 리더보드에도 반영될 수 있으니, 테스트 후에는 초기화하거나 리더보드 동의를 꺼두세요(`localStorage.setItem("stellapet-lb-consent","0")`).

---

## 정리

- 저장은 `JSON.stringify` → localStorage. 실패해도 게임은 계속된다
- **백필(`?? 기본값`)이 핵심**: 기존 유저 세이브에 없는 새 필드를 채워 크래시를 막는다
- 상태 필드 추가 = `types.ts` + `initialState` + **`storage.ts` 백필** 세트
- 규칙 변경으로 기록이 무의미해지면 **세대(`sortieGen`)로 명시적 리셋**
- F12 Console에서 세이브를 직접 조작하면 테스트가 빨라진다

다음: [6장 — 캔버스와 픽셀 아트](06-canvas-pixel.md)
