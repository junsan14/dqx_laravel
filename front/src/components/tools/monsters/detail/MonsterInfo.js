"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { getMonsterAssetUrl } from "@/lib/monsters";
import styles from "./MonsterInfo.module.css";

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function MonsterImageCard({ monster, priority = false }) {
  const t = useTranslations("MonsterInfoSection");
  const [hasError, setHasError] = useState(false);

  const imageUrl = useMemo(() => {
    if (!monster?.image_path) return "";
    return getMonsterAssetUrl(monster.image_path);
  }, [monster?.image_path]);

  if (!imageUrl || hasError) {
    return (
      <div className={styles.imagePlaceholder} aria-label={t("noImage")}>
        👾
      </div>
    );
  }

  return (
    <div className={styles.imageFrame}>
      <Image
        src={imageUrl}
        alt={monster?.name || t("imageAlt")}
        fill
        priority={priority}
        unoptimized
        sizes="(max-width: 920px) 30vw, 200px"
        onError={() => setHasError(true)}
        className={styles.image}
      />
    </div>
  );
}

function joinDisplayValue(value) {
  if (value == null) return "";

  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).join(" / ");
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[]") return "";

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean).join(" / ");
      }
      if (typeof parsed === "string") return parsed.trim();
    } catch (_) {
      return trimmed;
    }

    return trimmed;
  }

  return String(value);
}

function pickMemoValues(monster) {
  return [
    monster?.memo_1,
    monster?.memo1,
    monster?.trivia_1,
    monster?.豆知識1,
    monster?.memo_2,
    monster?.memo2,
    monster?.trivia_2,
    monster?.豆知識2,
  ]
    .map(joinDisplayValue)
    .filter(Boolean)
    .slice(0, 2);
}

function getReincarnationParentName(monster) {
  return (
    monster?.reincarnation_parent_name ||
    monster?.parent_name ||
    monster?.reincarnation_parent?.name ||
    ""
  );
}

function useIsMobile(breakpoint = 920) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < breakpoint);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [breakpoint]);

  return isMobile;
}

