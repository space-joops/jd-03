# 7장 — 미니게임: 게임 루프와 물리 (`SortieGame.tsx`)

> 이 파일은 **작은 게임 하나가 통째로** 들어있습니다. 진짜 게임 개발의 축소판이라 배울 게 많습니다.
> 형제 프로젝트 jd-02(스페이스 죽스)의 구조를 참조해 만들었습니다.

## 7.1 이 미니게임은 무엇인가

**연료 서바이벌** — 시간 제한이 없고, **연료가 바닥나면 끝납니다.**

```
조종 버튼(추진제 5 소모) → 전체화면 전환 → 조그셔틀로 기동
  → 잔해를 먹어 kg 수집 / 연료 셀로 수명 연장 / 붉은 파편 피하기
  → 연료 0 → 4초 표류 유예 (이때 연료 셀 먹으면 부활!) → 종료
  → settleSortie로 본편에 정산
```

## 7.2 게임 루프의 3대 원칙

이 파일 맨 위 주석에 적힌 원칙들입니다. **모든 실시간 게임의 기본기**입니다.

### 원칙 ① 상태는 클로저 지역 변수에

```tsx
useEffect(() => {
  // 이 안의 변수들은 React가 모른다 = 바뀌어도 리렌더 안 됨
  const pet = { x: w / 2, y: h / 2 };
  let vx = 0, vy = 0;
  let fuel = DIFF.startFuel;
  const junks: Junk[] = [];
  ...
}, []);
```

펫 좌표는 1초에 60번 바뀝니다. `useState`에 넣으면 초당 60번 리렌더가 일어나 게임이 버벅입니다. **캔버스 게임의 상태는 React 밖에 두는 것이 정석입니다.**

### 원칙 ② `update`와 `draw`를 분리한다

```tsx
const update = (dt: number) => { /* 상태만 바꾼다. 캔버스는 안 건드림 */ };
const draw = () => { /* 그리기만 한다. 상태는 안 바꿈 */ };

const frame = (now: number) => {
  const dt = Math.min(TUNE.maxDt, (now - last) / 1000);
  last = now;
  update(dt);
  if (done) return;
  draw();
  raf = requestAnimationFrame(frame);
};
```

섞으면 "그리는 도중에 값이 바뀌어" 화면이 어긋나고, 버그를 추적하기가 매우 어려워집니다. **읽기 전용 함수와 쓰기 전용 함수를 나누는 것**은 게임뿐 아니라 모든 프로그래밍의 좋은 습관입니다.

### 원칙 ③ dt(델타 타임)로 프레임 독립성 확보

```tsx
const dt = Math.min(TUNE.maxDt, (now - last) / 1000);   // 지난 프레임 이후 흐른 시간(초)
pet.x += vx * dt;    // 속도 × 시간 = 이동 거리
```

**왜 필요한가:** 60Hz 모니터와 144Hz 모니터에서 프레임 수가 다릅니다. `pet.x += vx`처럼 쓰면 144Hz에서 2.4배 빨라집니다. `× dt`를 곱하면 **어떤 기기에서도 같은 속도**가 됩니다.

**`Math.min(maxDt, ...)`의 정체:** 브라우저 탭을 백그라운드에 두면 `requestAnimationFrame`이 멈췄다가, 돌아왔을 때 `dt`가 몇 초로 튑니다. 그러면 물체가 화면을 순간이동해 **벽을 뚫고 충돌 판정도 건너뜁니다**(터널링). 그래서 0.05초로 상한을 둡니다.

## 7.3 조그셔틀 — 자동차 게임식 조종

화면 아무 곳이나 누르면 **그 지점이 스틱 원점**이 되고, 드래그한 방향으로 추진합니다.

