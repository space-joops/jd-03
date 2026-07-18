# 10장 — PWA: 앱처럼 설치되고 오프라인에서 돌기

> PWA(Progressive Web App) = 웹사이트를 **앱처럼** 만드는 기술.
> 관련 파일: `src/app/manifest.ts`, `public/sw.js`, `src/components/SwRegister.tsx`

## 10.1 PWA가 주는 것

| 기능 | 유저가 체감하는 것 |
| --- | --- |
| 홈 화면 설치 | 앱 아이콘을 눌러 바로 실행 |
| 전체화면 실행 | 주소창 없이 몰입 |
| 오프라인 구동 | 비행기 모드에서도 게임 진행 |
| 앱 전환 목록 | 다른 앱처럼 취급됨 |

앱스토어 심사도, 별도 코드베이스도 없이 **파일 두 개**(매니페스트 + 서비스 워커)로 됩니다.

## 10.2 매니페스트 — "나는 앱입니다" 선언서

```ts
// src/app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "STELLAPET — 궤도 청소 다마고치",   // 설치 다이얼로그에 표시
    short_name: "STELLAPET",                   // 홈 화면 아이콘 아래 이름
    id: "/",
    start_url: "/",                            // 앱을 열면 갈 주소
    display: "standalone",                     // 주소창 없이
    display_override: ["fullscreen", "standalone"],
    orientation: "any",                        // 회전 허용
    background_color: "#05060f",               // 스플래시 배경
    theme_color: "#05060f",                    // 상태바 색
    categories: ["games", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

Next.js가 이 파일을 `/manifest.webmanifest` 주소로 서빙하고 `<link rel="manifest">`도 자동으로 넣어줍니다.

### `maskable` 아이콘이 뭔가요?

안드로이드는 아이콘을 기기 테마에 맞춰 **원형·둥근사각형 등으로 잘라냅니다.** 일반 아이콘을 그대로 자르면 가장자리가 잘려나갑니다.

`purpose: "maskable"` 아이콘은 **중앙 약 60% 안에만 중요한 내용을 배치**한 버전입니다. 이 프로젝트는 알 스프라이트를 작게 그려 여백을 둔 별도 이미지를 씁니다.

### 아이콘도 코드로 생성했다

이미지 편집기 없이, 게임의 `EGG` 스프라이트 데이터를 읽어 PNG를 직접 인코딩하는 스크립트로 만들었습니다(zlib 압축 + CRC 계산까지 순수 Node로). 덕분에 캐릭터 도트를 수정하면 아이콘도 같은 소스에서 다시 뽑을 수 있습니다.

### iOS 대응

iOS는 매니페스트 지원이 제한적이라 메타 태그가 따로 필요합니다.

```ts
// src/app/layout.tsx
export const metadata: Metadata = {
  appleWebApp: {
    capable: true,                      // 홈 화면 추가 시 독립 실행
    title: "STELLAPET",
    statusBarStyle: "black-translucent",
  },
};
```
`src/app/apple-icon.png` 파일을 두면 Next.js가 `apple-touch-icon` 링크를 자동 생성합니다.

## 10.3 서비스 워커 — 웹의 백그라운드 직원

**서비스 워커**는 브라우저와 네트워크 사이에 서서 모든 요청을 가로챌 수 있는 스크립트입니다. 페이지와 별개로 동작합니다.

```
[페이지] → [서비스 워커] → [네트워크]
                 ↓
             [캐시 저장소]
```

오프라인에서도 캐시로 응답할 수 있어 앱처럼 동작합니다.

### 생명주기

```js
// public/sw.js
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `stellapet-${VERSION}`;
const SHELL = ["/", "/manifest.webmanifest"];

// ① install — 설치될 때: 앱 셸 미리 캐싱
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting()),   // 대기 없이 즉시 활성화
  );
});

// ② activate — 활성화될 때: 옛날 캐시 청소
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),  // 열려있는 페이지도 즉시 관리
  );
});

