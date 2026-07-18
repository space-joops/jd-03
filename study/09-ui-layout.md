# 9장 — UI와 반응형 레이아웃 (`Game.tsx`, Tailwind)

> 화면 배치와 스타일을 다룹니다. **레이아웃 버그를 두 번이나 만든** 실전 사례도 담았습니다.

## 9.1 Tailwind CSS — 클래스로 스타일 쓰기

전통적인 CSS는 이렇게 씁니다.
```css
.button { display: flex; padding: 8px; color: #7ee8a2; }
```

Tailwind는 미리 만들어둔 작은 클래스를 조합합니다.
```tsx
<button className="flex p-2 text-[#7ee8a2]">
```

**장점:** 파일을 오가지 않고 바로 보이며, 클래스 이름을 고민할 필요가 없고, 안 쓰는 CSS가 남지 않습니다.
**단점:** 클래스가 길어집니다. (이 프로젝트도 꽤 깁니다)

### 이 프로젝트에서 자주 보는 클래스

| 클래스 | 의미 |
| --- | --- |
| `flex`, `flex-col` | 가로/세로 배치 |
| `grid grid-cols-4` | 4열 격자 |
| `gap-2` | 자식 간 간격 8px |
| `px-3 py-2` | 좌우 12px, 위아래 8px 안쪽 여백 |
| `w-full`, `flex-1` | 폭 100%, 남은 공간 차지 |
| `shrink-0` | 공간이 부족해도 **줄어들지 않음** |
| `overflow-y-auto` | 내용이 넘치면 세로 스크롤 |
| `text-[13px]`, `text-[#7ee8a2]` | 임의 값 (대괄호 문법) |
| `border-2 border-[#1c2440]` | 2px 테두리 |
| `sticky bottom-0 z-10` | 스크롤해도 하단에 붙어있기 |
| `landscape:flex-row` | 가로 화면일 때만 적용 |
| `disabled:opacity-40` | 비활성 상태일 때만 적용 |

**숫자 규칙:** `p-1`=4px, `p-2`=8px, `p-3`=12px, `p-4`=16px (4의 배수)

### 커스텀 스타일은 `globals.css`에

Tailwind로 표현하기 어려운 것들은 전역 CSS에 있습니다.

```css
/* CRT 스캔라인 오버레이 — 레트로 모니터 느낌 */
.scanlines {
  position: fixed; inset: 0; z-index: 50;
  pointer-events: none;            /* ⭐ 클릭이 통과하도록! */
  background: repeating-linear-gradient(
    to bottom,
    rgba(0,0,0,0.14) 0px, rgba(0,0,0,0.14) 1px,
    transparent 1px, transparent 3px
  );
}

/* 픽셀 버튼 — 안쪽 그림자로 입체감 */
.pixel-btn {
  border: 2px solid var(--line);
  background: var(--panel);
  color: var(--mint);
  box-shadow: inset 0 -3px 0 rgba(0,0,0,0.45);   /* 아래쪽이 눌린 느낌 */
}
.pixel-btn:not(:disabled):active {
  box-shadow: inset 0 3px 0 rgba(0,0,0,0.45);    /* 누르면 위쪽으로 반전 */
}

/* 게이지 바 — 세그먼트 느낌 */
.seg-fill {
  background-image: repeating-linear-gradient(to right, transparent 0 4px, rgba(0,0,0,0.35) 4px 5px);
  transition: width 0.4s steps(8);   /* ⭐ steps = 뚝뚝 끊기는 레트로 애니메이션 */
}
```

`transition: steps(8)`이 재미있는 부분입니다. 부드럽게 늘어나는 대신 8칸으로 뚝뚝 끊겨 **옛날 게임기 게이지**처럼 보입니다.

`pointer-events: none`이 없으면 스캔라인이 화면 전체를 덮어 **모든 클릭이 막힙니다.** 오버레이를 만들 때 반드시 기억하세요.

## 9.2 `Game.tsx`의 구조

792줄로 가장 크지만 뼈대는 단순합니다.

