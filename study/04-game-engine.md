# 4장 — 게임 엔진 완전 해부 (`engine.ts`)

> 이 파일 하나가 게임의 전부입니다. 576줄이지만 구조는 단순합니다.
> **상수 → 헬퍼 → 틱(시간 진행) → 액션(유저 입력) → 정산** 순서로 되어 있습니다.

## 4.1 게임의 뼈대: 5개의 단계(Phase)

```ts
export type Phase = "egg" | "ground" | "awaiting" | "launching" | "orbit";
```

```
egg (알)  →  ground (지상 육성)  →  awaiting (발사 대기)
                                       ↓
                        orbit (궤도 임무) ← launching (발사 시퀀스)
```

한 방향으로만 갑니다. 돌아가는 길은 없습니다(초기화 제외). 각 단계에서 **할 수 있는 액션이 다르고, 매초 일어나는 일도 다릅니다.**

| Phase | 매초 일어나는 일 | 가능한 액션 |
| --- | --- | --- |
| `egg` | 에너지·기분 감소 | 품어주기 |
| `ground` | 에너지·기분 감소 | 먹이, 보살핌, 훈련, (자격되면) 발사 등록 |
| `awaiting` | 윈도우 시각 도달 확인 | 먹이, 보살핌, 훈련 |
| `launching` | 대사 출력, 13초 후 궤도 진입 | 없음 (구경만) |
| `orbit` | 잔해 조우, 이벤트, 충돌 | 조종, 부스트, 교신, 보급, 견인 |

## 4.2 파일 위쪽: 상수 = 밸런스 다이얼

**게임 밸런스를 바꾸려면 여기만 만지면 됩니다.**

```ts
/** 라이드셰어 공동 발사 윈도우 간격 (5분) */
export const WINDOW_MS = 5 * 60_000;
/** 발사 시퀀스 길이 */
export const LAUNCH_DURATION_MS = 13_000;
/** 발사 자격: 최소 체중(g) / 최소 훈련도 */
export const LAUNCH_MIN_WEIGHT = 500;
export const LAUNCH_MIN_TRAINING = 30;
/** 부재중 진행 상한 (8시간) */
const OFFLINE_CAP_MS = 8 * 3600_000;

export const COOLDOWNS: Record<string, number> = {
  incubate: 3_000,   // 품어주기 3초
  feed: 6_000,       // 먹이 6초
  care: 5_000,
  train: 8_000,
  boost: 25_000,
  comm: 20_000,
  supply: 90_000,
  sortie: 60_000,    // 미니게임 1분에 한 번
};
```

> 📌 **규칙**: 이 숫자들을 바꾸면 [`docs/REQUIREMENTS.md`](../docs/REQUIREMENTS.md)의 표도 함께 고쳐야 합니다. 코드와 문서가 어긋나면 다음 사람이 헷갈립니다.

### 잔해 테이블 — 가중치 뽑기의 원리

```ts
const DEBRIS_TABLE: DebrisType[] = [
  { name: "페인트 조각 무리",     kg: [2, 6],     w: 28 },
  { name: "볼트·너트 파편",       kg: [4, 10],    w: 24 },
  { name: "다층단열재(MLI) 조각", kg: [6, 14],    w: 14 },
  { name: "페어링 잔해",          kg: [15, 40],   w: 12, bonus: "speed" },
  { name: "폐기된 큐브샛",        kg: [25, 60],   w: 10, bonus: "pull" },
  { name: "로켓 상단부 연료탱크", kg: [80, 150],  w: 6,  bonus: "prop" },
  { name: "수수께끼의 파편",      kg: [50, 120],  w: 4 },
  { name: "낡은 기상위성",        kg: [200, 400], w: 2,  bonus: "pull" },
];
```

`w`는 **가중치**입니다. 총합이 100이라 이 경우엔 곧 확률(%)이지만, 항목을 추가해도 코드는 알아서 동작합니다.

