# 3장 — 프로젝트 전체 지도

> 이 장이 가장 중요합니다. **어떤 파일이 무엇을 담당하는지** 알면 나머지는 필요할 때 찾아 읽으면 됩니다.

## 3.1 폴더 구조

```
jd-03/
├─ src/
│  ├─ app/                     ← 페이지 (주소)
│  │  ├─ page.tsx              메인 게임 화면 (/)
│  │  ├─ layout.tsx            모든 페이지 공통 껍데기 (메타 태그, 폰트)
│  │  ├─ globals.css           전역 스타일 (색 변수, 픽셀 버튼, 스캔라인)
│  │  ├─ rank/page.tsx         리더보드 (/rank)
│  │  ├─ c/page.tsx            도전장 링크 랜딩 (/c) — 링크 미리보기 생성
│  │  ├─ api/og/route.tsx      미리보기 이미지 생성 서버 (/api/og)
│  │  └─ manifest.ts           PWA 설치 정보
│  │
│  ├─ components/              ← 화면 조각
│  │  ├─ Game.tsx              메인 UI 총괄 ⭐ (가장 큼)
│  │  ├─ PixelView.tsx         본편 픽셀 캔버스 (지구·펫·로켓)
│  │  ├─ SortieGame.tsx        미니게임 ⭐ (독립적인 작은 게임)
│  │  └─ SwRegister.tsx        서비스 워커 등록 (PWA)
│  │
│  └─ lib/game/                ← 게임 두뇌 (화면과 무관)
│     ├─ engine.ts             게임 규칙 전부 ⭐⭐⭐
│     ├─ types.ts              데이터 모양 정의
│     ├─ storage.ts            저장/불러오기
│     ├─ sprites.ts            픽셀 그림 데이터
│     ├─ sound.ts              효과음 합성
│     ├─ bragImage.ts          공유 카드 이미지 생성
│     └─ leaderboard.ts        Supabase 통신
│
├─ public/                     ← 그대로 서빙되는 파일
│  ├─ sw.js                    서비스 워커 (오프라인 캐싱)
│  └─ icons/                   앱 아이콘
│
├─ supabase/                   ← 서버 DB 스키마 (SQL)
├─ docs/                       ← 설계 문서
└─ study/                      ← 지금 읽고 있는 이 문서
```

### 별점 순서로 읽기

| 순위 | 파일 | 왜 중요한가 |
| --- | --- | --- |
| ⭐⭐⭐ | `lib/game/engine.ts` | 게임의 모든 규칙과 숫자. 여기만 알면 게임을 바꿀 수 있다 |
| ⭐⭐ | `components/Game.tsx` | 화면·입력·저장·소리를 잇는 중앙역 |
| ⭐⭐ | `components/SortieGame.tsx` | 미니게임 하나가 통째로 들어있음 (독립적) |
| ⭐ | `lib/game/types.ts` | 데이터 모양. 짧으니 먼저 읽으면 좋음 |
| ⭐ | `lib/game/storage.ts` | 40줄. 저장 규칙과 구버전 처리 |

## 3.2 가장 중요한 설계 원칙 4가지

### ① 엔진은 순수 함수다

`engine.ts`는 React도, 브라우저도 모릅니다. 오직 **입력 → 출력**입니다.

```ts
tick(이전상태, 지금시각)  →  새로운 상태
act(이전상태, "feed", 지금시각)  →  새로운 상태
```

같은 입력이면 (랜덤 요소를 빼면) 같은 출력이 나옵니다. 그래서:
- 브라우저 없이 Node.js로 테스트할 수 있다
- 화면을 다 뜯어고쳐도 게임 규칙은 안전하다
- 버그가 나면 "UI 문제인가 규칙 문제인가"를 바로 가를 수 있다

**규칙: 게임 로직을 컴포넌트 안에 쓰지 마세요.** 예를 들어 "체중이 500g 넘으면 발사 가능"을 `Game.tsx`에 `if (state.weightG >= 500)`로 쓰면 안 되고, `engine.ts`의 `canLaunch(s)`를 불러야 합니다.

### ② 상태는 하나의 큰 객체다

게임의 모든 것이 `GameState` 객체 하나에 들어있습니다. (`types.ts`)

```ts
export interface GameState {
  v: 1;                    // 세이브 버전
  name: string;            // 펫 이름
  phase: Phase;            // 현재 단계 (egg/ground/awaiting/launching/orbit)
  hatch: number;           // 알 품기 진행도
  weightG, energy, mood, training: number;   // 지상 스탯
  windowAt, launchT, launchStep;             // 발사 관련
  speed, pull, prop, propMax, debrisKg;      // 궤도 스탯
  stage: number;           // 진화 단계 0~3
  branch: Branch;          // 진화 계열
  meteorUntil, flareUntil, offer;            // 궤도 이벤트
  sortieBestKg, sortieWeek, sortieWeekBestKg, sortieGen;  // 미니게임 기록
  cd: Record<string, number>;   // 액션별 쿨다운 만료 시각
  lastTick: number;        // 마지막 진행 시각
  log: LogEntry[];         // 이벤트 로그 (최대 80개)
}
```

