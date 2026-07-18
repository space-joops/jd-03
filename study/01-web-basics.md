# 1장 — 웹 개발 기초 체력

> 이 장은 **웹 개발이 처음인 분**을 위한 것입니다. HTML/CSS/JS를 이미 안다면 [2장](02-react-nextjs.md)으로 건너뛰세요.
> 이 프로젝트를 이해하는 데 **실제로 필요한 것만** 골라 설명합니다.

## 1.1 웹 페이지는 세 가지로 만들어진다

| 언어 | 역할 | 비유 |
| --- | --- | --- |
| HTML | 구조 (무엇이 있는가) | 건물의 뼈대 |
| CSS | 모양 (어떻게 보이는가) | 페인트와 인테리어 |
| JavaScript | 동작 (무엇을 하는가) | 전기·수도 배선 |

```html
<!-- HTML: 버튼이 하나 있다 -->
<button id="feed">먹이 주기</button>
```
```css
/* CSS: 그 버튼은 초록색이다 */
#feed { color: green; }
```
```js
// JavaScript: 그 버튼을 누르면 무슨 일이 일어난다
document.getElementById("feed").addEventListener("click", () => {
  console.log("냠냠!");
});
```

이 프로젝트에서는 세 가지가 조금 다른 모습으로 나타납니다.

- HTML → **JSX** (자바스크립트 안에 HTML처럼 쓰는 문법, 2장에서 설명)
- CSS → **Tailwind CSS** (`className="text-red-500"`처럼 클래스 이름으로 스타일 지정, 9장에서 설명)
- JavaScript → **TypeScript** (타입이 추가된 자바스크립트, 아래에서 설명)

## 1.2 JavaScript에서 꼭 알아야 할 문법 6개

이 프로젝트 코드에 계속 나오는 것들입니다.

### ① 화살표 함수

```js
// 옛날 방식
function add(a, b) { return a + b; }

// 화살표 함수 (같은 뜻)
const add = (a, b) => a + b;
```

프로젝트 예시 (`engine.ts`):
```ts
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
```
`clamp`는 "값을 최소~최대 범위 안에 가두는" 함수입니다. 기분(mood)이 100을 넘거나 0 밑으로 내려가지 않게 할 때 씁니다.

### ② 구조 분해와 스프레드(`...`)

```js
const pet = { name: "코스모", energy: 60 };

// 스프레드: 기존 것을 복사하면서 일부만 바꾼 새 객체 만들기
const fed = { ...pet, energy: 85 };
// fed = { name: "코스모", energy: 85 }  ← pet은 그대로!
```

**이 프로젝트에서 가장 중요한 문법입니다.** 게임 상태를 바꿀 때 원본을 수정하지 않고 항상 새 객체를 만듭니다(이유는 2장 "왜 복사하나"에서).

```ts
// engine.ts의 tick 함수 첫 줄 — 이 패턴이 계속 반복됩니다
const s: GameState = { ...prev, cd: { ...prev.cd }, log: [...prev.log] };
```

### ③ 옵셔널 체이닝(`?.`)과 널 병합(`??`)

```js
const x = obj?.name;      // obj가 없으면 에러 대신 undefined
const y = value ?? 10;    // value가 null이나 undefined면 10을 사용
```

프로젝트 예시 (`engine.ts`의 쿨다운 확인):
```ts
const readyAt = prev.cd[action] ?? 0;   // 이 액션을 쓴 적이 없으면 0(=언제든 가능)
```

### ④ 삼항 연산자

```js
const label = isHungry ? "배고픔" : "배부름";
// if/else를 한 줄로 쓴 것
```

### ⑤ 배열 다루기

```js
const nums = [1, 2, 3];
nums.map(n => n * 2);        // [2, 4, 6] — 각각 변환한 새 배열
nums.filter(n => n > 1);     // [2, 3]    — 조건에 맞는 것만
nums.reduce((a, b) => a + b, 0); // 6     — 하나로 합치기
```