```ts
const DEBRIS_TOTAL_W = DEBRIS_TABLE.reduce((a, d) => a + d.w, 0);

function pickDebris(): DebrisType {
  let r = Math.random() * DEBRIS_TOTAL_W;   // 0 ~ 총합 사이 난수
  for (const d of DEBRIS_TABLE) {
    r -= d.w;              // 가중치만큼 깎아나가다가
    if (r <= 0) return d;  // 0 이하가 되는 지점이 당첨
  }
  return DEBRIS_TABLE[0];  // 부동소수점 오차 대비 안전망
}
```

**직선 위에 항목별 길이만큼 구간을 그려놓고 다트를 던지는 것**과 같습니다. 게임에서 매우 자주 쓰는 패턴이니 익혀두면 좋습니다.

새 잔해를 추가하고 싶다면 배열에 한 줄 넣기만 하면 됩니다.
```ts
{ name: "부서진 태양전지판", kg: [30, 70], w: 8, bonus: "prop" },
```

## 4.3 핵심 헬퍼 3인방

```ts
// ① 범위 가두기 — 스탯이 0~100을 벗어나지 않게
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ② 로그 남기기 — 최신이 앞으로, 최대 80개 유지
function pushLog(s: GameState, msg: string, kind: LogKind = "info") {
  s.log.unshift({ t: s.lastTick, msg, kind });
  if (s.log.length > 80) s.log.length = 80;   // 배열 자르기 트릭
}

// ③ 수확 배율 — 기분이 좋을수록 많이 먹는다
const yieldMult = (s: GameState) => 0.6 + s.mood / 200;
//  기분 0   → 0.6배
//  기분 100 → 1.1배
```

`s.log.length = 80`은 배열을 80개로 잘라내는 관용구입니다. 로그가 무한히 쌓이면 메모리와 저장 용량이 계속 커지므로 상한을 둡니다.

## 4.4 `tick` — 시간이 흐르는 함수

1초에 한 번 호출됩니다.

```ts
export function tick(prev: GameState, now: number): GameState {
  // ① 새 객체로 복사 (React가 변화를 알아채도록)
  const s: GameState = { ...prev, cd: { ...prev.cd }, log: [...prev.log] };
  s.lastTick = now;

  // ② 단계별 처리
  if (s.phase === "ground" || s.phase === "egg") groundTick(s);

  // ③ 발사 윈도우 도달 → 발사 시작
  if (s.phase === "awaiting" && s.windowAt !== null && now >= s.windowAt) {
    s.phase = "launching";
    s.launchT = now;
    s.launchStep = 0;
  }
  if (s.phase === "launching") launchingTick(s, now);
  if (s.phase === "orbit") orbitTick(s, now);

  return s;   // ④ 새 상태 반환
}
```

**중요한 점:** `s`는 복사본이므로 안에서 마음껏 고쳐도 됩니다. 원본 `prev`는 그대로입니다. 그래서 `groundTick(s)` 같은 함수들은 값을 반환하지 않고 `s`를 직접 수정합니다(복사본이니 안전).

### 확률로 표현한 "천천히 줄어드는" 스탯

```ts
function groundTick(s: GameState) {
  // 에너지는 10초에 1, 기분은 15초에 1씩 감소
  if (Math.random() < 1 / 10) s.energy = clamp(s.energy - 1, 0, 100);
  if (Math.random() < 1 / 15) s.mood = clamp(s.mood - 1, 0, 100);
}
```

매초 1/10 확률로 1을 깎으면 **평균적으로** 10초에 1씩 줄어듭니다. `energy -= 0.1`처럼 소수로 깎지 않는 이유는, 화면에 정수로 보여주기 위해서이고 약간의 불규칙성이 살아있는 느낌을 주기 때문입니다.

### 발사 시퀀스 — 대본 재생

