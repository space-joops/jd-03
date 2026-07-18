// ============================================================================
// /c — 도전장 공유 랜딩 라우트
//
// 카톡·X 크롤러는 여기의 동적 메타(개인화 og:image)를 읽어 미리보기를 만들고,
// 사람은 그대로 게임(Game)으로 들어간다. 쿼리 파싱·데모 출격은 Game이 담당하며
// 파싱 후 주소는 "/"로 정리된다.
// ============================================================================

import type { Metadata } from "next";
import Game from "@/components/Game";

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const p = await searchParams;
  const kg = Math.min(999_999, Math.max(0, Math.round(Number(p.kg) || 0)));
  const name = String(p.n ?? "누군가").slice(0, 10);
  // 도전자의 현재 캐릭터(진화 단계·계열) — 미리보기 이미지에 반영된다
  const stage = Math.min(3, Math.max(0, Math.round(Number(p.s ?? 1) || 0)));
  const branch = p.b === "speed" || p.b === "pull" ? p.b : "balanced";
  const title =
    kg > 0 ? `${name}의 스텔라펫 — 30초에 ${kg.toLocaleString()}kg 수거!` : "STELLAPET 도전장";
  const description = "이 기록, 깰 수 있으면 깨 보시죠. 가입 없이 바로 도전 출격!";
  const og = `/api/og?kg=${kg}&n=${encodeURIComponent(name)}&s=${stage}&b=${branch}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: og, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description, images: [og] },
  };
}

export default function ChallengePage() {
  return <Game />;
}