function FullMonsterInfo({ monster, showSectionTitle = true }) {
  const t = useTranslations("MonsterInfoSection");
  const isMobile = useIsMobile();
  const memos = useMemo(() => pickMemoValues(monster), [monster]);
  const parentName = getReincarnationParentName(monster);
  const isReincarnated =
    Number(monster?.is_reincarnated) === 1 || monster?.is_reincarnated === true;

  const scrollerRef = useRef(null);
  const isProgrammaticScrollRef = useRef(false);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (!isMobile || !memos.length) return undefined;
    const element = scrollerRef.current;
    if (!element) return undefined;

    isProgrammaticScrollRef.current = true;
    element.scrollTo({
      left: (element.clientWidth || 1) * activeTab,
      behavior: "smooth",
    });

    const timer = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 350);

    return () => clearTimeout(timer);
  }, [activeTab, isMobile, memos.length]);

  useEffect(() => {
    if (!isMobile || !memos.length) return undefined;
    const element = scrollerRef.current;
    if (!element) return undefined;

    function handleScroll() {
      if (isProgrammaticScrollRef.current) return;
      const nextTab = Math.round(element.scrollLeft / (element.clientWidth || 1));
      if (nextTab >= 0 && nextTab < memos.length && nextTab !== activeTab) {
        setActiveTab(nextTab);
      }
    }

    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => element.removeEventListener("scroll", handleScroll);
  }, [activeTab, isMobile, memos.length]);

  useEffect(() => {
    if (activeTab > Math.max(0, memos.length - 1)) setActiveTab(0);
  }, [activeTab, memos.length]);

  return (
    <section className={styles.root}>
      {showSectionTitle ? (
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t("title")}</h2>
        </div>
      ) : null}

      <div className={styles.fullCard}>
        <div className={cx(styles.infoGrid, isMobile && styles.infoGridMobile)}>
          <div className={styles.leftColumn}>
            {!isMobile ? (
              <>
                <div className={styles.titleBlock}>
                  <div className={styles.titleRow}>
                    <h1 className={styles.monsterName}>{monster?.name || ""}</h1>
                    {monster?.system_type ? (
                      <span className={styles.systemTypeTag}>{monster.system_type}</span>
                    ) : null}
                  </div>

                  {isReincarnated ? (
                    <div className={styles.reincarnationRow}>
                      <span className={styles.reincarnationBadge}>{t("reincarnated")}</span>
                      {parentName ? (
                        <span className={styles.parentText}>（{parentName}）</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {memos.length ? (
                  <div className={styles.desktopMemoList}>
                    {memos.map((memo, index) => (
                      <p key={`memo-${index}`} className={styles.memoCard}>
                        {memo}
                      </p>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className={styles.mobileTitleBlock}>
                <h1 className={styles.monsterName}>{monster?.name || ""}</h1>
                {isReincarnated || monster?.system_type ? (
                  <div className={styles.reincarnationRow}>
                    {isReincarnated ? (
                      <span className={styles.reincarnationBadge}>{t("reincarnated")}</span>
                    ) : null}
                    {parentName && isReincarnated ? (
                      <span className={styles.parentText}>（{parentName}）</span>
                    ) : null}
                    {monster?.system_type ? (
                      <span className={styles.systemTypeTag}>{monster.system_type}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className={styles.imageColumn}>
            <MonsterImageCard monster={monster} />
          </div>
        </div>

        {isMobile && memos.length ? (
          <div className={styles.mobileMemoSection}>
            <div className={styles.memoHeader}>
              <h3 className={styles.memoTitle}>{t("trivia")}</h3>
            </div>

            {memos.length > 1 ? (
              <div className={styles.memoTabs}>
                {memos.map((_, index) => (
                  <button
                    key={`memo-tab-${index}`}
                    type="button"
                    onClick={() => setActiveTab(index)}
                    className={cx(styles.memoTab, index === activeTab && styles.memoTabActive)}
                  >
                    {t("triviaTab", { number: index + 1 })}
                  </button>
                ))}
              </div>
            ) : null}

            <div className={styles.mobileMemoViewport}>
              <div ref={scrollerRef} className={styles.mobileMemoScroller}>
                {memos.map((memo, index) => (
                  <div key={`memo-page-${index}`} className={styles.mobileMemoPage}>
                    <div className={styles.mobileMemoCard}>
                      <p className={styles.mobileMemoText}>{memo}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {memos.length > 1 ? (
              <div className={styles.memoDots}>
                {memos.map((_, index) => (
                  <span
                    key={`memo-dot-${index}`}
                    className={cx(styles.memoDot, index === activeTab && styles.memoDotActive)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CompactMonsterInfo({ monster, showName = false }) {
  const t = useTranslations("MonsterInfoSection");
  const description =
    joinDisplayValue(monster?.description) || joinDisplayValue(monster?.note) || "";
  const parentName = getReincarnationParentName(monster);
  const isReincarnated =
    Number(monster?.is_reincarnated) === 1 || monster?.is_reincarnated === true;

  return (
    <section className={styles.compactCard}>
      {showName ? <h1 className={styles.compactName}>{monster?.name || ""}</h1> : null}

      <div className={styles.compactContent}>
        <div className={styles.compactTitleBlock}>
          <div className={styles.compactTitleRow}>
            {showName && monster?.system_type ? (
              <span className={styles.systemTypeTag}>{monster.system_type}</span>
            ) : null}

            {isReincarnated ? (
              <div className={styles.reincarnationRow}>
                <span className={styles.reincarnationBadge}>{t("reincarnated")}</span>
                {parentName ? <span className={styles.parentText}>（{parentName}）</span> : null}
              </div>
            ) : null}
          </div>
        </div>

        {description ? <p className={styles.compactDescription}>{description}</p> : null}

        {monster?.exp != null || monster?.gold != null ? (
          <div className={styles.metaGrid}>
            {monster?.exp != null ? (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t("exp")}</span>
                <span className={styles.metaValue}>{monster.exp}</span>
              </div>
            ) : null}
            {monster?.gold != null ? (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{t("gold")}</span>
                <span className={styles.metaValue}>{monster.gold}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function MonsterInfo({
  monster,
  variant = "full",
  showName = false,
  showSectionTitle = true,
}) {
  if (variant === "compact") {
    return <CompactMonsterInfo monster={monster} showName={showName} />;
  }

  return <FullMonsterInfo monster={monster} showSectionTitle={showSectionTitle} />;
}
