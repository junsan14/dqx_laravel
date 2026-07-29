"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { getMonsterAssetUrl } from "@/lib/monsters";
import styles from "./MonsterDrops.module.css";

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function MonsterImageCard({ monster }) {
  const t = useTranslations("MonsterDropSection");
  const [hasError, setHasError] = useState(false);
  const imageUrl = useMemo(
    () => (monster?.image_path ? getMonsterAssetUrl(monster.image_path) : ""),
    [monster?.image_path]
  );

  if (!imageUrl || hasError) {
    return <div className={styles.imagePlaceholder} aria-label={t("noImage")}>👾</div>;
  }

  return (
    <div className={styles.imageFrame}>
      <Image
        src={imageUrl}
        alt={monster?.name || t("imageAlt")}
        fill
        unoptimized
        sizes="(max-width: 920px) 84px, 165px"
        onError={() => setHasError(true)}
        className={styles.image}
      />
    </div>
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

function normalizeList(list) {
  return Array.isArray(list) ? list.filter(Boolean) : [];
}

function getDropName(drop, t) {
  return (
    drop?.item_name ||
    drop?.equipment_name ||
    drop?.orb_name ||
    drop?.name ||
    t("unknown")
  );
}

function getOrbColor(orb) {
  return orb?.orb_color || orb?.matched_color || orb?.color || orb?.attribute || "";
}

function getOrbColorClass(color) {
  return {
    炎: styles.orbFlame,
    水: styles.orbWater,
    風: styles.orbWind,
    雷: styles.orbLightning,
    土: styles.orbEarth,
    光: styles.orbLight,
    闇: styles.orbDark,
  }[String(color || "").trim()] || styles.orbDefault;
}

function uniqueByNameWithType(list, t) {
  const map = new Map();

  for (const item of list) {
    const name = getDropName(item, t).trim();
    if (!name) continue;

    const currentType = item?.__drop_kind || "normal";
    if (!map.has(name)) {
      map.set(name, { ...item, __display_name: name, __drop_kind: currentType });
      continue;
    }

    const existing = map.get(name);
    if (existing.__drop_kind !== "rare" && currentType === "rare") {
      map.set(name, { ...existing, __drop_kind: "rare" });
    }
  }

  return Array.from(map.values());
}

function DropTagList({ items, t }) {
  if (!items.length) return <div className={styles.emptyBox}>{t("noData")}</div>;

  return (
    <div className={styles.tagList}>
      {items.map((item, index) => {
        const isRare = item.__drop_kind === "rare";
        return (
          <span key={`${item?.id ?? item?.__display_name ?? "item"}-${index}`} className={styles.itemTag}>
            <span className={cx(styles.kindBadge, isRare ? styles.kindBadgeRare : styles.kindBadgeNormal)}>
              {isRare ? t("rare") : t("normal")}
            </span>
            <span className={styles.itemTagText}>{item.__display_name}</span>
          </span>
        );
      })}
    </div>
  );
}

function WhiteBoxTagList({ items, t }) {
  if (!items.length) return <div className={styles.emptyBox}>{t("noData")}</div>;

  return (
    <div className={styles.tagList}>
      {items.map((item, index) => (
        <span key={`${item?.id ?? item?.name ?? "whitebox"}-${index}`} className={styles.itemTag}>
          <span className={cx(styles.kindBadge, styles.kindBadgeEquipment)}>{t("whiteBox")}</span>
          <span className={styles.itemTagText}>{getDropName(item, t)}</span>
        </span>
      ))}
    </div>
  );
}

function OrbTagList({ items, t }) {
  if (!items.length) return <div className={styles.emptyBox}>{t("noData")}</div>;

  return (
    <div className={styles.tagList}>
      {items.map((item, index) => {
        const color = getOrbColor(item);
        return (
          <span key={`${item?.id ?? item?.__display_name ?? "orb"}-${index}`} className={styles.itemTag}>
            {color ? (
              <span className={cx(styles.orbColorBadge, getOrbColorClass(color))}>
                {t(`orbColors.${color}`, { default: color })}
              </span>
            ) : null}
            <span className={styles.itemTagText}>{item.__display_name || getDropName(item, t)}</span>
          </span>
        );
      })}
    </div>
  );
}

function Panel({ title, children, isMobile }) {
  return (
    <section className={styles.panel}>
      {!isMobile ? (
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>{title}</h3>
        </div>
      ) : null}
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

export default function MonsterDrops({
  monster,
  showMonsterImage = false,
  normalDrops = [],
  rareDrops = [],
  accessoryDrops = [],
  whiteBoxDrops = [],
  orbDrops = [],
}) {
  const t = useTranslations("MonsterDropSection");
  const isMobile = useIsMobile();
  const scrollerRef = useRef(null);
  const [activeTab, setActiveTab] = useState(0);
  const isProgrammaticScrollRef = useRef(false);
  const hasMonsterImage = showMonsterImage && Boolean(monster?.image_path);

  const mergedDrops = useMemo(
    () =>
      uniqueByNameWithType(
        [
          ...normalizeList(normalDrops).map((item) => ({ ...item, __drop_kind: "normal" })),
          ...normalizeList(rareDrops).map((item) => ({ ...item, __drop_kind: "rare" })),
          ...normalizeList(accessoryDrops).map((item) => ({ ...item, __drop_kind: "rare" })),
        ],
        t
      ),
    [normalDrops, rareDrops, accessoryDrops, t]
  );

  const whiteBoxes = useMemo(() => normalizeList(whiteBoxDrops), [whiteBoxDrops]);
  const orbs = useMemo(
    () => normalizeList(orbDrops).map((item) => ({ ...item, __display_name: getDropName(item, t) })),
    [orbDrops, t]
  );

  const tabs = useMemo(
    () => [
      {
        key: "drops",
        label: t("tabs.drops"),
        content: <DropTagList items={mergedDrops} t={t} />,
      },
      {
        key: "whitebox",
        label: t("tabs.equipment"),
        content: <WhiteBoxTagList items={whiteBoxes} t={t} />,
      },
      {
        key: "orb",
        label: t("tabs.orb"),
        content: <OrbTagList items={orbs} t={t} />,
      },
    ],
    [mergedDrops, whiteBoxes, orbs, t]
  );

  useEffect(() => {
    if (!isMobile) return undefined;
    const element = scrollerRef.current;
    if (!element) return undefined;

    isProgrammaticScrollRef.current = true;
    element.scrollTo({ left: (element.clientWidth || 1) * activeTab, behavior: "smooth" });
    const timer = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 350);
    return () => clearTimeout(timer);
  }, [activeTab, isMobile]);

  useEffect(() => {
    if (!isMobile) return undefined;
    const element = scrollerRef.current;
    if (!element) return undefined;

    function handleScroll() {
      if (isProgrammaticScrollRef.current) return;
      const nextTab = Math.round(element.scrollLeft / (element.clientWidth || 1));
      if (nextTab >= 0 && nextTab < tabs.length && nextTab !== activeTab) {
        setActiveTab(nextTab);
      }
    }

    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => element.removeEventListener("scroll", handleScroll);
  }, [activeTab, isMobile, tabs.length]);

  return (
    <section className={styles.root}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{t("title")}</h2>
      </div>

      <div className={styles.outerGrid}>
        {isMobile ? (
          <div className={styles.tabsRow}>
            {tabs.map((tab, index) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(index)}
                className={cx(styles.tabButton, index === activeTab && styles.tabButtonActive)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className={cx(styles.contentRow, hasMonsterImage && styles.contentRowWithImage)}>
          <div className={styles.leftWrap}>
            {isMobile ? (
              <div className={styles.mobileContentViewport}>
                <div ref={scrollerRef} className={styles.mobileScroller}>
                  {tabs.map((tab) => (
                    <div key={tab.key} className={styles.mobilePage}>
                      <Panel title={tab.label} isMobile>
                        {tab.content}
                      </Panel>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.desktopPanels}>
                {tabs.map((tab) => (
                  <Panel key={tab.key} title={tab.label}>
                    {tab.content}
                  </Panel>
                ))}
              </div>
            )}
          </div>

          {hasMonsterImage ? (
            <div className={styles.rightWrap}>
              <MonsterImageCard monster={monster} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