```tsx
const onDown = (e: PointerEvent) => {
  const p = toLocal(e);
  // HUD의 [RETURN] 버튼 탭이면 복귀 처리
  if (p.y <= HUD_H + 4 && p.x >= returnRect.x && p.x <= returnRect.x + returnRect.w) {
    finish();
    return;
  }
  joyOx = p.x; joyOy = p.y;      // 원점
  joyCx = p.x; joyCy = p.y;      // 노브 위치
  joyActive = true;
  canvas.setPointerCapture(e.pointerId);   // 손가락이 캔버스 밖으로 나가도 계속 추적
};

const onMove = (e: PointerEvent) => {
  if (!joyActive) return;
  const p = toLocal(e);
  const dx = p.x - joyOx, dy = p.y - joyOy;
  const dist = Math.hypot(dx, dy);
  if (dist > TUNE.joyMax) {
    // 최대 반경 밖으로는 안 나가게 — 방향은 유지하고 거리만 자름
    joyCx = joyOx + (dx / dist) * TUNE.joyMax;
    joyCy = joyOy + (dy / dist) * TUNE.joyMax;
  } else { joyCx = p.x; joyCy = p.y; }
};
```

**`(dx / dist)`가 단위 벡터**입니다. 방향만 남기고 크기를 1로 만든 것이라, 여기에 원하는 거리를 곱하면 그 방향으로 정확히 그만큼 갑니다. 게임에서 매우 자주 쓰는 계산입니다.

**Pointer Events**를 쓴 이유: 마우스·터치·펜을 하나의 코드로 처리할 수 있습니다(`mousedown`/`touchstart`를 따로 안 써도 됨).

### 3단 분사

```tsx
if (dist > TUNE.joyDead) {                       // 데드존(4px) 넘으면
  thrustLevel = dist < TUNE.levelAt[0] ? 0       // 4~12px  → 1단
              : dist < TUNE.levelAt[1] ? 1       // 12~24px → 2단
              : 2;                               // 24px~   → 3단
  const cost = DIFF.thrustCosts[thrustLevel] * dt;
  if (fuel >= cost) {
    fuel -= cost;
    const acc = TUNE.thrustAccel[thrustLevel] * accelMul;
    vx += (dx / dist) * acc * dt;                // 속도에 가속 누적
    vy += (dy / dist) * acc * dt;
    thrusting = true;
  } else fuel = 0;
}
```

드래그 거리가 곧 액셀 페달의 깊이입니다. 단계가 올라갈수록 **가속은 커지지만 연료도 많이 먹습니다**(2/6/14 per second). 이 트레이드오프가 게임의 핵심 재미입니다.

**데드존**은 손가락 미세 떨림으로 의도치 않게 분사되는 것을 막습니다.

## 7.4 우주 관성 물리

```tsx
// ① 마찰로 서서히 감속 (우주지만 게임성을 위해 약간의 저항)
vx -= vx * TUNE.friction * dt;
vy -= vy * TUNE.friction * dt;

// ② 최소 표류 속도 — 한 번 움직이면 완전히 멈추진 않는다
const sp = Math.hypot(vx, vy);
if (sp > 0 && sp < TUNE.minSpeed) {
  vx = (vx / sp) * TUNE.minSpeed;
  vy = (vy / sp) * TUNE.minSpeed;
}

// ③ 위치 갱신
pet.x += vx * dt;
pet.y += vy * dt;

// ④ 벽 반동
if (pet.x < petR)      { pet.x = petR;      vx *= -TUNE.bounce; }
if (pet.x > w - petR)  { pet.x = w - petR;  vx *= -TUNE.bounce; }
if (pet.y < HUD_H+petR){ pet.y = HUD_H+petR; vy *= -TUNE.bounce; }
if (pet.y > h - petR)  { pet.y = h - petR;  vy *= -TUNE.bounce; }
```

**이것이 "관성"의 전부입니다.**
- 위치가 아니라 **속도**를 조종한다 → 미끄러지는 느낌
- 마찰은 속도에 비례해 깎는다(`vx -= vx * k * dt`) → 빠를수록 많이 줄어 자연스럽게 수렴
- 벽에 닿으면 위치를 되돌리고 **속도 부호를 뒤집으며 0.8배** → 튕기되 조금 손해