```ts
const LAUNCH_SCRIPT: [number, string, LogKind][] = [
  [0,  "📡 발사 시퀀스 개시 — 라이드셰어 파트너 큐브샛 12기 탑재 확인", "sys"],
  [3,  "연료 주입 완료. T-5초 카운트다운 시작", "sys"],
  [6,  "🚀 리프트오프! 스텔라펫이 하늘을 가른다!", "evo"],
  [9,  "MAX-Q 통과… 페어링 분리", "sys"],
  [12, "2단 엔진 정지. 궤도 투입 기동 중…", "sys"],
];

function launchingTick(s: GameState, now: number) {
  const elapsed = now - (s.launchT ?? now);
  // 아직 출력 안 한 대사 중, 시간이 된 것들을 전부 출력
  while (s.launchStep < LAUNCH_SCRIPT.length && elapsed >= LAUNCH_SCRIPT[s.launchStep][0] * 1000) {
    const [, msg, kind] = LAUNCH_SCRIPT[s.launchStep];
    pushLog(s, msg, kind);
    s.launchStep += 1;
  }
  if (elapsed >= LAUNCH_DURATION_MS) {
    s.phase = "orbit";
    // ⭐ 지상 육성 결과가 궤도 스탯으로 환산되는 지점
    s.speed = 4 + Math.floor(s.training / 10);
    s.pull = 3 + Math.floor(s.weightG / 250);
    s.prop = Math.round(60 + s.mood / 2);
    s.propMax = 100;
    ...
  }
}
```

`while`을 쓴 이유: 브라우저 탭이 백그라운드에 있으면 틱이 밀릴 수 있습니다. 5초가 한 번에 지나가도 **밀린 대사를 모두 출력**하도록 한 것입니다. `if`였다면 대사를 건너뛰었을 것입니다.

**게임 디자인 관점**: 이 환산식이 "지상 육성이 헛되지 않다"는 것을 보장합니다. 훈련을 많이 하면 스피드(조우 확률), 많이 먹이면 당김(수확량), 기분 좋게 보내면 추진제로 이어집니다.

### `orbitTick` — 가장 복잡한 부분

궤도에서 매초 벌어지는 일입니다. 순서가 중요합니다.

```ts
function orbitTick(s: GameState, now: number) {
  // 1) 진행 중인 이벤트가 끝났는지 확인
  if (s.meteorUntil !== 0 && now >= s.meteorUntil) { s.meteorUntil = 0; pushLog(...); }
  if (s.flareUntil !== 0 && now >= s.flareUntil)  { s.flareUntil = 0;  pushLog(...); }
  if (s.offer && now >= s.offer.expiresAt)        { s.offer = null;    pushLog(...); }

  // 2) 새 이벤트 발생 굴림 (유성우와 플레어는 동시에 안 나옴)
  if (now >= s.meteorUntil && now >= s.flareUntil) {
    const r = Math.random();
    if (r < 0.004)      { s.meteorUntil = now + METEOR_MS; ... }  // 0.4%
    else if (r < 0.007) { s.flareUntil = now + FLARE_MS; ... }    // 0.3%
  }
  if (!s.offer && Math.random() < 0.004) { /* 대형 잔해 발견 */ }

  // 3) 잔해 조우
  if (Math.random() < encounterP(s, now)) gainDebris(s, pickDebris());

  // 4) 충돌 위기 (유성우 중엔 2배)
  if (Math.random() < (now < s.meteorUntil ? 0.016 : 0.008)) {
    if (s.prop >= 8) { s.prop -= 8; /* 회피 성공 */ }
    else { /* 기분 -12, 수거물 손실 */ }
  }

  // 5) 기분 서서히 감소 (플레어 중엔 2배)
  if (Math.random() < (now < s.flareUntil ? 2 / 30 : 1 / 30)) s.mood = clamp(s.mood - 1, 0, 100);
}
```

**왜 이 순서인가**: 만료 처리를 먼저 해야 "방금 끝난 이벤트"의 효과가 이번 틱에 잘못 적용되지 않습니다. 그리고 이벤트 발생을 조우보다 먼저 해야, 이번 틱부터 이벤트 효과가 반영됩니다.

`r < 0.004` / `else if (r < 0.007)`처럼 **하나의 난수로 여러 갈래**를 판정하는 것도 흔한 패턴입니다. 유성우 0.4%, 플레어 0.3%(=0.7%−0.4%)가 됩니다.

### 조우 확률 계산

