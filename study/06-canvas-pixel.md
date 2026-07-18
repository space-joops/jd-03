# 6장 — 캔버스와 픽셀 아트

> 이미지 파일 하나 없이 어떻게 캐릭터와 지구를 그리는지 알아봅니다.
> 관련 파일: `src/lib/game/sprites.ts`, `src/components/PixelView.tsx`

## 6.1 캔버스 기초 — 도화지에 그림 그리기

`<canvas>`는 브라우저가 제공하는 **그림판**입니다. JS로 명령을 내려 그립니다.

```tsx
const canvas = canvasRef.current;
const ctx = canvas.getContext("2d");   // 붓(context)을 얻는다

ctx.fillStyle = "#7ee8a2";      // 색을 정하고
ctx.fillRect(10, 20, 30, 40);   // (10,20)에서 가로30 세로40 사각형을 칠한다
```

좌표계는 **왼쪽 위가 (0,0)**, 오른쪽으로 x 증가, **아래로 y 증가**입니다(수학과 y 방향이 반대!).

이 프로젝트에서 쓰는 캔버스 명령은 몇 개 안 됩니다.

```ts
ctx.fillRect(x, y, w, h)     // 사각형 채우기 ← 픽셀 아트는 사실상 이것만 씀
ctx.fillText(text, x, y)     // 글자
ctx.save() / ctx.restore()   // 붓 상태 저장/복원
ctx.translate(x, y)          // 원점 이동
ctx.rotate(rad)              // 회전
ctx.scale(sx, sy)            // 확대/축소
ctx.beginPath() / arc() / fill()  // 원 (조이스틱에만 사용)
ctx.globalAlpha = 0.5        // 투명도
```

## 6.2 스프라이트 — 그림을 문자열로 표현하기

`sprites.ts`의 아이디어가 이 프로젝트의 백미입니다.

```ts
export interface Sprite {
  rows: string[];                    // 그림을 한 줄씩 문자로
  palette: Record<string, string>;   // 문자 → 색상 매핑
}

/** 스텔라 알 */
export const EGG: Sprite = {
  rows: [
    "...oooo...",
    "..owwwwo..",
    ".owwwwwwo.",
    ".owwswwwo.",
    "owwsssswwo",
    "owwwsswwwo",
    "owwwwwwwwo",
    "owwwwwwwwo",
    ".owwwwwwo.",
    ".owwwwwwo.",
    "..owwwwo..",
    "...oooo...",
  ],
  palette: { o: "#3fbf9f", w: "#f6f1dc", s: "#f4b860" },
};
```

`.`은 팔레트에 없으므로 **투명**(안 그림)입니다. `o`는 테두리 민트, `w`는 흰 껍질, `s`는 노란 무늬.

에디터에서 보면 **그림이 그대로 보입니다.** 도트를 바꾸고 싶으면 문자를 바꾸면 됩니다. 이미지 편집기도, 에셋 파이프라인도 필요 없습니다.

### 그리는 함수

```ts
export function drawSprite(ctx, sprite, x, y, scale = 1) {
  for (let ry = 0; ry < sprite.rows.length; ry++) {
    const row = sprite.rows[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const c = sprite.palette[row[rx]];
      if (!c) continue;                      // 팔레트에 없는 문자 = 투명
      ctx.fillStyle = c;
      ctx.fillRect(x + rx * scale, y + ry * scale, scale, scale);
    }
  }
}

export const spriteW = (s: Sprite) => Math.max(...s.rows.map((r) => r.length));
export const spriteH = (s: Sprite) => s.rows.length;
```

**한 글자 = 한 픽셀 = `scale`×`scale` 크기의 사각형.** `scale`을 4로 주면 도트 하나가 4×4로 커져 레트로 감성이 살아납니다.

### 등장인물들

| 스프라이트 | 용도 |
| --- | --- |
| `EGG` | 알 (PWA 앱 아이콘도 이 데이터로 생성) |
| `BABY` | 아기 스텔라펫 (지상) |
| `ORBIT_SPRITES[0..3]` | 궤도 진화 4단계 |
| `ROCKET` | 발사 로켓 |

진화 단계별 스프라이트는 실루엣으로 성장을 표현합니다: 1단계는 태양전지판 날개, 2단계는 큰 입(잔해를 삼킴), 3단계는 견인 촉수, 4단계는 황금 왕관.

### 실습: 알 무늬 바꿔보기

`sprites.ts`의 `EGG.rows`에서 `s`(노란 무늬) 위치를 바꿔보세요.

```ts
// 하트 무늬로
"..oww..wwo..",
".ow.ss.ss.wo",
```

