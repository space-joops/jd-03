import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "STELLAPET — 궤도 청소 다마고치",
    short_name: "STELLAPET",
    description:
      "케슬러 신드롬이 일어난 가까운 미래. 우주 쓰레기를 먹는 스텔라펫을 키워 궤도로 보내자!",
    id: "/",
    start_url: "/",
    display: "standalone",
    display_override: ["fullscreen", "standalone"],
    // 가로 회전 허용 — 레이아웃이 orientation 미디어쿼리로 2컬럼 전환된다
    orientation: "any",
    background_color: "#05060f",
    theme_color: "#05060f",
    categories: ["games", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
