# 11장 — 공유 카드와 바이럴 구조

> "자랑하기" 버튼 하나가 어떻게 **유입 루프**가 되었는지, 그 과정을 코드와 함께 봅니다.
> 관련 파일: `src/lib/game/bragImage.ts`, `src/app/c/page.tsx`, `src/app/api/og/route.tsx`

## 11.1 왜 이렇게 만들었나 — 설계 사고 과정

처음엔 자랑 기능이 **텍스트를 클립보드에 복사**하는 것이었습니다.

```
🛰 STELLAPET 「코스모」
형태: 클리너 노바
누적 수거: 4,321kg
```

문제가 둘 있었습니다.
1. 받는 사람 입장에서 **밋밋합니다.** 텍스트는 SNS에서 눈에 안 띕니다
2. 본 사람이 **들어올 길이 없습니다.** 링크도 없고, 게임이 뭔지도 모릅니다

바이럴은 세 가지가 맞물려야 합니다.
> ① 공유하고 싶은 **결과물** ② 공유하고 싶어지는 **타이밍** ③ 본 사람이 할 수 있는 **행동**

그래서 4단계로 만들었습니다.

| 단계 | 무엇 | 해결하는 것 |
| --- | --- | --- |
| 1 | 픽셀 아트 이미지 카드 + Web Share | ① 결과물 |
| 2 | 감정 고점에 게임이 먼저 제안 | ② 타이밍 |
| 3 | 도전장 링크 + 가입 없는 데모 플레이 | ③ 행동 |
| 4 | 링크 미리보기 이미지(OG) | 확산 시 눈에 띄기 |

## 11.2 1단계 — 캔버스로 이미지 카드 만들기

브라우저에서 **눈에 안 보이는 캔버스**에 그림을 그려 PNG 파일로 뽑습니다.

```ts
const canvas = document.createElement("canvas");   // DOM에 붙이지 않음
canvas.width = 1080;
canvas.height = 1080;
const ctx = canvas.getContext("2d");
// ... 그리기 ...
canvas.toBlob((blob) => { /* PNG 파일 데이터 */ }, "image/png");
```

`toBlob`은 콜백 방식이라 `await`로 쓰려면 Promise로 감싸야 합니다.

```ts
function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}
```

### 카드 3종과 공통 부품

카드가 3종류(상태·신기록·랭크)라 공통 부분을 함수로 뽑았습니다.

```ts
async function makeCard(s: GameState, subtitle: string): Promise<Card> {
  // 폰트 로드 대기 → 캔버스 생성 → 배경·별하늘·계열색 프레임·헤더까지 그림
}
function drawPetBlock(card: Card, s: GameState) {
  // 궤도 링 + 대형 도트 펫 + 이름·형태명
}
```

```ts
export async function renderBragCard(s)          // 상태 자랑 (phase별 변형)
export async function renderSortieCard(s, r)     // 신기록 스코어
export async function renderRankCard(s, rank, board)  // 리더보드 순위
```

### 폰트를 기다려야 하는 이유

```ts
try {
  await Promise.all([
    document.fonts.load('700 72px "Galmuri11"'),
    document.fonts.load('400 32px "Galmuri11"'),
  ]);
} catch {}
```

웹폰트는 비동기로 로드됩니다. 기다리지 않고 그리면 **시스템 기본 폰트로 그려진 카드**가 나옵니다(픽셀 감성 실종). 실패해도 진행하도록 `try/catch`로 감쌉니다.

### 같은 펫 = 같은 별하늘

```ts
const rand = mulberry32(s.createdAt || 1);   // 펫 생성 시각을 시드로
for (let i = 0; i < 70; i++) { /* 별 그리기 */ }
```

펫마다 고유하지만 **매번 같은** 배경이 나옵니다. "내 카드"라는 정체성이 생깁니다.

### 계열 색 프레임 = 수집 요소 시각화

```ts
const FRAME_COLORS: Record<Branch, string> = {
  balanced: "#7ee8a2",   // 민트
  speed: "#7dd3fc",      // 하늘
  pull: "#c4b5fd",       // 보라
};
```

트레이딩 카드처럼 보이게 만들어 "내 카드는 보라색(이벤트 호라이즌)" 같은 자랑이 성립하게 했습니다.

### 숫자보다 비유가 퍼진다

