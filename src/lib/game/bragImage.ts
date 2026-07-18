// ============================================================================
// bragImage.ts — 자랑 카드 이미지 생성 + 공유
//
// 오프스크린 캔버스에 1080×1080 픽셀 아트 카드를 그려 PNG로 뽑는다.
// 카드 2종: 상태 카드(renderBragCard) / 수동 조종 스코어 카드(renderSortieCard).
// 서버 없이 순수 클라이언트로 동작하며, 공유는 3단 폴백:
//   Web Share(파일) → 클립보드(이미지) → 다운로드
// ============================================================================

import type { Branch, GameState } from "./types";
import { bragCard, SORTIE_MS, stageName } from "./engine";
import { BABY, EGG, ORBIT_SPRITES, drawSprite, spriteH, spriteW, type Sprite } from "./sprites";

const SIZE = 1080;

/** 계열별 프레임 색 — 트레이딩 카드처럼 계열이 한눈에 보이게 */
const FRAME_COLORS: Record<Branch, string> = {
  balanced: "#7ee8a2",
  speed: "#7dd3fc",
  pull: "#c4b5fd",
};

/** 누적 kg → 실감 나는 비유 (바이럴 카피의 핵심) */
export function kgAnalogy(kg: number): string {
  if (kg >= 1000) return `경차 ${(kg / 1000).toFixed(1)}대`;
  if (kg >= 500) return `대형 통신위성 ${Math.floor(kg / 500)}기`;
  if (kg >= 100) return `냉장고 ${Math.floor(kg / 100)}대`;
  if (kg >= 15) return `자전거 ${Math.floor(kg / 15)}대`;
  return `볼트 ${Math.max(1, Math.round(kg * 10))}개`;
}

/** 같은 펫이면 같은 별하늘이 나오게 — 시드 고정 난수 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cardSprite(s: GameState): Sprite {
  if (s.phase === "egg") return EGG;
  if (s.phase === "orbit") return ORBIT_SPRITES[Math.min(s.stage, ORBIT_SPRITES.length - 1)];
  return BABY;
}

function cardStageLabel(s: GameState): string {
  if (s.phase === "egg") return "스텔라 알";
  if (s.phase === "orbit") return stageName(s);
  return "아기 스텔라펫";
}

interface Card {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  frame: string;
  rand: () => number;
  /** 중앙 정렬 텍스트 헬퍼 */
  text: (str: string, y: number, size: number, color: string, weight?: number) => void;
}

