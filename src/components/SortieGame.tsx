"use client";

// ============================================================================
// SortieGame — 궤도 수동 조종 미니게임 (jd-02 게임 로직 참조)
//
// 모드: 연료 서바이벌 — 시간 제한 없음. 연료는 자동 회복되지 않으며,
// 연료가 바닥나면 관성 유예(driftGrace) 동안 표류하다 종료된다.
// 유예 중 연료 셀을 먹으면 재점화. 위험물 피격은 연료를 깎는다.
//
// 난이도 조절: SORTIE_DIFFICULTY — 코드 기본값을 NEXT_PUBLIC_SORTIE_* 환경
// 변수가 배포 설정에서 오버라이드한다 (빌드 타임 인라인, 재배포로 반영).
//
// 원칙 (jd-02에서 가져옴):
// - 초당 60번 변하는 상태는 전부 useEffect 클로저 지역 변수. React는 모른다.
// - update(dt)는 상태만 바꾸고 draw()는 읽기만 한다. dt 상한으로 터널링 방지.
// - 획득 판정은 보이는 것보다 후하게, 피격 판정은 짜게. 자석으로 슬쩍 돕는다.
// ============================================================================

import { useEffect, useRef } from "react";
import type { GameState } from "@/lib/game/types";
import type { SortieOutcome } from "@/lib/game/engine";
import { ORBIT_SPRITES, drawSprite, spriteW, spriteH } from "@/lib/game/sprites";
import {
  ensureAudio,
  playEat,
  playFuelEmpty,
  playFuelUp,
  playHit,
  playSortieEnd,
  playSortieStart,
  updateThrustSound,
} from "@/lib/game/sound";

/** 기준 논리 해상도 — 픽셀 스케일 계산의 바탕 */
const BASE_W = 240;
const BASE_H = 200;
const HUD_H = 18;

const envNum = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/**
 * 난이도 조절 변수 — 배포 설정(Vercel 환경변수)으로 코드 수정 없이 조절한다.
 * 값이 없거나 잘못되면 코드 기본값으로 폴백. (환경변수는 빌드 타임 인라인)
 */
export const SORTIE_DIFFICULTY = {
  /** 시작(최대) 연료 */
  startFuel: envNum(process.env.NEXT_PUBLIC_SORTIE_START_FUEL, 100),
  /** 분사 1/2/3단 연료 소모(/s) */
  thrustCosts: [
    envNum(process.env.NEXT_PUBLIC_SORTIE_COST_1, 2),
    envNum(process.env.NEXT_PUBLIC_SORTIE_COST_2, 6),
    envNum(process.env.NEXT_PUBLIC_SORTIE_COST_3, 14),
  ],
  /** 연료 셀 등장 가중치 (chip 46 · bolt 26 · tank 10 · 위험물과 상대비) */
  fuelItemWeight: envNum(process.env.NEXT_PUBLIC_SORTIE_FUEL_WEIGHT, 12),
  /** 연료 셀 리필량 */
  fuelItemRefill: envNum(process.env.NEXT_PUBLIC_SORTIE_FUEL_REFILL, 25),
  /** 위험물 등장 가중치 */
  hazardWeight: envNum(process.env.NEXT_PUBLIC_SORTIE_HAZARD_WEIGHT, 18),
  /** 위험물 피격 시 연료 손실 */
  hazardFuelDamage: envNum(process.env.NEXT_PUBLIC_SORTIE_HAZARD_DAMAGE, 15),
  /** 스폰 간격 기준(초) — ±30% 지터 */
  spawnBase: envNum(process.env.NEXT_PUBLIC_SORTIE_SPAWN_BASE, 0.45),
  /** 연료 0 이후 관성 표류 유예(초) — 이 안에 연료 셀을 먹으면 재점화 */
  driftGrace: envNum(process.env.NEXT_PUBLIC_SORTIE_DRIFT_GRACE, 4),
};

