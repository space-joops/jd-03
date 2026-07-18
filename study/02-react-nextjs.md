# 2장 — React와 Next.js: 화면은 어떻게 그려지나

> React를 이미 아신다면 **2.5절(이 프로젝트의 React 사용 규칙)** 만 읽고 넘어가세요.

## 2.1 React의 핵심 아이디어 한 문장

> **"상태(state)가 바뀌면 화면이 알아서 다시 그려진다."**

옛날 방식(순수 JS)은 이랬습니다.

```js
// 값이 바뀔 때마다 화면을 손으로 갱신해야 함
energy = energy + 25;
document.getElementById("energy-bar").style.width = energy + "%";
document.getElementById("energy-text").textContent = energy;
// 갱신할 곳을 하나라도 빠뜨리면 화면과 데이터가 어긋남 ← 버그의 주범
```

React는 이렇게 합니다.

```jsx
// 값만 바꾸면 됨. 화면은 React가 알아서 다시 그림
setEnergy(energy + 25);

// 화면은 "지금 값이 이러면 이렇게 보인다"만 선언
return <div style={{ width: energy + "%" }}>{energy}</div>;
```

**화면 = 상태를 그린 함수**라는 게 React의 전부입니다.

## 2.2 컴포넌트와 JSX

컴포넌트는 **화면 조각을 만드는 함수**입니다. 이름은 대문자로 시작합니다.

```tsx
// src/components/Game.tsx 에 있는 실제 컴포넌트 (단순화)
function Bar({ label, value, max, color }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span>{label}</span>
      <div className="h-3 flex-1 border">
        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// 사용할 땐 HTML 태그처럼
<Bar label="에너지" value={state.energy} max={100} color="#f4b860" />
```

`{ label, value, max, color }`처럼 컴포넌트가 받는 값을 **props(속성)** 라고 합니다.

### JSX 규칙 5가지

```jsx
// 1. class가 아니라 className
<div className="text-red">

// 2. 중괄호 안에 자바스크립트 표현식
<span>{state.debrisKg.toLocaleString()}kg</span>

// 3. 조건부 렌더링 — && 또는 삼항
{state.phase === "orbit" && <p>궤도 임무 중</p>}
{isWin ? <p>성공!</p> : <p>실패…</p>}

// 4. 목록은 map + key
{state.log.map((e, i) => <p key={`${e.t}-${i}`}>{e.msg}</p>)}

// 5. 스타일 객체는 카멜케이스
<div style={{ backgroundColor: "#fff", imageRendering: "pixelated" }} />
```

> `key`는 React가 목록의 각 항목을 구분하는 이름표입니다. 없으면 경고가 뜨고, 목록이 바뀔 때 엉뚱한 항목이 재사용될 수 있습니다.

## 2.3 useState — 기억하는 값

```tsx
const [state, setState] = useState<GameState | null>(null);
//     ↑현재값  ↑바꾸는함수              ↑초기값
```

`setState`를 호출하면 React가 **컴포넌트 함수를 처음부터 다시 실행**해서 새 화면을 만듭니다.

**중요:** 값을 직접 고치면 안 됩니다.

```tsx
state.energy = 100;        // ❌ 화면이 안 바뀜. React가 변경을 눈치채지 못함
setState({ ...state, energy: 100 });  // ⭕ 새 객체를 주면 React가 알아챔
```

### 왜 복사해야 하나?

React는 "이전 상태와 새 상태가 **같은 객체인가**"만 비교합니다(주소 비교). 내용물을 하나하나 뒤지지 않습니다. 빠르기 때문입니다.

```js
const a = { x: 1 };
const b = a;      b.x = 2;  a === b  // true  → "안 바뀌었다"고 판단 ❌
const c = { ...a, x: 2 };            // a !== c → "바뀌었다"고 판단 ⭕
```

그래서 이 프로젝트의 엔진 함수들은 **항상 새 객체를 반환**합니다.

```ts
// engine.ts — 모든 상태 변경 함수의 첫 줄
const s: GameState = { ...prev, cd: { ...prev.cd }, log: [...prev.log] };
```

`cd`(쿨다운 객체)와 `log`(배열)까지 따로 복사하는 이유는, 스프레드가 **한 겹만 복사(얕은 복사)** 하기 때문입니다. 안쪽 객체는 여전히 같은 것을 가리키므로, 그 안을 고치면 원본도 바뀝니다. 그래서 손댈 것들은 한 겹 더 복사해 둡니다.

### 이전 값으로 계산할 땐 함수형 업데이트