// ③ fetch — 모든 네트워크 요청을 가로챔
self.addEventListener("fetch", (e) => { ... });
```

`skipWaiting`과 `clients.claim`이 없으면, 새 서비스 워커는 모든 탭이 닫힐 때까지 기다립니다. 게임에서는 즉시 갱신되는 게 낫습니다.

### 캐싱 전략 3가지

이 프로젝트는 요청 종류에 따라 다른 전략을 씁니다. **이게 서비스 워커 설계의 핵심입니다.**

```js
// ① 페이지 이동: 네트워크 우선 (Network First)
if (req.mode === "navigate") {
  e.respondWith(
    fetch(req)
      .then((res) => { /* 성공하면 캐시도 갱신 */ return res; })
      .catch(() => caches.match("/")),   // 실패(오프라인)하면 캐시된 셸
  );
  return;
}

// ② 해시 붙은 정적 자산: 캐시 우선 (Cache First)
if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
  e.respondWith(
    caches.match(req).then((hit) => hit ?? fetch(req).then((res) => { /* 캐시에 저장 */ return res; })),
  );
  return;
}

// ③ 그 외: 캐시 먼저 주고 뒤에서 갱신 (Stale While Revalidate)
e.respondWith(
  caches.match(req).then((hit) => {
    const refresh = fetch(req).then((res) => { /* 캐시 갱신 */ return res; }).catch(() => hit);
    return hit ?? refresh;
  }),
);
```

| 전략 | 언제 쓰나 | 특징 |
| --- | --- | --- |
| Network First | HTML 페이지 | 온라인이면 **항상 최신**, 오프라인이면 캐시 |
| Cache First | 해시 붙은 JS/CSS/이미지 | 파일명에 해시가 있어 내용이 바뀌면 이름도 바뀜 → 캐시해도 안전, 매우 빠름 |
| Stale While Revalidate | 나머지 | 즉시 응답 + 백그라운드 갱신 |

**왜 HTML은 네트워크 우선인가:** 캐시 우선으로 하면 배포해도 유저가 옛날 버전을 계속 보게 됩니다. HTML만 최신으로 받으면, 그 안에 적힌 새 해시 자산들도 자연히 새로 받게 됩니다.

## 10.4 버전 관리 — package.json과 연동

캐시를 언제 비울지가 늘 골칫거리입니다. 이 프로젝트는 **버전의 단일 원본**을 만들어 해결했습니다.

```ts
// next.config.ts — package.json의 version을 환경변수로 주입
import pkg from "./package.json";
const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  ...
};
```

```tsx
// SwRegister.tsx — 등록 URL에 버전을 실어 보냄
const v = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(v)}`);
```

```js
// sw.js — 자기 URL에서 버전을 읽어 캐시 이름에 사용
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `stellapet-${VERSION}`;
```

**결과:** `npm version patch`로 버전을 올려 배포하면
1. 등록 URL이 `/sw.js?v=0.2.12`로 바뀜 → 브라우저가 다른 워커로 인식 → 새로 설치
2. `activate`에서 `stellapet-0.2.11` 캐시 삭제
3. 푸터의 `v0.2.12` 표기도 자동으로 바뀜

버전 하나만 올리면 캐시 세대교체와 화면 표기가 동시에 처리됩니다.

## 10.5 개발 중에는 서비스 워커를 끈다

