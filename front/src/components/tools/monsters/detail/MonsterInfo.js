"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { getMonsterAssetUrl } from "@/lib/monsters";
import moduleStyles from "./MonsterInfo.module.css";

function MonsterImageCard({
  monster,
  rounded = 5,
  priority = false,
  aspectRatio = "1 / 1",
}) {
  const [hasError, setHasError] = useState(false);

  const imageUrl = useMemo(() => {
    if (!monster?.image_path) return "";
    return getMonsterAssetUrl(monster.image_path);
  }, [monster?.image_path]);

  const hasImage = !!imageUrl && !hasError;

  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
      }}
    >
      {hasImage ? (
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio,
            borderRadius: `${rounded}px`,
            overflow: "hidden",
            background: "transparent",
          }}
        >
          <Image
            src={imageUrl}
            alt={monster?.name || "モンスター画像"}
            fill
            priority={priority}
            unoptimized
            sizes="(max-width: 920px) 84px, 132px"
            onError={() => setHasError(true)}
            style={{
              objectFit: "contain",
              borderRadius: `${rounded}px`,
            }}
          />
        </div>
      ) : (
        <div
          style={{
            width: "100%",
            aspectRatio,
            borderRadius: `${rounded}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--soft-bg)",
            color: "var(--text-muted)",
            fontSize: "24px",
            userSelect: "none",
          }}
        >
          👾
        </div>
      )}
    </div>
  );
}



function joinDisplayValue(value) {
  if (value == null) return "";

  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean).join(" / ");
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[]") return "";

    try {
      const parsed = JSON.parse(trimmed);

      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean).join(" / ");
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
  const candidates = [
    monster?.memo_1,
    monster?.memo1,
    monster?.trivia_1,
    monster?.豆知識1,
    monster?.memo_2,
    monster?.memo2,
    monster?.trivia_2,
    monster?.豆知識2,
  ];

  return candidates.map(joinDisplayValue).filter(Boolean).slice(0, 2);
}

function getReincarnationParentName(monster) {
  if (!monster) return "";

  return (
    monster.reincarnation_parent_name ||
    monster.parent_name ||
    monster.reincarnation_parent?.name ||
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

const fullStyles = {
  section: {
    marginBottom: "16px",
    width: "100%",
    minWidth: 0,
  },
  header: {
    marginBottom: "12px",
    minWidth: 0,
  },
  title: {
    margin: 0,
    fontSize: "18px",
    fontWeight: 800,
    color: "var(--text-title)",
  },
  card: {
    width: "100%",
    minWidth: 0,
    borderRadius: "18px",
    border: "1px solid var(--card-border)",
    background: "transparent",
    padding: "16px",
    boxSizing: "border-box",
  },

  desktopGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 200px",
    gap: "20px",
    alignItems: "start",
    width: "100%",
    minWidth: 0,
  },
  mobileGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 7fr) minmax(72px, 3fr)",
    gap: "12px",
    alignItems: "start",
    width: "100%",
    minWidth: 0,
  },

  leftCol: {
    minWidth: 0,
    display: "grid",
    gap: "12px",
    alignContent: "start",
  },

  desktopTitleBlock: {
    display: "grid",
    gap: "8px",
    minWidth: 0,
  },
  desktopTitleRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: "10px",
    width: "100%",
    minWidth: 0,
    flexWrap: "wrap",
  },

  mobileTitleBlock: {
    display: "grid",
    gap: "8px",
    minWidth: 0,
  },

  pageTitle: {
    margin: 0,
    fontSize: "clamp(22px, 4vw, 36px)",
    lineHeight: 1.15,
    fontWeight: 900,
    color: "var(--text-title)",
    letterSpacing: "-0.02em",
    wordBreak: "break-word",
    minWidth: 0,
  },

  systemTypeTag: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 800,
    lineHeight: 1,
    background: "var(--soft-bg)",
    color: "var(--text-main)",
    border: "1px solid var(--soft-border)",
    whiteSpace: "nowrap",
    width: "fit-content",
    maxWidth: "100%",
    flexShrink: 0,
  },
  desktopSystemTypeTag: {
    transform: "translateY(2px)",
  },

  reincarnationRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    minWidth: 0,
  },
  reincarnationBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 800,
    lineHeight: 1,
    background: "var(--warning-bg, var(--soft-bg))",
    color: "var(--warning-text, var(--text-main))",
    border: "1px solid var(--warning-border, var(--soft-border))",
    whiteSpace: "nowrap",
  },
  parentText: {
    fontSize: "14px",
    fontWeight: 700,
    color: "var(--text-sub)",
    whiteSpace: "normal",
    wordBreak: "break-word",
  },

  imageColDesktop: {
    minWidth: 0,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-end",
  },
  imageColMobile: {
    minWidth: 0,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-end",
    paddingTop: "2px",
  },
  desktopImageWrap: {
    width: "200px",
    minWidth: "200px",
  },

  memoSectionDesktop: {
    display: "grid",
    gap: "10px",
    minWidth: 0,
  },
  memoSectionMobile: {
    marginTop: "14px",
    width: "100%",
    minWidth: 0,
  },
  memoHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "10px",
    minWidth: 0,
  },
  memoTitle: {
    margin: 0,
    fontSize: "15px",
    fontWeight: 900,
    color: "var(--text-title)",
  },
  memoCard: {
    margin: 0,
    borderRadius: "14px",
    padding: "12px 14px",
    background: "var(--card-bg)",
    border: "1px solid var(--soft-border)",
    color: "var(--text-sub)",
    fontSize: "14px",
    lineHeight: 1.8,
    wordBreak: "break-word",
    boxSizing: "border-box",
  },
  emptyMemo: {
    margin: 0,
    color: "var(--text-muted)",
    fontSize: "14px",
    lineHeight: 1.8,
  },

  tabsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "6px",
    width: "100%",
    marginBottom: "10px",
  },
  tabButton: {
    appearance: "none",
    border: "1px solid var(--panel-border)",
    background: "var(--panel-bg)",
    color: "var(--text-sub)",
    padding: "8px 8px",
    fontSize: "12px",
    fontWeight: 900,
    lineHeight: 1.2,
    cursor: "pointer",
    borderRadius: "5px",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },
  tabButtonActive: {
    background: "var(--primary-bg)",
    color: "var(--primary-text)",
    border: "1px solid var(--primary-border)",
  },
  mobileContentViewport: {
    overflow: "hidden",
    width: "100%",
    minWidth: 0,
  },
  mobileScroller: {
    display: "flex",
    overflowX: "auto",
    overflowY: "hidden",
    scrollSnapType: "x mandatory",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
    width: "100%",
    minWidth: 0,
  },
  mobilePage: {
    minWidth: "100%",
    width: "100%",
    flex: "0 0 100%",
    scrollSnapAlign: "start",
    boxSizing: "border-box",
  },
  mobileMemoCard: {
    margin: 0,
    borderRadius: "14px",
    padding: "12px 14px",
    background: "var(--card-bg)",
    border: "1px solid var(--soft-border)",
    color: "var(--text-sub)",
    fontSize: "14px",
    lineHeight: 1.8,
    wordBreak: "break-word",
    boxSizing: "border-box",
    minHeight: "132px",
    display: "flex",
    alignItems: "center",
  },
  mobileMemoCardText: {
    margin: 0,
    width: "100%",
  },
  dots: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "6px",
    marginTop: "10px",
  },
  dot: {
    width: "6px",
    height: "6px",
    borderRadius: "999px",
    background: "var(--soft-border)",
    opacity: 0.9,
  },
  dotActive: {
    background: "var(--primary-border)",
  },
};

function FullMonsterInfo({ monster }) {
  const isMobile = useIsMobile();
  const memos = useMemo(() => pickMemoValues(monster), [monster]);

  const parentName = getReincarnationParentName(monster);
  const isReincarnated =
    Number(monster?.is_reincarnated) === 1 || monster?.is_reincarnated === true;

  const scrollerRef = useRef(null);
  const isProgrammaticScrollRef = useRef(false);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (!isMobile || !memos.length) return;

    const el = scrollerRef.current;
    if (!el) return;

    const pageWidth = el.clientWidth || 1;
    isProgrammaticScrollRef.current = true;

    el.scrollTo({
      left: pageWidth * activeTab,
      behavior: "smooth",
    });

    const timer = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 350);

    return () => clearTimeout(timer);
  }, [activeTab, isMobile, memos.length]);

  useEffect(() => {
    if (!isMobile || !memos.length) return;

    const el = scrollerRef.current;
    if (!el) return;

    function handleScroll() {
      if (isProgrammaticScrollRef.current) return;

      const pageWidth = el.clientWidth || 1;
      const nextTab = Math.round(el.scrollLeft / pageWidth);

      if (nextTab !== activeTab && nextTab >= 0 && nextTab < memos.length) {
        setActiveTab(nextTab);
      }
    }

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [activeTab, isMobile, memos.length]);

  useEffect(() => {
    if (activeTab > Math.max(0, memos.length - 1)) {
      setActiveTab(0);
    }
  }, [activeTab, memos.length]);

  return (
    <section className={moduleStyles.root} style={fullStyles.section}>
      <div style={fullStyles.header}>
        <h2 style={fullStyles.title}>モンスター情報</h2>
      </div>

      <div style={fullStyles.card}>
        <div style={isMobile ? fullStyles.mobileGrid : fullStyles.desktopGrid}>
          <div style={fullStyles.leftCol}>
            {!isMobile ? (
              <>
                <div style={fullStyles.desktopTitleBlock}>
                  <div style={fullStyles.desktopTitleRow}>
                    <h1 style={fullStyles.pageTitle}>{monster?.name || ""}</h1>

                    {monster?.system_type ? (
                      <span
                        style={{
                          ...fullStyles.systemTypeTag,
                          ...fullStyles.desktopSystemTypeTag,
                        }}
                      >
                        {monster.system_type}
                      </span>
                    ) : null}
                  </div>

                  {isReincarnated ? (
                    <div style={fullStyles.reincarnationRow}>
                      <span style={fullStyles.reincarnationBadge}>転生</span>
                      {parentName ? (
                        <span style={fullStyles.parentText}>（{parentName}）</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {memos.length ? (
                  <div style={fullStyles.memoSectionDesktop}>
                    {memos.map((memo, index) => (
                      <p key={`memo-${index}`} style={fullStyles.memoCard}>
                        {memo}
                      </p>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div style={fullStyles.mobileTitleBlock}>
                <h1 style={fullStyles.pageTitle}>{monster?.name || ""}</h1>

                {(isReincarnated || monster?.system_type) ? (
                  <div style={fullStyles.reincarnationRow}>
                    {isReincarnated ? (
                      <span style={fullStyles.reincarnationBadge}>転生</span>
                    ) : null}

                    {parentName && isReincarnated ? (
                      <span style={fullStyles.parentText}>（{parentName}）</span>
                    ) : null}

                    {monster?.system_type ? (
                      <span style={fullStyles.systemTypeTag}>{monster.system_type}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div style={isMobile ? fullStyles.imageColMobile : fullStyles.imageColDesktop}>
            {!isMobile ? (
              <div style={fullStyles.desktopImageWrap}>
                <MonsterImageCard monster={monster} size="sm" rounded={5} />
              </div>
            ) : (
              <MonsterImageCard monster={monster} size="sm" rounded={5} />
            )}
          </div>
        </div>

        {isMobile && memos.length ? (
          <div style={fullStyles.memoSectionMobile}>
            <div style={fullStyles.memoHeader}>
              <h3 style={fullStyles.memoTitle}>豆知識</h3>
            </div>

            {memos.length > 1 ? (
              <div style={fullStyles.tabsRow}>
                {memos.map((_, index) => {
                  const isActive = index === activeTab;

                  return (
                    <button
                      key={`memo-tab-${index}`}
                      type="button"
                      onClick={() => setActiveTab(index)}
                      style={{
                        ...fullStyles.tabButton,
                        ...(isActive ? fullStyles.tabButtonActive : {}),
                      }}
                    >
                      豆知識 {index + 1}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div style={fullStyles.mobileContentViewport}>
              <div ref={scrollerRef} style={fullStyles.mobileScroller}>
                {memos.map((memo, index) => (
                  <div key={`memo-page-${index}`} style={fullStyles.mobilePage}>
                    <div style={fullStyles.mobileMemoCard}>
                      <p style={fullStyles.mobileMemoCardText}>{memo}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {memos.length > 1 ? (
              <div style={fullStyles.dots}>
                {memos.map((_, index) => (
                  <span
                    key={`memo-dot-${index}`}
                    style={{
                      ...fullStyles.dot,
                      ...(index === activeTab ? fullStyles.dotActive : {}),
                    }}
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

const compactStyles = {
  card: {
    marginBottom: "16px",
    width: "100%",
    minWidth: 0,
  },
  pageTitle: {
    margin: "0 0 12px",
    fontSize: "clamp(26px, 5vw, 40px)",
    lineHeight: 1.15,
    fontWeight: 900,
    color: "var(--text-title)",
    letterSpacing: "-0.02em",
    wordBreak: "break-word",
  },
  contentCol: {
    minWidth: 0,
    display: "grid",
    gap: "12px",
    alignContent: "start",
    width: "100%",
  },
  titleBlock: {
    display: "grid",
    gap: "6px",
    width: "100%",
    minWidth: 0,
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    width: "100%",
    minWidth: 0,
  },
  systemTypeTag: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 800,
    lineHeight: 1,
    background: "var(--soft-bg)",
    color: "var(--text-main)",
    border: "1px solid var(--soft-border)",
    whiteSpace: "nowrap",
  },
  reincarnationRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    minWidth: 0,
  },
  reincarnationBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 800,
    lineHeight: 1,
    background: "var(--warning-bg, var(--soft-bg))",
    color: "var(--warning-text, var(--text-main))",
    border: "1px solid var(--warning-border, var(--soft-border))",
    whiteSpace: "nowrap",
  },
  parentText: {
    fontSize: "14px",
    fontWeight: 700,
    color: "var(--text-sub)",
    whiteSpace: "normal",
    wordBreak: "break-word",
  },
  description: {
    margin: 0,
    color: "var(--text-sub)",
    fontSize: "14px",
    lineHeight: 1.8,
    wordBreak: "break-word",
  },
  metaGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    width: "100%",
    minWidth: 0,
  },
  metaItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    background: "var(--soft-bg)",
    border: "1px solid var(--soft-border)",
    borderRadius: "14px",
    padding: "8px 12px",
    minWidth: 0,
  },
  metaLabel: {
    fontSize: "12px",
    fontWeight: 800,
    color: "var(--text-muted)",
    letterSpacing: "0.04em",
  },
  metaValue: {
    fontSize: "14px",
    fontWeight: 900,
    color: "var(--text-main)",
  },
};

function CompactMonsterInfo({ monster, showName = false }) {
  const description =
    joinDisplayValue(monster?.description) ||
    joinDisplayValue(monster?.note) ||
    "";

  const parentName = getReincarnationParentName(monster);
  const isReincarnated =
    Number(monster?.is_reincarnated) === 1 || monster?.is_reincarnated === true;

  return (
    <section className={moduleStyles.root} style={compactStyles.card}>
      {showName ? <h1 style={compactStyles.pageTitle}>{monster?.name || ""}</h1> : null}

      <div style={compactStyles.contentCol}>
        <div style={compactStyles.titleBlock}>
          <div style={compactStyles.titleRow}>
            {showName && monster?.system_type ? (
              <span style={compactStyles.systemTypeTag}>{monster.system_type}</span>
            ) : null}

            {isReincarnated ? (
              <div style={compactStyles.reincarnationRow}>
                <span style={compactStyles.reincarnationBadge}>転生</span>
                {parentName ? (
                  <span style={compactStyles.parentText}>（{parentName}）</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {description ? <p style={compactStyles.description}>{description}</p> : null}

        {monster?.exp != null || monster?.gold != null ? (
          <div style={compactStyles.metaGrid}>
            {monster?.exp != null ? (
              <div style={compactStyles.metaItem}>
                <span style={compactStyles.metaLabel}>EXP</span>
                <span style={compactStyles.metaValue}>{monster.exp}</span>
              </div>
            ) : null}

            {monster?.gold != null ? (
              <div style={compactStyles.metaItem}>
                <span style={compactStyles.metaLabel}>G</span>
                <span style={compactStyles.metaValue}>{monster.gold}</span>
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
}) {
  if (variant === "compact") {
    return <CompactMonsterInfo monster={monster} showName={showName} />;
  }

  return <FullMonsterInfo monster={monster} />;
}
