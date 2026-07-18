"use client";

import { useEffect, useRef } from "react";
import type { GameState } from "@/lib/game/types";
import { LAUNCH_DURATION_MS } from "@/lib/game/engine";
import { EGG, BABY, ORBIT_SPRITES, ROCKET, drawSprite, spriteW, spriteH } from "@/lib/game/sprites";

const W = 240;
const H = 200;

/** 시드 고정 난수 — 별 배치가 매 렌더마다 흔들리지 않게 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260718);
const STARS = Array.from({ length: 46 }, () => ({
  x: Math.floor(rand() * W),
  y: Math.floor(rand() * H),
  tw: rand() * Math.PI * 2,
  big: rand() < 0.18,
}));
const DEBRIS = Array.from({ length: 10 }, (_, i) => ({
  a0: rand() * Math.PI * 2,
  spd: 0.00006 + rand() * 0.00008,
  rr: 0.86 + rand() * 0.3,
  ph: i,
}));

const EARTH_CX = 120;
const EARTH_CY = 106;
const EARTH_R = 28;
const ORBIT_RX = 94;
const ORBIT_RY = 62;
/** 한 바퀴 도는 데 걸리는 시간 */
const ORBIT_PERIOD = 24_000;

/** 육지 픽셀 패치 (지구 중심 기준 오프셋) */
const LAND: [number, number, number, number][] = [
  [-16, -12, 10, 6],
  [-4, -18, 8, 5],
  [4, -2, 12, 7],
  [-12, 4, 7, 5],
  [-2, 12, 9, 5],
  [12, 8, 6, 4],
];

function drawStars(ctx: CanvasRenderingContext2D, t: number, scrollY = 0) {
  for (const s of STARS) {
    const a = 0.4 + 0.6 * Math.abs(Math.sin(t / 900 + s.tw));
    ctx.fillStyle = `rgba(220,230,255,${a.toFixed(2)})`;
    const y = (s.y + scrollY) % H;
    ctx.fillRect(s.x, y, s.big ? 2 : 1, s.big ? 2 : 1);
  }
}

function drawEarth(ctx: CanvasRenderingContext2D) {
  // 대기권 글로우
  ctx.fillStyle = "#14304f";
  fillCircle(ctx, EARTH_CX, EARTH_CY, EARTH_R + 2);
  // 바다
  ctx.fillStyle = "#2b6cb0";
  fillCircle(ctx, EARTH_CX, EARTH_CY, EARTH_R);
  // 육지
  ctx.fillStyle = "#48a860";
  for (const [dx, dy, w, h] of LAND) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = dx + x;
        const py = dy + y;
        if (px * px + py * py < (EARTH_R - 2) * (EARTH_R - 2)) {
          ctx.fillRect(EARTH_CX + px, EARTH_CY + py, 1, 1);
        }
      }
    }
  }
  // 명암 (오른쪽 아래 그림자)
  ctx.fillStyle = "rgba(4,8,20,0.45)";
  for (let y = -EARTH_R; y <= EARTH_R; y++) {
    for (let x = 0; x <= EARTH_R; x++) {
      if (x * x + y * y <= EARTH_R * EARTH_R && x + y * 0.6 > EARTH_R * 0.55) {
        ctx.fillRect(EARTH_CX + x, EARTH_CY + y, 1, 1);
      }
    }
  }
}

function fillCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    ctx.fillRect(cx - half, cy + y, half * 2 + 1, 1);
  }
}

function drawGround(ctx: CanvasRenderingContext2D, s: GameState, t: number) {
  drawStars(ctx, t);
  // 바닥
  ctx.fillStyle = "#0d1226";
  ctx.fillRect(0, 168, W, H - 168);
  ctx.fillStyle = "#1c2440";
  ctx.fillRect(0, 168, W, 2);
  // 배양 시설 창문 너머 지구 살짝
  ctx.fillStyle = "#14304f";
  ctx.fillRect(190, 30, 34, 24);
  ctx.fillStyle = "#2b6cb0";
  ctx.fillRect(193, 33, 28, 18);
  ctx.fillStyle = "#48a860";
  ctx.fillRect(198, 38, 8, 5);
  ctx.fillStyle = "#1c2440";
  ctx.strokeStyle = "#1c2440";
  ctx.fillRect(206, 30, 2, 24);

  const sprite = s.phase === "egg" ? EGG : BABY;
  const scale = 4;
  const sw = spriteW(sprite) * scale;
  const sh = spriteH(sprite) * scale;
  const bob = Math.round(Math.sin(t / 320) * 3);
  const px = Math.round(W / 2 - sw / 2) - (s.phase === "awaiting" ? 40 : 0);
  const py = 168 - sh + (s.phase === "egg" ? 0 : bob);

  // 그림자
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(px + 6, 166, sw - 12, 3);
  drawSprite(ctx, sprite, px, py, scale);

  // 발사 대기: 옆에 로켓과 발사탑
  if (s.phase === "awaiting") {
    const rScale = 4;
    const rx = 158;
    const ry = 168 - spriteH(ROCKET) * rScale;
    ctx.fillStyle = "#3a4468";
    ctx.fillRect(rx + spriteW(ROCKET) * rScale + 4, ry - 8, 4, 168 - ry + 8);
    drawSprite(ctx, ROCKET, rx, ry, rScale);
    if (s.windowAt !== null) {
      const remain = Math.max(0, s.windowAt - t);
      const mm = String(Math.floor(remain / 60_000)).padStart(2, "0");
      const ss = String(Math.floor((remain % 60_000) / 1000)).padStart(2, "0");
      ctx.fillStyle = "#f4b860";
      ctx.font = "10px monospace";
      ctx.fillText(`T-${mm}:${ss}`, rx - 8, ry - 14);
    }
  }
}

