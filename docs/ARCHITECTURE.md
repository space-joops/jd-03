# STELLAPET 코드 아키텍처

이 문서는 코드가 어떻게 나뉘어 있고 데이터가 어떻게 흐르는지 설명합니다. 게임 규칙·밸런스 수치는 [REQUIREMENTS.md](REQUIREMENTS.md)를 보세요.

## 설계 원칙

1. **엔진은 순수 함수** — `src/lib/game/engine.ts`는 React·DOM·오디오를 모릅니다. `(이전 상태, 시각) → 새 상태`만 계산합니다. 그래서 Node로 단독 실행해 시뮬레이션·검증할 수 있습니다.
2. **UI는 표현만** — `Game.tsx`는 상태를 그리고 액션을 전달할 뿐, 게임 규칙을 갖지 않습니다.
3. **초당 60번 변하는 것은 캔버스에, 가끔 변하는 것만 React에** (jd-02 원칙) — 픽셀 뷰와 미니게임은 rAF 루프 + 클로저 지역 변수로 돌고, React 상태는 1초 틱과 액션 결과만 받습니다.
4. **사건은 로그로 통일** — 엔진의 모든 사건은 kind(`info/gain/warn/evo/sys`)가 붙은 로그를 남기고, UI(색상)와 사운드(효과음 매핑)가 이를 공통으로 소비합니다.

## 데이터 흐름

```
                ┌───────────────────────────────────────┐
                │              GameState                │
                │  (단일 상태 객체 — types.ts 정의)      │
                └───────────────────────────────────────┘
   부팅 시            ▲                        │
   loadState() ───▶ catchUp(부재중 정산)       │ 매 변경마다
                      ▲                        ▼
   1초 인터벌 ────▶ tick(s, now)          saveState()
   유저 버튼  ────▶ act(s, action, now)   (localStorage)
   미니게임 종료 ─▶ settleSortie(s, 결과)
                      │
                      ▼ 새 GameState
        ┌─────────────┼──────────────┐
        ▼             ▼              ▼
   상태 패널/로그   PixelView      사운드 훅
   (React 렌더)   (rAF 캔버스)   (새 로그 kind → 효과음)
```

- 엔진 함수는 항상 **새 객체를 반환**합니다(불변 업데이트). 실패한 액션은 원본을 그대로 반환해 React 리렌더를 건너뜁니다.
- 수동 조종 중에는 1초 틱을 멈춰(`sortieRef`) 자동 수거와 이중으로 벌리는 것을 막습니다.

## 모듈별 역할

### `lib/game/` — 게임 코어 (React 무관)

| 파일 | 역할 |
| --- | --- |
| `types.ts` | `GameState`·`Phase`·`Branch`·`DebrisOffer`·`LogEntry` 타입. 상태 필드를 추가하면 여기부터 |
| `engine.ts` | 게임 규칙의 전부. 상수(쿨다운·임계값·이벤트 확률)와 `initialState`/`tick`/`act`/`catchUp`/`settleSortie`/`bragCard`. 진화(`checkEvolution`)와 계열 분기(`buildTendency`)도 여기 |
| `storage.ts` | localStorage 저장/로드. **구버전 세이브 백필** — 새 상태 필드를 추가하면 여기에 기본값을 보강해야 기존 유저가 크래시하지 않음 |
| `sprites.ts` | 픽셀 스프라이트를 문자열 그리드 + 팔레트로 정의. `drawSprite`로 캔버스에 찍음. PWA 아이콘도 이 데이터에서 생성 |
| `sound.ts` | Web Audio 신시사이저. `chirp`(단음 합성) 기반 효과음들, 로그 kind 매핑(`playLogSound`), 추진 엔진음 루프, 뮤트 저장 |

### `components/` — 표현 계층