/** 손맛 튜닝 상수 — 난이도가 아닌 조작감은 여기서 */
const TUNE = {
  joyMax: 36, // 스틱 최대 반경(px)
  joyDead: 4, // 데드존
  levelAt: [12, 24], // 분사 단계 경계: <12px 1단, <24px 2단, 이상 3단
  thrustAccel: [90, 220, 400], // 단계별 가속(px/s²)
  friction: 1.2, // 우주 관성 — 천천히 잦아드는 감쇠
  minSpeed: 30, // 한 번 움직이면 유지되는 최소 표류 속도
  bounce: 0.8, // 벽 반동 계수

  eatBonus: 5, // 획득 판정 여유(px)
  hitShrink: 0.75, // 피격 판정은 펫 반지름을 이만큼 줄여서
  eatAnim: 0.16, // "꿀꺽" 연출 시간
  magnetPull: 55, // 자석 끌어당김 속도(px/s)
  invincible: 1.2, // 피격 후 무적
  blinkHz: 8,
  shakeTime: 0.3,
  shakeAmp: 4,
  grace: 2, // 시작 직후 위험물 미출현(초)
  maxDt: 0.05,
  minScale: 1.5, // 픽셀 확대 하한
};

const THRUST_COLORS = ["#7dd3fc", "#f4b860", "#ff6b6b"];

type Kind = "chip" | "bolt" | "tank" | "shard" | "cell";

interface Junk {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  kg: number;
  rot: number;
  rotSpeed: number;
  /** -1이면 평소, 0 이상이면 꿀꺽 경과 시간 */
  eatT: number;
}

interface Popup {
  text: string;
  x: number;
  y: number;
  age: number;
  color: string;
}

const KIND_STAT: Record<Kind, { size: number; kg: [number, number]; speed: [number, number] }> = {
  chip: { size: 3, kg: [2, 4], speed: [45, 80] },
  bolt: { size: 5, kg: [5, 9], speed: [40, 68] },
  tank: { size: 9, kg: [15, 25], speed: [30, 45] },
  shard: { size: 6, kg: [0, 0], speed: [65, 110] },
  cell: { size: 5, kg: [0, 0], speed: [40, 60] },
};

function buildKindTable(): { kind: Kind; w: number }[] {
  return [
    { kind: "chip", w: 46 },
    { kind: "bolt", w: 26 },
    { kind: "shard", w: SORTIE_DIFFICULTY.hazardWeight },
    { kind: "tank", w: 10 },
    { kind: "cell", w: SORTIE_DIFFICULTY.fuelItemWeight },
  ];
}

function pickKind(allowShard: boolean): Kind {
  const table = buildKindTable().filter((k) => allowShard || k.kind !== "shard");
  const totalW = table.reduce((a, k) => a + k.w, 0);
  let r = Math.random() * totalW;
  for (const k of table) {
    r -= k.w;
    if (r <= 0) return k.kind;
  }
  return "chip";
}

/** 사방 가장자리 중 한 곳에서, 화면 안쪽을 향해(±0.7rad 스프레드) 진입한다 */
function makeJunk(kind: Kind, w: number, h: number): Junk {
  const stat = KIND_STAT[kind];
  const speed = stat.speed[0] + Math.random() * (stat.speed[1] - stat.speed[0]);
  const edge = Math.floor(Math.random() * 4);
  let x: number;
  let y: number;
  let baseAng: number;
  if (edge === 0) {
    x = Math.random() * w;
    y = -16;
    baseAng = Math.PI / 2;
  } else if (edge === 1) {
    x = w + 16;
    y = HUD_H + 10 + Math.random() * Math.max(1, h - HUD_H - 20);
    baseAng = Math.PI;
  } else if (edge === 2) {
    x = Math.random() * w;
    y = h + 16;
    baseAng = -Math.PI / 2;
  } else {
    x = -16;
    y = HUD_H + 10 + Math.random() * Math.max(1, h - HUD_H - 20);
    baseAng = 0;
  }
  const ang = baseAng + (Math.random() * 2 - 1) * 0.7;
  return {
    kind,
    x,
    y,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    size: stat.size,
    kg: stat.kg[0] + Math.random() * (stat.kg[1] - stat.kg[0]),
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() * 2 - 1) * 2,
    eatT: -1,
  };
}