```ts
export function kgAnalogy(kg: number): string {
  if (kg >= 1000) return `경차 ${(kg / 1000).toFixed(1)}대`;
  if (kg >= 500) return `대형 통신위성 ${Math.floor(kg / 500)}기`;
  if (kg >= 100) return `냉장고 ${Math.floor(kg / 100)}대`;
  if (kg >= 15) return `자전거 ${Math.floor(kg / 15)}대`;
  return `볼트 ${Math.max(1, Math.round(kg * 10))}개`;
}
```

카드에는 이렇게 들어갑니다.
> "지구 저궤도가 **경차 4.3대 분량**만큼 깨끗해졌습니다"

`4,321kg`보다 훨씬 잘 와닿고, **게임 자랑이 아니라 사회공헌 인증**처럼 보여 공유 부담이 낮아집니다.

### 공유 3단 폴백

```ts
async function shareBlob(blob, filename, shareText) {
  const file = new File([blob], filename, { type: "image/png" });

  // ① Web Share — 모바일 네이티브 공유 시트 (카톡·인스타 바로 선택)
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: shareText });
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "shared";  // 사용자가 닫음 — 폴백 안 함
    }
  }

  // ② 클립보드에 이미지 복사 (데스크톱)
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return "copied";
  } catch {}

  // ③ 파일 다운로드 (최후)
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3_000);
  return "downloaded";
}
```

**`AbortError` 처리가 중요합니다.** 사용자가 공유 시트를 그냥 닫은 것은 "실패"가 아니라 "취소"입니다. 이때 클립보드 복사로 넘어가면 원하지 않는 동작이 됩니다.

`URL.revokeObjectURL`은 만들어둔 임시 URL의 메모리를 해제합니다(안 하면 누수).

## 11.3 2단계 — 감정 고점에 먼저 제안하기

유저가 자랑 버튼을 누를 생각을 하는 순간은 드뭅니다. **게임이 먼저 물어보게** 했습니다.

```tsx
// Game.tsx — 사운드 훅과 같은 자리에서 로그를 감시
let prompt: SharePrompt | null = null;
if (fresh.some((e) => e.msg.startsWith("🏆"))) {
  prompt = { kind: "sortie", label: "수동 조종 신기록 달성!" };
} else if (fresh.some((e) => e.msg.startsWith("✨ 진화!"))) {
  prompt = { kind: "state", label: `「${stageName(state)}」(으)로 진화 성공!` };
} else if (fresh.some((e) => e.kind === "gain" && e.msg.startsWith("🪝"))) {
  prompt = { kind: "state", label: "대형 잔해 견인 성공!" };
} else if (prevDays !== null && prevDays !== days && MILESTONE_DAYS.includes(days)) {
  prompt = { kind: "state", label: `임무 ${days}일차 달성!` };
}
if (prompt) showSharePrompt(prompt);
```

로그 메시지의 **이모지 접두사로 사건을 식별**합니다. 별도 이벤트 시스템을 만들지 않고 이미 있는 로그를 재활용한 것입니다(간단하지만, 메시지를 바꾸면 같이 고쳐야 하는 약한 결합이라는 단점도 있습니다).

배너는 12초 뒤 자동으로 사라집니다.
```tsx
const showSharePrompt = useCallback((p: SharePrompt) => {
  setSharePrompt(p);
  if (promptTimer.current) clearTimeout(promptTimer.current);
  promptTimer.current = setTimeout(() => setSharePrompt(null), 12_000);
}, []);
```

> 💡 **첫 기록엔 축하하지 않는다** — `settleSortie`에서 `hadPrev` 체크로 첫 기록에는 🏆 로그를 안 남깁니다. 첫 판은 무조건 신기록이라 축하가 어색하기 때문입니다.

## 11.4 3단계 — 도전장: 본 사람이 할 게 있어야 한다

바이럴의 핵심입니다. 카드에 **도전장 링크**를 넣었습니다.

```ts
export function challengeUrl(s: GameState): string {
  return `${window.location.origin}/c?kg=${s.sortieBestKg}&n=${encodeURIComponent(s.name)}&s=${s.stage}&b=${s.branch}`;
}
```

**서버 없이** URL 쿼리에 기록·이름·캐릭터를 인코딩합니다.

### QR 코드

```ts
async function drawQr(card: Card, url: string): Promise<void> {
  try {
    const QRCode = (await import("qrcode")).default;   // ⭐ 동적 import
    const qr = document.createElement("canvas");
    await QRCode.toCanvas(qr, url, { width: 150, margin: 2, color: { dark: "#05060f", light: "#e8ecff" } });
    card.ctx.drawImage(qr, x, 55, 150, 150);
    // "SCAN TO PLAY" 라벨
  } catch {
    // QR 생성 실패는 카드 발행을 막지 않는다
  }
}
```