`Math.hypot(vx, vy)`는 피타고라스로 속도의 크기(빠르기)를 구합니다.

> 💡 **왜 최소 속도를 두나?** 완전히 멈추면 "우주"의 느낌이 사라지고, 연료 아끼려고 가만히 있는 전략이 지루해집니다. 계속 표류하게 만들어 항상 무언가 일어나게 합니다.

## 7.5 연료 서바이벌의 심장 — 종료 규칙

```tsx
// 연료 소진 → 유예 시작
if (fuel <= 0 && emptyAt === null) {
  emptyAt = elapsed;
  playFuelEmpty();               // 시동 꺼지는 소리
}
// 유예 시간이 다 되면 종료
if (emptyAt !== null && elapsed - emptyAt >= DIFF.driftGrace) {
  finish();
  return;
}
```

그리고 유예 중에 연료 셀을 먹으면:

```tsx
const pickupFuel = (j: Junk) => {
  const revived = emptyAt !== null;
  fuel = Math.min(DIFF.startFuel, fuel + DIFF.fuelItemRefill);
  emptyAt = null;                                    // ⭐ 부활!
  popups.push({ text: revived ? "재점화!" : `FUEL +${...}`, ... });
  playFuelUp();
};
```

**이 4초가 게임의 명장면입니다.** 연료가 떨어져 표류하는 동안 카운트다운이 깜빡이고, 마침 흘러오던 연료 셀을 관성으로 아슬아슬하게 스치면 "재점화!"와 함께 살아납니다. 규칙 하나로 극적인 순간이 만들어집니다.

## 7.6 난이도 변수 — 환경변수로 조절하기

```tsx
const envNum = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;   // 값이 없거나 이상하면 기본값
};

export const SORTIE_DIFFICULTY = {
  startFuel:        envNum(process.env.NEXT_PUBLIC_SORTIE_START_FUEL, 100),
  thrustCosts: [
    envNum(process.env.NEXT_PUBLIC_SORTIE_COST_1, 2),
    envNum(process.env.NEXT_PUBLIC_SORTIE_COST_2, 6),
    envNum(process.env.NEXT_PUBLIC_SORTIE_COST_3, 14),
  ],
  fuelItemWeight:   envNum(process.env.NEXT_PUBLIC_SORTIE_FUEL_WEIGHT, 12),
  fuelItemRefill:   envNum(process.env.NEXT_PUBLIC_SORTIE_FUEL_REFILL, 25),
  hazardWeight:     envNum(process.env.NEXT_PUBLIC_SORTIE_HAZARD_WEIGHT, 18),
  hazardFuelDamage: envNum(process.env.NEXT_PUBLIC_SORTIE_HAZARD_DAMAGE, 15),
  spawnBase:        envNum(process.env.NEXT_PUBLIC_SORTIE_SPAWN_BASE, 0.45),
  driftGrace:       envNum(process.env.NEXT_PUBLIC_SORTIE_DRIFT_GRACE, 4),
};
```

**왜 이렇게 만들었나:** 난이도는 여러 번 실험해야 하는 값입니다. 코드를 고쳐 커밋·배포하는 대신, Vercel 대시보드에서 환경변수만 바꿔 재배포하면 됩니다. 기획자나 비개발자도 조정할 수 있습니다.

로컬에서 실험하려면 `.env.local`에 추가하고 서버를 재시작하세요.
```
NEXT_PUBLIC_SORTIE_START_FUEL=200
NEXT_PUBLIC_SORTIE_HAZARD_WEIGHT=40
```

> ⚠️ `NEXT_PUBLIC_` 환경변수는 **빌드할 때 코드에 박힙니다.** 값을 바꾸면 재빌드/재배포가 필요합니다.

### `TUNE` vs `SORTIE_DIFFICULTY` 구분

