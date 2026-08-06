"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouteProgress } from "./RouteProgressProvider";

export default function ProgressLink({
  onClick,
  target,
  href,
  ...props
}) {
  const { start } = useRouteProgress();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleClick = (event) => {
    onClick?.(event);

    if (event.defaultPrevented) return;

    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (target === "_blank") return;

    const currentQuery = searchParams.toString();

    const currentUrl =
      pathname + (currentQuery ? `?${currentQuery}` : "");

    const nextUrl =
      typeof href === "string"
        ? href
        : href?.pathname
          ? href.pathname +
            (href.query
              ? `?${new URLSearchParams(href.query).toString()}`
              : "")
          : "";

    // 同じURLやページ内リンクでは開始しない
    if (!nextUrl || nextUrl === currentUrl || nextUrl.startsWith("#")) {
      return;
    }

    start();
  };

  return (
    <Link
      href={href}
      target={target}
      {...props}
      onClick={handleClick}
    />
  );
}