"use client";

import ProgressIntlLink from "@/components/common/ProgressIntlLink";
import ProgressLink from "@/components/common/ProgressLink";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FaXTwitter } from "react-icons/fa6";
import { FiMoon, FiSun } from "react-icons/fi";

import { useAuth } from "@/hooks/auth";
import { mochiy } from "@/app/fonts";
import { isAdminPath } from "@/lib/adminPaths";

import styles from "./Header.module.css";

function HeaderNavLink({
  href,
  localized = true,
  onClick,
  className,
  children,
  ...props
}) {
  if (localized) {
    return (
      <ProgressIntlLink
        href={href}
        onClick={onClick}
        className={className}
        {...props}
      >
        {children}
      </ProgressIntlLink>
    );
  }

  return (
    <ProgressLink
      href={href}
      onClick={onClick}
      className={className}
      {...props}
    >
      {children}
    </ProgressLink>
  );
}

function LanguageSwitcher({ onNavigate }) {
  const pathname = usePathname();

  const currentLocale = pathname.startsWith("/en") ? "en" : "ja";

  const normalizedPathname =
    pathname.replace(/^\/(ja|en)(?=\/|$)/, "") || "/";

  const getItemClassName = (active) =>
    [
      styles.languageItem,
      active ? styles.languageItemActive : "",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <div
      className={styles.languageSwitcher}
      aria-label="Language switcher"
    >
      <ProgressIntlLink
        href={normalizedPathname}
        locale="ja"
        onClick={onNavigate}
        className={getItemClassName(currentLocale === "ja")}
      >
        JA
      </ProgressIntlLink>

      <ProgressIntlLink
        href={normalizedPathname}
        locale="en"
        onClick={onNavigate}
        className={getItemClassName(currentLocale === "en")}
      >
        EN
      </ProgressIntlLink>
    </div>
  );
}

function ThemeSwitcher() {
  const [theme, setTheme] = useState("light");
  const [mounted, setMounted] = useState(false);

  function applyTheme(nextTheme) {
    const root = document.documentElement;

    root.dataset.theme = nextTheme;
    root.classList.toggle("dark", nextTheme === "dark");
    root.classList.toggle("light", nextTheme === "light");
    root.style.colorScheme = nextTheme;

    window.localStorage.setItem("theme", nextTheme);
    setTheme(nextTheme);
  }

  useEffect(() => {
    const root = document.documentElement;
    const storedTheme = window.localStorage.getItem("theme");
    const rootTheme = root.dataset.theme;
    const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";

    const initialTheme =
      storedTheme === "dark" || storedTheme === "light"
        ? storedTheme
        : rootTheme === "dark" || rootTheme === "light"
          ? rootTheme
          : preferredTheme;

    applyTheme(initialTheme);
    setMounted(true);
  }, []);

  const getItemClassName = (itemTheme) =>
    [
      styles.themeItem,
      mounted && theme === itemTheme ? styles.themeItemActive : "",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <div className={styles.themeSwitcher} aria-label="Theme switcher">
      <button
        type="button"
        className={getItemClassName("light")}
        onClick={() => applyTheme("light")}
        aria-label="ライトテーマ"
        aria-pressed={mounted && theme === "light"}
        title="ライトテーマ"
      >
        <FiSun aria-hidden="true" />
      </button>

      <button
        type="button"
        className={getItemClassName("dark")}
        onClick={() => applyTheme("dark")}
        aria-label="ダークテーマ"
        aria-pressed={mounted && theme === "dark"}
        title="ダークテーマ"
      >
        <FiMoon aria-hidden="true" />
      </button>
    </div>
  );
}

