"use client";

import ProgressIntlLink from "@/components/common/ProgressIntlLink";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import PageHeroTitle from "@/components/PageHeroTitle";
import styles from "./MonsterZukanClient.module.css";

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

function withLocalePath(locale, path) {
  if (!path) return `/${locale}`;
  if (path === "/") return `/${locale}`;
  return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
}

function MonsterCard({ monster, backHref, t }) {
  return (
    <ProgressIntlLink
      href={{
        pathname: `/tools/monster-search/${monster.id}`,
        query: { back: backHref },
      }}
      className={styles.card}
    >
      <div className={styles.cardPcRow}>
        <div className={styles.cardNameWrap}>
          <span className={styles.cardNamePc}>{monster.name}</span>
        </div>

        <div className={styles.cardTags}>
          {monster.system_type && (
            <span className={styles.systemType}>{monster.system_type}</span>
          )}

          {(monster.is_reincarnated === true ||
            monster.is_reincarnated === 1) && (
            <span className={styles.reincarnatedPc}>{t("reincarnated")}</span>
          )}
        </div>
      </div>

      <div className={styles.cardSpRow}>
        <div className={styles.cardNameSp}>{monster.name}</div>

        {(monster.is_reincarnated === true ||
          monster.is_reincarnated === 1) && (
          <span className={styles.reincarnatedSp}>{t("reincarnated")}</span>
        )}
      </div>
    </ProgressIntlLink>
  );
}

function SortTabs({ sort, locale, t }) {
  const router = useRouter();

  const tabs = [
    { key: "no", label: t("sort.no") },
    { key: "kana", label: t("sort.kana"), soon: false },
  ];

  const moveSort = (nextSort, soon = false) => {
    if (soon) return;

    router.push(
      `${withLocalePath(locale, "/tools/monster-zukan")}?page=1&sort=${nextSort}`,
      { scroll: false }
    );
  };

  return (
    <div className={styles.sortTabWrap}>
      <div className={styles.sortTabInner}>
        {tabs.map((tab) => {
          const isActive = sort === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => moveSort(tab.key, tab.soon)}
              className={`${styles.sortTabButton} ${
                isActive ? styles.sortTabButtonActive : ""
              }`}
              disabled={tab.soon}
              title={tab.soon ? t("sort.kanaSoonTitle") : ""}
            >
              <span className={styles.sortTabLabel}>
                <span>{tab.label}</span>

                {tab.soon && (
                  <span className={styles.sortSoonBadge}>
                    {t("sort.comingSoon")}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Pagination({ currentPage, lastPage, sort, locale, t }) {
  const router = useRouter();
  const [inputPage, setInputPage] = useState(String(currentPage));

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
        top: 120,
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

  const handleSubmit = (event) => {
    event.preventDefault();
    moveToPage(inputPage);
  };

  return (
    <div className={styles.paginationArea}>
      <div className={styles.paginationTopRow}>
        <div className={styles.pageNumberRow}>
          {safeCurrentPage > 1 && (
            <button
              type="button"
              onClick={() => moveToPage(safeCurrentPage - 1)}
              className={styles.paginationButton}
            >
              ←
            </button>
          )}

          {pages.map((page, index) =>
            page === "..." ? (
              <span key={`ellipsis-${index}`} className={styles.ellipsis}>
                ...
              </span>
            ) : (
              <button
                key={page}
                type="button"
                onClick={() => moveToPage(page)}
                className={`${styles.paginationButton} ${styles.pageButton} ${
                  page === safeCurrentPage
                    ? styles.paginationButtonActive
                    : ""
                }`}
              >
                {page}
              </button>
            )
          )}

          {safeCurrentPage < safeLastPage && (
            <button
              type="button"
              onClick={() => moveToPage(safeCurrentPage + 1)}
              className={styles.paginationButton}
            >
              →
            </button>
          )}
        </div>
      </div>

      <div className={styles.pageJumpRow}>
        <form onSubmit={handleSubmit} className={styles.pageJumpInner}>
          <input
            id="page-input"
            type="number"
            inputMode="numeric"
            enterKeyHint="go"
            autoComplete="off"
            min={1}
            max={safeLastPage}
            value={inputPage}
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
            onChange={(event) => setInputPage(event.target.value)}
            className={styles.pageInput}
          />

          <button type="submit" className={styles.paginationButton}>
            {t("pagination.go")}
          </button>

          <span className={styles.pageTotalText}>
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

      <SortTabs sort={sort} locale={locale} t={t} />


      {safeMonsters.length === 0 ? (
        <div className={styles.emptyBox}>{t("empty")}</div>
      ) : (
        <div className={styles.monsterGrid}>
          {safeMonsters.map((monster) => (
            <MonsterCard
              key={monster.id}
              monster={monster}
              backHref={backHref}
              t={t}
            />
          ))}
        </div>
      )}

      <div className={styles.summaryText}>
        {start}–{end} / {t("summary.total", { total: safeTotal })}
      </div>

      <Pagination
        currentPage={safeCurrentPage}
        lastPage={safeLastPage}
        sort={sort}
        locale={locale}
        t={t}
      />
    </main>
  );
}