저장하면 브라우저에 바로 반영됩니다. 앱 아이콘까지 같은 데이터를 쓰므로, 아이콘도 다시 생성하면 바뀝니다.

## 6.3 애니메이션 루프 — `requestAnimationFrame`

멈춘 그림이 아니라 움직이는 화면을 만들려면, **1초에 60번 다시 그려야** 합니다.

```tsx
useEffect(() => {
  let raf = 0;
  const loop = () => {
    // ... 그리기 ...
    raf = requestAnimationFrame(loop);   // 다음 프레임에 또 나를 불러줘
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);   // ⭐ 정리 필수!
}, []);
```

`setInterval(loop, 16)`을 쓰지 않는 이유:
- `requestAnimationFrame`은 **모니터 주사율에 맞춰** 호출되어 부드럽습니다
- 탭이 백그라운드면 **자동으로 멈춰** 배터리를 아낍니다
- 브라우저의 화면 갱신 타이밍과 동기화되어 찢어짐이 없습니다

**정리 함수(`cancelAnimationFrame`)를 빼먹으면** 컴포넌트가 사라진 뒤에도 루프가 계속 돌아 CPU를 태웁니다. 반드시 넣으세요.

## 6.4 `PixelView.tsx` — 본편 화면

240×200 논리 해상도의 캔버스에 세 종류의 장면을 그립니다.

```tsx
const t = Date.now();
ctx.fillStyle = "#05060f";
ctx.fillRect(0, 0, W, H);                       // 배경 지우기
if (s.phase === "orbit") drawOrbit(ctx, s, t);
else if (s.phase === "launching") drawLaunching(ctx, s, t);
else drawGround(ctx, s, t);
```

### 상태를 `ref`로 읽는 이유

```tsx
const stateRef = useRef(state);
stateRef.current = state;      // 매 렌더마다 최신값 갱신

useEffect(() => {
  const loop = () => {
    const s = stateRef.current;   // 루프 안에서는 ref로 읽는다
    ...
  };
  ...
}, []);   // ← 의존성 비어있음: 루프는 한 번만 등록
```

`useEffect`에 `[state]`를 넣으면 상태가 바뀔 때마다 루프를 껐다 켜게 됩니다(1초마다!). 루프는 **한 번만 등록**하고, 안에서 `ref`로 최신 상태를 들여다보는 것이 정석입니다.

### 시드 고정 난수 — 별이 흔들리지 않게

배경 별을 매 프레임 `Math.random()`으로 배치하면 별이 미친 듯이 깜빡입니다. 그래서 **한 번만 계산해 고정**합니다.

```tsx
function mulberry32(seed: number) {   // 시드 기반 의사난수 생성기
  return () => { ... };
}
const rand = mulberry32(20260718);    // 고정 시드
const STARS = Array.from({ length: 46 }, () => ({
  x: Math.floor(rand() * W),
  y: Math.floor(rand() * H),
  tw: rand() * Math.PI * 2,   // 반짝임 위상
  big: rand() < 0.18,
}));
```

모듈이 로드될 때 딱 한 번 실행되어, 별 배치가 항상 같습니다. **시드 난수는 "랜덤하지만 재현 가능한" 것이 필요할 때 쓰는 도구**입니다 (자랑 카드의 별하늘도 펫 생성 시각을 시드로 써서, 같은 펫이면 항상 같은 하늘이 나옵니다).

### 시간으로 움직임 만들기

```tsx
// 반짝임: sin 곡선으로 밝기 오르내림
const a = 0.4 + 0.6 * Math.abs(Math.sin(t / 900 + s.tw));

// 둥둥 떠다니기: 위아래 3px
const bob = Math.round(Math.sin(t / 320) * 3);

// 궤도 공전: 24초에 한 바퀴
const theta = ((t % ORBIT_PERIOD) / ORBIT_PERIOD) * Math.PI * 2;
const px = EARTH_CX + ORBIT_RX * Math.cos(theta);
const py = EARTH_CY + ORBIT_RY * Math.sin(theta);
```

`sin`/`cos`은 **주기적인 움직임**의 기본 도구입니다. `t`(현재 시각)를 넣으면 시간에 따라 부드럽게 오가는 값이 나옵니다. `t / 320`의 320을 키우면 느려지고, 곱하는 3을 키우면 폭이 커집니다.

타원 궤도는 `cos`(x)과 `sin`(y)에 각각 다른 반지름(`ORBIT_RX=94`, `ORBIT_RY=62`)을 곱해 만듭니다.

### 원을 픽셀로 그리기

