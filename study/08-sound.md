# 8장 — 소리 만들기 (`sound.ts`)

> **mp3 파일이 하나도 없습니다.** 모든 효과음을 코드로 합성합니다.
> 8비트 게임 사운드의 원리를 배울 수 있는 장입니다.

## 8.1 Web Audio의 기본 개념

브라우저에는 신시사이저가 내장되어 있습니다. 부품을 연결해 소리를 만듭니다.

```
[Oscillator] → [Gain] → [destination]
 파형 생성      음량 조절    스피커
```

```ts
const audio = new AudioContext();
const osc = audio.createOscillator();   // 파형 발생기
const g = audio.createGain();           // 볼륨 조절기

osc.type = "square";        // 파형 종류
osc.frequency.value = 440;  // 주파수(Hz) = 음 높이. 440Hz = '라'
g.gain.value = 0.05;        // 음량 (0~1, 작게!)

osc.connect(g).connect(audio.destination);   // 연결
osc.start();
osc.stop(audio.currentTime + 0.2);           // 0.2초 뒤 정지
```

### 파형별 성격

| 파형 | 소리 | 이 프로젝트에서 |
| --- | --- | --- |
| `sine` | 부드러운 삐— | (미사용) |
| `triangle` | 맑고 순한 | 좋은 일 (진화, 교신) |
| `square` | 8비트 게임기 | 코인, 획득 |
| `sawtooth` | 거칠고 위협적 | 나쁜 일 (피격, 경고) |

**"사운드 문법"**: 음이 올라가면 긍정, 내려가면 부정. 부드러운 파형은 좋은 일, 거친 파형은 나쁜 일. 이 규칙을 지키면 유저가 소리만 듣고도 무슨 일인지 압니다.

## 8.2 만능 함수 `chirp`

이 파일의 모든 소리는 이 함수 하나로 만들어집니다.

```ts
function chirp(
  type: OscillatorType,   // 파형
  from: number,           // 시작 주파수
  to: number,             // 끝 주파수
  dur: number,            // 길이(초)
  gain = 0.06,            // 음량
  delay = 0,              // 시작 지연(초) — 멜로디 만들 때
): void {
  if (!audio || muted) return;
  try {
    const t0 = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const g = audio.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    //   ↑ 주파수를 from에서 to로 지수 곡선으로 미끄러뜨림

    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    //   ↑ 음량도 지수로 감쇠 (자연스러운 여운)

    osc.connect(g).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);   // 감쇠 끝나면 정지 — 노드 누수 방지
  } catch {
    // 실패하면 그냥 무음
  }
}
```

### 왜 지수(exponential) 곡선인가

**사람의 귀는 로그 스케일로 듣습니다.** 음량을 선형으로 줄이면 뚝 끊기는 느낌이고, 지수로 줄여야 자연스럽게 사라집니다. 주파수도 마찬가지입니다(한 옥타브 = 주파수 2배).

> ⚠️ `exponentialRampToValueAtTime`은 **0을 다룰 수 없습니다**(수학적으로 로그 0은 정의 불가). 그래서 `0.0001`처럼 아주 작은 값으로, 주파수는 `Math.max(1, to)`로 방어합니다. 0을 넣으면 에러가 납니다.

### 여러 음을 겹쳐 멜로디 만들기

```ts
/** 진화·대사건: 상승 아르페지오 팡파르 */
function playEvo(): void {
  const notes = [523, 659, 784, 1046, 1318];   // 도 미 솔 도 미
  notes.forEach((f, i) => {
    chirp("triangle", f, f, 0.16, 0.055, i * 0.07);   // 0.07초씩 지연
    chirp("square", f, f, 0.1, 0.02, i * 0.07);       // 살짝 겹쳐 두께 추가
  });
}
```

`delay`를 조금씩 늘려가며 여러 번 부르면 **분산 화음(아르페지오)** 이 됩니다. 두 파형을 겹치면 소리가 두꺼워집니다.

주요 음의 주파수(참고):
```
도(C4) 261 · 레 294 · 미 330 · 파 349 · 솔 392 · 라 440 · 시 494 · 도(C5) 523
```
한 옥타브 올리려면 ×2 하면 됩니다.

## 8.3 로그 기반 자동 사운드 ⭐

이 프로젝트의 영리한 설계입니다. **소리를 재생하는 코드가 게임 로직 안에 없습니다.**

```ts
const LOG_SOUNDS: Record<LogKind, () => void> = {
  gain: playGain,    // 코인
  warn: playWarn,    // 하강 버즈
  evo: playEvo,      // 팡파르
  sys: playSys,      // 무전 비프
  info: playInfo,    // 작은 블립
};

export const LOG_SOUND_PRIORITY: Record<LogKind, number> = {
  evo: 5, gain: 4, warn: 3, sys: 2, info: 1,
};

export function playLogSound(kind: LogKind): void {
  LOG_SOUNDS[kind]();
}
```