상태가 한 곳에 모여 있어서 **저장이 쉽고**(통째로 JSON), **디버깅이 쉽습니다**(하나만 찍어보면 됨).

### ③ 사건은 전부 로그로 남긴다

게임에서 무슨 일이 일어나면 `pushLog`로 기록합니다.

```ts
pushLog(s, `${d.name} 포획! +${kg}kg`, "gain");
```

세 번째 인자 `kind`가 중요합니다.

| kind | 의미 | 화면 색 | 효과음 |
| --- | --- | --- | --- |
| `info` | 소소한 정보 | 회백색 | 작은 블립 |
| `gain` | 획득 | 초록 | 코인 소리 |
| `warn` | 경고·손실 | 빨강 | 하강 버즈 |
| `evo` | 진화·큰 사건 | 주황 | 팡파르 |
| `sys` | 시스템·관제 | 하늘 | 무전 비프 |

**로그 하나만 남기면 색·소리·(경우에 따라) 공유 제안까지 자동으로 따라옵니다.** 새 기능을 만들 때 `pushLog`만 제대로 부르면 나머지는 공짜입니다.

### ④ 시간은 "끝나는 시각"으로 저장한다

```ts
s.boostUntil = now + 12_000;        // 12초 뒤 시각
if (now < s.boostUntil) { /* 부스트 중 */ }
```

남은 시간을 매 틱 빼는 게 아니라 만료 시각을 저장합니다. 앱을 껐다 켜도, 몇 시간 뒤에 돌아와도 계산이 정확합니다.

## 3.3 게임 한 판의 흐름 (코드로 따라가기)

### 1단계: 앱이 켜진다

```
브라우저가 / 접속
  → app/page.tsx → <Game />
  → Game.tsx의 useEffect: loadState()로 저장 데이터 읽기
  → catchUp(saved, Date.now())로 자리 비운 동안 정산
  → 저장 데이터가 없으면 <Intro /> (이름 입력 화면)
```

### 2단계: 1초마다 시간이 흐른다

```
setInterval (1초)
  → tick(state, Date.now())
      → phase에 따라 groundTick / launchingTick / orbitTick 실행
      → 확률적으로 스탯 감소, 잔해 조우, 이벤트 발생
  → setState(새 상태)
      → 화면 갱신 + 자동 저장 + 새 로그 있으면 효과음
```

### 3단계: 버튼을 누른다

```
"먹이" 버튼 클릭
  → dispatch("feed")
  → act(state, "feed", Date.now())
      → 쿨다운 확인 (아직이면 원본 그대로 반환 = 아무 일 없음)
      → phase 확인 (지상/발사대기에서만 가능)
      → energy +25, weightG +40
      → 쿨다운 6초 설정, 로그 남김
  → setState(새 상태)
```

### 4단계: 궤도에 도착하면

```
매 초 orbitTick:
  → 이벤트 종료 체크 (유성우/플레어/견인 제안 만료)
  → 이벤트 발생 굴림 (0.4% 유성우, 0.3% 플레어, 0.4% 대형 잔해)
  → 잔해 조우 굴림 (스피드가 높을수록 자주)
      → gainDebris: 수거량 계산 → checkEvolution: 진화 체크
  → 충돌 위기 굴림 (추진제로 회피 or 손실)
  → 기분 서서히 감소
```

### 5단계: 미니게임

```
"조종" 버튼
  → act(state, "sortie") — 추진제 5 소모, 60초 쿨다운
  → setSortie(true) → <SortieGame /> 전체화면 등장
  → 본편 틱 정지 (sortieRef로 확인)
  → [미니게임 진행: 연료 다 쓸 때까지]
  → onEnd(결과) → settleSortie(state, 결과)
      → 수거량 반영, 기분 변화, 신기록 갱신, 진화 체크
  → setSortie(false) → 본편 복귀
```

## 3.4 파일별 한 줄 요약

### 게임 두뇌 (`src/lib/game/`)

| 파일 | 줄수 | 요약 |
| --- | --- | --- |
| `engine.ts` | 576 | 상수·규칙·`tick`/`act`/`catchUp`/`settleSortie`/진화 판정 |
| `types.ts` | 71 | `GameState`, `Phase`, `Branch`, `LogEntry` 타입 정의 |
| `storage.ts` | 44 | localStorage 저장/로드, **구버전 세이브 보정(백필)** |
| `sprites.ts` | 183 | 픽셀 그림을 문자열 배열로 정의 + 캔버스에 찍는 함수 |
| `sound.ts` | 254 | 오실레이터로 효과음 합성, 로그 kind→소리 매핑 |
| `bragImage.ts` | 348 | 공유 카드 PNG 생성(3종), QR, 공유 3단 폴백 |
| `leaderboard.ts` | 246 | Supabase 익명 로그인, 동기화, 순위 조회 |

### 화면 (`src/components/`)