```
1. 상수·타입 (LOG_COLORS, DEMO_STATE 등)
2. 작은 컴포넌트들 (Bar, ActionButton, Intro)
3. Game 컴포넌트
   3-1. useState 선언들 (state, toast, sortie, sharePrompt…)
   3-2. useEffect들 (부팅/틱/저장/사운드/PWA/리더보드/도전장)
   3-3. 핸들러들 (dispatch, brag, reset, startSortie…)
   3-4. JSX (헤더 → 픽셀뷰 → 상태패널 → 배너 → 로그 → 버튼 → 푸터)
```

### 작은 컴포넌트로 반복 줄이기

```tsx
function Bar({ label, value, max, color }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] text-[#8b93b5]">{label}</span>
      <div className="h-3 flex-1 border border-[#1c2440] bg-[#0b0f1e]">
        <div className="h-full seg-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-10 shrink-0 text-right text-[11px]" style={{ color }}>
        {Math.round(value)}
      </span>
    </div>
  );
}
```

에너지·기분·추진제·진화도 게이지가 전부 이 하나로 그려집니다. **같은 모양이 세 번 이상 나오면 컴포넌트로 뽑으세요.**

### 쿨다운 버튼

```tsx
function ActionButton({ label, icon, onClick, remainMs, disabled }) {
  const onCd = remainMs > 0;
  return (
    <button onClick={onClick} disabled={onCd || disabled}
      className="pixel-btn flex flex-col items-center gap-0.5 py-2.5 ... disabled:opacity-40">
      <span className="text-lg leading-none">{icon}</span>
      <span>{onCd ? `${Math.ceil(remainMs / 1000)}s` : label}</span>
    </button>
  );
}
```

쿨다운 중이면 **라벨 자리에 남은 초를 표시**합니다. 별도 타이머 없이, 1초 틱마다 리렌더되며 자연스럽게 갱신됩니다.

```tsx
const now = state.lastTick;
const cd = (a: string) => Math.max(0, (state.cd[a] ?? 0) - now);
```

## 9.3 조건부 렌더링 — phase별로 다른 화면

```tsx
{(state.phase === "egg" || state.phase === "ground" || state.phase === "awaiting") && (
  <>
    {state.phase === "egg" ? (
      <p>🥚 알 품기 {state.hatch}/3 — 품어주기를 눌러 부화시키세요</p>
    ) : (
      <div>체중 {state.weightG}g / 500g · 훈련 {state.training} / 30</div>
    )}
    <Bar label="에너지" value={state.energy} max={100} color="#f4b860" />
    <Bar label="기분" value={state.mood} max={100} color="#ef8fb8" />
  </>
)}

{state.phase === "orbit" && ( /* 궤도 전용 패널 */ )}
```

`<>...</>`는 **프래그먼트**입니다. 여러 요소를 감싸되 실제 DOM은 만들지 않습니다.

버튼도 phase에 따라 통째로 바뀝니다.
```tsx
{state.phase === "egg" && <ActionButton label="품어주기" ... />}
{(state.phase === "ground" || state.phase === "awaiting") && (
  <>먹이 · 보살핌 · 훈련 · 자랑</>
)}
{state.phase === "orbit" && !sortie && (
  <>조종 · 부스트 · 교신 · 보급 · 자랑</>   // 5개라 grid-cols-5
)}
```

## 9.4 레이아웃 버그 실전 사례 ⭐

이 프로젝트에서 **같은 증상의 버그가 두 번** 발생했습니다. 배울 점이 많아 그대로 기록합니다.

### 증상
> "로그가 쌓이면 액션 버튼이 화면 아래로 밀려서 안 보여요."

### 원인 분석

화면은 이렇게 쌓여 있습니다.
```
헤더 (약 30px)
픽셀 뷰 (폭에 비례한 높이 — 390px 폰에서 약 325px!)
상태 패널 (약 150px)
[배너들 — 견인 제안, 공유 제안이 뜨면 +50px씩]
로그 (flex-1, 최소 96px)
액션 버튼 (약 60px)
푸터 (약 20px)
```

**고정 높이 요소들의 합이 화면 높이를 넘으면** 본문 전체가 스크롤되면서 맨 아래 버튼이 화면 밖으로 나갑니다. 로그가 늘어나서라기보다, **픽셀 뷰가 세로를 너무 많이 차지하는 상태에서 배너까지 뜨면** 터지는 것이었습니다.