```ts
function encounterP(s: GameState, now: number): number {
  let p = 0.03 + s.speed * 0.004;    // 기본 3% + 스피드 보정
  if (now < s.boostUntil) p *= 4;    // 부스트 중 4배
  if (now < s.meteorUntil) p *= 2.5; // 유성우 중 2.5배
  if (now < s.flareUntil) p *= 0.5;  // 플레어 중 절반
  return Math.min(p, 0.9);           // 상한 90%
}
```

배율을 곱셈으로 쌓는 구조라, 새 버프/디버프를 추가하기 쉽습니다.

### 수확량 계산

```ts
function gainDebris(s: GameState, d: DebrisType) {
  const base = d.kg[0] + Math.random() * (d.kg[1] - d.kg[0]);  // 범위 안 랜덤
  const kg = Math.round(base * (1 + s.pull * 0.08) * yieldMult(s));
  //                            ↑당김 보정        ↑기분 보정
  s.debrisKg += kg;
  s.totalEncounters += 1;
  pushLog(s, `${d.name} 포획! +${kg}kg`, "gain");

  // 보너스 잔해면 35% 확률로 추가 효과
  if (d.bonus && Math.random() < 0.35) {
    if (d.bonus === "speed") { s.speed += 1; ... }
    else if (d.bonus === "pull") { s.pull += 1; ... }
    else { const refill = Math.min(30, s.propMax - s.prop); s.prop += refill; ... }
  }
  checkEvolution(s);   // 수거량이 늘었으니 진화 조건 확인
}
```

이 공식 `기본 × (1 + 당김×0.08) × (0.6 + 기분/200)`은 **게임 전체에서 재사용**됩니다. 미니게임 정산(`sortieYieldKg`)과 부재중 정산도 같은 식을 씁니다. 그래서 어떤 경로로 얻든 공평합니다.

## 4.5 진화와 계열 분기 — 게임의 성장 축

```ts
export const ORBIT_STAGES = [
  { name: "궤도 유영체",     atKg: 0 },
  { name: "데브리스 이터",   atKg: 200 },
  { name: "클리너 노바",     atKg: 1000 },
  { name: "가디언 오브 오빗", atKg: 5000 },
] as const;

export const STAGE_NAMES: Record<Branch, string[]> = {
  balanced: ["궤도 유영체", "데브리스 이터", "클리너 노바",     "가디언 오브 오빗"],
  speed:    ["궤도 유영체", "데브리스 이터", "코멧 체이서",     "델타브이 레이서"],
  pull:     ["궤도 유영체", "데브리스 이터", "그래비티 홀더",   "이벤트 호라이즌"],
};
```

2단계(1,000kg)부터 **스탯 성향에 따라 이름과 성장 방향이 갈립니다.**

```ts
export function buildTendency(s: GameState): Branch {
  if (s.speed > s.pull) return "speed";
  if (s.pull > s.speed) return "pull";
  return "balanced";
}

function checkEvolution(s: GameState) {
  // ① 지금 수거량으로 도달 가능한 최고 단계 찾기 (뒤에서부터 검사)
  let target = s.stage;
  for (let i = ORBIT_STAGES.length - 1; i >= 0; i--) {
    if (s.debrisKg >= ORBIT_STAGES[i].atKg) { target = i; break; }
  }

  if (target > s.stage) {
    // ② 2단계로 처음 올라가는 순간에만 계열 결정 (이후 고정)
    const branching = s.stage < 2 && target >= 2;
    s.stage = target;
    if (branching) s.branch = buildTendency(s);

    // ③ 계열별 성장 보정
    if (s.branch === "speed")      { s.speed += 3; s.pull += 1; }
    else if (s.branch === "pull")  { s.speed += 1; s.pull += 3; }
    else                           { s.speed += 2; s.pull += 2; }

    s.propMax += 20;
    s.prop = s.propMax;   // 진화하면 추진제 가득
    pushLog(s, `✨ 진화! 「${stageName(s)}」 형태가 되었다!`, "evo");
    if (branching) pushLog(s, `스탯 성향이 개화 — ${BRANCH_LABEL[s.branch]} 계열로 분기했다!`, "sys");
  }
}
```