function drawJunk(ctx: CanvasRenderingContext2D, j: Junk, scale: number) {
  ctx.save();
  ctx.translate(Math.round(j.x), Math.round(j.y));
  ctx.rotate(j.rot);
  ctx.scale(scale, scale);
  switch (j.kind) {
    case "chip":
      ctx.fillStyle = "#8b93b5";
      ctx.fillRect(-3, -3, 6, 6);
      ctx.fillStyle = "#c7cde6";
      ctx.fillRect(-1, -3, 2, 2);
      break;
    case "bolt":
      ctx.fillStyle = "#cfd8e6";
      ctx.fillRect(-2, -5, 4, 10);
      ctx.fillRect(-5, -2, 10, 4);
      ctx.fillStyle = "#05060f";
      ctx.fillRect(-1, -1, 2, 2);
      break;
    case "tank":
      ctx.fillStyle = "#7dd3fc";
      ctx.fillRect(-8, -5, 16, 10);
      ctx.fillStyle = "#1d5d8a";
      ctx.fillRect(-8, -1, 16, 3);
      ctx.fillStyle = "#c7cde6";
      ctx.fillRect(6, -3, 3, 6);
      break;
    case "shard":
      ctx.fillStyle = "#ff6b6b";
      ctx.fillRect(-1, -6, 2, 12);
      ctx.fillRect(-6, -1, 12, 2);
      ctx.fillRect(-3, -3, 6, 6);
      ctx.fillStyle = "#05060f";
      ctx.fillRect(-1, -1, 2, 2);
      break;
    case "cell":
      // 연료 셀 — 네온 배터리
      ctx.fillStyle = "#66fcf1";
      ctx.fillRect(-3, -5, 6, 10);
      ctx.fillRect(-1, -6, 2, 1);
      ctx.fillStyle = "#05060f";
      ctx.fillRect(-2, -2, 4, 2);
      ctx.fillStyle = "#0b3b38";
      ctx.fillRect(-3, 3, 6, 2);
      break;
  }
  ctx.restore();
}

const EAT_WORDS = ["냠!", "꿀꺽!", "맛있다!", "좋아!"];

/** 별 배치는 화면 크기와 무관한 상대 좌표로 들고 있는다 */
const STARS = Array.from({ length: 42 }, () => ({
  fx: Math.random(),
  fy: Math.random(),
  tw: Math.random() * Math.PI * 2,
}));

