"use client";

import { Link } from "@/i18n/navigation";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouteProgress } from "@/components/common/route-progress/RouteProgressProvider";

export default function ProgressIntlLink({ onClick, target, href, ...props }) {
  const { start } = useRouteProgress();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Link
      href={href}
      target={target}
      {...props}
      onClick={(e) => {
        onClick?.(e);

        if (e.defaultPrevented) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (target === "_blank") return;

        const currentUrl =
          pathname +
          (searchParams.toString() ? `?${searchParams.toString()}` : "");

        const nextUrl =
          typeof href === "string"
            ? href
            : href?.pathname
              ? href.pathname +
                (href.query
                  ? `?${new URLSearchParams(href.query).toString()}`
                  : "")
              : "";

        if (nextUrl && nextUrl === currentUrl) return;

        start();
      }}
    />
  );
}