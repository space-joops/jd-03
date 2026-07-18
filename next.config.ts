import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  // /api/og가 런타임에 읽는 한글 픽셀 폰트를 서버 번들에 포함시킨다
  outputFileTracingIncludes: {
    "/api/og": ["./node_modules/galmuri/dist/Galmuri11-Bold.ttf"],
  },
};

export default nextConfig;
