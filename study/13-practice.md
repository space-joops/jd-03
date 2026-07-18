# 13장 — 실습 과제 · 디버깅 · 자주 하는 실수

> 읽기만 해서는 늘지 않습니다. 손을 움직여봅시다.
> 난이도 순으로 배치했으니 위에서부터 하나씩 해보세요.

## 13.1 실습 과제 — 레벨 1 (숫자 바꾸기)

### 과제 1-1. 먹이 쿨다운 줄이기
`src/lib/game/engine.ts`의 `COOLDOWNS`에서 `feed: 6_000`을 `3_000`으로.
→ 브라우저에서 먹이 버튼 쿨다운이 3초가 되는지 확인
→ **`docs/REQUIREMENTS.md`의 액션 표도 함께 수정** (중요!)

### 과제 1-2. 진화를 빨리 보기
`ORBIT_STAGES`의 `atKg`를 `[0, 20, 50, 100]`으로 낮춰보세요.
→ 궤도 진입 후 몇 분 만에 4단계까지 진화하는 걸 볼 수 있습니다
→ 확인 후 원래대로 되돌리세요

### 과제 1-3. 미니게임 난이도 실험
`.env.local`에 추가하고 `npm run dev` 재시작:
```
NEXT_PUBLIC_SORTIE_START_FUEL=300
NEXT_PUBLIC_SORTIE_HAZARD_WEIGHT=40
```
→ 연료는 넉넉한데 위험물이 쏟아지는 모드를 체험

### 과제 1-4. 색 테마 바꾸기
`src/app/globals.css`의 `--mint: #7ee8a2`를 다른 색으로.
→ 버튼·강조 텍스트가 한꺼번에 바뀌는 걸 확인 (CSS 변수의 힘)

## 13.2 실습 과제 — 레벨 2 (기능 추가)

### 과제 2-1. 새 잔해 추가
`engine.ts`의 `DEBRIS_TABLE`에 한 줄 추가:
```ts
{ name: "부서진 태양전지판", kg: [30, 70], w: 8, bonus: "prop" },
```
→ 궤도에서 이 잔해가 나오는지 로그로 확인
→ 가중치 8이면 대략 7~8% 확률 (총합이 108이 되므로)

### 과제 2-2. 새 액션 추가 (4장 실습 참고)
"명상" 액션: 기분 +30, 에너지 −5, 쿨다운 15초
1. `COOLDOWNS`에 `meditate: 15_000`
2. `ActionId`에 `"meditate"` 추가
3. `act`의 switch에 case 작성
4. `Game.tsx` 지상 버튼 영역에 `<ActionButton label="명상" icon="🧘" ... />`
5. 문서 갱신 → `npm run build`

### 과제 2-3. 새 궤도 이벤트 추가
"우주 태풍"(20초, 추진제가 초당 1씩 감소):
1. `types.ts`에 `stormUntil: number` 추가
2. `initialState`에 `stormUntil: 0`
3. **`storage.ts` 백필에 `stormUntil: s.stormUntil ?? 0`** ← 잊지 마세요!
4. `orbitTick`에 발생·종료·효과 로직
5. `Game.tsx`에 배지 표시, `PixelView.tsx`에 연출(선택)

### 과제 2-4. 스프라이트 그리기
`sprites.ts`에 새 스프라이트를 만들고 `drawOrbit`에서 그려보세요.
```ts
export const SATELLITE: Sprite = {
  rows: [
    "p.ooo.p",
    "ppooopp",
    "p.ooo.p",
  ],
  palette: { o: "#cfd8e6", p: "#5b8dd9" },
};
```

## 13.3 실습 과제 — 레벨 3 (설계가 필요한 것)

### 과제 3-1. 펫 나이 시스템
- `createdAt`으로 일차를 계산해 화면에 표시
- 7일차마다 "성숙도" 보너스 (예: 수확량 +5%)
- 힌트: `bragCard`가 이미 일차를 계산합니다

### 과제 3-2. 업적(뱃지) 시스템 — 백로그에 있는 기능
- 통계 필드 추가: `salvageSuccess`, `meteorSurvived`, `maxSortieSec`…
- 조건 달성 시 뱃지 획득 + `pushLog(..., "evo")`
- 리더보드 업적 모달에 뱃지 표시
- 힌트: `docs/backlog/viral-brag.md`에 아이디어가 정리돼 있습니다

### 과제 3-3. 미니게임에 새 아이템
"쉴드"(3초간 무적):
- `Kind`에 `"shield"` 추가, `KIND_STAT`·`buildKindTable`·`drawJunk` 수정
- 획득 시 `invincible`을 3초로 설정
- 난이도 변수로 등장 빈도 조절 가능하게

### 과제 3-4. 리더보드에 "이번 주 출격 횟수" 탭
- DB 컬럼 추가(SQL) → `syncLeaderboard` → `fetch...Top` → 탭 UI

## 13.4 디버깅 가이드