```tsx
// src/components/SwRegister.tsx
export default function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;   // ⭐ 개발 중엔 등록 안 함
    if (!("serviceWorker" in navigator)) return;
    const v = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(v)}`).catch(() => {});
  }, []);
  return null;
}
```

**왜?** 개발 중에 서비스 워커가 캐싱하면 코드를 고쳐도 옛날 화면이 나와 미치게 됩니다. 그래서 프로덕션 빌드에서만 켭니다.

**PWA를 테스트하려면:**
```bash
npm run build && npm run start
```

## 10.6 "업데이트가 반영이 안 돼요" 대응표

| 상황 | 반영되나 | 이유 |
| --- | --- | --- |
| 온라인에서 앱을 새로 열기 | ✅ 즉시 | 네비게이션이 네트워크 우선 |
| 앱을 켜둔 채 백그라운드→복귀 | ❌ | 페이지가 살아있어 재로드가 없음 |
| 오프라인 | ❌ (의도됨) | 캐시된 이전 버전으로 구동 |

**켜둔 채 복귀"까지 잡으려면** 새 워커 감지 시 "새 버전이 있어요, 탭하여 새로고침" 토스트를 띄우는 패턴을 추가할 수 있습니다. 현재는 미구현입니다.

### 캐시가 꼬였을 때 (개발자용)

F12 → Application → Service Workers → **Unregister** → 새로고침
또는 Application → Storage → **Clear site data**

## 10.7 설치 버튼 만들기

브라우저는 설치 가능해지면 `beforeinstallprompt` 이벤트를 줍니다.

```tsx
useEffect(() => {
  // 이미 앱 모드로 실행 중이면 설치 버튼 숨김
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);
  if (standalone) setInstalled(true);

  const onPrompt = (e: Event) => {
    e.preventDefault();                  // 브라우저 기본 배너 막고
    setInstallEvt(e as BeforeInstallPromptEvent);   // 이벤트를 보관
  };
  const onInstalled = () => { setInstalled(true); setInstallEvt(null); };

  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => { /* 정리 */ };
}, []);
```

보관해둔 이벤트로 원하는 타이밍에 설치창을 띄웁니다.

```tsx
const install = useCallback(async () => {
  ensureAudio(); playTap();
  if (installEvt) {
    await installEvt.prompt();
    await installEvt.userChoice;
    setInstallEvt(null);          // 프롬프트는 1회용
    return;
  }
  // 프롬프트를 못 받는 환경 → 플랫폼별 안내
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  showToast(isIos
    ? "Safari 공유 버튼 → '홈 화면에 추가'로 설치하세요!"
    : "크롬·엣지(HTTPS)에서 주소창의 설치 아이콘으로 설치할 수 있어요");
}, [installEvt, showToast]);
```

### 여기서 배운 교훈

처음엔 `beforeinstallprompt`를 받았을 때만 버튼을 보여줬습니다. 그런데 **버튼이 안 보인다**는 문의가 왔습니다. 이 이벤트는 크롬·엣지 + HTTPS + 미설치일 때만 오고, **iOS Safari에는 아예 없기 때문**입니다.

그래서 **버튼은 항상 보이게 하고**, 프롬프트를 못 쓰는 환경에서는 수동 설치 방법을 안내하도록 바꿨습니다.

> 💡 **일반화된 교훈**: 브라우저 기능 지원 여부로 UI를 숨기면, 지원 안 되는 유저는 그 기능이 있는 줄도 모릅니다. **보여주되 대안을 안내**하는 편이 낫습니다.

### 커스텀 iOS 감지

```ts
/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
```
뒷부분은 **아이패드 판별 트릭**입니다. iPadOS 13+는 자신을 Macintosh로 소개하기 때문에, 터치 포인트 개수로 진짜 맥과 구분합니다.

## 10.8 실습 과제

1. **설치해보기** — `npm run build && npm run start` → 크롬 주소창 오른쪽 설치 아이콘 클릭
2. **오프라인 테스트** — 설치 후 F12 → Network → Offline 체크 → 새로고침. 게임이 도는지 확인
3. **캐시 관찰** — F12 → Application → Cache Storage에서 `stellapet-0.2.x` 내용 확인
4. **테마 색 바꾸기** — `manifest.ts`의 `theme_color`를 바꾸고 재설치해 상태바 색 변화 확인

---

## 정리

- PWA = **매니페스트(선언) + 서비스 워커(캐싱)**
- 캐싱 전략: HTML은 네트워크 우선, 해시 자산은 캐시 우선, 나머지는 SWR
- 캐시 버전은 `package.json`의 version과 연동 → 버전만 올리면 세대교체
- 서비스 워커는 **프로덕션에서만** 등록 (개발 중 캐시 지옥 방지)
- 기능 미지원 환경에서는 UI를 숨기지 말고 **대안을 안내**하라

다음: [11장 — 공유 카드와 바이럴 구조](11-share-viral.md)