그리고 `Game.tsx`에서 **새 로그가 생기면 자동으로** 소리를 냅니다.

```tsx
useEffect(() => {
  ...
  // 이번 렌더에서 새로 추가된 로그들 수집
  const fresh: LogEntry[] = [];
  if (first && first !== prev) {
    for (const e of state.log) {
      if (e === prev) break;    // 이전에 본 로그를 만나면 중단
      fresh.push(e);
    }
  }

  // 우선순위가 가장 높은 것 하나만 재생
  let best: LogKind | null = null;
  for (const e of fresh) {
    if (!best || LOG_SOUND_PRIORITY[e.kind] > LOG_SOUND_PRIORITY[best]) best = e.kind;
  }
  if (best) playLogSound(best);
}, [state, showSharePrompt]);
```

**얻는 것:**
- 새 기능을 만들 때 `pushLog`만 부르면 **소리가 공짜로 따라옵니다**
- 한 틱에 여러 사건이 겹쳐도 **가장 중요한 것 하나만** 울려 소리가 뭉개지지 않습니다
- 게임 규칙(engine.ts)이 오디오를 몰라도 됩니다 — 관심사 분리

**`prev === undefined` 체크**의 의미: 앱을 처음 켰을 때 저장된 로그 80개가 한꺼번에 "새 로그"로 보입니다. 그러면 부팅하자마자 소리 폭탄이 터집니다. 첫 렌더는 소리 없이 넘어가게 막아둡니다.

## 8.4 브라우저 자동재생 정책 — 가장 흔한 함정

> **브라우저는 사용자가 클릭/터치하기 전에는 소리를 못 내게 막습니다.**
> (광고가 갑자기 소리를 내는 걸 막기 위한 정책)

그래서 AudioContext는 **반드시 사용자 제스처 안에서** 만들거나 깨워야 합니다.

```ts
export function ensureAudio(): void {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext!)();
    if (audio.state === "suspended") void audio.resume();   // 잠들었으면 깨우기
  } catch {
    audio = null;   // 미지원 환경 — 이후 모든 재생이 조용히 무시됨
  }
}
```

이 프로젝트는 **모든 버튼 핸들러에서** `ensureAudio()`를 부릅니다.

```tsx
const dispatch = useCallback((a: ActionId) => {
  ensureAudio();   // 클릭 제스처 안에서 오디오 활성화 보장
  setState((s) => (s ? act(s, a, Date.now()) : s));
}, []);
```

추가로 iOS Safari를 위한 보험도 있습니다.

```ts
export function initAudioListener(): void {
  const unlock = () => {
    if (audioUnlocked) return;
    ensureAudio();
    // 더미 무음 오실레이터를 재생해 오디오 락을 확실히 해제
    const osc = audio.createOscillator();
    const g = audio.createGain();
    g.gain.value = 0;              // 음량 0 = 안 들림
    osc.connect(g).connect(audio.destination);
    osc.start(0);
    osc.stop(audio.currentTime + 0.05);
    audioUnlocked = true;
  };
  window.addEventListener("touchstart", unlock, { once: true, capture: true });
  window.addEventListener("touchend", unlock, { once: true, capture: true });
  window.addEventListener("click", unlock, { once: true, capture: true });
}
```

iOS는 "실제로 소리를 재생한 적이 있는" 컨텍스트만 신뢰합니다. 그래서 무음 소리를 한 번 재생해 락을 풉니다. `{ once: true }`로 한 번만 실행되게 합니다.

> 💡 **"소리가 안 나요"** 문의의 90%는 이것입니다. 화면을 한 번 터치한 뒤에 소리가 나기 시작하는 게 정상입니다.

## 8.5 지속음 — 추진 엔진 소리

효과음은 짧게 울리고 끝나지만, 엔진음은 **분사하는 동안 계속** 나야 합니다.

```ts
let thrustNode: OscillatorNode | null = null;
let thrustGain: GainNode | null = null;

export function updateThrustSound(level: number): void {
  if (!audio) return;
  try {
    if (!thrustNode || !thrustGain) {
      if (level === 0) return;          // 아직 필요 없음
      thrustGain = audio.createGain();
      thrustGain.gain.value = 0;
      thrustGain.connect(audio.destination);
      thrustNode = audio.createOscillator();
      thrustNode.type = "square";
      thrustNode.frequency.value = 50;  // 낮게 부릉거리는 베이스
      thrustNode.connect(thrustGain);
      thrustNode.start();               // ⭐ 한 번 켜면 계속 켜둔다
    }
    const on = level > 0 && !muted;
    // setTargetAtTime: 목표값으로 부드럽게 이동 (뚝뚝 끊기지 않게)
    thrustGain.gain.setTargetAtTime(on ? 0.012 + level * 0.012, audio.currentTime, 0.1);
    thrustNode.frequency.setTargetAtTime(40 + level * 20, audio.currentTime, 0.1);
  } catch {}
}
```

