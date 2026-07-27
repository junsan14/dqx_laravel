"use client";
import ProgressIntlLink from "@/components/common/ProgressIntlLink";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import PageHeroTitle from "@/components/PageHeroTitle";

function buildPages(currentPage, lastPage) {
  if (lastPage <= 1) return [1];

  const pages = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(lastPage, currentPage + 2);

  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push("...");
  }

  for (let i = start; i <= end; i += 1) {
    pages.push(i);
  }

  if (end < lastPage) {
    if (end < lastPage - 1) pages.push("...");
    pages.push(lastPage);
  }

  return pages;
}

function getStyles() {
  return {
    summaryText: {
      color: "var(--text-sub)",
      textAlign: "center",
      marginTop: "20px",
    },
    emptyBox: {
      border: "1px dashed var(--soft-border)",
      background: "var(--panel-bg)",
      color: "var(--text-muted)",
    },
    card: {
      border: "1px solid var(--card-border)",
      background: "var(--card-bg)",
      color: "var(--text-main)",
      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
      textDecoration: "none",
      minWidth: 0,
    },
    cardHover: {
      background: "var(--hover-bg)",
    },
    orderText: {
      color: "var(--text-muted)",
    },
    nameText: {
      color: "var(--text-title)",
      lineHeight: 1.35,
      wordBreak: "break-word",
    },
    systemTypePc: {
      background: "var(--tag-bg)",
      color: "var(--tag-text)",
      border: "1px solid var(--tag-border)",
    },
    reincarnatedPc: {
      background: "var(--soft-danger-bg)",
      color: "var(--danger-text)",
      border: "1px solid var(--soft-danger-border)",
    },
    reincarnatedSp: {
      background: "var(--soft-danger-bg)",
      color: "var(--danger-text)",
      border: "1px solid var(--soft-danger-border)",
    },

    sortTabWrap: {
      display: "flex",
      justifyContent: "center",
      marginBottom: "16px",
    },
    sortTabInner: {
      display: "inline-flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px",
      borderRadius: "999px",
      background: "var(--soft-bg)",
      border: "1px solid var(--soft-border)",
      flexWrap: "wrap",
    },
    sortTabButton: {
      border: "1px solid transparent",
      background: "transparent",
      color: "var(--text-sub)",
      transition: "all .16s ease",
    },
    sortTabButtonActive: {
      border: "1px solid var(--primary-border)",
      background: "var(--primary-bg)",
      color: "var(--primary-text)",
      boxShadow: "0 8px 20px rgba(15, 23, 42, 0.12)",
    },
    sortSoonBadge: {
      background: "var(--soft-bg)",
      border: "1px solid var(--soft-border)",
      color: "var(--text-muted)",
      lineHeight: 1.2,
    },

    pageMetaRow: {
      display: "flex",
      justifyContent: "flex-end",
      marginBottom: "8px",
    },
    pageMetaBadge: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "4px 10px",
      borderRadius: "999px",
      border: "1px solid var(--soft-border)",
      background: "var(--soft-bg)",
      color: "var(--text-muted)",
      fontSize: "12px",
      lineHeight: 1.2,
    },

    paginationArea: {
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      marginTop: "8px",
      marginBottom: "20px",
      width: "100%",
    },
    paginationTopRow: {
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "48px",
      width: "100%",
    },
    pageNumberRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexWrap: "nowrap",
      gap: "8px",
      width: "100%",
      overflowX: "auto",
      padding: "4px 0",
      scrollbarWidth: "none",
      msOverflowStyle: "none",
    },
    pageJumpInner: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      flexWrap: "wrap",
      justifyContent: "center",
    },

    paginationButton: {
      border: "1px solid var(--input-border)",
      background: "var(--panel-bg)",
      color: "var(--text-main)",
      transition: "all .16s ease",
      flex: "0 0 auto",
    },
    paginationButtonActive: {
      border: "1px solid var(--primary-border)",
      background: "var(--primary-bg)",
      color: "var(--primary-text)",
      boxShadow: "0 8px 20px rgba(15, 23, 42, 0.14)",
      flex: "0 0 auto",
    },
    ellipsis: {
      color: "var(--text-muted)",
      flex: "0 0 auto",
    },
    pageInput: {
      border: "1px solid var(--input-border)",
      background: "var(--input-bg)",
      color: "var(--input-text)",
      fontSize: "16px",
      lineHeight: 1.25,
    },
    pageTotalText: {
      color: "var(--text-muted)",
    },
  };
}

function withLocalePath(locale, path) {
  if (!path) return `/${locale}`;
  if (path === "/") return `/${locale}`;
  return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
}