| | 무엇 | 예 |
| --- | --- | --- |
| `TUNE` | **조작감**(손맛) — 코드에서만 조정 | 데드존, 마찰, 판정 여유, 무적 시간 |
| `SORTIE_DIFFICULTY` | **난이도** — 환경변수로 조정 | 연료량, 소모율, 아이템 빈도, 위험물 빈도 |

## 7.7 잔해 스폰과 판정

### 사방에서 진입

```tsx
function makeJunk(kind: Kind, w: number, h: number): Junk {
  const edge = Math.floor(Math.random() * 4);   // 0 위 1 오른쪽 2 아래 3 왼쪽
  let x, y, baseAng;
  if (edge === 0)      { x = Math.random() * w; y = -16;    baseAng = Math.PI / 2; }
  else if (edge === 1) { x = w + 16; y = ...;               baseAng = Math.PI; }
  else if (edge === 2) { x = Math.random() * w; y = h + 16; baseAng = -Math.PI / 2; }
  else                 { x = -16; y = ...;                  baseAng = 0; }

  const ang = baseAng + (Math.random() * 2 - 1) * 0.7;   // ±0.7rad 흩뿌리기
  return { kind, x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, ... };
}
```

화면 밖에서 시작해 안쪽을 향하되, 각도에 랜덤을 섞어 일정한 패턴이 안 보이게 합니다.

### 스폰 간격에 지터 주기

```tsx
spawnTimer = DIFF.spawnBase * (0.7 + Math.random() * 0.6);   // 0.45초 ±30%
```

정확히 0.45초마다 나오면 리듬이 외워져 지루해집니다. **불규칙성도 설계입니다.**

### 판정: 후하게 먹고, 짜게 맞는다 ⭐

```tsx
const dist = Math.hypot(pet.x - j.x, pet.y - j.y);
if (j.kind === "shard") {
  // 피격 판정은 짜게 — 보이는 것보다 작게 (반경 ×0.75)
  if (invincible <= 0 && dist < petR * TUNE.hitShrink + j.size) hit(j);
} else if (dist < petR + j.size + TUNE.eatBonus) {
  // 획득 판정은 후하게 — 보이는 것보다 크게 (+5px)
  if (j.kind === "cell") pickupFuel(j); else eat(j);
}
```

**이 비대칭이 "손맛"의 핵심입니다.**
- 아슬아슬하게 스친 먹이가 먹히면 → "오, 먹었다!" (기분 좋음)
- 아슬아슬하게 스친 위험물이 안 맞으면 → "휴, 피했다!" (기분 좋음)

둘 다 플레이어에게 유리하게 판정합니다. 정직하게 계산하면 억울한 순간이 많아 게임이 짜증납니다. **상용 게임들이 다 이렇게 합니다.**

### 자석 — 티 안 나게 돕기

```tsx
if (j.kind !== "shard") {                          // 위험물은 제외!
  const dx = pet.x - j.x, dy = pet.y - j.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 1 && dist < petR + magnetRange) {
    const pull = (TUNE.magnetPull * dt) / dist;    // 가까울수록 강하게
    j.x += dx * pull;
    j.y += dy * pull;
  }
}
```

`magnetRange`는 본편의 **당김 스탯**에 비례합니다(`12 + min(28, pull × 0.5)`). 육성을 잘하면 미니게임이 쉬워집니다 — **본편과 미니게임을 잇는 장치**입니다.

마찬가지로 스피드 스탯은 추진 가속에 보너스(`1 + min(0.5, speed × 0.01)`)를 줍니다.

### 무적 시간

```tsx
const hit = (j: Junk) => {
  hits += 1;
  invincible = TUNE.invincible;    // 1.2초
  shake = TUNE.shakeTime;
  fuel = Math.max(0, fuel - DIFF.hazardFuelDamage);
  junks.splice(junks.indexOf(j), 1);   // 찌른 파편은 제거
  playHit();
};
```

무적이 없으면 파편 무리에 들어갔을 때 순식간에 연료가 증발합니다. 그리고 **부딪힌 파편을 즉시 없애는 것**도 중요합니다 — 무적이 끝나자마자 같은 파편에 또 맞으면 억울하니까요.