```tsx
// ❌ 위험: state가 낡은 값일 수 있음
setState(tick(state, Date.now()));

// ⭕ 안전: React가 최신 값을 넣어줌
setState((s) => (s ? tick(s, Date.now()) : s));
```

1초마다 도는 타이머처럼 **오래 살아있는 함수** 안에서는 반드시 함수형을 써야 합니다. 이 프로젝트의 틱 코드가 그렇습니다.

## 2.4 useEffect — 화면 밖의 일 처리하기

타이머 등록, 이벤트 구독, 저장 같은 **화면 그리기 외의 일**은 `useEffect`에서 합니다.

```tsx
useEffect(() => {
  // ① 실행할 일
  const id = setInterval(() => { ... }, 1000);

  // ② 정리(cleanup) — 컴포넌트가 사라질 때 실행
  return () => clearInterval(id);
}, []);  // ③ 의존성 배열
```

**의존성 배열(③)의 의미**

| 배열 | 언제 실행되나 |
| --- | --- |
| `[]` | 처음 한 번만 |
| `[state]` | `state`가 바뀔 때마다 |
| 없음 | 매 렌더마다 (거의 안 씀) |

**정리 함수(②)를 빼먹으면** 타이머가 계속 쌓이거나 이벤트 리스너가 중복 등록되어, 원인 모를 버그가 생깁니다. 이 프로젝트에서 정리 함수가 없는 `useEffect`는 하나도 없습니다.

### 이 프로젝트의 실제 useEffect들 (`Game.tsx`)

```tsx
// 1) 부팅: 저장된 게임 불러오기 + 자리 비운 동안 정산
useEffect(() => {
  const saved = loadState();
  if (saved) setState(catchUp(saved, Date.now()));
  setBooted(true);
}, []);

// 2) 1초 게임 틱
useEffect(() => {
  const id = setInterval(() => {
    setState((s) => (s && !sortieRef.current ? tick(s, Date.now()) : s));
  }, 1000);
  return () => clearInterval(id);
}, []);

// 3) 자동 저장: 상태가 바뀔 때마다
useEffect(() => {
  if (state) saveState(state);
}, [state]);
```

세 개가 각각 **로드 / 진행 / 저장**을 담당합니다. 게임의 심장이 이 세 덩어리입니다.

## 2.5 useRef — 리렌더 없이 기억하기

`useState`는 값이 바뀌면 화면을 다시 그립니다. 그런데 **화면과 무관한 값**을 기억하고 싶을 때가 있습니다. 그럴 때 `useRef`를 씁니다.

```tsx
const timer = useRef(null);   // timer.current 에 값을 넣고 뺌
timer.current = setTimeout(...);  // 이걸 바꿔도 화면은 다시 안 그려짐
```

이 프로젝트에서의 활용:

```tsx
// ① 타이머 핸들 보관 (토스트 자동 닫기)
const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

// ② 오래 사는 함수 안에서 최신 값 읽기
const sortieRef = useRef(false);
sortieRef.current = sortie;   // 매 렌더마다 최신값 동기화
// → 1초 틱(한 번만 등록된 함수)에서 sortieRef.current로 지금 값을 읽음

// ③ 캔버스 DOM 요소 잡기
const canvasRef = useRef<HTMLCanvasElement>(null);
<canvas ref={canvasRef} />   // canvasRef.current 가 실제 <canvas> 요소
```

②번이 특히 중요합니다. `useEffect(..., [])`로 한 번만 등록한 함수는 **그때의 값에 갇힙니다(stale closure)**. `useRef`를 통해 최신 값을 들여다보는 것이 표준 해법입니다.

### 이 프로젝트의 React 사용 규칙 ⭐

> **"초당 60번 변하는 것은 캔버스에, 가끔 변하는 것만 React에."**

- 펫의 좌표·속도·잔해 배열처럼 **1초에 60번 바뀌는 값**은 `useState`에 넣지 않습니다. `useEffect` 안의 지역 변수로 두고 캔버스에 직접 그립니다. (7장 미니게임 참고)
- `useState`에 들어가는 것은 게임 상태(1초에 1번), 토스트, 모달 열림 여부처럼 **가끔 바뀌는 것**뿐입니다.

매 프레임 `setState`를 하면 초당 60번 리렌더가 일어나 게임이 버벅입니다. 이 규칙은 성능을 위한 것입니다.

## 2.6 Next.js — React에 얹은 뼈대

Next.js는 React로 웹사이트를 만들 때 필요한 것들(라우팅, 빌드, 서버 기능)을 제공합니다.