export default function SortieGame({
  state,
  onEnd,
}: {
  state: GameState;
  onEnd: (r: SortieOutcome) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  // 마운트 시점 스탯만 쓴다 — 게임 중 본편 상태 변화에 흔들리지 않게
  const initialRef = useRef(state);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const DIFF = SORTIE_DIFFICULTY;
    const init = initialRef.current;
    const sprite = ORBIT_SPRITES[Math.min(init.stage, ORBIT_SPRITES.length - 1)];
    const scale = 2;
    const petR = (spriteW(sprite) * scale) / 2 - 2;
    // 본편 스탯이 조종감에 스며든다: 스피드 → 추진 가속, 당김 → 자석 범위
    const accelMul = 1 + Math.min(0.5, init.speed * 0.01);
    const magnetRange = 12 + Math.min(28, init.pull * 0.5);

    // ---- 화면 맞춤: 논리 해상도를 뷰포트 비율로 동적 결정 (jd-02 fitCanvas) ----
    let w = BASE_W;
    let h = BASE_H;
    const fit = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pxScale = Math.max(TUNE.minScale, Math.min(vw / BASE_W, vh / BASE_H));
      w = Math.round(vw / pxScale);
      h = Math.round(vh / pxScale);
      canvas.width = w;
      canvas.height = h;
    };
    fit();

    // ---- 게임 상태 (전부 클로저 지역 변수) ----
    const pet = { x: w / 2, y: h / 2 };
    let vx = 0;
    let vy = 0;
    let joyActive = false;
    let joyOx = 0;
    let joyOy = 0;
    let joyCx = 0;
    let joyCy = 0;
    let thrustLevel = 0;
    let thrusting = false;
    let fuel: number = DIFF.startFuel;
    /** 연료 소진 시각(elapsed 기준). null이면 정상 비행 중 */
    let emptyAt: number | null = null;

    let elapsed = 0;
    let spawnTimer = 0.3;
    let invincible = 0;
    let shake = 0;
    let kgCollected = 0;
    let eaten = 0;
    let hits = 0;
    const junks: Junk[] = [];
    const popups: Popup[] = [];
    let done = false;
    /** HUD 안 [RETURN] 버튼의 탭 판정 영역 (논리 px, y는 HUD 전 높이) */
    const returnRect = { x: 0, w: 0 };

    // 조종 버튼 클릭 제스처 직후라 오디오가 살아 있다 — 출격 휘리릭
    ensureAudio();
    playSortieStart();

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      updateThrustSound(0);
      playSortieEnd();
      onEndRef.current({ kg: Math.round(kgCollected), eaten, hits, sec: Math.round(elapsed) });
    };

    const eat = (j: Junk) => {
      j.eatT = 0;
      kgCollected += j.kg;
      eaten += 1;
      popups.push({
        text:
          Math.random() < 0.5
            ? `+${Math.round(j.kg)}kg`
            : EAT_WORDS[Math.floor(Math.random() * EAT_WORDS.length)],
        x: j.x,
        y: j.y - 8,
        age: 0,
        color: "#7ee8a2",
      });
      playEat();
    };

    const pickupFuel = (j: Junk) => {
      j.eatT = 0;
      const revived = emptyAt !== null;
      fuel = Math.min(DIFF.startFuel, fuel + DIFF.fuelItemRefill);
      emptyAt = null;
      popups.push({
        text: revived ? "재점화!" : `FUEL +${Math.round(DIFF.fuelItemRefill)}`,
        x: j.x,
        y: j.y - 8,
        age: 0,
        color: "#66fcf1",
      });
      playFuelUp();
    };

    const hit = (j: Junk) => {
      hits += 1;
      invincible = TUNE.invincible;
      shake = TUNE.shakeTime;
      fuel = Math.max(0, fuel - DIFF.hazardFuelDamage);
      popups.push({
        text: `아야! 연료 -${Math.round(DIFF.hazardFuelDamage)}`,
        x: pet.x,
        y: pet.y - petR - 8,
        age: 0,
        color: "#ff6b6b",
      });
      junks.splice(junks.indexOf(j), 1);
      playHit();
    };

    // ---- update: 상태만 바꾼다 ----
    const update = (dt: number) => {
      elapsed += dt;
      if (invincible > 0) invincible -= dt;
      if (shake > 0) shake -= dt;

      // 연료 소진 → 관성 유예 → 종료 (유예 중 연료 셀을 먹으면 부활)
      if (fuel <= 0 && emptyAt === null) {
        emptyAt = elapsed;
        playFuelEmpty();
      }
      if (emptyAt !== null && elapsed - emptyAt >= DIFF.driftGrace) {
        finish();
        return;
      }

      // 스폰 — 일정 리듬이 외워지지 않게 ±30% 지터
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        junks.push(makeJunk(pickKind(elapsed > TUNE.grace), w, h));
        spawnTimer = DIFF.spawnBase * (0.7 + Math.random() * 0.6);
      }

      // --- 조그셔틀 추진: 드래그 방향으로 가속, 거리로 3단 분사 (자동 회복 없음) ---
      thrusting = false;
      if (joyActive && fuel > 0) {
        const dx = joyCx - joyOx;
        const dy = joyCy - joyOy;
        const dist = Math.hypot(dx, dy);
        if (dist > TUNE.joyDead) {
          thrustLevel = dist < TUNE.levelAt[0] ? 0 : dist < TUNE.levelAt[1] ? 1 : 2;
          const cost = DIFF.thrustCosts[thrustLevel] * dt;
          if (fuel >= cost) {
            fuel -= cost;
            const acc = TUNE.thrustAccel[thrustLevel] * accelMul;
            vx += (dx / dist) * acc * dt;
            vy += (dy / dist) * acc * dt;
            thrusting = true;
          } else {
            fuel = 0;
          }
        }
      }
      updateThrustSound(thrusting ? thrustLevel + 1 : 0);

      // --- 우주 관성: 마찰 감쇠 + 최소 표류 속도 유지 ---
      vx -= vx * TUNE.friction * dt;
      vy -= vy * TUNE.friction * dt;
      const sp = Math.hypot(vx, vy);
      if (sp > 0 && sp < TUNE.minSpeed) {
        vx = (vx / sp) * TUNE.minSpeed;
        vy = (vy / sp) * TUNE.minSpeed;
      }
      pet.x += vx * dt;
      pet.y += vy * dt;

      // --- 벽 반동 ---
      if (pet.x < petR) {
        pet.x = petR;
        vx *= -TUNE.bounce;
      }
      if (pet.x > w - petR) {
        pet.x = w - petR;
        vx *= -TUNE.bounce;
      }
      if (pet.y < HUD_H + petR) {
        pet.y = HUD_H + petR;
        vy *= -TUNE.bounce;
      }
      if (pet.y > h - petR) {
        pet.y = h - petR;
        vy *= -TUNE.bounce;
      }

      // 잔해: 역순 순회 + splice
      for (let i = junks.length - 1; i >= 0; i--) {
        const j = junks[i];

        if (j.eatT >= 0) {
          j.eatT += dt;
          const suck = Math.min(1, dt * 18);
          j.x += (pet.x - j.x) * suck;
          j.y += (pet.y - j.y) * suck;
          j.rot += 25 * dt;
          if (j.eatT >= TUNE.eatAnim) junks.splice(i, 1);
          continue;
        }

        j.x += j.vx * dt;
        j.y += j.vy * dt;
        j.rot += j.rotSpeed * dt;

        // 자석: 위험물 빼고 전부 슬쩍 끌려온다
        if (j.kind !== "shard") {
          const dx = pet.x - j.x;
          const dy = pet.y - j.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 1 && dist < petR + magnetRange) {
            const pull = (TUNE.magnetPull * dt) / dist;
            j.x += dx * pull;
            j.y += dy * pull;
          }
        }

        const dist = Math.hypot(pet.x - j.x, pet.y - j.y);
        if (j.kind === "shard") {
          if (invincible <= 0 && dist < petR * TUNE.hitShrink + j.size) {
            hit(j);
            continue;
          }
        } else if (dist < petR + j.size + TUNE.eatBonus) {
          if (j.kind === "cell") pickupFuel(j);
          else eat(j);
        }

        if (j.x < -28 || j.x > w + 28 || j.y < -28 || j.y > h + 28) junks.splice(i, 1);
      }

      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.age += dt;
        p.y -= 16 * dt;
        if (p.age > 0.8) popups.splice(i, 1);
      }
    };

    // ---- draw: 읽기만 한다 ----
    const draw = () => {
      ctx.fillStyle = "#05060f";
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      if (shake > 0) {
        const power = (shake / TUNE.shakeTime) * TUNE.shakeAmp;
        ctx.translate((Math.random() * 2 - 1) * power, (Math.random() * 2 - 1) * power);
      }

      for (const s of STARS) {
        const a = 0.3 + 0.5 * Math.abs(Math.sin(elapsed * 1.5 + s.tw));
        ctx.fillStyle = `rgba(220,230,255,${a.toFixed(2)})`;
        const x = (((s.fx * w - pet.x * 0.15) % w) + w) % w;
        const y = (((s.fy * h - pet.y * 0.15) % h) + h) % h;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }

      for (const j of junks) {
        const sc = j.eatT >= 0 ? Math.max(0, 1 - j.eatT / TUNE.eatAnim) : 1;
        drawJunk(ctx, j, sc);
      }

      if (thrusting) {
        const ang = Math.atan2(joyCy - joyOy, joyCx - joyOx);
        ctx.fillStyle = THRUST_COLORS[thrustLevel];
        const flicker = Math.random() > 0.4 ? 0 : 2;
        for (let i = 1; i <= thrustLevel + 2; i++) {
          const fx = pet.x - Math.cos(ang) * (petR + flicker + i * 4);
          const fy = pet.y - Math.sin(ang) * (petR + flicker + i * 4);
          const fs = Math.max(1, 4 - i);
          ctx.fillRect(Math.round(fx - fs / 2), Math.round(fy - fs / 2), fs, fs);
        }
      }

      const blinking = invincible > 0 && Math.floor(elapsed * TUNE.blinkHz * 2) % 2 === 1;
      if (!blinking) {
        drawSprite(
          ctx,
          sprite,
          Math.round(pet.x - (spriteW(sprite) * scale) / 2),
          Math.round(pet.y - (spriteH(sprite) * scale) / 2),
          scale,
        );
      }

      ctx.font = "9px monospace";
      for (const p of popups) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - p.age / 0.8);
        ctx.fillText(p.text, Math.round(p.x - 10), Math.round(p.y));
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // 조그셔틀 (흔들림 밖)
      if (joyActive) {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(joyOx, joyOy, TUNE.joyMax, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = fuel > 0 ? THRUST_COLORS[thrustLevel] : "#5a6284";
        ctx.beginPath();
        ctx.arc(joyCx, joyCy, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // HUD (흔들림 밖) — 상단 바는 연료 게이지
      ctx.fillStyle = "rgba(5,6,15,0.85)";
      ctx.fillRect(0, 0, w, HUD_H);
      ctx.fillStyle = "#1c2440";
      ctx.fillRect(0, HUD_H - 1, w, 1);
      const fuelFrac = Math.max(0, fuel / DIFF.startFuel);
      ctx.fillStyle = fuelFrac > 0.25 ? "#66fcf1" : "#ff6b6b";
      ctx.fillRect(0, 0, Math.round(w * fuelFrac), 3);
      ctx.font = "10px monospace";
      ctx.fillStyle = "#7dd3fc";
      ctx.fillText(`T+${String(Math.floor(elapsed)).padStart(2, "0")}s`, 5, 14);
      // [RETURN] 버튼 — kg 표시와 같은 스타일로 우측에 나란히, 탭하면 복귀
      const retText = "[RETURN]";
      const retW = ctx.measureText(retText).width;
      const retX = w - 6 - retW;
      ctx.fillStyle = "#f4b860";
      ctx.fillText(retText, retX, 14);
      returnRect.x = retX - 6;
      returnRect.w = retW + 12;
      ctx.fillStyle = "#7ee8a2";
      const kgText = `${Math.round(kgCollected)}kg (${eaten})`;
      ctx.fillText(kgText, retX - 10 - ctx.measureText(kgText).width, 14);
      if (hits > 0) {
        ctx.fillStyle = "#ff6b6b";
        ctx.fillText(`×${hits}`, 64, 14);
      }
      // 연료 소진: 표류 카운트다운 (깜빡임)
      if (emptyAt !== null && Math.floor(elapsed * 4) % 2 === 0) {
        const remain = Math.max(0, Math.ceil(DIFF.driftGrace - (elapsed - emptyAt)));
        ctx.fillStyle = "#ff6b6b";
        const msg = `⚠ 연료 소진 — 표류 ${remain}s`;
        ctx.fillText(msg, Math.round(w / 2 - ctx.measureText(msg).width / 2), HUD_H + 14);
      }
    };

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(TUNE.maxDt, (now - last) / 1000);
      last = now;
      update(dt);
      if (done) return;
      draw();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // ---- 입력: 누른 지점이 조그셔틀 원점 ----
    const toLocal = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * w,
        y: ((e.clientY - rect.top) / rect.height) * h,
      };
    };
    const onDown = (e: PointerEvent) => {
      const p = toLocal(e);
      // HUD의 [RETURN] 버튼 탭 — 조그셔틀을 시작하지 않고 복귀
      if (p.y <= HUD_H + 4 && p.x >= returnRect.x && p.x <= returnRect.x + returnRect.w) {
        finish();
        return;
      }
      joyOx = p.x;
      joyOy = p.y;
      joyCx = p.x;
      joyCy = p.y;
      joyActive = true;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!joyActive) return;
      const p = toLocal(e);
      const dx = p.x - joyOx;
      const dy = p.y - joyOy;
      const dist = Math.hypot(dx, dy);
      if (dist > TUNE.joyMax) {
        joyCx = joyOx + (dx / dist) * TUNE.joyMax;
        joyCy = joyOy + (dy / dist) * TUNE.joyMax;
      } else {
        joyCx = p.x;
        joyCy = p.y;
      }
    };
    const onUp = () => {
      joyActive = false;
    };
    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("resize", fit);

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      updateThrustSound(0);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-[#05060f]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ imageRendering: "pixelated" }}
        aria-label="수동 조종 미니게임 화면"
      />
    </div>
  );
}