캔버스의 `arc()`를 쓰면 안티앨리어싱 때문에 가장자리가 흐려집니다. 픽셀 감성을 지키려고 직접 그립니다.

```tsx
function fillCircle(ctx, cx, cy, r) {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));   // 피타고라스
    ctx.fillRect(cx - half, cy + y, half * 2 + 1, 1);    // 가로줄 한 줄씩
  }
}
```

각 y줄마다 원의 폭을 계산해 **가로 막대 하나로** 칠합니다. 점 하나씩 찍는 것보다 훨씬 빠릅니다.

지구의 그림자도 비슷한 원리입니다.
```tsx
if (x * x + y * y <= r * r && x + y * 0.6 > r * 0.55) {  // 원 안 + 대각선 아래쪽
  ctx.fillRect(...);   // 어두운 색
}
```

### 이벤트 연출

```tsx
// 유성우: 대각선으로 흐르는 스트릭
if (t < s.meteorUntil) {
  for (let i = 0; i < 6; i++) {
    const mx = Math.round(W + 20 - ((t * sp + i * 97) % (W + 60)));
    ...  // 머리(밝음) + 꼬리(반투명) 픽셀
  }
}

// 태양 플레어: 화면 전체에 주황 오버레이
if (t < s.flareUntil) {
  const a = 0.07 + 0.05 * Math.sin(t / 200);   // 은은하게 맥동
  ctx.fillStyle = `rgba(255,140,80,${a.toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
}
```

`% (W + 60)`은 **화면을 벗어나면 반대편에서 다시 나오게** 하는 순환 트릭입니다(모듈로 연산).

## 6.5 픽셀이 뭉개지지 않게 하기

캔버스를 CSS로 확대하면 브라우저가 부드럽게 보간해서 흐려집니다. 픽셀 아트에서는 재앙입니다.

```tsx
<canvas
  width={240} height={200}                    // 논리 해상도 (그림 좌표계)
  className="mx-auto w-full max-w-[50dvh]"    // 실제 표시 크기 (CSS)
  style={{ imageRendering: "pixelated", aspectRatio: "240/200" }}
/>
```

- **`imageRendering: "pixelated"`** — 확대할 때 계단 모양 그대로 유지 (핵심!)
- `width`/`height` 속성 = 그림을 그리는 좌표계 (여기선 항상 240×200)
- CSS 크기 = 화면에 보이는 크기 (기기마다 다름)
- `aspectRatio` — 비율 유지
- `max-w-[50dvh]` — 화면이 짧을 때 캔버스가 세로를 다 먹지 않게 (9장 참고)

캔버스 안에서 그릴 때는 **항상 240×200 기준**으로 좌표를 쓰면 됩니다. 실제 화면 크기는 신경 쓰지 않아도 됩니다. 이게 논리 해상도의 편리함입니다.

### 좌표 변환 (입력을 받을 때)

반대로, 사용자가 화면을 터치한 위치는 **CSS 픽셀**이므로 논리 좌표로 바꿔야 합니다.

```ts
const rect = canvas.getBoundingClientRect();
const x = ((e.clientX - rect.left) / rect.width) * w;   // 0~1 비율로 만든 뒤 논리 폭 곱하기
const y = ((e.clientY - rect.top) / rect.height) * h;
```

미니게임의 조종 입력이 이 변환을 씁니다.

## 6.6 실습 과제

1. **별 개수 바꾸기** — `PixelView.tsx`의 `Array.from({ length: 46 })`을 100으로. 밤하늘이 촘촘해집니다.
2. **공전 속도 바꾸기** — `ORBIT_PERIOD = 24_000`을 8000으로. 펫이 빠르게 지구를 돕니다.
3. **새 스프라이트 만들기** — `sprites.ts`에 작은 우주선을 그려 `drawOrbit`에 추가해보세요.
4. **지구 색 바꾸기** — `drawEarth`의 `#2b6cb0`(바다), `#48a860`(육지)을 화성처럼 붉게.

---

## 정리

- 스프라이트 = **문자열 배열 + 팔레트**. 코드 안에서 그림이 눈에 보인다
- 애니메이션은 `requestAnimationFrame` 루프, **정리 함수 필수**
- 루프 안에서는 `useRef`로 최신 상태를 읽는다 (루프를 재등록하지 않는다)
- 별 배치처럼 고정돼야 할 랜덤은 **시드 난수**로
- 움직임은 `sin`/`cos` + 현재 시각
- `imageRendering: pixelated`로 도트 감성 유지

다음: [7장 — 미니게임: 게임 루프와 물리](07-minigame.md)