**동적 import(`await import(...)`)** 를 쓴 이유: qrcode 라이브러리는 카드를 만들 때만 필요합니다. 정적으로 import하면 게임 첫 로딩에 항상 포함되어 무거워집니다. 이렇게 하면 **필요한 순간에만 내려받습니다**(코드 스플리팅).

스크린샷으로 퍼져도 QR로 들어올 수 있게 하는 장치입니다.

### 도전장으로 들어온 사람 처리

```tsx
// Game.tsx — 쿼리 파싱 후 주소는 깨끗하게
useEffect(() => {
  const q = new URLSearchParams(window.location.search);
  const kg = Number(q.get("kg") ?? q.get("c"));       // 구형 링크도 호환
  if (!Number.isFinite(kg) || kg <= 0) return;
  setChallenge({ kg: Math.min(999_999, Math.round(kg)), name: (q.get("n") || "누군가").slice(0, 10) });
  window.history.replaceState(null, "", "/");          // 주소창 정리
}, []);
```

**입력 검증**을 반드시 합니다. URL은 누구나 조작할 수 있으므로 상한(999,999)과 길이 제한(10자)을 겁니다.

### 가입 없는 데모 플레이 ⭐

```tsx
/** 펫 없이 도전 출격할 때 쓰는 데모 기체 */
const DEMO_STATE: GameState = (() => {
  const s = initialState("도전자", 0);
  s.phase = "orbit"; s.stage = 1; s.speed = 12; s.pull = 8; s.mood = 80;
  return s;
})();
```

도전장으로 온 **신규 방문자**는 인트로에서 바로 미니게임 1판을 할 수 있습니다. 회원가입도, 알 부화도 필요 없습니다.

```tsx
const endDemoSortie = useCallback((r: SortieOutcome) => {
  setDemoSortie(false);
  if (!challenge) return;
  const kg = sortieYieldKg(DEMO_STATE, r.kg);   // 본편과 같은 공식으로 계산
  setDemoResult({ kg, win: kg > challenge.kg });
}, [challenge]);
```

결과에 따라 다른 메시지로 **알 배정(가입)을 유도**합니다.
- 이기면: "🏆 도전 성공! 조종 재능이 있군요 — 내 펫을 키우면 더 멀리 갈 수 있습니다"
- 지면: "아깝다! ○○의 펫은 육성으로 스탯을 키웠습니다. 당신의 알을 받아보세요 👇"

> 💡 **전환율 설계**: "가입해야 해볼 수 있음"과 "해보고 나서 가입 권유"는 전환율이 크게 다릅니다. 재미를 먼저 보여주는 쪽이 강합니다.

## 11.5 4단계 — 링크 미리보기 (OG 이미지)

카톡·X에 링크를 보내면 뜨는 **미리보기 카드**를 개인화합니다.

### OG 태그란

```html
<meta property="og:title" content="코스모의 스텔라펫 — 한 출격에 1,187kg 수거!">
<meta property="og:image" content="https://사이트/api/og?kg=1187&n=코스모&s=3&b=pull">
```

메신저 크롤러가 링크를 열어 이 태그를 읽고 미리보기를 만듭니다.

### `/c` — 사람과 크롤러를 동시에 상대하는 페이지

```tsx
// src/app/c/page.tsx — 서버 컴포넌트 ("use client" 없음!)
export async function generateMetadata({ searchParams }): Promise<Metadata> {
  const p = await searchParams;
  const kg = Math.min(999_999, Math.max(0, Math.round(Number(p.kg) || 0)));
  const name = String(p.n ?? "누군가").slice(0, 10);
  const stage = Math.min(3, Math.max(0, Math.round(Number(p.s ?? 1) || 0)));
  const branch = p.b === "speed" || p.b === "pull" ? p.b : "balanced";

  const title = kg > 0 ? `${name}의 스텔라펫 — 한 출격에 ${kg.toLocaleString()}kg 수거!` : "STELLAPET 도전장";
  const og = `/api/og?kg=${kg}&n=${encodeURIComponent(name)}&s=${stage}&b=${branch}`;
  return {
    title, description: "이 기록, 깰 수 있으면 깨 보시죠. 가입 없이 바로 도전 출격!",
    openGraph: { title, description, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [og] },
  };
}

export default function ChallengePage() {
  return <Game />;   // 사람에게는 그냥 게임을 보여줌
}
```

**크롤러는 메타 태그를, 사람은 게임을 봅니다.** 한 주소로 둘 다 처리합니다.