프로젝트 예시 (잔해 테이블의 가중치 총합):
```ts
const DEBRIS_TOTAL_W = DEBRIS_TABLE.reduce((a, d) => a + d.w, 0);
```

### ⑥ async / await (비동기)

네트워크 요청이나 파일 처리처럼 **시간이 걸리는 일**은 결과를 기다려야 합니다.

```js
async function load() {
  const data = await fetchSomething();  // 끝날 때까지 기다림
  console.log(data);
}
```

프로젝트 예시 (공유 카드 만들기):
```ts
const blob = await renderBragCard(s);   // 그림 그리기가 끝날 때까지 기다림
await navigator.share({ files: [file] });
```

## 1.3 TypeScript — 타입이 붙은 JavaScript

TypeScript는 자바스크립트에 **"이 값은 숫자다", "이 값은 문자열이다"** 라는 표시를 붙인 것입니다. 실수를 미리 잡아줍니다.

```ts
let energy: number = 60;
energy = "많음";  // ❌ 에디터가 바로 빨간 줄로 알려줌
```

### 이 프로젝트에서 쓰는 타입 문법

```ts
// 1) interface — 객체의 모양 정의
interface LogEntry {
  t: number;      // 시각
  msg: string;    // 메시지
  kind: LogKind;  // 종류
}

// 2) 유니온 타입 — "이것들 중 하나"
type Phase = "egg" | "ground" | "awaiting" | "launching" | "orbit";
// phase에는 이 5개 문자열만 들어갈 수 있음. 오타를 원천 차단!

// 3) Record — 키-값 짝의 사전
const COOLDOWNS: Record<string, number> = { feed: 6_000, care: 5_000 };
// "문자열 키에 숫자 값" 이라는 뜻

// 4) 옵셔널(?) — 있어도 되고 없어도 됨
interface DebrisType {
  name: string;
  bonus?: "speed" | "pull" | "prop";  // 없을 수도 있음
}

// 5) null 허용
windowAt: number | null;   // 숫자이거나 null
```

> 💡 `6_000`의 밑줄은 읽기 쉬우라고 넣은 자릿수 구분입니다. `6000`과 완전히 같습니다.

### 타입 에러가 나면?

에러 메시지는 **파일:줄번호**를 알려줍니다. 대부분 이 셋 중 하나입니다.
- 오타 (`s.moode` → `s.mood`)
- null 체크 안 함 (`s.offer.kg` → `s.offer && s.offer.kg`)
- 타입 불일치 (숫자 자리에 문자열)

## 1.4 브라우저가 제공하는 도구들 (Web API)

이 프로젝트는 라이브러리 대신 **브라우저에 이미 들어있는 기능**을 적극적으로 씁니다. 아래는 실제로 쓰는 것들입니다.

| API | 하는 일 | 이 프로젝트에서 |
| --- | --- | --- |
| `localStorage` | 브라우저에 데이터 저장 (새로고침해도 남음) | 게임 세이브 |
| `<canvas>` | 그림 그리기 | 픽셀 아트 캐릭터·미니게임 |
| `requestAnimationFrame` | 초당 60번 함수 실행 | 게임 화면 애니메이션 |
| `setInterval` | 일정 간격으로 함수 실행 | 1초마다 게임 진행 |
| Web Audio | 소리 합성 | 모든 효과음 |
| Pointer Events | 마우스·터치 통합 입력 | 미니게임 조종 |
| Web Share | 네이티브 공유 시트 | 자랑 카드 공유 |
| Service Worker | 오프라인 캐싱 | PWA |
| Fullscreen API | 전체화면 전환 | 미니게임 |

### localStorage 맛보기

```js
localStorage.setItem("키", "값");        // 저장 (문자열만 가능)
const v = localStorage.getItem("키");   // 읽기
localStorage.removeItem("키");          // 삭제
```