**뒤에서부터 검사하는 이유**: 부재중 정산으로 수거량이 한 번에 크게 뛰면 2단계를 건너뛰고 3단계에 도달할 수 있습니다. 뒤에서부터 찾으면 **도달 가능한 최고 단계**로 한 번에 갑니다.

**`branching` 플래그의 역할**: 계열은 딱 한 번, 2단계 진입 시점의 스탯으로 정해집니다. 이후 스탯이 뒤집혀도 계열은 유지됩니다("한 번 선택한 길").

> 💡 **게임 디자인 포인트**: 계열이 사실상 수집 요소입니다. "내 펫은 이벤트 호라이즌"이라고 자랑할 거리가 생기고, 다시 키울 이유(다른 계열 보기)도 됩니다.

## 4.6 `act` — 유저 입력 처리

```ts
export function act(prev: GameState, action: ActionId, now: number): GameState {
  // ① 쿨다운 확인 — 아직이면 아무것도 안 함
  const readyAt = prev.cd[action] ?? 0;
  if (now < readyAt) return prev;      // ⭐ 원본 그대로 반환

  const s: GameState = { ...prev, cd: { ...prev.cd }, log: [...prev.log] };
  s.lastTick = now;
  const setCd = () => { s.cd[action] = now + (COOLDOWNS[action] ?? 0); };

  switch (action) {
    case "feed": {
      if (s.phase !== "ground" && s.phase !== "awaiting") return prev;  // ② 단계 확인
      s.energy = clamp(s.energy + 25, 0, 100);
      s.weightG += 40;
      setCd();                                                          // ③ 쿨다운 설정
      pushLog(s, `우주식량 냠냠! 체중 +40g (현재 ${s.weightG}g)`, "gain"); // ④ 로그
      return s;
    }
    ...
  }
}
```

### 핵심 패턴: 실패하면 `prev`를 그대로 반환

```ts
if (now < readyAt) return prev;
```

새 객체가 아니라 **원본 그 자체**를 돌려줍니다. React는 "같은 객체"를 보고 리렌더를 건너뜁니다. 즉 **쿨다운 중 버튼을 눌러도 아무 비용이 들지 않습니다.** 작지만 영리한 최적화입니다.

### 액션별 로직 요약

| 액션 | 조건 | 효과 |
| --- | --- | --- |
| `incubate` | egg | 부화 +1, 3회면 ground로 (기분 90) |
| `feed` | ground/awaiting | 에너지 +25, 체중 +40g |
| `care` | ground/awaiting | 기분 +20 |
| `train` | ground/awaiting, 에너지 ≥15 | 에너지 −15, 훈련 +10 |
| `register` | ground + `canLaunch` | awaiting, 다음 윈도우 예약 |
| `boost` | orbit, 추진제 ≥15 | 추진제 −15, 12초간 조우 4배 |
| `comm` | orbit | 기분 +15 |
| `supply` | orbit | 추진제 +40 |
| `sortie` | orbit, 추진제 ≥5 | 추진제 −5, 미니게임 시작 |
| `salvage` | orbit + 유효한 제안 | 추진제 −10, 확률로 대형 잔해 획득 |

### 실패에도 두 종류가 있다

```ts
// ① 조용한 실패 — 로그도 없이 원본 반환 (애초에 불가능한 상황)
if (s.phase !== "orbit") return prev;

// ② 알려주는 실패 — 로그를 남기고 새 상태 반환 (조건 부족)
if (s.prop < 15) {
  pushLog(s, "추진제가 부족하다… (보급 필요)", "warn");
  return s;      // ← 쿨다운은 설정 안 함! 다시 시도 가능
}
```

②에서 `setCd()`를 부르지 않는 게 중요합니다. 실패했는데 쿨다운까지 걸리면 억울하니까요. **이런 배려가 게임 감각을 만듭니다.**

### 견인(salvage) — 확률 판정의 예