/** 캔버스 준비 + 배경·별하늘·프레임·헤더까지 공통 크롬을 그린다 */
async function makeCard(s: GameState, subtitle: string): Promise<Card> {
  // 픽셀 폰트가 로드된 뒤에 그린다 — 실패해도 시스템 폰트로 진행
  try {
    await Promise.all([
      document.fonts.load('700 72px "Galmuri11"'),
      document.fonts.load('400 32px "Galmuri11"'),
    ]);
  } catch {
    // 폰트 로드 실패는 무시
  }

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.imageSmoothingEnabled = false;

  const frame = s.phase === "orbit" ? FRAME_COLORS[s.branch] : FRAME_COLORS.balanced;
  const rand = mulberry32(s.createdAt || 1);
  const text: Card["text"] = (str, y, size, color, weight = 700) => {
    ctx.font = `${weight} ${size}px "Galmuri11", "Galmuri9", sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(str, SIZE / 2, y);
  };

  // 배경: 우주 + 시드 고정 별하늘
  ctx.fillStyle = "#05060f";
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 70; i++) {
    const bright = rand() < 0.2;
    ctx.fillStyle = bright ? "#c7cde6" : "#3a4468";
    const d = bright ? 6 : 4;
    ctx.fillRect(Math.floor(rand() * SIZE), Math.floor(rand() * SIZE), d, d);
  }

  // 계열 색 프레임 (이중 테두리)
  ctx.fillStyle = frame;
  ctx.fillRect(20, 20, SIZE - 40, 10);
  ctx.fillRect(20, SIZE - 30, SIZE - 40, 10);
  ctx.fillRect(20, 20, 10, SIZE - 40);
  ctx.fillRect(SIZE - 30, 20, 10, SIZE - 40);
  ctx.fillStyle = "#1c2440";
  ctx.fillRect(38, 38, SIZE - 76, 3);
  ctx.fillRect(38, SIZE - 41, SIZE - 76, 3);
  ctx.fillRect(38, 38, 3, SIZE - 76);
  ctx.fillRect(SIZE - 41, 38, 3, SIZE - 76);

  // 헤더
  text("STELLAPET", 136, 72, "#7ee8a2");
  text(subtitle, 184, 28, "#8b93b5", 400);

  return { canvas, ctx, frame, rand, text };
}

/** 궤도 링 + 잔해 점 + 대형 도트 펫 + 이름·형태 (공통 중앙부) */
function drawPetBlock(card: Card, s: GameState) {
  const { ctx, frame, rand, text } = card;
  const cx = SIZE / 2;
  const cy = 440;
  ctx.fillStyle = "#2a3350";
  for (let deg = 0; deg < 360; deg += 7) {
    const a = (deg * Math.PI) / 180;
    ctx.fillRect(Math.round(cx + 340 * Math.cos(a)) - 3, Math.round(cy + 140 * Math.sin(a)) - 3, 6, 6);
  }
  ctx.fillStyle = "#8b93b5";
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    ctx.fillRect(Math.round(cx + 340 * Math.cos(a)) - 5, Math.round(cy + 140 * Math.sin(a)) - 5, 10, 10);
  }

  const sprite = cardSprite(s);
  const sc = Math.min(Math.floor(360 / spriteW(sprite)), Math.floor(300 / spriteH(sprite)));
  const sw = spriteW(sprite) * sc;
  const sh = spriteH(sprite) * sc;
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = frame;
  ctx.fillRect(cx - sw / 2 - 30, cy - sh / 2 - 30, sw + 60, sh + 60);
  ctx.globalAlpha = 1;
  drawSprite(ctx, sprite, Math.round(cx - sw / 2), Math.round(cy - sh / 2), sc);

  text(s.name, 668, 58, "#e8ecff");
  text(`「 ${cardStageLabel(s)} 」`, 724, 40, frame);
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

/** 도전장 URL — /c 라우트가 동적 OG 미리보기를 제공한다. s/b로 현재 캐릭터(단계·계열)를 실어 미리보기에 반영 */
export function challengeUrl(s: GameState): string {
  return `${window.location.origin}/c?kg=${s.sortieBestKg}&n=${encodeURIComponent(s.name)}&s=${s.stage}&b=${s.branch}`;
}

/** 카드 우상단에 QR 코드 — 스크린샷 경유 유입까지 커버. 실패해도 카드는 발행 */
async function drawQr(card: Card, url: string): Promise<void> {
  try {
    const QRCode = (await import("qrcode")).default;
    const qr = document.createElement("canvas");
    await QRCode.toCanvas(qr, url, {
      width: 150,
      margin: 2,
      color: { dark: "#05060f", light: "#e8ecff" },
    });
    const x = SIZE - 41 - 150;
    card.ctx.imageSmoothingEnabled = false;
    card.ctx.drawImage(qr, x, 55, 150, 150);
    card.ctx.font = '400 18px "Galmuri11", "Galmuri9", sans-serif';
    card.ctx.fillStyle = "#8b93b5";
    card.ctx.textAlign = "center";
    card.ctx.fillText("SCAN TO PLAY", x + 75, 226);
  } catch {
    // QR 생성 실패는 무시
  }
}

/** 상태 자랑 카드 (phase별 변형) */
export async function renderBragCard(s: GameState): Promise<Blob> {
  const days = Math.max(1, Math.ceil((s.lastTick - s.createdAt) / 86_400_000));
  const card = await makeCard(s, `MISSION REPORT — DAY ${days}`);
  const { text } = card;
  await drawQr(card, window.location.origin);
  drawPetBlock(card, s);

  if (s.phase === "orbit") {
    text("누적 수거량", 790, 28, "#8b93b5", 400);
    text(`${s.debrisKg.toLocaleString()}kg`, 862, 84, "#7ee8a2");
    text(`잔해 ${s.totalEncounters}개 · 스피드 ${s.speed} · 당김 ${s.pull}`, 912, 30, "#c7cde6", 400);
    text(`지구 저궤도가 ${kgAnalogy(s.debrisKg)} 분량만큼 깨끗해졌습니다`, 962, 32, "#f4b860", 400);
  } else if (s.phase === "egg") {
    text("부화 진행", 790, 28, "#8b93b5", 400);
    text(`${s.hatch} / 3`, 862, 84, "#f4b860");
    text("따뜻하게 품는 중…", 912, 30, "#c7cde6", 400);
    text("곧 우주 청소부가 태어납니다", 962, 32, "#f4b860", 400);
  } else {
    text("현재 체중", 790, 28, "#8b93b5", 400);
    text(`${s.weightG.toLocaleString()}g`, 862, 84, "#7ee8a2");
    text(`훈련 ${s.training} · 에너지 ${Math.round(s.energy)} · 기분 ${Math.round(s.mood)}`, 912, 30, "#c7cde6", 400);
    text("발사 자격을 향해 무럭무럭 크는 중입니다", 962, 32, "#f4b860", 400);
  }

  text("#스텔라펫  #케슬러신드롬청소반", 1022, 28, "#7dd3fc", 400);
  return toBlob(card.canvas);
}

/** 수동 조종 신기록 스코어 카드 — 도전을 유도하는 카피 */
export async function renderSortieCard(
  s: GameState,
  r: { eaten: number; hits: number },
): Promise<Blob> {
  const sec = Math.round(SORTIE_MS / 1000);
  const card = await makeCard(s, "MANUAL SORTIE — NEW RECORD");
  const { text } = card;
  await drawQr(card, challengeUrl(s)); // QR로 접속하면 바로 도전 출격
  drawPetBlock(card, s);

  text(`${sec}초 수동 조종 수거량`, 790, 28, "#8b93b5", 400);
  text(`${s.sortieBestKg.toLocaleString()}kg`, 862, 84, "#f4b860");
  text(`잔해 ${r.eaten}개 · 피격 ${r.hits}회`, 912, 30, "#c7cde6", 400);
  text("이 기록, 깰 수 있으면 깨 보시죠", 962, 32, "#7dd3fc", 400);

  text("#스텔라펫  #수동조종챌린지", 1022, 28, "#7dd3fc", 400);
  return toBlob(card.canvas);
}

/** 공유 3단 폴백: Web Share → 클립보드 → 다운로드. 어떤 경로였는지 반환 */
async function shareBlob(
  blob: Blob,
  filename: string,
  shareText: string,
): Promise<"shared" | "copied" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/png" });

  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: shareText });
      return "shared";
    } catch (e) {
      // 사용자가 공유 시트를 닫은 경우 — 폴백을 강제하지 않는다
      if (e instanceof Error && e.name === "AbortError") return "shared";
      // 그 외 실패는 아래 폴백으로
    }
  }

  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return "copied";
  } catch {
    // 클립보드 미지원 — 다운로드로
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3_000);
  return "downloaded";
}

export async function shareBragImage(
  s: GameState,
): Promise<"shared" | "copied" | "downloaded"> {
  const blob = await renderBragCard(s);
  return shareBlob(blob, `stellapet-${s.name}.png`, `${bragCard(s)}\n${window.location.origin}`);
}

export async function shareSortieImage(
  s: GameState,
  r: { eaten: number; hits: number },
): Promise<"shared" | "copied" | "downloaded"> {
  const blob = await renderSortieCard(s, r);
  const sec = Math.round(SORTIE_MS / 1000);
  return shareBlob(
    blob,
    `stellapet-sortie-${s.name}.png`,
    `🕹 STELLAPET 수동 조종 신기록 — ${sec}초에 ${s.sortieBestKg.toLocaleString()}kg 수거! 이 기록 깰 수 있어?\n${challengeUrl(s)}\n#스텔라펫 #수동조종챌린지`,
  );
}