### 증상별 대응표

| 증상 | 먼저 확인할 것 |
| --- | --- |
| 화면이 하얗게 비어있음 | F12 Console의 빨간 에러. 대개 `undefined` 참조 |
| 버튼을 눌러도 반응 없음 | 쿨다운 중? phase 조건? `act`의 `return prev` 경로 확인 |
| 값이 화면에 반영 안 됨 | 상태를 직접 수정했을 가능성 (`s.x = 1` 대신 `{...s, x:1}`) |
| 소리가 안 남 | 화면을 한 번 클릭했는지, 🔇 켜져 있는지 |
| 수정했는데 옛날 화면 | `npm run start`로 봤다면 서비스 워커 캐시 → Application에서 Unregister |
| 게임이 느려짐/버벅임 | 매 프레임 `setState` 하고 있는지 확인 |
| 기존 유저만 크래시 | **storage.ts 백필 누락** |
| 리더보드 안 뜸 | 환경변수, Anonymous sign-ins 활성화 |

### 도구 1: console.log 잘 쓰기

```ts
// 값에 이름표를 붙이면 읽기 쉽다
console.log("[tick] phase:", s.phase, "debris:", s.debrisKg);

// 객체는 통째로
console.log("[act] before:", { ...prev }, "after:", { ...s });

// 조건부 — 특정 상황만 보고 싶을 때
if (s.debrisKg > 900) console.log("진화 직전!", s.debrisKg);
```

### 도구 2: 세이브 조작으로 상황 만들기

F12 Console에서:
```js
const s = JSON.parse(localStorage.getItem("stellapet-save-v1"));
s.phase = "orbit";      // 궤도로 순간이동
s.debrisKg = 990;       // 진화 직전
s.prop = 100;
localStorage.setItem("stellapet-save-v1", JSON.stringify(s));
location.reload();
```
**개발 중 가장 많이 쓰게 될 기술입니다.** 몇 시간 플레이할 필요가 없습니다.

### 도구 3: 엔진 시뮬레이션 (밸런스 검증)

3장 3.5절 참고. 밸런스를 바꾸면 이걸로 확인하세요.
```bash
node sim.mjs   # 2시간치 플레이를 1초에
```

### 도구 4: 레이아웃은 스크린샷으로

여러 화면 크기에서 실제로 찍어봅니다.
```bash
npm run build && npm run start   # 포트 3457 등
google-chrome --headless=new --window-size=390,660 --screenshot=a.png http://localhost:3457/
google-chrome --headless=new --window-size=844,390 --screenshot=b.png http://localhost:3457/
```
또는 F12 기기 툴바로 여러 기기를 전환하며 확인.

### 도구 5: React DevTools

브라우저 확장을 설치하면 컴포넌트 트리와 state를 실시간으로 볼 수 있습니다. "왜 리렌더가 안 되지?" 할 때 유용합니다.

## 13.5 자주 하는 실수 TOP 10

### 1. 상태를 직접 수정
```ts
state.energy = 100;                    // ❌ 화면이 안 바뀜
setState({ ...state, energy: 100 });   // ⭕
```

### 2. `storage.ts` 백필 누락
새 필드를 추가하고 백필을 안 하면 **기존 유저만** 크래시합니다. 내 브라우저에선 새 세이브라 멀쩡해서 못 잡습니다.
```ts
// storage.ts loadState에 반드시 추가
newField: s.newField ?? 기본값,
```

### 3. useEffect 정리 함수 누락
```ts
useEffect(() => {
  const id = setInterval(...);
  return () => clearInterval(id);   // ⭐ 없으면 타이머가 쌓임
}, []);
```

### 4. 배열을 앞에서부터 순회하며 삭제
```ts
for (let i = junks.length - 1; i >= 0; i--) { ... junks.splice(i, 1); }   // ⭕ 뒤에서부터
```

### 5. dt 안 곱하기 (게임 루프)
```ts
pet.x += vx;        // ❌ 모니터 주사율에 따라 속도가 달라짐
pet.x += vx * dt;   // ⭕
```

### 6. 매 프레임 setState
```ts
// ❌ 초당 60번 리렌더 → 게임이 슬라이드쇼
const loop = () => { setPos({ x, y }); requestAnimationFrame(loop); };
```
캔버스 게임 상태는 `useEffect` 클로저 변수로.

### 7. 문서 동기화 안 함
밸런스 숫자를 바꾸고 `docs/REQUIREMENTS.md`를 안 고치면, 다음 사람이 문서를 믿고 잘못된 판단을 합니다.

### 8. 오버레이에 `pointer-events: none` 누락
화면 전체를 덮는 요소를 만들면 그 아래 모든 클릭이 막힙니다.

### 9. Supabase `jd03_` 접두사 누락
공유 프로젝트라 다른 프로젝트 테이블과 충돌합니다.