객체를 저장하려면 문자열로 바꿔야 합니다.

```js
localStorage.setItem("save", JSON.stringify(gameState));  // 객체 → 문자열
const state = JSON.parse(localStorage.getItem("save"));   // 문자열 → 객체
```

이게 바로 `src/lib/game/storage.ts`가 하는 일의 전부입니다.

> ⚠️ localStorage는 **브라우저별·기기별로 따로** 저장됩니다. 크롬에서 키운 펫이 사파리엔 없고, 시크릿 창에선 매번 새 게임입니다. 개발 중 "게임을 처음부터" 하고 싶으면 시크릿 창을 쓰거나 화면 하단 "초기화"를 누르세요.

### 시간 다루기

```js
Date.now()   // 1970년부터 지금까지 흐른 밀리초 (예: 1784822400000)
```

게임에서 "3초 쿨다운"은 이렇게 표현합니다.
```ts
s.cd[action] = now + 3000;          // 3초 뒤 시각을 저장해두고
if (now < s.cd[action]) return prev; // 아직 그 시각 전이면 거부
```
"남은 시간"을 계속 빼는 게 아니라 **끝나는 시각을 저장**하는 방식입니다. 앱이 꺼져 있어도 정확하고 계산도 간단합니다. 게임 코드 전반에서 이 패턴(`boostUntil`, `meteorUntil`, `expiresAt`)이 반복됩니다.

## 1.5 개발자 도구 (F12) — 반드시 익히세요

브라우저에서 `F12`를 누르면 열립니다. 개발자의 청진기입니다.

| 탭 | 용도 |
| --- | --- |
| **Console** | `console.log()` 출력과 에러 메시지 확인 |
| **Elements** | 화면 요소의 HTML/CSS 실시간 확인·수정 |
| **Application** | localStorage 값 확인·삭제, 서비스 워커 관리 |
| **Network** | 서버 통신 내역 (Supabase 요청 확인용) |
| 기기 툴바 | 휴대폰 화면 크기로 시뮬레이션 (레이아웃 확인 필수) |

**가장 자주 쓰게 될 3가지**
1. 코드 중간에 `console.log("여기까지 왔나?", 값);` 넣고 Console에서 확인
2. Application → Local Storage → `stellapet-save-v1` 삭제 = 게임 초기화
3. 기기 툴바로 세로/가로 전환해 레이아웃 깨짐 확인

## 1.6 터미널 명령어

```bash
npm install        # package.json에 적힌 라이브러리 설치
npm run dev        # 개발 서버 (코드 고치면 자동 반영)
npm run build      # 배포용 빌드 + 린트 + 타입 검사
npm run start      # 빌드 결과 실행 (PWA·서비스 워커 테스트용)

git status         # 지금 뭘 고쳤는지
git diff           # 구체적으로 어떻게 고쳤는지
git log --oneline  # 지금까지의 작업 기록
```

> 💡 **`npm run dev`와 `npm run start`의 차이**
> `dev`는 개발용(빠른 반영, 서비스 워커 꺼짐), `start`는 실제 배포와 같은 환경입니다. PWA 설치나 오프라인을 테스트하려면 반드시 `npm run build && npm run start`를 쓰세요.

---

## 정리

- 이 프로젝트의 자바스크립트는 **스프레드(`...`)로 복사해서 새 객체 만들기**가 핵심 패턴이다
- TypeScript의 유니온 타입(`"egg" | "ground"`)이 게임 단계 같은 걸 안전하게 표현한다
- 라이브러리 대신 **브라우저 기본 기능**(canvas, localStorage, Web Audio)을 직접 쓴다
- 시간은 "남은 시간"이 아니라 **"끝나는 시각"** 으로 저장한다
- F12 개발자 도구는 매일 쓰게 된다

다음: [2장 — React와 Next.js](02-react-nextjs.md)