| 파일 | 줄수 | 요약 |
| --- | --- | --- |
| `Game.tsx` | 792 | 상태 관리 + 모든 UI + 입력 + 사운드/공유/리더보드 연결 |
| `PixelView.tsx` | 320 | 240×200 캔버스에 지상/발사/궤도 장면을 60fps로 그림 |
| `SortieGame.tsx` | 691 | 미니게임 전체 (자체 게임 루프·물리·HUD) |
| `SwRegister.tsx` | 18 | 프로덕션에서만 서비스 워커 등록 |

## 3.5 브라우저 없이 엔진 테스트하기 (매우 유용)

엔진이 순수 함수라서 Node.js로 직접 돌려볼 수 있습니다. 게임 밸런스를 바꿨을 때 **10시간 플레이 대신 1초 시뮬레이션**으로 확인할 수 있습니다.

`sim.mjs` 파일을 만들고:

```js
import { readFileSync, writeFileSync } from "node:fs";

// engine.ts를 그대로 복사해오되, import 경로에 확장자만 붙여준다
// (Node 22+는 TypeScript를 직접 실행할 수 있다)
writeFileSync("types.ts", readFileSync("src/lib/game/types.ts", "utf8"));
writeFileSync(
  "engine.ts",
  readFileSync("src/lib/game/engine.ts", "utf8").replace('from "./types"', 'from "./types.ts"'),
);
const E = await import("./engine.ts");

let now = 0;
let s = E.initialState("테스트", now);

// 알 품기 3번
for (let i = 0; i < 3; i++) s = E.act(s, "incubate", (now += 4000));
console.log("부화 후:", s.phase);          // ground

// 발사 자격 될 때까지 먹이/훈련
while (!E.canLaunch(s)) {
  now += 9000;
  s = E.act(s, "feed", now);
  s = E.act(s, "train", now);
}
s = E.act(s, "register", now);
now = s.windowAt;                          // 발사 윈도우로 시간 점프
for (let i = 0; i < 15; i++) s = E.tick(s, (now += 1000));
console.log("궤도 진입:", s.phase, "스피드", s.speed, "당김", s.pull);

// 궤도에서 2시간 돌려보기
for (let i = 0; i < 7200; i++) s = E.tick(s, (now += 1000));
console.log("2시간 후:", s.debrisKg + "kg", "단계", s.stage, E.stageName(s));
```

```bash
node sim.mjs
```

이 방법으로 이 프로젝트의 밸런스 변경은 전부 검증되었습니다. 새 규칙을 넣었다면 꼭 한 번 돌려보세요.

## 3.6 어디를 고쳐야 하나? — 상황별 지도

| 하고 싶은 것 | 고칠 파일 | 참고 챕터 |
| --- | --- | --- |
| 쿨다운·수치·확률 조정 | `engine.ts` 상단 상수 | [4장](04-game-engine.md) |
| 새 액션(버튼) 추가 | `engine.ts`(`ActionId`+`act`) → `Game.tsx`(버튼) | [4장](04-game-engine.md) |
| 새 궤도 이벤트 추가 | `engine.ts`의 `orbitTick` | [4장](04-game-engine.md) |
| 진화 단계·이름 변경 | `engine.ts`의 `ORBIT_STAGES`, `STAGE_NAMES` | [4장](04-game-engine.md) |
| 상태 필드 추가 | `types.ts` + `initialState` + **`storage.ts` 백필** | [5장](05-storage.md) |
| 캐릭터 그림 수정 | `sprites.ts` | [6장](06-canvas-pixel.md) |
| 배경·연출 수정 | `PixelView.tsx` | [6장](06-canvas-pixel.md) |
| 미니게임 조작감 | `SortieGame.tsx`의 `TUNE` | [7장](07-minigame.md) |
| 미니게임 난이도 | `SortieGame.tsx`의 `SORTIE_DIFFICULTY` 또는 환경변수 | [7장](07-minigame.md) |
| 효과음 추가·변경 | `sound.ts` | [8장](08-sound.md) |
| 화면 배치·색 | `Game.tsx` (Tailwind 클래스), `globals.css` | [9장](09-ui-layout.md) |
| 앱 아이콘·설치 설정 | `app/manifest.ts`, `public/sw.js` | [10장](10-pwa.md) |
| 공유 카드 디자인 | `bragImage.ts` | [11장](11-share-viral.md) |
| 리더보드 항목 | `leaderboard.ts` + `rank/page.tsx` + SQL | [12장](12-supabase.md) |

---

## 정리

- **`engine.ts`가 게임의 두뇌**다. 화면은 그 결과를 그릴 뿐
- 게임의 모든 것은 `GameState` 객체 하나에 담기고, 매번 새 객체로 교체된다
- 사건은 `pushLog`로 남기면 색·소리·공유 제안이 자동으로 붙는다
- 엔진이 순수 함수라 **Node로 시뮬레이션 테스트**가 가능하다

다음: [4장 — 게임 엔진 완전 해부](04-game-engine.md)