const ADMIN_MENUS = [
  {
    href: "/admin/tool-editor/accessories",
    label: "アクセ",
    localized: false,
  },
  {
    href: "/admin/tool-editor/items",
    label: "アイテム",
    localized: false,
  },
  {
    href: "/admin/tool-editor/orbs",
    label: "オーブ",
    localized: false,
  },
  {
    href: "/admin/tool-editor/clystals",
    label: "結晶",
    localized: false,
  },
  {
    href: "/admin/tool-editor/game-jobs",
    label: "職業",
    localized: false,
  },
  {
    href: "/admin/tool-editor/equipments",
    label: "装備",
    localized: false,
  },
  {
    href: "/admin/tool-editor/equipment-types",
    label: "装備職人タイプ",
    localized: false,
  },
  {
    href: "/admin/tool-editor/craft-types",
    label: "職人",
    localized: false,
  },
  {
    href: "/admin/tool-editor/continents",
    label: "大陸",
    localized: false,
  },
  {
    href: "/admin/tool-editor/maps",
    label: "マップ",
    localized: false,
  },
  {
    href: "/admin/tool-editor/monsters",
    label: "モンスター",
    localized: false,
  },
  {
    href: "/admin/tool-editor/bosses",
    label: "ボス",
    localized: false,
  },
  {
    href: "/admin/tool-editor/content-reports",
    label: "レポート",
    localized: false,
  },
  {
    href: "/admin/kishoju",
    label: "輝晶獣",
    localized: false,
  },
].sort((a, b) => a.label.localeCompare(b.label, "ja"));

