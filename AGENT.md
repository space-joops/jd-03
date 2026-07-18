# AGENT.md — STELLAPET 에이전트 공통 지침

AI 코딩 에이전트(Claude Code, Gemini CLI 등)를 위한 단일 원본 문서. `CLAUDE.md`와 `GEMINI.md`는 이 파일을 참조만 한다. 내용을 갱신할 땐 이 파일만 고치면 된다.

## 프로젝트 한눈에

**STELLAPET** — 우주 쓰레기를 먹는 생체 위성을 키우는 모바일 우선 픽셀 아트 다마고치 (Next.js 15 + React 19 + TS, 게임 엔진·오디오 파일·이미지 에셋 없음). 상세는 [README.md](README.md), 게임 규칙·밸런스는 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md), 코드 구조는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 참조. 코드 상세 해설·설계 의도는 [study/](study/README.md) (13장 인수인계 가이드).

## 작업 규칙 (중요)

1. **엔진은 순수 함수** — `src/lib/game/engine.ts`는 React·DOM·오디오를 모른다. 게임 규칙은 전부 여기에, UI에는 넣지 않는다.
2. **수치 동기화** — 밸런스 수치를 바꾸면 `docs/REQUIREMENTS.md`의 해당 표·수치를 반드시 함께 갱신한다.
3. **상태 필드 추가 시** — `types.ts` + `initialState` + **`storage.ts` 백필**을 세트로. 백필을 빼먹으면 기존 유저 세이브가 크래시한다.
4. **사건은 `pushLog`로** — 로그 kind(`info/gain/warn/evo/sys`)를 남기면 UI 색상과 사운드가 자동으로 따라온다.
5. **Supabase는 공유 프로젝트** — 모든 서버 생성 요소(테이블·뷰·정책·인덱스)에 **`jd03_` 접두사** 필수. 스키마 원본은 `supabase/jd03_schema.sql`.
6. **버전 단일 원본** — `package.json`의 `version`이 푸터 표기와 서비스 워커 캐시 세대(`/sw.js?v=`)를 겸한다. 유저가 배포 시 직접 올린다.
7. **커밋 메시지는 한국어**로, 무엇을·왜가 드러나게. 요구사항/문서 갱신은 같은 커밋에 포함.
8. **미니게임 손맛은 `TUNE`, 난이도는 `SORTIE_DIFFICULTY`** (`SortieGame.tsx`) — 난이도는 `NEXT_PUBLIC_SORTIE_*` 환경변수로 오버라이드 가능.

## 검증 방법

- `npm run build` — 린트 + 타입 체크 포함. 커밋 전 필수. (서버가 떠 있는 채로 빌드하면 `.next`가 깨질 수 있음 — 포트 3457 등 정리 후 빌드)
- **엔진 시뮬레이션** — 엔진이 순수라 Node로 직접 실행 가능: `types.ts`/`engine.ts`를 스크래치로 복사해 import 확장자만 보정 후 시나리오 실행 (Node 22+ 타입 스트리핑). 예시는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#검증-방법).
- **레이아웃 검증** — 헤드리스 크롬으로 실측: `public/`에 임시 시드 페이지(localStorage 세이브 주입) → `google-chrome --headless=new --screenshot` 뷰포트별 촬영 → 확인 후 시드 삭제.
- **Supabase 검증** — `.env.local`의 URL/anon key로 Node 스크립트 조회. RLS 검증은 익명 세션 2개로 교차 시도.

## 환경

- `.env.local` (gitignore): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Vercel 배포. 선택 env: `NEXT_PUBLIC_SITE_URL`(커스텀 도메인 OG), `NEXT_PUBLIC_SORTIE_*`(난이도)
- dev 서버 포트: jd-02=3002, jd-03=3003, jd-04=3004 (형제 프로젝트 서버를 죽이지 말 것)
- 참조 프로젝트 `/home/rhgw/code/SJ/jd-02` — 미니게임 루프·조이스틱·사운드의 원형

## 작업 히스토리

상세 연혁은 [docs/CHANGELOG.md](docs/CHANGELOG.md)와 `git log` 참조. 요약:

1. **MVP 코어 루프** (`04aea35`) — 알→육성→라이드셰어 발사→궤도 수거, 순수 엔진(tick/act/catchUp), 픽셀 캔버스, localStorage 저장
2. **궤도 이벤트·진화 분기** (`fb1f763`) — 유성우/플레어/대형 잔해 견인, 2단계부터 스피드/당김/균형 계열 분기, 세이브 백필 체계
3. **문서 체계** (`3c51240`, `339ccbd`) — REQUIREMENTS(수치 명세)·ARCHITECTURE·CONTRIBUTING(초심자용)·README
4. **PWA** (`46350bf`~`8ceec15`) — 매니페스트+스프라이트 아이콘, 수제 SW(네비 네트워크 우선), 설치 버튼, SW 캐시를 package.json 버전과 연동
5. **수동 조종 미니게임** (`3076dc4`→`114fc39`→`cfe0d92`) — jd-02 참조 클로저 루프, 전체 화면(동적 논리 해상도), 조그셔틀 3단 분사+관성+벽 반동+사방 스폰
6. **사운드** (`c5ca4a9`) — Web Audio 신시사이저, 로그 kind→효과음 매핑, 엔진음 루프, 뮤트
7. **바이럴 공유 4단계** (`1856c5f`→`45f4f98`→`0f8c941`→`063beef`, `aee2a34`) — ① 픽셀 카드+Web Share ② 감정 고점 프롬프트+신기록 스코어 카드 ③ 도전장 URL(/c)+데모 출격+QR ④ next/og 동적 미리보기(현재 캐릭터 반영)
8. **Supabase 리더보드** (`75cea02`) — jd03_ 스키마(펫·주간·명예의전당 뷰), 익명 인증+RLS, 참가 동의, /rank(업적 모달·랭크 카드)
9. **연료 서바이벌 개편** (`26ec60e`) — 시간 제한 제거, 연료 소진=종료(표류 유예·재점화), 연료 셀 아이템, 피격=연료 손실, `SORTIE_DIFFICULTY` env 오버라이드, 역대 단판 탭, 기록 세대(`sortieGen`) 리셋
10. **반응형·UX** (`b88f58b`, `ab8e1ea`, `28ff149`) — 가로 2컬럼 레이아웃+PWA 회전 허용, 액션 바 sticky 고정(버튼 밀림 버그 픽스, 헤드리스 재현 검증), 미니게임 [RETURN] 버튼을 HUD 내로 통합

## 백로그

- [docs/backlog/viral-brag.md](docs/backlog/viral-brag.md) — 바이럴 로드맵(4/4 완료) + 잔여 아이디어
- 미구현 아이디어: 뱃지형 업적 시스템(엔진 통계 추적 필요), 스토리형 세로 카드, 도전 수락 횟수 추적, 주간 리더보드 알림
