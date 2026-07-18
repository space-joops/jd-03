"use client";

import { useEffect } from "react";

/** 프로덕션에서만 서비스 워커를 등록한다 (개발 중 캐시 오염 방지) */
export default function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 등록 실패는 게임 진행을 막지 않는다
    });
  }, []);
  return null;
}