export default function Header() {
  const t = useTranslations("Header");
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  const headerRef = useRef(null);

  const term = "v8.0対応";
  const showAdminArea = isAdminPath(pathname);

  const publicMenus = useMemo(
    () => [
      {
        href: "/tools/craft-profit",
        label: t("menus.public.craftProfit"),
        localized: true,
      },
      {
        href: "/tools/monster-search",
        label: t("menus.public.monsterSearch"),
        localized: true,
      },
      {
        href: "/tools/monster-zukan",
        label: t("menus.public.monsterZukan"),
        localized: true,
      },
      {
        href: "/tools/map-monster-browser",
        label: t("menus.public.mapMonsterBrowser"),
        localized: true,
      },
      {
        href: "/tools/accessory-guide",
        label: t("menus.public.accessory-guide"),
        localized: true,
      },
      {
        href: "/tools/kishoju",
        label: t("menus.public.kishoju"),
        localized: true,
      },
    ],
    [t]
  );

  useEffect(() => {
    const updateHeaderHeight = () => {
      const nextHeight = headerRef.current?.offsetHeight ?? 0;

      setHeaderHeight(nextHeight);

      document.documentElement.style.setProperty(
        "--site-header-height",
        `${nextHeight}px`
      );
    };

    updateHeaderHeight();

    window.addEventListener("resize", updateHeaderHeight);

    return () => {
      window.removeEventListener("resize", updateHeaderHeight);
    };
  }, []);

  useEffect(() => {
    const handleOpenHeaderMenu = () => {
      setMenuVisible(true);

      window.requestAnimationFrame(() => {
        setOpen(true);
      });
    };

    window.addEventListener(
      "open-header-menu",
      handleOpenHeaderMenu
    );

    return () => {
      window.removeEventListener(
        "open-header-menu",
        handleOpenHeaderMenu
      );
    };
  }, []);
  
  useEffect(() => {
    if (open) {
      setMenuVisible(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setMenuVisible(false);
    }, 240);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function closeMenu() {
    setOpen(false);
  }

  function openMenu() {
    setMenuVisible(true);

    window.requestAnimationFrame(() => {
      setOpen(true);
    });
  }

  function toggleMenu() {
    if (open) {
      closeMenu();
      return;
    }

    openMenu();
  }

  return (
    <>
      <header
        ref={headerRef}
        className={`${styles.header} ${mochiy.className}`}
      >
        <div className={styles.headerInner}>
          <div className={styles.headerRow}>
            <HeaderNavLink
              href="/"
              localized
              className={styles.brandLink}
              onClick={closeMenu}
            >
              <span className={styles.brandText}>
                <span className={styles.brandBadge}>
                  DQX TOOLS
                </span>

                <span className={styles.brandTitle}>
                  アストルティアの孫の手
                </span>
              </span>

              <span
                className={`${styles.versionBadge} ${styles.headerVersion}`}
              >
                {term}
              </span>
            </HeaderNavLink>

            <button
              type="button"
              className={styles.menuButton}
              onClick={toggleMenu}
              aria-label={
                open ? t("closeMenu") : t("openMenu")
              }
              aria-expanded={open}
            >
              <span className={styles.menuButtonGlow} />

              <span className={styles.hamburger}>
                <span
                  className={[
                    styles.bar,
                    open ? styles.barTopOpen : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />

                <span
                  className={[
                    styles.bar,
                    open ? styles.barMiddleOpen : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />

                <span
                  className={[
                    styles.bar,
                    open ? styles.barBottomOpen : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      {menuVisible && (
        <div
          className={`${styles.menuLayer} ${mochiy.className}`}
          style={{
            top: `${headerHeight}px`,
            height: `calc(100dvh - ${headerHeight}px)`,
          }}
          onClick={closeMenu}
        >
          <div
            className={[
              styles.menuBackdrop,
              open
                ? styles.menuBackdropOpen
                : styles.menuBackdropClosed,
            ].join(" ")}
          />

          <div
            className={[
              styles.menuScroll,
              open
                ? styles.menuScrollOpen
                : styles.menuScrollClosed,
            ].join(" ")}
          >
            <div
              className={styles.menuCard}
              onClick={(event) => event.stopPropagation()}
            >
              <section className={styles.menuSection}>
                <div className={styles.sectionTitle}>
                  {t("menuTitle")}
                </div>

                <nav className={styles.menuNav}>
                  {publicMenus.map((menu, index) => (
                    <HeaderNavLink
                      key={menu.href}
                      href={menu.href}
                      localized={menu.localized}
                      onClick={closeMenu}
                      className={styles.menuLink}
                      style={{
                        transitionDelay: open
                          ? `${index * 28}ms`
                          : "0ms",
                      }}
                    >
                      {menu.label}
                    </HeaderNavLink>
                  ))}

                  <a
                    href="https://x.com/miki0801388249"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={closeMenu}
                    className={styles.menuLink}
                    aria-label="X"
                    title="X"
                  >
                    <FaXTwitter />
                    <span>X</span>
                  </a>
                </nav>
              </section>

              {showAdminArea ? (
                <HeaderMobileAdminMenu
                  t={t}
                  closeMenu={closeMenu}
                />
              ) : null}

              {showAdminArea ? (
                <HeaderMobileAuthButtons
                  t={t}
                  closeMenu={closeMenu}
                />
              ) : null}

              <div className={styles.menuFooter}>
                <div className={styles.menuPreferenceRow}>
                  <LanguageSwitcher
                    onNavigate={closeMenu}
                  />

                  <ThemeSwitcher />
                </div>

                <div
                  className={`${styles.versionBadge} ${styles.footerVersion}`}
                >
                  {term}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function HeaderMobileAdminMenu({ t, closeMenu }) {
  const { user } = useAuth();

  if (!user) return null;

  const isAdmin = Boolean(user?.is_admin);

  const limitedAdminMenus = [
    {
      href: "/admin/tool-editor/monsters",
      label: t("menus.admin.monsters"),
      localized: false,
    },
  ];

  const visibleAdminMenus = isAdmin
    ? ADMIN_MENUS
    : limitedAdminMenus;

  return (
    <section className={styles.menuSection}>
      <div
        className={`${styles.sectionTitle} ${styles.adminTitle}`}
      >
        {t("adminTitle")}
      </div>

      <nav className={styles.menuNav}>
        {visibleAdminMenus.map((menu) => (
          <HeaderNavLink
            key={menu.href}
            href={menu.href}
            localized={menu.localized}
            onClick={closeMenu}
            className={`${styles.menuLink} ${styles.adminLink}`}
          >
            {menu.label}
          </HeaderNavLink>
        ))}
      </nav>
    </section>
  );
}

function HeaderMobileAuthButtons({ t, closeMenu }) {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <section className={styles.authSection}>
      <div className={styles.userName}>
        {user.name}
      </div>

      <button
        type="button"
        onClick={() => {
          closeMenu();
          logout();
        }}
        className={styles.logoutButton}
      >
        {t("logout")}
      </button>
    </section>
  );
}