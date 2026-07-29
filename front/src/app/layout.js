import "./globals.css";
import { Suspense } from "react";
import { mochiy, kosugi } from "@/app/fonts";
import { GoogleTagManager } from "@next/third-parties/google";
import { RouteProgressProvider } from "@/components/common/route-progress/RouteProgressProvider";
import RouteProgressBar from "@/components/common/route-progress/RouteProgressBar";

const themeInitScript = `
(function () {
  try {
    var savedTheme = window.localStorage.getItem("theme");
    var systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";

    var theme =
      savedTheme === "light" || savedTheme === "dark"
        ? savedTheme
        : systemTheme;

    var root = document.documentElement;

    root.setAttribute("data-theme", theme);
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    root.style.colorScheme = theme;
  } catch (error) {
    var root = document.documentElement;

    root.setAttribute("data-theme", "light");
    root.classList.remove("dark");
    root.classList.add("light");
    root.style.colorScheme = "light";
  }
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html: themeInitScript,
          }}
        />
      </head>

      <body className={`antialiased ${kosugi.className} ${mochiy.variable}`}>
        <Suspense fallback={null}>
          <RouteProgressProvider>
            <RouteProgressBar />
            {children}
          </RouteProgressProvider>
        </Suspense>

        {process.env.NODE_ENV === "production" && (
          <GoogleTagManager gtmId="GTM-K29NKBTR" />
        )}
      </body>
    </html>
  );
}