**핵심 아이디어:** 오실레이터를 껐다 켜는 게 아니라 **계속 켜두고 음량만 0↔소리로 조절**합니다. 매번 새로 만들면 "틱틱" 잡음이 생기고 노드가 쌓입니다.

`setTargetAtTime(목표, 시각, 시상수)`은 값을 부드럽게 수렴시킵니다. 분사 단계가 바뀔 때 음이 매끄럽게 변합니다.

미니게임에서 매 프레임 호출합니다.
```tsx
updateThrustSound(thrusting ? thrustLevel + 1 : 0);
```

**끄는 것도 잊지 말아야 합니다.** 게임이 끝나거나 컴포넌트가 사라질 때:
```tsx
const finish = () => {
  updateThrustSound(0);   // 엔진음 정지
  playSortieEnd();
  ...
};
return () => {
  updateThrustSound(0);   // 언마운트 시에도
  ...
};
```
안 그러면 게임을 나가도 엔진 소리가 계속 웅웅거립니다.

## 8.6 음소거 기능

```ts
const MUTE_KEY = "stellapet-muted";
let muted = false;

export function initSound(): void {
  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch {}
}

export function setMuted(m: boolean): void {
  muted = m;
  if (muted) updateThrustSound(0);   // 지속음도 즉시 끄기
  try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch {}
}
```

`chirp` 첫 줄에서 `if (!audio || muted) return;`으로 걸러지므로, 음소거하면 아무 소리도 나지 않습니다. 설정은 localStorage에 저장되어 다음에 와도 유지됩니다.

## 8.7 효과음 목록

| 함수 | 소리 | 언제 |
| --- | --- | --- |
| `playGain` | 코인 (B5→E6) | gain 로그 |
| `playWarn` | 하강 버즈 | warn 로그 |
| `playEvo` | 상승 팡파르 | evo 로그 (진화 등) |
| `playSys` | 무전 비프 | sys 로그 |
| `playInfo` | 작은 블립 | info 로그 |
| `playTap` | 짧은 탭 | 로그 없는 UI 버튼 |
| `playLaunch` | 저주파 럼블 | 발사 시퀀스 진입 |
| `playEat` | 코인 | 미니게임 먹기 |
| `playHit` | 곤두박질 | 미니게임 피격 |
| `playFuelUp` | 파워업 아르페지오 | 연료 셀 획득 |
| `playFuelEmpty` | 시동 꺼짐 | 연료 소진 |
| `playSortieStart/End` | 휘리릭 / 징글 | 미니게임 시작·종료 |
| `updateThrustSound` | 엔진 루프 | 분사 중 (지속음) |

## 8.8 실습: 새 효과음 만들기

"보급 캡슐 도킹" 전용 소리를 추가해봅시다.

```ts
// sound.ts
/** 도킹 성공: 금속성 '척-컹' */
export function playDock(): void {
  chirp("square", 300, 200, 0.08, 0.05);        // 첫 접촉
  chirp("triangle", 150, 120, 0.25, 0.06, 0.08); // 묵직한 결합
}
```

호출은 `Game.tsx`의 보급 버튼 핸들러나, 더 깔끔하게는 로그 메시지를 감지해서 붙일 수 있습니다.

**소리 만들기 팁**
- 음량(`gain`)은 0.03~0.09가 적당합니다. 0.3은 귀가 아픕니다
- 짧게(0.05~0.3초). 길면 다른 소리와 겹쳐 지저분해집니다
- 올라가면 좋은 일, 내려가면 나쁜 일
- 두 파형을 겹치면 풍성해집니다

---

## 정리

- 오디오 파일 없이 **오실레이터 → 게인 → 스피커**로 모든 소리를 합성한다
- `chirp` 하나로 모든 효과음을 만든다. 지수 곡선이 자연스러운 이유는 귀가 로그로 듣기 때문
- **로그 kind → 효과음 자동 매핑**이라 `pushLog`만 하면 소리가 따라온다
- 브라우저 자동재생 정책 때문에 **첫 클릭 전엔 소리가 안 난다** (정상)
- 지속음은 껐다 켜지 말고 **음량을 0↔값으로** 조절하고, 끝날 때 반드시 0으로

다음: [9장 — UI와 반응형 레이아웃](09-ui-layout.md)