function drawLaunching(ctx: CanvasRenderingContext2D, s: GameState, t: number) {
  const elapsed = t - (s.launchT ?? t);
  const prog = Math.min(1, elapsed / LAUNCH_DURATION_MS);
  drawStars(ctx, t, Math.floor(elapsed / 18));

  const scale = 5;
  const sw = spriteW(ROCKET) * scale;
  const sh = spriteH(ROCKET) * scale;
  // 하단에서 중앙까지 상승 후 유지
  const baseY = H - 20 - sh;
  const targetY = 56;
  const y = Math.round(baseY - (baseY - targetY) * Math.min(1, prog * 1.6));
  const shake = prog < 1 ? Math.round(Math.sin(t / 30) * 1.5) : 0;
  const x = Math.round(W / 2 - sw / 2) + shake;

  drawSprite(ctx, ROCKET, x, y, scale);
  // 불꽃
  const flameH = 14 + Math.floor(Math.random() * 10);
  ctx.fillStyle = "#f4b860";
  ctx.fillRect(x + sw / 2 - 5, y + sh - 4, 10, flameH);
  ctx.fillStyle = "#ef6f6f";
  ctx.fillRect(x + sw / 2 - 8, y + sh - 4, 3, flameH * 0.6);
  ctx.fillRect(x + sw / 2 + 5, y + sh - 4, 3, flameH * 0.6);
  ctx.fillStyle = "#fff8e7";
  ctx.fillRect(x + sw / 2 - 2, y + sh - 4, 4, flameH * 0.7);
}

function drawOrbit(ctx: CanvasRenderingContext2D, s: GameState, t: number) {
  drawStars(ctx, t);
  drawEarth(ctx);

  // 궤도 경로 (점선)
  ctx.fillStyle = "#2a3350";
  for (let deg = 0; deg < 360; deg += 9) {
    const a = (deg * Math.PI) / 180;
    ctx.fillRect(
      Math.round(EARTH_CX + ORBIT_RX * Math.cos(a)),
      Math.round(EARTH_CY + ORBIT_RY * Math.sin(a)),
      1,
      1,
    );
  }

  const theta = ((t % ORBIT_PERIOD) / ORBIT_PERIOD) * Math.PI * 2;

  // 떠다니는 잔해
  for (const d of DEBRIS) {
    const a = d.a0 + t * d.spd;
    const dx = EARTH_CX + ORBIT_RX * d.rr * Math.cos(a);
    const dy = EARTH_CY + ORBIT_RY * d.rr * Math.sin(a);
    const flick = Math.sin(t / 400 + d.ph) > -0.3;
    ctx.fillStyle = flick ? "#8b93b5" : "#5a6284";
    ctx.fillRect(Math.round(dx), Math.round(dy), 2, 2);
  }

  // 내 펫
  const sprite = ORBIT_SPRITES[Math.min(s.stage, ORBIT_SPRITES.length - 1)];
  const scale = 2;
  const sw = spriteW(sprite) * scale;
  const sh = spriteH(sprite) * scale;
  const px = EARTH_CX + ORBIT_RX * Math.cos(theta);
  const py = EARTH_CY + ORBIT_RY * Math.sin(theta);

  // 부스트 화염 꼬리
  if (t < s.boostUntil) {
    ctx.fillStyle = "#f4b860";
    for (let i = 1; i <= 5; i++) {
      const ta = theta - i * 0.09;
      ctx.fillRect(
        Math.round(EARTH_CX + ORBIT_RX * Math.cos(ta)),
        Math.round(EARTH_CY + ORBIT_RY * Math.sin(ta)),
        3 - Math.floor(i / 2),
        3 - Math.floor(i / 2),
      );
    }
  }

  drawSprite(ctx, sprite, Math.round(px - sw / 2), Math.round(py - sh / 2), scale);

  // 잔해와 가까우면 반짝 이펙트 (연출용)
  for (const d of DEBRIS) {
    const a = d.a0 + t * d.spd;
    const dx = EARTH_CX + ORBIT_RX * d.rr * Math.cos(a);
    const dy = EARTH_CY + ORBIT_RY * d.rr * Math.sin(a);
    const dist = Math.hypot(dx - px, dy - py);
    if (dist < 14) {
      ctx.fillStyle = "#ffe08a";
      ctx.fillRect(Math.round((dx + px) / 2), Math.round((dy + py) / 2) - 2, 2, 2);
      ctx.fillRect(Math.round((dx + px) / 2) - 3, Math.round((dy + py) / 2) + 1, 2, 2);
    }
  }
}

export default function PixelView({ state }: { state: GameState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const canvas = canvasRef.current;
      const s = stateRef.current;
      if (canvas && s) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const t = Date.now();
          ctx.fillStyle = "#05060f";
          ctx.fillRect(0, 0, W, H);
          if (s.phase === "orbit") drawOrbit(ctx, s, t);
          else if (s.phase === "launching") drawLaunching(ctx, s, t);
          else drawGround(ctx, s, t);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="w-full"
      style={{ imageRendering: "pixelated", aspectRatio: `${W}/${H}` }}
    />
  );
}