### 파일이 곧 주소 (App Router)

```
src/app/page.tsx           → https://사이트/
src/app/rank/page.tsx      → https://사이트/rank
src/app/c/page.tsx         → https://사이트/c
src/app/api/og/route.tsx   → https://사이트/api/og   (이미지를 만들어 응답)
src/app/layout.tsx         → 모든 페이지를 감싸는 껍데기
```

폴더를 만들고 그 안에 `page.tsx`를 넣으면 그 주소가 생깁니다. 라우터 설정 파일이 따로 없습니다.

### "use client" — 이게 무슨 뜻인가

Next.js는 기본적으로 컴포넌트를 **서버에서** 실행합니다(빠른 첫 화면). 하지만 `useState`, 클릭 이벤트, 브라우저 API(localStorage, canvas)를 쓰려면 **브라우저에서** 실행돼야 합니다. 그때 파일 맨 위에 이렇게 씁니다.

```tsx
"use client";
```

이 프로젝트에서 `Game.tsx`, `PixelView.tsx`, `SortieGame.tsx`, `rank/page.tsx`가 클라이언트 컴포넌트입니다. 게임이니 당연합니다.

반대로 `c/page.tsx`는 서버에서 링크 미리보기 정보(OG 태그)를 만들어야 해서 서버 컴포넌트입니다.

> 💡 **에러 힌트**: "useState는 서버 컴포넌트에서 쓸 수 없다"는 에러가 나면 파일 맨 위에 `"use client";`를 빠뜨린 것입니다.

### 정적 vs 동적

빌드 결과를 보면 이런 표시가 있습니다.

```
○  /            (Static)   — 미리 만들어둔 HTML. 매우 빠름
ƒ  /c           (Dynamic)  — 요청마다 서버가 생성
ƒ  /api/og      (Dynamic)  — 요청마다 이미지 생성
```

게임 본체(`/`)는 정적이라 CDN에서 바로 내려갑니다. 개인화된 링크 미리보기가 필요한 `/c`와 `/api/og`만 서버에서 돕니다.

### 환경 변수

```ts
process.env.NEXT_PUBLIC_SUPABASE_URL
```

- `NEXT_PUBLIC_`으로 시작하면 **브라우저에서도** 읽을 수 있습니다(빌드할 때 코드에 박힙니다).
- 접두사가 없으면 서버에서만 읽힙니다.
- 값이 바뀌면 **다시 빌드/배포해야** 반영됩니다.
- 로컬 값은 `.env.local`에 있고, 이 파일은 git에 올라가지 않습니다(비밀 유지).

## 2.7 이 프로젝트의 데이터 흐름 그림

```
      [localStorage]                     [Supabase]
           │ 읽기                             ↑ 동의 후 동기화
           ↓                                  │
   ┌──────────────────────────────────────────────────┐
   │   Game.tsx  (useState<GameState>)                │
   │                                                  │
   │   1초 타이머 ─→ tick(state, now) ─→ 새 state      │
   │   버튼 클릭  ─→ act(state, "feed", now) ─→ 새 state│
   │   미니게임 종료 ─→ settleSortie(...) ─→ 새 state   │
   └──────────────────────────────────────────────────┘
           │ state가 바뀌면
           ├─→ 화면 다시 그리기 (상태 바, 로그, 버튼)
           ├─→ PixelView가 캔버스에 그림
           ├─→ 새 로그 감지 → 효과음 재생 + 공유 제안
           └─→ localStorage에 자동 저장
```

**모든 게임 규칙은 `tick`/`act`/`settleSortie` 세 함수 안에만 있습니다.** UI는 이 함수들을 부르고 결과를 그릴 뿐입니다. 이 분리가 이 프로젝트에서 가장 중요한 설계입니다 — 덕분에 게임 규칙을 브라우저 없이 테스트할 수 있습니다(4장 참고).

---

## 정리

- React: **상태를 바꾸면 화면이 따라온다.** 상태는 직접 고치지 말고 새 객체로 교체한다
- `useEffect`: 타이머·이벤트 같은 부수 작업, **정리 함수 필수**
- `useRef`: 리렌더 없이 값 기억 / 오래 사는 함수에서 최신 값 읽기 / DOM 잡기
- 이 프로젝트 규칙: **60fps는 캔버스, 가끔 바뀌는 것만 React**
- Next.js: 폴더 = 주소, 브라우저 기능 쓰려면 `"use client"`

다음: [3장 — 프로젝트 전체 지도](03-project-tour.md)