### 재현 방법 (중요한 기술)

추측하지 말고 **재현**했습니다. 헤드리스 크롬으로 실제 스크린샷을 찍었습니다.

```bash
# 1) 로그가 많은 세이브를 심는 임시 페이지를 public/에 만들고 접속
# 2) 여러 화면 크기로 스크린샷
google-chrome --headless=new --window-size=390,660 \
  --screenshot=shot.png http://localhost:3457/
```

390×660(작은 폰) 화면에서 버튼이 완전히 사라진 것을 눈으로 확인했습니다.

### 해결 (3중 방어)

```tsx
// ① 액션 바를 sticky로 화면 하단에 고정
<div className="sticky bottom-0 z-10 -mx-3 shrink-0 space-y-2 bg-[#05060f] px-3 pb-3 pt-1
                landscape:static landscape:mx-0 landscape:bg-transparent landscape:p-0">
  <nav>...액션 버튼...</nav>
  <footer>...</footer>
</div>
```
`sticky bottom-0`은 **스크롤이 생겨도 항상 화면 하단에 붙어있게** 합니다. `bg-[#05060f]`로 배경을 덮어 로그가 뒤로 지나가게 하고, `-mx-3 px-3`으로 좌우 여백을 상쇄해 배경이 화면 끝까지 닿게 합니다.

```tsx
// ② 픽셀 캔버스 폭에 상한
<canvas className="mx-auto w-full max-w-[50dvh] landscape:max-w-none" ... />
```
`50dvh` = 뷰포트 높이의 50%. 캔버스는 240:200 비율이므로 **높이가 약 42dvh를 넘지 않습니다.** 짧은 화면에서 자동으로 작아지고 중앙 정렬됩니다.

```tsx
// ③ 가로 모드 로그 최소 높이 완화
<section className="min-h-[96px] flex-1 ... landscape:min-h-[56px]">
```

### 교훈

1. **레이아웃 버그는 추측하지 말고 재현하라.** 여러 화면 크기에서 실제로 찍어봐야 한다
2. `h-dvh` + `overflow-y-auto` 조합에서는 **필수 UI를 sticky로 고정**하는 게 안전하다
3. 비율로 크기가 정해지는 요소(캔버스, 이미지)는 **반대 축 기준 상한**을 걸어야 한다 (`max-w-[50dvh]`)

### `dvh`가 뭔가요?

- `vh` = 뷰포트 높이. 그런데 **모바일 주소창이 접히면 값이 달라져** 화면이 튑니다
- `dvh` = dynamic viewport height. 주소창 상태를 반영한 **실제 보이는 높이**

모바일 게임 레이아웃에서는 `dvh`를 쓰는 게 정답입니다.

## 9.5 가로 화면 대응

`landscape:` 접두사로 가로일 때만 다른 스타일을 줍니다.

```tsx
<main className="... flex-col ... landscape:max-w-[900px] landscape:flex-row landscape:gap-3">

  {/* 왼쪽 컬럼: 헤더 + 픽셀 뷰 */}
  <div className="contents landscape:flex landscape:w-[min(46%,calc((100dvh-62px)*1.2))]
                  landscape:shrink-0 landscape:flex-col landscape:gap-2">
    <header>...</header>
    <div>픽셀 뷰</div>
  </div>

  {/* 오른쪽 컬럼: 상태·배너·로그·버튼 */}
  <div className="contents landscape:flex landscape:min-h-0 landscape:flex-1 landscape:flex-col">
    ...
  </div>
</main>
```

### `display: contents`의 마법

```
세로일 때: contents → 래퍼 div가 "투명"해져서 자식들이 부모(main)의 직접 자식처럼 배치됨
          = 기존 단일 컬럼 그대로

가로일 때: flex → 래퍼가 실제 컬럼이 되어 2단 구성
```

**DOM 구조를 바꾸지 않고** CSS만으로 레이아웃을 전환합니다. 리렌더도, 상태 손실도 없습니다. `contents`는 잘 안 알려졌지만 이런 상황에 매우 유용합니다.

### 컬럼 폭 계산