function MonsterCard({ monster, backHref, styles, t }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <ProgressIntlLink
      href={{
        pathname: `/tools/monster-search/${monster.id}`,
        query: { back: backHref },
      }}
      className="block rounded-lg px-2.5 py-2 transition sm:px-3 sm:py-2.5"
      style={{
        ...styles.card,
        ...(isHovered ? styles.cardHover : {}),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="hidden sm:flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-xs" style={styles.orderText}>
            No.{monster.display_order}
          </span>

          <span className="min-w-0 truncate font-medium" style={styles.nameText}>
            {monster.name}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {monster.system_type && (
            <span
              className="rounded-full px-2 py-1 text-xs"
              style={styles.systemTypePc}
            >
              {monster.system_type}
            </span>
          )}

          {(monster.is_reincarnated === true ||
            monster.is_reincarnated === 1) && (
            <span
              className="rounded-full px-2 py-1 text-xs"
              style={styles.reincarnatedPc}
            >
              {t("reincarnated")}
            </span>
          )}
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 sm:hidden">
        <div
          className="min-w-0 text-[12px] font-medium leading-4"
          style={styles.nameText}
        >
          {monster.name}
        </div>

        {(monster.is_reincarnated === true ||
          monster.is_reincarnated === 1) && (
          <span
            className="shrink-0 rounded px-1.5 py-[2px] text-[10px]"
            style={styles.reincarnatedSp}
          >
            {t("reincarnated")}
          </span>
        )}
      </div>
    </ProgressIntlLink>
  );
}

function SortTabs({ sort, styles, locale, t }) {
  const router = useRouter();
  const [hoveredTab, setHoveredTab] = useState(null);

  const tabs = [
    { key: "no", label: t("sort.no") },
    { key: "kana", label: t("sort.kana"), soon: true },
  ];

  const moveSort = (nextSort, soon = false) => {
    if (soon) return;
    router.push(
      `${withLocalePath(locale, "/tools/monster-zukan")}?page=1&sort=${nextSort}`,
      { scroll: false }
    );
  };

  const getTabStyle = (key, active = false, soon = false) => {
    if (active) return styles.sortTabButtonActive;

    return {
      ...styles.sortTabButton,
      opacity: soon ? 0.72 : 1,
      cursor: soon ? "not-allowed" : "pointer",
      ...(hoveredTab === key && !soon
        ? {
            background: "var(--hover-bg)",
            color: "var(--text-main)",
          }
        : {}),
    };
  };

  return (
    <div style={styles.sortTabWrap}>
      <div style={styles.sortTabInner}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => moveSort(tab.key, tab.soon)}
            className="rounded-full px-4 py-2 text-sm font-medium"
            style={getTabStyle(tab.key, sort === tab.key, tab.soon)}
            onMouseEnter={() => setHoveredTab(tab.key)}
            onMouseLeave={() => setHoveredTab(null)}
            disabled={tab.soon}
            title={tab.soon ? t("sort.kanaSoonTitle") : ""}
          >
            <span className="inline-flex items-center gap-2">
              <span>{tab.label}</span>
              {tab.soon && (
                <span
                  className="rounded-full px-2 py-[2px] text-[10px] font-bold"
                  style={styles.sortSoonBadge}
                >
                  {t("sort.comingSoon")}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Pagination({ currentPage, lastPage, sort, styles, locale, t }) {
  const router = useRouter();
  const [inputPage, setInputPage] = useState(String(currentPage));
  const [hoveredButton, setHoveredButton] = useState(null);

  const safeCurrentPage = Math.max(1, Number(currentPage) || 1);
  const safeLastPage = Math.max(1, Number(lastPage) || 1);

  useEffect(() => {
    setInputPage(String(safeCurrentPage));
  }, [safeCurrentPage]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function releaseRestoredInputFocus() {
      if (window.innerWidth >= 768) return;

      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement &&
        activeElement.id === "page-input"
      ) {
        activeElement.blur();
      }
    }

    const timer = window.setTimeout(releaseRestoredInputFocus, 0);
    window.addEventListener("pageshow", releaseRestoredInputFocus);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pageshow", releaseRestoredInputFocus);
    };
  }, []);

  const pages = useMemo(
    () => buildPages(safeCurrentPage, safeLastPage),
    [safeCurrentPage, safeLastPage]
  );

  function scrollPageTop() {
    if (typeof window === "undefined") return;

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }

    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "smooth",
      });
    });
  }

  const moveToPage = (page) => {
    const safePage = Math.max(1, Math.min(Number(page) || 1, safeLastPage));

    router.push(
      `${withLocalePath(locale, "/tools/monster-zukan")}?page=${safePage}&sort=${sort}`,
      { scroll: false }
    );

    scrollPageTop();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    moveToPage(inputPage);
  };

  const getButtonStyle = (key, active = false) => {
    if (active) return styles.paginationButtonActive;

    return {
      ...styles.paginationButton,
      ...(hoveredButton === key
        ? {
            background: "var(--hover-bg)",
            transform: "translateY(-1px)",
          }
        : {}),
    };
  };

  return (
    <div style={styles.paginationArea}>
      <div className="w-full" style={styles.paginationTopRow}>
        <div
          style={styles.pageNumberRow}
          className="[&::-webkit-scrollbar]:hidden"
        >
          {safeCurrentPage > 1 && (
            <button
              type="button"
              onClick={() => moveToPage(safeCurrentPage - 1)}
              className="rounded-full px-4 py-2 text-sm"
              style={getButtonStyle("prev")}
              onMouseEnter={() => setHoveredButton("prev")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              ←
            </button>
          )}

          {pages.map((page, index) =>
            page === "..." ? (
              <span
                key={`ellipsis-${index}`}
                className="px-1 text-sm"
                style={styles.ellipsis}
              >
                ...
              </span>
            ) : (
              <button
                key={page}
                type="button"
                onClick={() => moveToPage(page)}
                className="min-w-[42px] rounded-full px-3 py-2 text-sm"
                style={getButtonStyle(`page-${page}`, page === safeCurrentPage)}
                onMouseEnter={() => setHoveredButton(`page-${page}`)}
                onMouseLeave={() => setHoveredButton(null)}
              >
                {page}
              </button>
            )
          )}

          {safeCurrentPage < safeLastPage && (
            <button
              type="button"
              onClick={() => moveToPage(safeCurrentPage + 1)}
              className="rounded-full px-4 py-2 text-sm"
              style={getButtonStyle("next")}
              onMouseEnter={() => setHoveredButton("next")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              →
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-center sm:justify-end">
        <form onSubmit={handleSubmit} style={styles.pageJumpInner}>
          <input
            id="page-input"
            type="number"
            inputMode="numeric"
            enterKeyHint="go"
            autoComplete="off"
            min={1}
            max={safeLastPage}
            value={inputPage}
            onFocus={(e) => e.currentTarget.select()}
            onClick={(e) => e.currentTarget.select()}
            onChange={(e) => setInputPage(e.target.value)}
            className="w-16 rounded-full px-3 py-2 text-base text-center"
            style={styles.pageInput}
          />

          <button
            type="submit"
            className="rounded-full px-4 py-2 text-sm"
            style={getButtonStyle("submit")}
            onMouseEnter={() => setHoveredButton("submit")}
            onMouseLeave={() => setHoveredButton(null)}
          >
            {t("pagination.go")}
          </button>

          <span className="text-sm" style={styles.pageTotalText}>
            / {safeLastPage} {t("pagination.pages")}
          </span>
        </form>
      </div>
    </div>
  );
}

export default function MonsterZukanClient({
  monsters = [],
  currentPage = 1,
  lastPage = 1,
  total = 0,
  perPage = 16,
  sort = "no",
}) {
  const t = useTranslations("MonsterZukan");
  const locale = useLocale();
  const styles = useMemo(() => getStyles(), []);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const backHref = useMemo(() => {
    const query = searchParams?.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  const safeMonsters = Array.isArray(monsters) ? monsters : [];
  const safeCurrentPage = Math.max(1, Number(currentPage) || 1);
  const safeLastPage = Math.max(1, Number(lastPage) || 1);
  const safeTotal = Math.max(0, Number(total) || 0);
  const safePerPage = Math.max(1, Number(perPage) || 16);

  const start = safeTotal === 0 ? 0 : (safeCurrentPage - 1) * safePerPage + 1;
  const end =
    safeTotal === 0 ? 0 : Math.min(safeCurrentPage * safePerPage, safeTotal);

  return (
    <main>
      <PageHeroTitle kicker="DQX MONSTER ZUKAN" title={t("title")} />

      <SortTabs sort={sort} styles={styles} locale={locale} t={t} />

      <div style={styles.pageMetaRow}>
        <div style={styles.pageMetaBadge}>
          {safeCurrentPage} / {safeLastPage} {t("pagination.pages")}
        </div>
      </div>

      {safeMonsters.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={styles.emptyBox}>
          {t("empty")}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3">
          {safeMonsters.map((monster) => (
            <MonsterCard
              key={monster.id}
              monster={monster}
              backHref={backHref}
              styles={styles}
              locale={locale}
              t={t}
            />
          ))}
        </div>
      )}

      <div className="mb-4 text-sm" style={styles.summaryText}>
        {start}–{end} / {t("summary.total", { total: safeTotal })}
      </div>

      <Pagination
        currentPage={safeCurrentPage}
        lastPage={safeLastPage}
        sort={sort}
        styles={styles}
        locale={locale}
        t={t}
      />
    </main>
  );
}
