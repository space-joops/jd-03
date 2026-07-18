import type { Metadata, Viewport } from "next";
import "galmuri/dist/galmuri.css";
import "./globals.css";
import SwRegister from "@/components/SwRegister";

export const metadata: Metadata = {
  title: "STELLAPET — 궤도 청소 다마고치",
  description:
    "케슬러 신드롬이 일어난 가까운 미래. 우주 쓰레기를 먹는 스텔라펫을 키워 궤도로 보내자!",
  appleWebApp: {
    capable: true,
    title: "STELLAPET",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#05060f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <div className="scanlines" aria-hidden />
        <SwRegister />
      </body>
    </html>
  );
}