| 파일 | 역할 |
| --- | --- |
| `Game.tsx` | 메인 컴포넌트. 부팅(로드+정산), 1초 틱, 자동 저장, 액션 디스패치, 새 로그 → 사운드 훅, PWA 설치 버튼, 뮤트, 푸터 |
| `PixelView.tsx` | 본편 캔버스(240×200). phase별 씬(지상/발사/궤도)과 이벤트 연출(유성우 스트릭·플레어 오버레이·대형 잔해 마커)을 rAF로 그림. 상태는 `stateRef`로 읽기만 |
| `SortieGame.tsx` | 수동 조종 미니게임. 아래 별도 설명 |
| `SwRegister.tsx` | 프로덕션에서만 서비스 워커 등록. 등록 URL에 `?v={package.json version}`을 붙여 캐시 세대를 연동 |

### 미니게임(`SortieGame.tsx`)의 루프 구조

jd-02의 게임 본체 구조를 그대로 따릅니다:

- 게임 상태(펫 위치·속도, 잔해 배열, 연료, 조그셔틀…)는 전부 `useEffect` **클로저 지역 변수**. React state는 없음
- `update(dt)`는 상태만 바꾸고, `draw()`는 읽기만 함 — 섞이면 디버깅 지옥
- `dt`는 0.05초로 상한 — 백그라운드 탭 복귀 시 물체가 화면을 뚫는 터널링 방지
- 배열 삭제는 **역순 순회 + splice**
- 화면 맞춤: 뷰포트 비율로 논리 해상도를 동적 결정(`fit()`), 픽셀 스케일 하한으로 도트 감성 유지
- 종료는 `finish()` 한 곳으로 수렴(중복 호출 가드) → `onEnd(결과)` → 부모가 `settleSortie`로 본편에 정산
- 손맛 수치는 파일 상단 `TUNE` 상수에 모여 있음 — 밸런스 조정은 로직이 아니라 여기부터

### PWA

- `app/manifest.ts` — 매니페스트(전체화면 실행, 아이콘, 세로 고정). Next가 `/manifest.webmanifest`로 서빙·자동 링크
- `public/sw.js` — 서비스 워커. 네비게이션은 **네트워크 우선**(온라인이면 항상 최신, 오프라인이면 캐싱된 셸), `/_next/static/`·`/icons/`는 캐시 우선(해시 자산이라 불변), 나머지는 stale-while-revalidate
- 캐시 이름은 등록 URL의 `?v=`에서 — `package.json` 버전 업 → 새 워커 → 이전 세대 캐시 자동 정리

## 검증 방법

엔진이 순수 함수라서 브라우저 없이 검증할 수 있습니다. Node 22+는 TypeScript를 직접 실행하므로:

```js
// sim.mjs — engine.ts를 그대로 불러와 시뮬레이션
import { writeFileSync, readFileSync } from "node:fs";
writeFileSync("types.ts", readFileSync("src/lib/game/types.ts", "utf8"));
writeFileSync("engine.ts",
  readFileSync("src/lib/game/engine.ts", "utf8").replace('from "./types"', 'from "./types.ts"'));
const E = await import("./engine.ts");

let now = 0;
let s = E.initialState("테스트", now);
for (let i = 0; i < 3; i++) s = E.act(s, "incubate", (now += 4000));
// … 원하는 시나리오를 코드로 돌려보고 상태를 검사
```

UI·미니게임은 `npm run dev`로 직접 플레이해 확인합니다. 커밋 전 `npm run build`가 린트와 타입 체크를 겸합니다.

## 새 콘텐츠를 추가할 때 체크리스트

1. 상태 필드 추가 → `types.ts` + `initialState` + **`storage.ts` 백필**
2. 규칙/수치 → `engine.ts` (UI에 게임 로직을 넣지 않기)
3. 사건은 `pushLog`로 — 로그 색과 사운드가 공짜로 따라옴
4. 밸런스 수치를 바꿨다면 → [REQUIREMENTS.md](REQUIREMENTS.md)의 해당 표·수치 동기화
5. `npm run build` 통과 확인
