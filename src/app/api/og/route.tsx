// ============================================================================
// /api/og — 도전장 링크 미리보기 이미지 (1200×630)
//
// 카톡·X 등에 /c 링크를 보내면 크롤러가 이 이미지를 미리보기로 띄운다.
// next/og(Satori)는 outline 글리프만 지원하므로 Galmuri Bold TTF를 로드한다.
// Node 런타임 사용 — 한글 전체 글리프 폰트(2.6MB)는 엣지 한도를 넘는다.
// ============================================================================

import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { STAGE_NAMES } from "@/lib/game/engine";
import { ORBIT_SPRITES, type Sprite } from "@/lib/game/sprites";
import type { Branch } from "@/lib/game/types";

/** 계열별 강조색 — 클라이언트 카드의 프레임 색과 동일 */
const BRANCH_COLORS: Record<Branch, string> = {
  balanced: "#7ee8a2",
  speed: "#7dd3fc",
  pull: "#c4b5fd",
};

let fontCache: Buffer | null = null;
async function loadFont(): Promise<Buffer> {
  if (!fontCache) {
    fontCache = await readFile(
      join(process.cwd(), "node_modules", "galmuri", "dist", "Galmuri11-Bold.ttf"),
    );
  }
  return fontCache;
}

/** 스프라이트를 div 그리드로 렌더 — Satori에는 캔버스가 없다 */
function SpriteBox({ sprite, cell }: { sprite: Sprite; cell: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {sprite.rows.map((row, y) => (
        <div key={y} style={{ display: "flex" }}>
          {[...row].map((ch, x) => (
            <div
              key={x}
              style={{
                width: cell,
                height: cell,
                backgroundColor: sprite.palette[ch] ?? "transparent",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const STAR_POS: [number, number][] = [
  [90, 80], [220, 180], [400, 60], [660, 140], [900, 70], [1100, 190],
  [150, 420], [520, 520], [1050, 480], [780, 560], [300, 560], [1130, 330],
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const kg = Math.min(999_999, Math.max(0, Math.round(Number(searchParams.get("kg")) || 0)));
  const name = (searchParams.get("n") || "누군가").slice(0, 10);
  const hasRecord = kg > 0;
  // 도전자의 현재 캐릭터 — 스프라이트·형태명·계열색이 미리보기에 그대로 반영된다
  const stage = Math.min(3, Math.max(0, Math.round(Number(searchParams.get("s") ?? 1) || 0)));
  const rawBranch = searchParams.get("b");
  const branch: Branch = rawBranch === "speed" || rawBranch === "pull" ? rawBranch : "balanced";
  const stageLabel = STAGE_NAMES[branch][stage];
  const branchColor = BRANCH_COLORS[branch];

  const font = await loadFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#05060f",
          border: "10px solid #f4b860",
          position: "relative",
          fontFamily: "Galmuri",
        }}
      >
        {STAR_POS.map(([x, y], i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: i % 3 === 0 ? 8 : 5,
              height: i % 3 === 0 ? 8 : 5,
              backgroundColor: i % 4 === 0 ? "#c7cde6" : "#3a4468",
            }}
          />
        ))}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            paddingLeft: 80,
            paddingRight: 20,
          }}
        >
          <div style={{ display: "flex", fontSize: 34, color: "#7ee8a2" }}>
            🛰 STELLAPET — 궤도 청소 다마고치
          </div>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 46, marginTop: 34 }}>
            {hasRecord ? (
              <>
                <span style={{ color: "#e8ecff" }}>{name}</span>
                <span style={{ color: branchColor, fontSize: 38, marginLeft: 18 }}>
                  「{stageLabel}」
                </span>
              </>
            ) : (
              <span style={{ color: "#e8ecff" }}>우주 쓰레기를 먹는 스텔라펫</span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              // 자릿수가 커져도 한 줄 유지 (텍스트 영역 폭 ~740px)
              fontSize: kg >= 10_000 ? 54 : kg >= 1_000 ? 62 : 72,
              color: "#f4b860",
              marginTop: 14,
            }}
          >
            {hasRecord ? `한 출격에 ${kg.toLocaleString()}kg 수거!` : "궤도 청소 대결에 초대!"}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#8b93b5", marginTop: 30 }}>
            이 기록, 깰 수 있으면 깨 보시죠 — 가입 없이 바로 도전
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#7dd3fc", marginTop: 22 }}>
            #스텔라펫 #수동조종챌린지 #케슬러신드롬청소반
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 360,
          }}
        >
          <SpriteBox sprite={ORBIT_SPRITES[Math.min(stage, ORBIT_SPRITES.length - 1)]} cell={17} />
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Galmuri", data: font, weight: 700, style: "normal" }],
      headers: {
        // 같은 쿼리는 같은 이미지 — CDN에 하루 캐시
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    },
  );
}