### 10. 서버 켜둔 채 빌드
`npm run start`가 돌고 있는데 `npm run build`를 하면 `.next` 폴더가 꼬여 이상한 에러가 납니다.
```bash
# 해결: 서버 끄고 클린 빌드
rm -rf .next && npm run build
```

## 13.6 코드 작성 체크리스트

새 기능을 만들 때 순서대로 확인하세요.

- [ ] 게임 규칙은 `engine.ts`에 있는가? (UI에 로직을 넣지 않았는가)
- [ ] 상태 필드를 추가했다면 `types.ts` + `initialState` + **`storage.ts` 백필** 3종 세트를 했는가
- [ ] 사건에 `pushLog`를 적절한 `kind`로 남겼는가 (색·소리가 자동으로 따라옴)
- [ ] 밸런스 숫자를 바꿨다면 `docs/REQUIREMENTS.md`를 갱신했는가
- [ ] `useEffect`에 정리 함수가 있는가
- [ ] 실패 케이스를 처리했는가 (조건 부족 시 로그, 네트워크 실패 시 조용히)
- [ ] `npm run build`가 통과하는가
- [ ] 실제로 플레이해서 확인했는가
- [ ] 짧은 화면(390×660)에서도 UI가 깨지지 않는가
- [ ] 커밋 메시지에 무엇을·왜가 드러나는가 (한국어)

## 13.7 git 기본 흐름

```bash
git checkout -b feat/meditate-action   # 작업용 가지 만들기
# ... 코드 수정 ...
npm run build                          # 검증
git add .
git status                             # 뭐가 담겼는지 확인
git commit -m "명상 액션 추가 — 기분 +30, 에너지 -5, 쿨다운 15초"
git push origin feat/meditate-action
# GitHub에서 Pull Request 생성
```

**커밋 메시지 예시** (이 프로젝트 스타일):
```
궤도 이벤트(유성우·플레어·대형 잔해 견인)와 진화 계열 분기 구현

- orbitTick: 유성우(조우 ×2.5)·플레어(조우 ×0.5)·대형 잔해 발생/종료 처리
- salvage 액션: 추진제 10 소모, 당김 비례 성공률로 견인
- 구버전 세이브 로드 시 신규 필드 백필
```
제목은 한 줄 요약, 본문은 항목별로. **왜 그렇게 했는지**가 들어가면 더 좋습니다.

## 13.8 더 공부하려면

| 주제 | 추천 자료 |
| --- | --- |
| JavaScript 기초 | [MDN JavaScript 가이드](https://developer.mozilla.org/ko/docs/Web/JavaScript/Guide) |
| React | [React 공식 문서 (한국어)](https://ko.react.dev/learn) |
| TypeScript | [TypeScript 핸드북](https://www.typescriptlang.org/ko/docs/handbook/intro.html) |
| Next.js | [Next.js Learn](https://nextjs.org/learn) |
| Canvas | [MDN Canvas 튜토리얼](https://developer.mozilla.org/ko/docs/Web/API/Canvas_API/Tutorial) |
| Web Audio | [MDN Web Audio API](https://developer.mozilla.org/ko/docs/Web/API/Web_Audio_API) |
| Tailwind | [Tailwind 공식 문서](https://tailwindcss.com/docs) |
| Supabase | [Supabase Docs](https://supabase.com/docs) |
| 게임 루프 이론 | [Game Programming Patterns](https://gameprogrammingpatterns.com/game-loop.html) |

### 이 프로젝트에서 배울 수 있는 것 (면접에서 말할 거리)

- **관심사 분리**: 순수 함수 엔진 / 표현 계층 분리, 덕분에 브라우저 없이 테스트 가능
- **성능 설계**: 60fps는 캔버스, 저빈도는 React
- **하위 호환**: 세이브 마이그레이션(백필), 기록 세대 관리
- **점진적 향상**: 서비스 워커·Web Share·Fullscreen 모두 미지원 시 우아하게 폴백
- **보안**: RLS로 클라이언트 직접 접근을 안전하게, 실제로 뚫어보는 검증
- **게임 감각**: 판정 비대칭, 무적 시간, 실패 시 쿨다운 미적용 같은 배려

---

## 마치며

이 프로젝트는 **작지만 완결된 제품**입니다. 게임 루프, 상태 관리, 렌더링, 사운드, 오프라인, 공유, 서버 연동까지 웹 개발의 거의 모든 영역이 한 번씩 나옵니다.

처음엔 `engine.ts`의 숫자 하나를 바꾸는 것부터 시작하세요. 그 다음엔 액션 하나, 그 다음엔 이벤트 하나. **작게 바꾸고, 빌드하고, 직접 플레이해서 확인하는 사이클**을 반복하다 보면 어느새 전체가 손에 들어옵니다.

막히면 언제든 이 문서로 돌아오세요. 그리고 새로 알게 된 것이 있으면 이 문서에도 추가해 주세요 — 다음 사람을 위해서요. 🛰

← [처음으로](README.md)