### `/api/og` — 서버에서 이미지 만들기

```tsx
// src/app/api/og/route.tsx
import { ImageResponse } from "next/og";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const kg = ...; const name = ...; const stage = ...; const branch = ...;
  const font = await loadFont();

  return new ImageResponse(
    ( <div style={{ display: "flex", ... }}> ... </div> ),
    {
      width: 1200, height: 630,
      fonts: [{ name: "Galmuri", data: font, weight: 700, style: "normal" }],
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },  // CDN 1일 캐시
    },
  );
}
```

`next/og`는 **JSX를 이미지로 렌더링**해줍니다(Satori 엔진). 주의점 두 가지:

**① 캔버스가 없습니다.** 스프라이트를 `fillRect`로 그릴 수 없으므로 div 격자로 재현했습니다.

```tsx
function SpriteBox({ sprite, cell }: { sprite: Sprite; cell: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {sprite.rows.map((row, y) => (
        <div key={y} style={{ display: "flex" }}>
          {[...row].map((ch, x) => (
            <div key={x} style={{ width: cell, height: cell,
                                  backgroundColor: sprite.palette[ch] ?? "transparent" }} />
          ))}
        </div>
      ))}
    </div>
  );
}
```
**같은 스프라이트 데이터를 캔버스와 div 양쪽에서 재사용**하는 셈입니다. 데이터와 렌더링을 분리해둔 덕을 봤습니다.

**② 한글 폰트를 직접 넣어야 합니다.**

```ts
let fontCache: Buffer | null = null;
async function loadFont(): Promise<Buffer> {
  if (!fontCache) {
    fontCache = await readFile(join(process.cwd(), "node_modules", "galmuri", "dist", "Galmuri11-Bold.ttf"));
  }
  return fontCache;
}
```

그리고 서버 번들에 폰트 파일이 포함되도록 설정이 필요합니다.
```ts
// next.config.ts
outputFileTracingIncludes: {
  "/api/og": ["./node_modules/galmuri/dist/Galmuri11-Bold.ttf"],
},
```

이 설정이 없으면 로컬에선 되는데 **배포하면 폰트를 못 찾아 실패**합니다. 흔한 함정입니다.

> 참고: 한글 전체 글리프가 들어간 폰트(2.6MB)라 Edge 런타임 용량 한도를 넘습니다. 그래서 이 라우트는 Node 런타임에서 동작합니다.

### 긴 숫자 대응

```tsx
fontSize: kg >= 10_000 ? 54 : kg >= 1_000 ? 62 : 72,
```
기록이 커지면 글자가 줄바꿈되어 카드가 깨졌습니다. 자릿수에 따라 폰트 크기를 줄여 한 줄을 유지합니다. **실제 렌더링해보고 발견한 문제**입니다.

## 11.6 완성된 바이럴 루프

```
     신기록 달성
          ↓
  게임이 "카드 만들래?" 제안        ← 2단계
          ↓
  픽셀 카드 + 도전장 링크 + QR 공유  ← 1·3단계
          ↓
  카톡에서 개인화 미리보기로 노출     ← 4단계
          ↓
  친구가 링크 클릭 → 가입 없이 즉시 도전 ← 3단계
          ↓
  승/패 → "네 펫을 키워봐" → 알 배정
          ↓
     그 친구가 또 신기록…
```

## 11.7 실습 과제

1. **비유 문구 추가** — `kgAnalogy`에 "코끼리 N마리" 구간을 넣어보세요
2. **카드 색 바꾸기** — `FRAME_COLORS`를 수정하고 자랑 버튼으로 확인
3. **OG 이미지 확인** — `npm run start` 후 `http://localhost:3000/api/og?kg=500&n=테스트&s=2&b=speed` 접속
4. **도전장 흐름 체험** — 시크릿 창에서 `http://localhost:3003/c?kg=300&n=친구` 접속 → 데모 출격

---

## 정리

- 오프스크린 캔버스로 **PNG를 즉석 생성**하고 Web Share로 공유 (3단 폴백)
- 숫자보다 **비유**가 퍼진다. 게임 자랑보다 **사회공헌**처럼 보이면 공유 부담이 낮아진다
- 공유는 유저가 떠올리길 기다리지 말고 **감정 고점에 게임이 먼저 제안**
- 바이럴 = 본 사람이 **할 게 있어야** 한다 → 가입 없는 데모 플레이
- OG 이미지는 서버에서 생성. `next/og`는 캔버스가 없고 폰트를 직접 공급해야 한다

다음: [12장 — Supabase 리더보드](12-supabase.md)
