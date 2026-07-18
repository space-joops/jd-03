"use client";

import { useEffect } from "react";

/** 프로덕션에서만 서비스 워커를 등록한다 (개발 중 캐시 오염 방지) */
export default function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    // package.json version을 쿼리로 전달 — 버전 업 배포 시 새 워커로 교체되어
    // 이전 세대 캐시가 자동 정리된다
    const v = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(v)}`).catch(() => {
      // 등록 실패는 게임 진행을 막지 않는다
    });
  }, []);
  return null;
}