```ts
case "salvage": {
  if (s.phase !== "orbit" || !s.offer || now >= s.offer.expiresAt) return prev;
  if (s.prop < SALVAGE_PROP_COST) { pushLog(...); return s; }

  s.prop -= SALVAGE_PROP_COST;
  const offer = s.offer;
  s.offer = null;              // 시도했으면 제안은 사라짐 (성공/실패 무관)

  // 당김이 높을수록 성공률 상승, 최대 95%
  if (Math.random() < Math.min(0.95, 0.45 + s.pull * 0.04)) {
    const kg = Math.round(offer.kg * yieldMult(s));
    s.debrisKg += kg;
    s.mood = clamp(s.mood + 10, 0, 100);
    pushLog(s, `🪝 ${offer.name} 견인 성공! +${kg}kg — 대어다!`, "gain");
    checkEvolution(s);
  } else {
    s.mood = clamp(s.mood - 5, 0, 100);
    pushLog(s, `🪝 견인 실패… ${offer.name}이(가) 튕겨나가 버렸다`, "warn");
  }
  return s;
}
```

성공률에 **상한(95%)** 을 두는 이유: 스탯이 아무리 높아도 긴장감을 남기기 위해서입니다.

## 4.7 `catchUp` — 자리를 비운 동안의 정산

앱을 껐다가 몇 시간 뒤 돌아왔을 때, 그동안의 일을 한 번에 계산합니다.

```ts
export function catchUp(prev: GameState, now: number): GameState {
  const s = { ...prev, cd: { ...prev.cd }, log: [...prev.log] };
  const elapsed = Math.min(now - s.lastTick, OFFLINE_CAP_MS);  // 최대 8시간만 인정
  s.lastTick = now;
  if (elapsed < 60_000) return s;   // 1분 미만은 무시

  if (s.phase === "ground" || s.phase === "egg") {
    // 스탯 감소하되 하한을 둠 — 펫은 죽지 않는다
    s.energy = clamp(s.energy - elapsed / 10_000, 5, 100);
    s.mood = clamp(s.mood - elapsed / 15_000, 10, 100);
  } else if (s.phase === "awaiting" && s.windowAt !== null && now >= s.windowAt) {
    // ⭐ 자느라 발사 윈도우를 놓치는 일은 없다
    s.phase = "orbit";
    s.speed = 4 + Math.floor(s.training / 10);
    ...
  } else if (s.phase === "orbit") {
    // 기댓값으로 한 번에 계산 (7200번 반복 대신 곱셈 한 번)
    const ticks = elapsed / 1000;
    const p = 0.03 + s.speed * 0.004;
    const encounters = Math.floor(ticks * p * (0.8 + Math.random() * 0.4));  // ±20% 변동
    let kg = 0;
    for (let i = 0; i < encounters; i++) { /* 잔해 하나씩 뽑아 합산 */ }
    s.debrisKg += kg;
    ...
    checkEvolution(s);
  }
  return s;
}
```

### 설계 의도 3가지 (게임 디자인 공부용)

1. **8시간 상한** — 한 달 만에 돌아와도 8시간치만. 방치가 지나치게 유리해지지 않게.
2. **하한 있는 감소** — 에너지 5, 기분 10 밑으로는 안 떨어집니다. **펫이 죽는 게임이 아닙니다.** 돌아왔을 때 죄책감 대신 반가움을 주려는 선택입니다.
3. **윈도우 자동 통과** — 5분 발사 윈도우를 자느라 놓치면 화가 납니다. 부재중이어도 발사가 진행됩니다.

## 4.8 `settleSortie` — 미니게임 결과를 본편에 반영