## 7.8 배열 순회의 함정

```tsx
for (let i = junks.length - 1; i >= 0; i--) {   // ⭐ 뒤에서부터!
  const j = junks[i];
  ...
  if (조건) { junks.splice(i, 1); continue; }
}
```

**앞에서부터 순회하며 삭제하면 항목을 건너뜁니다.**

```
[A, B, C]에서 i=0일 때 A 삭제 → [B, C]
i=1이 되면 C를 봄 → B를 건너뜀! ❌
```

뒤에서부터 돌면 삭제해도 앞쪽 인덱스가 밀리지 않습니다. **게임 코드에서 가장 흔한 버그 중 하나**이니 꼭 기억하세요.

## 7.9 화면 크기 대응

```tsx
const fit = () => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const pxScale = Math.max(TUNE.minScale, Math.min(vw / BASE_W, vh / BASE_H));
  w = Math.round(vw / pxScale);    // 논리 해상도를 화면 비율에 맞춰 계산
  h = Math.round(vh / pxScale);
  canvas.width = w;
  canvas.height = h;
};
fit();
window.addEventListener("resize", fit);
```

본편(`PixelView`)은 240×200 고정이지만, 미니게임은 **화면이 클수록 플레이 영역도 넓어집니다.** 폰을 가로로 눕히면 좌우로 넓은 전장이 됩니다. `minScale`(1.5)로 하한을 둬 데스크톱에서 도트가 너무 작아지지 않게 합니다.

## 7.10 HUD와 [RETURN] 버튼

HTML 버튼 대신 **캔버스 안에 직접 그립니다.**

```tsx
// 그리기
const retText = "[RETURN]";
const retW = ctx.measureText(retText).width;
const retX = w - 6 - retW;
ctx.fillStyle = "#f4b860";
ctx.fillText(retText, retX, 14);
returnRect.x = retX - 6;      // 탭 판정 영역 기록
returnRect.w = retW + 12;

// 입력 (onDown에서)
if (p.y <= HUD_H + 4 && p.x >= returnRect.x && p.x <= returnRect.x + returnRect.w) {
  finish();
  return;
}
```

**왜 이렇게?** HTML 버튼을 캔버스 위에 겹치면 화면 크기에 따라 HUD 텍스트와 겹치고 스타일도 따로 놉니다. 캔버스 안에 그리면 픽셀 스케일과 함께 움직여 항상 정렬이 맞습니다.

`ctx.measureText()`로 글자 폭을 재서 탭 영역을 계산하는 것이 포인트입니다.

## 7.11 실습 과제

1. **연료 셀을 흔하게** — `.env.local`에 `NEXT_PUBLIC_SORTIE_FUEL_WEIGHT=40` 넣고 재시작. 훨씬 오래 버팁니다.
2. **관성 없애보기** — `TUNE.friction`을 10으로. 미끄러짐이 사라지고 조작이 뻣뻣해지는 걸 체감해보세요.
3. **새 잔해 종류 추가** — `KIND_STAT`과 `buildKindTable`, `drawJunk`에 "황금 파편"(kg 50~80, 가중치 3)을 추가해보세요.
4. **무적 시간 제거** — `TUNE.invincible`을 0으로 하고 파편 무리에 들어가 보세요. 왜 필요한지 알게 됩니다.

---

## 정리

- 게임 루프 3원칙: **상태는 클로저에 / update와 draw 분리 / dt로 프레임 독립**
- `dt` 상한은 백그라운드 복귀 시 터널링을 막는다
- 관성 = 위치가 아니라 **속도**를 조종 + 마찰 감쇠 + 벽 반동
- 판정은 **먹기는 후하게, 맞기는 짜게** — 손맛의 비밀
- 배열 삭제는 **뒤에서부터 순회**
- 조작감은 `TUNE`, 난이도는 `SORTIE_DIFFICULTY`(환경변수)

다음: [8장 — 소리 만들기](08-sound.md)