```
landscape:w-[min(46%,calc((100dvh-62px)*1.2))]
```
"화면 폭의 46%" 또는 "(화면 높이 − 여백) × 1.2" 중 **작은 값**. 1.2는 캔버스 비율(240/200)입니다. 즉 **캔버스가 세로에 딱 맞는 폭**을 넘지 않게 합니다. 폰을 눕혀도 캔버스가 잘리지 않습니다.

### PWA 회전 허용

```ts
// app/manifest.ts
orientation: "any",   // 이전엔 "portrait"였음
```
설치된 앱도 회전할 수 있게 풀어야 합니다.

## 9.6 토스트와 오버레이

```tsx
const showToast = useCallback((msg: string) => {
  setToast(msg);
  if (toastTimer.current) clearTimeout(toastTimer.current);   // ⭐ 이전 타이머 취소
  toastTimer.current = setTimeout(() => setToast(null), 2200);
}, []);
```

`clearTimeout`이 중요합니다. 토스트를 연달아 띄우면 이전 타이머가 새 토스트를 일찍 꺼버립니다.

```tsx
{toast && (
  <div className="absolute inset-x-4 top-2 border border-[#f4b860] bg-[#0b0f1e]/95 px-3 py-2 text-center text-[12px] text-[#f4b860]">
    {toast}
  </div>
)}
```
`bg-[#0b0f1e]/95`의 `/95`는 **95% 불투명도**입니다.

### 모달 (리더보드 업적 창)

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
     onClick={() => setDetail(null)}>              {/* 배경 클릭 = 닫기 */}
  <div className="w-full max-w-[340px] ..."
       onClick={(e) => e.stopPropagation()}>       {/* ⭐ 내용 클릭은 안 닫힘 */}
    ...
  </div>
</div>
```

`stopPropagation()`이 없으면 모달 내용을 클릭해도 배경까지 이벤트가 전달돼 창이 닫힙니다. **모달의 필수 패턴**입니다.

## 9.7 접근성과 모바일 배려

```tsx
<button aria-label={mutedUi ? "소리 켜기" : "소리 끄기"}>{mutedUi ? "🔇" : "🔊"}</button>
<canvas aria-label="수동 조종 미니게임 화면" />
```
아이콘만 있는 버튼엔 `aria-label`로 설명을 답니다(스크린 리더용).

```css
body {
  overscroll-behavior-y: none;        /* 위로 당겨도 새로고침 안 되게 */
  -webkit-tap-highlight-color: transparent;   /* 탭할 때 파란 박스 제거 */
}
```

```tsx
<canvas className="touch-none" />   /* 드래그를 브라우저가 스크롤로 가로채지 않게 */
```
`touch-none`이 없으면 미니게임에서 조종하려고 드래그할 때 페이지가 스크롤됩니다. **캔버스 게임의 필수 클래스**입니다.

```tsx
style={{ top: "max(1.5rem, env(safe-area-inset-top))" }}
```
`env(safe-area-inset-*)`는 아이폰 노치/홈 인디케이터 영역을 피하는 값입니다.

## 9.8 실습 과제

1. **색 테마 바꾸기** — `globals.css`의 `--mint`, `--amber` 값을 바꿔보세요. 전체 톤이 바뀝니다.
2. **로그 영역 키우기** — `min-h-[96px]`을 `min-h-[200px]`로. 짧은 화면에서 어떻게 되는지 관찰
3. **버튼 배치 바꾸기** — 궤도 액션을 `grid-cols-5`에서 `grid-cols-3`으로 (2줄이 됨)
4. **가로 모드 비율** — `landscape:w-[min(46%,...)]`의 46%를 60%로 바꿔보고 비교

---

## 정리

- Tailwind는 클래스 조합. 임의 값은 `text-[13px]` 대괄호 문법
- `sticky bottom-0`으로 **필수 UI를 화면에 고정**하면 밀림 버그를 원천 차단
- 비율 요소는 **반대 축 기준 상한**(`max-w-[50dvh]`)을 걸어라
- `display: contents`로 DOM 변경 없이 세로/가로 레이아웃 전환
- 모바일 필수: `dvh`, `touch-none`, `overscroll-behavior`, safe-area
- 레이아웃 버그는 **여러 화면 크기에서 실제로 재현**해서 잡아라

다음: [10장 — PWA](10-pwa.md)