```ts
export function sortieYieldKg(s: GameState, rawKg: number): number {
  return Math.round(rawKg * (1 + s.pull * 0.08) * yieldMult(s));   // 본편과 같은 공식
}

export function settleSortie(prev: GameState, r: SortieOutcome, now: number): GameState {
  const s = { ...prev, cd: { ...prev.cd }, log: [...prev.log] };
  s.lastTick = now;
  const kg = sortieYieldKg(s, r.kg);
  s.debrisKg += kg;
  s.totalEncounters += r.eaten;
  s.mood = clamp(s.mood + 8 - r.hits * 3, 0, 100);   // 재밌었지만 부딪힌 만큼 깎임

  pushLog(s, `🕹 수동 조종 복귀 — ${r.sec}초 비행, 잔해 ${r.eaten}개 직접 수거! (+${kg}kg)`, "gain");

  // 개인 최고 기록
  if (kg > s.sortieBestKg) {
    const hadPrev = s.sortieBestKg > 0;
    s.sortieBestKg = kg;
    if (hadPrev) pushLog(s, `🏆 수동 조종 신기록 경신 — 한 출격에 ${kg}kg!`, "evo");
    //            ↑ 첫 기록일 땐 "신기록!"이라고 호들갑 떨지 않는다
  }

  // 주간 기록 (리더보드용) — 주가 바뀌었으면 리셋
  const wk = weekKey(now);
  if (s.sortieWeek !== wk) { s.sortieWeek = wk; s.sortieWeekBestKg = 0; }
  if (kg > s.sortieWeekBestKg) s.sortieWeekBestKg = kg;

  if (r.hits > 0) pushLog(s, `기체에 긁힘 ${r.hits}회… 다음엔 파편을 조심하자`, "warn");
  checkEvolution(s);
  return s;
}
```

`hadPrev` 체크가 작은 디테일입니다. 첫 판은 무조건 신기록이니 축하 로그가 어색합니다. **이런 세밀함이 완성도를 만듭니다.**

### 주차 키 계산 (`weekKey`)

```ts
export function weekKey(now: number): string {
  const d = new Date(now + 9 * 3600_000);   // KST로 이동
  const day = (d.getUTCDay() + 6) % 7;       // 일=0 → 월=0 으로 변환
  const thu = new Date(d.getTime());
  thu.setUTCDate(d.getUTCDate() - day + 3); // 그 주의 목요일 (ISO 8601 규칙)
  const year = thu.getUTCFullYear();
  const week = Math.ceil(((thu.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;   // "2026-W29"
}
```

ISO 주차는 "그 주의 목요일이 속한 해"를 기준으로 합니다. 연말연시에 주차가 꼬이지 않게 하는 국제 표준입니다. 이 함수는 리더보드의 주간 리셋 기준이 됩니다.

## 4.9 실습: 새 액션 추가하기

"명상" 액션(기분 +30, 에너지 −5, 쿨다운 15초)을 추가해봅시다.

**① 쿨다운 등록** (`engine.ts`)
```ts
export const COOLDOWNS: Record<string, number> = {
  ...
  meditate: 15_000,
};
```

**② 액션 ID에 추가**
```ts
export type ActionId = "incubate" | "feed" | ... | "meditate";
```

**③ `act`의 switch에 케이스 추가**
```ts
case "meditate": {
  if (s.phase !== "ground" && s.phase !== "awaiting") return prev;
  if (s.energy < 5) {
    pushLog(s, "너무 지쳐서 집중할 수 없다…", "warn");
    return s;
  }
  s.energy -= 5;
  s.mood = clamp(s.mood + 30, 0, 100);
  setCd();
  pushLog(s, "🧘 무중력 명상… 마음이 편안해졌다! 기분 +30", "info");
  return s;
}
```

**④ 버튼 추가** (`Game.tsx`의 지상 액션 영역)
```tsx
<ActionButton label="명상" icon="🧘" onClick={() => dispatch("meditate")} remainMs={cd("meditate")} />
```

**⑤ 문서 갱신** — `docs/REQUIREMENTS.md`의 액션 표에 한 줄 추가

**⑥ 검증** — `npm run build` 통과 확인 + 실제로 눌러보기

---

## 정리

- 게임은 **5개 phase**로 나뉘고, 각 phase마다 매초 하는 일과 가능한 액션이 다르다
- `tick`(시간) / `act`(입력) / `catchUp`(부재중) / `settleSortie`(미니게임) — 상태를 바꾸는 함수는 이 4개뿐
- 모두 **복사 → 수정 → 반환** 패턴. 실패 시엔 원본을 그대로 반환해 리렌더를 아낀다
- 수확 공식 `기본 × (1+당김×0.08) × (0.6+기분/200)`은 모든 획득 경로에서 공유된다
- 진화 계열은 2단계 진입 시 한 번만 정해진다
- 밸런스를 바꾸면 **문서도 함께** 고친다

다음: [5장 — 저장과 마이그레이션](05-storage.md)
