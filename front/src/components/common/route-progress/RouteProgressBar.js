"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouteProgress } from "./RouteProgressProvider";

export default function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { visible, progress, done } = useRouteProgress();

  const routeKey = `${pathname}?${searchParams.toString()}`;
  const previousRouteKeyRef = useRef(routeKey);

  useEffect(() => {
    const previousRouteKey = previousRouteKeyRef.current;

    previousRouteKeyRef.current = routeKey;

    if (!visible) return;
    if (previousRouteKey === routeKey) return;

    // 遷移先の描画後、少し待ってから完了させる
    const timer = setTimeout(() => {
      done();
    }, 150);

    return () => clearTimeout(timer);
  }, [routeKey, visible, done]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "3px",
        zIndex: 99999,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: `${progress}%`,
          height: "100%",
          background:
            "linear-gradient(90deg, #3b82f6, #60a5fa, #93c5fd)",
          transition: "width 180ms ease",
          boxShadow: "0 0 8px rgba(59, 130, 246, 0.5)",
        }}
      />
    </div>
  );
}