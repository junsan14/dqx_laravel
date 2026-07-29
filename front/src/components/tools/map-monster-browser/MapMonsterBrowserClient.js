"use client";

import ProgressIntlLink from "@/components/common/ProgressIntlLink";
import SearchableSelect from "@/components/common/SearchableSelect";
import DropdownSelect from "@/components/common/DropdownSelect";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { fetchMaps, fetchMapOptions } from "@/lib/maps";
import { fetchMonsterMapSpawns } from "@/lib/monsterMapSpawns";
import { fetchMonsterDetail, searchMonsters } from "@/lib/monsters";
import MonsterMapOverlay from "./MonsterMapOverlay";
import styles from "./MapMonsterBrowser.module.css";
import PageHeroTitle from "@/components/PageHeroTitle";
import ContentReportArea from "@/components/common/ContentReportArea";
import {
  MdOutlineSwipe,
  MdOutlineSwipeLeft,
  MdOutlineSwipeRight,
} from "react-icons/md";

const MAP_LAYER_REPORT_FIELDS = [
  { value: "map_name", label: "地名" },
  { value: "continent_name", label: "大陸・地域" },
  { value: "layer_name", label: "階層名・フロア名" },
  { value: "floor_no", label: "階層順・フロア番号" },
  { value: "image", label: "マップ画像" },
  { value: "other", label: "その他" },
];

const DROP_SEARCH_MIN_LENGTH = 2;
const DROP_SEARCH_DEBOUNCE_MS = 180;

const mapOptionsRequestCache = new Map();
const mapDataRequestCache = new Map();
const monsterIndexRequestCache = new Map();

function getCachedRequest(cache, key, loader) {
  if (cache.has(key)) {
    return cache.get(key);
  }

  const request = Promise.resolve()
    .then(loader)
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, request);
  return request;
}

function fetchMapOptionsCached(locale) {
  return getCachedRequest(mapOptionsRequestCache, locale, () =>
    fetchMapOptions(locale)
  );
}

function fetchMapDataCached(locale) {
  return getCachedRequest(mapDataRequestCache, locale, () =>
    Promise.all([
      fetchMaps("", locale),
      fetchMonsterMapSpawns(undefined, locale),
    ])
  );
}

function fetchMonsterIndexCached(locale) {
  return getCachedRequest(monsterIndexRequestCache, locale, () =>
    searchMonsters("", "monster", locale)
  );
}

function mergeMonsterRows(previous = {}, rows = []) {
  const next = { ...previous };

  for (const row of Array.isArray(rows) ? rows : []) {
    const id = Number(row?.id ?? row?.monster_id);
    if (!id) continue;

    const existing = next[id] ?? {};
    const monsterName =
      normalizeText(row?.monster_name) ||
      normalizeText(row?.name) ||
      normalizeText(existing?.monster_name) ||
      normalizeText(existing?.name);

    next[id] = {
      ...existing,
      ...row,
      id,
      name: monsterName,
      monster_name: monsterName,
    };
  }

  return next;
}

function buildMonsterSeedsFromSpawns(spawns = []) {
  const rows = [];
  const seen = new Set();

  for (const spawn of Array.isArray(spawns) ? spawns : []) {
    const id = Number(spawn?.monster_id);
    if (!id || seen.has(id)) continue;

    seen.add(id);
    rows.push({
      id,
      name: spawn?.monster_name ?? "",
      monster_name: spawn?.monster_name ?? "",
      system_type: spawn?.system_type ?? "",
      system_type_en: spawn?.system_type_en ?? "",
      display_order: spawn?.monster_display_order ?? 999999,
      is_reincarnated: Boolean(spawn?.is_reincarnated),
      reincarnation_parent_id: spawn?.reincarnation_parent_id ?? null,
    });
  }

  return rows;
}

function getMatchedDropName(monster = {}) {
  const matchedName = normalizeText(monster?.matched_name);
  if (matchedName) return matchedName;

  const matchText = normalizeText(monster?.match_text);
  if (matchText.includes(":")) {
    return normalizeText(matchText.split(":").slice(1).join(":"));
  }

  return matchText || normalizeText(monster?.name);
}

function buildDropSuggestions(monsters = []) {
  const unique = new Map();

  for (const monster of Array.isArray(monsters) ? monsters : []) {
    const label = getMatchedDropName(monster);
    if (!label || unique.has(label)) continue;

    unique.set(label, {
      label,
      searchText: [
        label,
        normalizeText(monster?.matched_name_kana),
        normalizeText(monster?.name_kana),
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  return Array.from(unique.values()).slice(0, 12);
}

function uniqBy(array, keyGetter) {
  const map = new Map();

  for (const item of array) {
    const key = keyGetter(item);
    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function parseAreaList(area) {
  if (!area) return [];

  if (Array.isArray(area)) return area;

  if (typeof area === "string") {
    try {
      const parsed = JSON.parse(area);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      return area
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function sortJa(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), "ja");
}

function useIsMobile(breakpoint = 1200) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleResize() {
      setIsMobile(window.innerWidth < breakpoint);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [breakpoint]);

  return isMobile;
}

function isBrowsableMapType(mapType) {
  const value = normalizeText(mapType).toLowerCase();

  return (
    value === "field" ||
    value === "dungeon" ||
    value === "フィールド" ||
    value === "ダンジョン"
  );
}

function getRelatedMonsterIds(targetMonsterId, monsters = {}) {
  const ids = new Set();

  if (!targetMonsterId) return ids;

  const selected = monsters[targetMonsterId];
  const selectedId = Number(targetMonsterId);

  ids.add(selectedId);

  if (selected?.reincarnation_parent_id) {
    ids.add(Number(selected.reincarnation_parent_id));
  }

  for (const monster of Object.values(monsters)) {
    if (!monster?.id) continue;

    const monsterId = Number(monster.id);
    const parentId = Number(monster.reincarnation_parent_id);

    if (parentId && parentId === selectedId) {
      ids.add(monsterId);
    }

    if (
      selected?.reincarnation_parent_id &&
      parentId === Number(selected.reincarnation_parent_id)
    ) {
      ids.add(monsterId);
    }
  }

  return ids;
}

function getDisplayValue(row, keys = [], fallback = "") {
  if (!row) return fallback;

  for (const key of keys) {
    const value = normalizeText(row?.[key]);
    if (value) return value;
  }

  return fallback;
}

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function MapLocationLabel({ continentLabel, mapLabel }) {
  if (!continentLabel && !mapLabel) return null;

  return (
    <div className="min-w-0 flex-1">
      {continentLabel ? (
        <div className={cn("truncate text-xs", styles.cardHeaderSub)}>
          {continentLabel}
        </div>
      ) : null}

      {mapLabel ? (
        <div
          className={cn(
            "mt-0.5 truncate text-sm font-semibold",
            styles.cardHeaderTitle
          )}
        >
          {mapLabel}
        </div>
      ) : null}
    </div>
  );
}

function MapSkeletonBlock({ className = "" }) {
  return (
    <span
      className={cn(styles.mapSkeletonBlock, className)}
      aria-hidden="true"
    />
  );
}

function MapMonsterBrowserContentSkeleton({ hasSelectedMap = false }) {
  if (!hasSelectedMap) {
    return (
      <div className={styles.mapBrowserSkeletonWrap} aria-hidden="true">
        <div className={styles.mapBrowserSkeletonGrid}>
          <aside className={styles.mapBrowserSkeletonAside}>
            <div className={styles.mapBrowserSkeletonEmptyBox}>
              <MapSkeletonBlock className={styles.mapSkeletonEmptyLine} />
              <MapSkeletonBlock className={styles.mapSkeletonEmptyLineShort} />
            </div>
          </aside>

          <div className={styles.mapBrowserSkeletonEmptyBox}>
            <MapSkeletonBlock className={styles.mapSkeletonEmptyLine} />
            <MapSkeletonBlock className={styles.mapSkeletonEmptyLineShort} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.mapBrowserSkeletonWrap} aria-hidden="true">
      <div className={styles.mapBrowserSkeletonGrid}>
        <aside className={styles.mapBrowserSkeletonAside}>
          <MapSkeletonBlock className={styles.mapSkeletonContinent} />
          <MapSkeletonBlock className={styles.mapSkeletonMapTitle} />
          <MapSkeletonBlock className={styles.mapSkeletonCount} />

          <div className={styles.mapSkeletonSection}>
            <MapSkeletonBlock className={styles.mapSkeletonSectionTitle} />
            <div className={styles.mapSkeletonChipRow}>
              <MapSkeletonBlock className={styles.mapSkeletonChipWide} />
              <MapSkeletonBlock className={styles.mapSkeletonChip} />
              <MapSkeletonBlock className={styles.mapSkeletonChip} />
            </div>
          </div>

          <div className={styles.mapSkeletonSection}>
            <MapSkeletonBlock className={styles.mapSkeletonSectionTitle} />
            <div className={styles.mapSkeletonMonsterGrid}>
              {Array.from({ length: 8 }).map((_, index) => (
                <MapSkeletonBlock
                  key={index}
                  className={styles.mapSkeletonMonsterChip}
                />
              ))}
            </div>
          </div>
        </aside>

        <section className={styles.mapBrowserSkeletonContentCard}>
          <div className={styles.mapBrowserSkeletonHeader}>
            <div className="min-w-0 flex-1">
              <MapSkeletonBlock className={styles.mapSkeletonContinent} />
              <div className="mt-2">
                <MapSkeletonBlock className={styles.mapSkeletonMapTitle} />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <MapSkeletonBlock className={styles.mapSkeletonLayerTabActive} />
              <MapSkeletonBlock className={styles.mapSkeletonLayerTab} />
              <MapSkeletonBlock className={styles.mapSkeletonLayerTabShort} />
            </div>
          </div>

          <div className={styles.mapBrowserSkeletonBody}>
            <div className={styles.mapBrowserSkeletonMapColumn}>
              <MapSkeletonBlock className={styles.mapBrowserSkeletonMap} />
              <div className={styles.mapBrowserSkeletonReportBox}>
                <MapSkeletonBlock className={styles.mapSkeletonReportTitle} />
                <MapSkeletonBlock className={styles.mapSkeletonReportText} />
              </div>
            </div>

            <div className={styles.mapBrowserSkeletonSpawnColumn}>
              <div className={styles.mapBrowserSkeletonSwipeRow}>
                <MapSkeletonBlock className={styles.mapSkeletonSwipeHint} />
              </div>

              <div className={styles.mapBrowserSkeletonSpawnCard}>
                <div className={styles.mapBrowserSkeletonSpawnHeader}>
                  <div className={styles.mapBrowserSkeletonSpawnHeading}>
                    <MapSkeletonBlock className={styles.mapSkeletonMonsterName} />
                    <MapSkeletonBlock className={styles.mapSkeletonSystemBadge} />
                  </div>
                  <MapSkeletonBlock className={styles.mapSkeletonDetailButton} />
                </div>

                <div className={styles.mapBrowserSkeletonStatGrid}>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className={styles.mapBrowserSkeletonStatBox}>
                      <MapSkeletonBlock className={styles.mapSkeletonStatLabel} />
                      <MapSkeletonBlock className={styles.mapSkeletonStatValue} />
                    </div>
                  ))}
                </div>

                <div className={styles.mapBrowserSkeletonMemoBox}>
                  <MapSkeletonBlock className={styles.mapSkeletonMemoLabel} />
                  <MapSkeletonBlock className={styles.mapSkeletonMemoText} />
                </div>

                <div className={styles.mapBrowserSkeletonAreaBox}>
                  <MapSkeletonBlock className={styles.mapSkeletonAreaTitle} />
                  <div className={styles.mapSkeletonChipRow}>
                    <MapSkeletonBlock className={styles.mapSkeletonAreaBadge} />
                    <MapSkeletonBlock className={styles.mapSkeletonAreaBadgeShort} />
                    <MapSkeletonBlock className={styles.mapSkeletonAreaBadge} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MonsterChip({
  active = false,
  onClick,
  children,
  variant = "default",
  emphasized = false,
  className = "",
}) {
  const stateClass =
    variant === "subtle"
      ? active
        ? styles.chipSubtleActive
        : emphasized
          ? styles.chipSubtleEmphasized
          : styles.chipSubtleIdle
      : active
        ? styles.chipDefaultActive
        : emphasized
          ? styles.chipDefaultEmphasized
          : styles.chipDefaultIdle;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(styles.chip, active && styles.chipActive, stateClass, className)}
    >
      {children}
    </button>
  );
}

function StatBox({ label, value }) {
  if (!normalizeText(value)) return null;

  return (
    <div className={styles.statBox}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}

function AreaBadgeList({ area, initialLimit = 4, t }) {
  const [expanded, setExpanded] = useState(false);

  const cells = parseAreaList(area)
    .map((cell) => String(cell ?? "").trim().toUpperCase())
    .filter(Boolean);

  if (cells.length === 0) {
    return (
      <div className={cn("rounded-2xl px-3 py-3", styles.areaWrap)}>
        <div className={cn("text-sm", styles.areaEmpty)}>
          {t("noAreaInfo")}
        </div>
      </div>
    );
  }

  const visibleCells = expanded ? cells : cells.slice(0, initialLimit);

  return (
    <div className={cn("rounded-2xl px-3 py-3", styles.areaWrap)}>
      <div className={cn("mb-2 text-xs font-semibold", styles.areaTitle)}>
        {t("habitatArea")}
      </div>

      <div className="flex flex-wrap gap-2">
        {visibleCells.map((cell, index) => (
          <span
            key={`${cell}-${index}`}
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
              styles.areaBadge
            )}
          >
            {cell}
          </span>
        ))}

        {cells.length > initialLimit && !expanded ? (
          <button
            type="button"
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
              styles.areaMoreButton
            )}
            onClick={() => setExpanded(true)}
          >
            {t("showAll")}
          </button>
        ) : null}

        {expanded && cells.length > initialLimit ? (
          <button
            type="button"
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
              styles.areaMoreButton
            )}
            onClick={() => setExpanded(false)}
          >
            {t("close")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MonsterSpawnCard({
  spawn,
  monster,
  emphasized = false,
  mobile = false,
  backHref = "/tools/map-monster-browser",
  t,
}) {
  const monsterName = getDisplayValue(
    monster,
    ["monster_name", "name"],
    getDisplayValue(spawn, ["monster_name"], t("unknownMonster"))
  );

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl",
        mobile ? styles.spawnCardMobile : styles.spawnCardDesktop
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn("text-base font-bold", styles.monsterName)}>
              <span className={styles.monsterNameLine}>{monsterName}</span>
            </h3>

            {monster?.system_type ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  emphasized ? styles.badgeSystemActive : styles.badgeSystemIdle
                )}
              >
                {monster.system_type}
              </span>
            ) : null}

            {monster?.is_reincarnated ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  styles.badgeReincarnated
                )}
              >
                {t("reincarnated")}
              </span>
            ) : null}
          </div>
        </div>

        {monster?.id ? (
          <ProgressIntlLink
            href={`/tools/monster-search/${monster.id}?back=${encodeURIComponent(backHref)}`}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition",
              styles.detailLink
            )}
          >
            {t("detail")}
          </ProgressIntlLink>
        ) : null}
      </div>

      <div className="px-4">
        <div className={styles.statGrid}>
          <StatBox label={t("spawnCount")} value={spawn?.spawn_count} />
          <StatBox label={t("symbolCount")} value={spawn?.symbol_count} />
          <StatBox label={t("spawnTime")} value={spawn?.spawn_time} />
        </div>
      </div>

      <div className="px-4 pt-3">
        <StatBox label={t("memo")} value={spawn?.note} />
      </div>

      <div className="px-4 pb-4 pt-3">
        <AreaBadgeList area={spawn?.area} t={t} />
      </div>
    </article>
  );
}

function MonsterSpawnCarousel({
  spawns,
  monstersById,
  selectedSystemType,
  mobile = false,
  backHref = "/tools/map-monster-browser",
  t,
}) {
  const scrollerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;

    function updateScrollState() {
      const maxScrollLeft = element.scrollWidth - element.clientWidth;
      const currentLeft = element.scrollLeft;

      setCanScrollLeft(currentLeft > 4);
      setCanScrollRight(currentLeft < maxScrollLeft - 4);
    }

    updateScrollState();

    element.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    return () => {
      element.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [spawns, mobile]);

  if (!spawns.length) return null;

  const showSwipeHint = spawns.length > 1;

  let HintIcon = MdOutlineSwipe;

  if (canScrollLeft && canScrollRight) {
    HintIcon = MdOutlineSwipe;
  } else if (canScrollRight) {
    HintIcon = MdOutlineSwipeRight;
  } else if (canScrollLeft) {
    HintIcon = MdOutlineSwipeLeft;
  }

  const scroller = (
    <div
      ref={scrollerRef}
      className={
        mobile ? styles.cardsMobileScroller : styles.cardsDesktopScroller
      }
    >
      {spawns.map((spawn, index) => {
        const monster = monstersById[spawn.monster_id];
        const emphasized =
          normalizeText(selectedSystemType) &&
          normalizeText(monster?.system_type) === normalizeText(selectedSystemType);

        return (
          <MonsterSpawnCard
            key={spawn.__key || `${spawn.monster_id}-${index}`}
            spawn={spawn}
            monster={monster}
            emphasized={Boolean(emphasized)}
            mobile={mobile}
            backHref={backHref}
            t={t}
          />
        );
      })}
    </div>
  );

  const hint = showSwipeHint ? (
    <div className={styles.swipeHintWrap}>
      <div className={styles.swipeHint}>
        <span className={styles.swipeHintIcon}>
          <HintIcon />
        </span>
      </div>
    </div>
  ) : null;

  if (mobile) {
    return (
      <div className={styles.cardsMobileScrollerOuter}>
        {hint}
        {scroller}
      </div>
    );
  }

  return (
    <div className={styles.cardsDesktopScrollerWrap}>
      {hint}
      {scroller}
    </div>
  );
}

function MapWithCards({
  layer,
  spawns,
  monstersById,
  selectedSystemType,
  isMobile,
  backHref,
  mapLabel,
  continentLabel,
  t,
}) {
  const layerId = Number(layer?.id);
  const canReportLayer = Number.isSafeInteger(layerId) && layerId > 0;
  const layerLabel =
    getDisplayValue(layer, ["map_layer_name", "layer_name", "name"]) ||
    `マップ階層 #${layer?.id ?? ""}`;
  const reportTargetLabel = [mapLabel, layerLabel].filter(Boolean).join(" / ");

  const layerReport = canReportLayer ? (
    <ContentReportArea
      reportableType="map_layer"
      reportableId={layerId}
      targetLabel={reportTargetLabel || layerLabel}
      fieldOptions={MAP_LAYER_REPORT_FIELDS}
      context={{
        page: "map-monster-browser",
        map_id: layer?.map_id ?? null,
        map_name: mapLabel || null,
        continent_name: continentLabel || null,
        map_layer_id: layerId,
        layer_name: layerLabel,
        floor_no: layer?.floor_no ?? null,
      }}
      description="地名・大陸・階層名・フロア番号・マップ画像の間違いを送ってください。"
    />
  ) : null;

  if (isMobile) {
    return (
      <div className="grid gap-4">
        <div className={styles.mapMobileBox}>
          <MonsterMapOverlay
            imagePath={layer?.image_path || layer?.image_url || ""}
            spawns={spawns}
            monstersById={monstersById}
            showMonsterNameInBubble
          />
        </div>

        {layerReport}

        <MonsterSpawnCarousel
          spawns={spawns}
          monstersById={monstersById}
          selectedSystemType={selectedSystemType}
          mobile
          backHref={backHref}
          t={t}
        />
      </div>
    );
  }

  return (
    <div className={styles.mapAndCardsDesktop}>
      <div className="grid min-w-0 gap-3">
        <div className={styles.mapDesktopBox}>
          <MonsterMapOverlay
            imagePath={layer?.image_path || layer?.image_url || ""}
            spawns={spawns}
            monstersById={monstersById}
            showMonsterNameInBubble
          />
        </div>

        {layerReport}
      </div>

      <MonsterSpawnCarousel
        spawns={spawns}
        monstersById={monstersById}
        selectedSystemType={selectedSystemType}
        backHref={backHref}
        t={t}
      />
    </div>
  );
}

function LayerSection({
  layer,
  spawns,
  monstersById,
  selectedMonsterId,
  selectedSystemType,
  relatedSelectedMonsterIds,
  isMobile,
  backHref,
  mapLabel,
  continentLabel,
  t,
}) {
  const filteredLayerSpawns = useMemo(() => {
    return spawns.filter((spawn) => {
      const monster = monstersById[spawn.monster_id];

      if (
        selectedMonsterId &&
        !relatedSelectedMonsterIds.has(Number(spawn.monster_id))
      ) {
        return false;
      }

      if (
        selectedSystemType &&
        normalizeText(monster?.system_type) !== normalizeText(selectedSystemType)
      ) {
        return false;
      }

      return true;
    });
  }, [
    spawns,
    monstersById,
    selectedMonsterId,
    selectedSystemType,
    relatedSelectedMonsterIds,
  ]);

  if (filteredLayerSpawns.length === 0) return null;

  const layerTitle =
    getDisplayValue(layer, ["map_layer_name", "layer_name"]) ||
    t("floorLabel", { floor: layer?.floor_no ?? "" });

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl",
        styles.layerSection,
        isMobile ? styles.layerSectionMobile : styles.layerSectionDesktop
      )}
    >
      <div className={cn("px-4 py-3", styles.cardHeader)}>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <MapLocationLabel
            continentLabel={continentLabel}
            mapLabel={mapLabel}
          />

          <div
            className={cn(
              "max-w-[45%] shrink-0 truncate text-sm font-semibold",
              styles.cardHeaderTitle
            )}
            title={layerTitle}
          >
            {layerTitle}
          </div>
        </div>
      </div>

      <div className={cn("p-4", !isMobile && styles.layerBodyDesktop)}>
        <MapWithCards
          layer={layer}
          spawns={filteredLayerSpawns}
          monstersById={monstersById}
          selectedSystemType={selectedSystemType}
          isMobile={isMobile}
          backHref={backHref}
          mapLabel={mapLabel}
          continentLabel={continentLabel}
          t={t}
        />
      </div>
    </section>
  );
}

function LayerCarousel({
  sections,
  monstersById,
  selectedSystemType,
  isMobile,
  backHref,
  mapLabel,
  continentLabel,
  t,
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const mobileCarouselRef = useRef(null);
  const mobileLayerRafRef = useRef(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [sections]);

  useEffect(() => {
    return () => {
      if (mobileLayerRafRef.current) {
        window.cancelAnimationFrame(mobileLayerRafRef.current);
      }
    };
  }, []);

  function handleMobileLayerChange(nextIndex) {
    if (nextIndex === activeIndex) return;

    const previousTop =
      mobileCarouselRef.current?.getBoundingClientRect().top ?? null;

    setActiveIndex(nextIndex);

    if (previousTop == null) return;

    if (mobileLayerRafRef.current) {
      window.cancelAnimationFrame(mobileLayerRafRef.current);
    }

    mobileLayerRafRef.current = window.requestAnimationFrame(() => {
      mobileLayerRafRef.current = window.requestAnimationFrame(() => {
        const nextTop =
          mobileCarouselRef.current?.getBoundingClientRect().top ?? null;

        if (nextTop == null) return;

        const offset = nextTop - previousTop;

        if (Math.abs(offset) > 0.5) {
          window.scrollBy({
            top: offset,
            left: 0,
            behavior: "auto",
          });
        }
      });
    });
  }

  if (sections.length === 0) return null;

  const current = sections[activeIndex] ?? null;
  if (!current) return null;

  if (isMobile) {
    return (
      <section
        ref={mobileCarouselRef}
        className={cn(
          "overflow-hidden rounded-2xl",
          styles.card,
          styles.mobileLayerCard
        )}
      >
        <div className={cn("px-4 py-3", styles.cardHeader)}>
          <div className={styles.mobileLayerHeader}>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <MapLocationLabel
                continentLabel={continentLabel}
                mapLabel={mapLabel}
              />

              <div
                className={cn(
                  "shrink-0 pt-0.5 text-xs",
                  styles.cardHeaderSub
                )}
              >
                {activeIndex + 1} / {sections.length}
              </div>
            </div>

            <div className={styles.mobileLayerTabs}>
              {sections.map((section, index) => {
                const active = index === activeIndex;
                const layerTitle =
                  getDisplayValue(section.layer, ["map_layer_name", "layer_name"]) ||
                  t("floorLabel", { floor: section.layer?.floor_no ?? "" });

                return (
                  <button
                    key={section.layer.id}
                    type="button"
                    onClick={() => handleMobileLayerChange(index)}
                    className={cn(
                      "shrink-0",
                      styles.layerTab,
                      active ? styles.layerTabActive : styles.layerTabIdle
                    )}
                  >
                    {layerTitle}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className={cn("p-4", styles.mobileLayerContent)}>
          <MapWithCards
            layer={current.layer}
            spawns={current.spawns}
            monstersById={monstersById}
            selectedSystemType={selectedSystemType}
            isMobile
            backHref={backHref}
            mapLabel={mapLabel}
            continentLabel={continentLabel}
            t={t}
          />
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl",
        styles.card,
        styles.layerSectionDesktop
      )}
    >
      <div className={cn("px-4 py-3", styles.cardHeader)}>
        <div className="flex min-w-0 items-center justify-between gap-4">
          <MapLocationLabel
            continentLabel={continentLabel}
            mapLabel={mapLabel}
          />

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {sections.map((section, index) => {
            const active = index === activeIndex;
            const layerTitle =
              getDisplayValue(section.layer, ["map_layer_name", "layer_name"]) ||
              t("floorLabel", { floor: section.layer?.floor_no ?? "" });

            return (
              <button
                key={section.layer.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={cn(
                  styles.layerTab,
                  active ? styles.layerTabActive : styles.layerTabIdle
                )}
              >
                {layerTitle}
              </button>
            );
            })}
          </div>
        </div>
      </div>

      <div className={cn("p-4", styles.layerBodyDesktop)}>
        <MapWithCards
          layer={current.layer}
          spawns={current.spawns}
          monstersById={monstersById}
          selectedSystemType={selectedSystemType}
          isMobile={false}
          backHref={backHref}
          mapLabel={mapLabel}
          continentLabel={continentLabel}
          t={t}
        />
      </div>
    </section>
  );
}

async function fetchMonsterDetailsInBatches(ids, locale, batchSize = 12) {
  const results = [];

  for (let index = 0; index < ids.length; index += batchSize) {
    const batch = ids.slice(index, index + batchSize);
    const rows = await Promise.all(
      batch.map(async (id) => {
        try {
          return await fetchMonsterDetail(id, locale);
        } catch (error) {
          console.error(`Failed to load monster ${id}`, error);
          return null;
        }
      })
    );

    results.push(...rows.filter(Boolean));
  }

  return results;
}

export default function MapMonsterBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("MapMonsterBrowser");
  const isMobile = useIsMobile();

  const labels = useMemo(() => {
    const isJapanese = String(locale).toLowerCase().startsWith("ja");

    return isJapanese
      ? {
          searchMethod: "検索方法",
          searchByMap: "地名で探す",
          searchBySystem: "モンスター系統で探す",
          searchByDrop: "ドロップ品で探す",
          systemSearch: "モンスター系統",
          dropSearch: "ドロップ品",
          selectSystem: "系統を選択してください",
          selectDrop: "ドロップ品を入力してください",
          dropMinLength: "2文字以上入力してください",
          loadingSystems: "系統データを読み込み中...",
          loadingDrops: "ドロップ品を検索中...",
          noSystems: "この大陸には系統データがありません",
          noDrops: "該当するドロップ品がありません",
          filteredMapSearch: "該当する地名",
          selectSystemFirst: "先にモンスター系統を選択してください",
          selectDropFirst: "先にドロップ品を入力してください",
          matchedMaps: (count) => `該当する地名 ${count}件`,
          selectedSystem: (systemType) => `「${systemType}」が出現する地名だけを表示中`,
          selectedDrop: (dropName) => `「${dropName}」を落とすモンスターだけを表示中`,
        }
      : {
          searchMethod: "Search method",
          searchByMap: "Search by map",
          searchBySystem: "Search by monster family",
          searchByDrop: "Search by drop",
          systemSearch: "Monster family",
          dropSearch: "Drop item",
          selectSystem: "Select a monster family",
          selectDrop: "Enter a drop item",
          dropMinLength: "Enter at least 2 characters",
          loadingSystems: "Loading monster families...",
          loadingDrops: "Searching drops...",
          noSystems: "No monster family data is available for this continent",
          noDrops: "No matching drops",
          filteredMapSearch: "Matching maps",
          selectSystemFirst: "Select a monster family first",
          selectDropFirst: "Enter a drop item first",
          matchedMaps: (count) => `${count} matching maps`,
          selectedSystem: (systemType) =>
            `Showing only maps where “${systemType}” appears`,
          selectedDrop: (dropName) =>
            `Showing only monsters that drop “${dropName}”`,
        };
  }, [locale]);

  const [continents, setContinents] = useState([]);
  const [maps, setMaps] = useState([]);
  const [allSpawns, setAllSpawns] = useState([]);
  const [monsterMaster, setMonsterMaster] = useState({});
  const [monsterMasterLocale, setMonsterMasterLocale] = useState(locale);
  const [resolvedMonsterIds, setResolvedMonsterIds] = useState(
    () => new Set()
  );
  const [loading, setLoading] = useState(true);
  const [loadingContinents, setLoadingContinents] = useState(true);
  const [loadingMonsterIndex, setLoadingMonsterIndex] = useState(true);
  const [loadingMonsterMaster, setLoadingMonsterMaster] = useState(false);
  const [error, setError] = useState("");

  const [selectedContinentId, setSelectedContinentId] = useState("");
  const [searchMode, setSearchMode] = useState("map");
  const [selectedMapId, setSelectedMapId] = useState("");
  const [selectedLayerId, setSelectedLayerId] = useState("all");
  const [selectedMonsterId, setSelectedMonsterId] = useState("");
  const [selectedSystemType, setSelectedSystemType] = useState("");
  const [dropKeyword, setDropKeyword] = useState("");
  const [dropSearchResults, setDropSearchResults] = useState([]);
  const [dropSuggestions, setDropSuggestions] = useState([]);
  const [dropSearchLoading, setDropSearchLoading] = useState(false);
  const [dropSearchError, setDropSearchError] = useState("");
  const [dropSearchCompletedQuery, setDropSearchCompletedQuery] = useState("");

  const dropSearchTimerRef = useRef(null);
  const dropSearchCacheRef = useRef(new Map());

  function syncUrl({
    continentId = selectedContinentId,
    mapId = selectedMapId,
    layerId = selectedLayerId,
    mode = searchMode,
    systemType = selectedSystemType,
    dropName = dropKeyword,
  } = {}) {
    const params = new URLSearchParams(searchParams?.toString() || "");

    if (continentId) params.set("continentId", String(continentId));
    else params.delete("continentId");

    if (mapId) params.set("mapId", String(mapId));
    else params.delete("mapId");

    if (layerId && layerId !== "all") params.set("layerId", String(layerId));
    else params.delete("layerId");

    if (mode === "system" || mode === "drop") {
      params.set("searchMode", mode);
    } else {
      params.delete("searchMode");
    }

    if (systemType) params.set("systemType", systemType);
    else params.delete("systemType");

    if (mode === "drop" && normalizeText(dropName)) {
      params.set("dropName", normalizeText(dropName));
    } else {
      params.delete("dropName");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  useEffect(() => {
    const nextContinentId = searchParams?.get("continentId") ?? "";
    const nextMapId = searchParams?.get("mapId") ?? "";
    const nextLayerId = searchParams?.get("layerId") ?? "all";
    const rawSearchMode = searchParams?.get("searchMode");
    const nextSearchMode =
      rawSearchMode === "system" || rawSearchMode === "drop"
        ? rawSearchMode
        : "map";
    const nextSystemType = searchParams?.get("systemType") ?? "";
    const nextDropName = searchParams?.get("dropName") ?? "";

    setSelectedContinentId((previous) =>
      previous === nextContinentId ? previous : nextContinentId
    );
    setSelectedMapId((previous) =>
      previous === nextMapId ? previous : nextMapId
    );
    setSelectedLayerId((previous) =>
      previous === nextLayerId ? previous : nextLayerId
    );
    setSearchMode((previous) =>
      previous === nextSearchMode ? previous : nextSearchMode
    );
    setSelectedSystemType((previous) =>
      previous === nextSystemType ? previous : nextSystemType
    );
    setDropKeyword((previous) =>
      previous === nextDropName ? previous : nextDropName
    );
  }, [searchParams]);

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setLoadingContinents(true);
    setLoadingMonsterIndex(true);
    setLoadingMonsterMaster(false);
    setError("");
    setMonsterMaster({});
    setResolvedMonsterIds(new Set());
    setMonsterMasterLocale(locale);

    fetchMapOptionsCached(locale)
      .then((mapOptions) => {
        if (ignore) return;

        const nextContinents = Array.isArray(mapOptions?.continents)
          ? [...mapOptions.continents]
              .filter((row) => row && row.id != null)
              .sort((a, b) => {
                const aOrder = Number(
                  a?.display_order ?? a?.display_id ?? 0
                );
                const bOrder = Number(
                  b?.display_order ?? b?.display_id ?? 0
                );
                if (aOrder !== bOrder) return aOrder - bOrder;

                return sortJa(
                  getDisplayValue(a, ["continent_name", "name"]),
                  getDisplayValue(b, ["continent_name", "name"])
                );
              })
          : [];

        setContinents(nextContinents);
      })
      .catch((optionsError) => {
        console.error(optionsError);
        if (!ignore) {
          setError(optionsError?.message || t("loadFailed"));
        }
      })
      .finally(() => {
        if (!ignore) setLoadingContinents(false);
      });

    fetchMapDataCached(locale)
      .then(([mapRows, spawnRows]) => {
        if (ignore) return;

        const nextMaps = Array.isArray(mapRows)
          ? mapRows.filter((row) => isBrowsableMapType(row?.map_type))
          : [];
        const nextSpawns = Array.isArray(spawnRows) ? spawnRows : [];

        setMaps(nextMaps);
        setAllSpawns(nextSpawns);
        setMonsterMaster((previous) =>
          mergeMonsterRows(previous, buildMonsterSeedsFromSpawns(nextSpawns))
        );
      })
      .catch((mapDataError) => {
        console.error(mapDataError);
        if (!ignore) {
          setError(mapDataError?.message || t("loadFailed"));
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    fetchMonsterIndexCached(locale)
      .then((monsterRows) => {
        if (ignore) return;

        const safeRows = Array.isArray(monsterRows) ? monsterRows : [];

        setMonsterMaster((previous) =>
          mergeMonsterRows(previous, safeRows)
        );
        setResolvedMonsterIds(
          new Set(
            safeRows
              .map((row) => Number(row?.id))
              .filter(Boolean)
          )
        );
        setMonsterMasterLocale(locale);
      })
      .catch((monsterIndexError) => {
        console.error("Failed to preload monster index", monsterIndexError);
      })
      .finally(() => {
        if (!ignore) setLoadingMonsterIndex(false);
      });

    return () => {
      ignore = true;
    };
  }, [locale, t]);

  useEffect(() => {
    let ignore = false;

    if (dropSearchTimerRef.current) {
      window.clearTimeout(dropSearchTimerRef.current);
      dropSearchTimerRef.current = null;
    }

    if (searchMode !== "drop") {
      setDropSearchLoading(false);
      setDropSearchError("");
      return undefined;
    }

    const query = normalizeText(dropKeyword);

    if (query.length < DROP_SEARCH_MIN_LENGTH) {
      setDropSearchResults([]);
      setDropSuggestions([]);
      setDropSearchLoading(false);
      setDropSearchError("");
      setDropSearchCompletedQuery("");
      return undefined;
    }

    dropSearchTimerRef.current = window.setTimeout(async () => {
      setDropSearchLoading(true);
      setDropSearchError("");

      try {
        const cacheKey = `${locale}:${query.toLocaleLowerCase()}`;
        let rows = dropSearchCacheRef.current.get(cacheKey);

        if (!rows) {
          rows = await searchMonsters(query, "item", locale);
          dropSearchCacheRef.current.set(
            cacheKey,
            Array.isArray(rows) ? rows : []
          );
        }

        if (ignore) return;

        const safeRows = Array.isArray(rows) ? rows : [];
        setDropSearchResults(safeRows);
        setDropSuggestions(buildDropSuggestions(safeRows));
        setDropSearchCompletedQuery(query);
        setMonsterMaster((previous) =>
          mergeMonsterRows(previous, safeRows)
        );
        setResolvedMonsterIds((previous) => {
          const next = new Set(previous);
          for (const row of safeRows) {
            const id = Number(row?.id);
            if (id) next.add(id);
          }
          return next;
        });
        setMonsterMasterLocale(locale);
      } catch (dropError) {
        console.error("Drop search failed", dropError);
        if (!ignore) {
          setDropSearchResults([]);
          setDropSuggestions([]);
          setDropSearchCompletedQuery(query);
          setDropSearchError(dropError?.message || labels.noDrops);
        }
      } finally {
        if (!ignore) setDropSearchLoading(false);
      }
    }, DROP_SEARCH_DEBOUNCE_MS);

    return () => {
      ignore = true;
      if (dropSearchTimerRef.current) {
        window.clearTimeout(dropSearchTimerRef.current);
        dropSearchTimerRef.current = null;
      }
    };
  }, [dropKeyword, locale, searchMode, labels.noDrops]);

  const selectedContinent = useMemo(() => {
    return (
      continents.find(
        (continent) => Number(continent.id) === Number(selectedContinentId)
      ) ?? null
    );
  }, [continents, selectedContinentId]);

  const mapsInContinent = useMemo(() => {
    const rows = selectedContinentId
      ? maps.filter(
          (row) => Number(row.continent_id) === Number(selectedContinentId)
        )
      : [];

    return [...rows].sort((a, b) =>
      sortJa(
        getDisplayValue(a, ["map_name", "name"]),
        getDisplayValue(b, ["map_name", "name"])
      )
    );
  }, [maps, selectedContinentId]);

  const mapIdsInContinent = useMemo(() => {
    return new Set(mapsInContinent.map((map) => Number(map.id)));
  }, [mapsInContinent]);

  const spawnsInContinent = useMemo(() => {
    if (!selectedContinentId || mapIdsInContinent.size === 0) return [];

    return allSpawns.filter((spawn) =>
      mapIdsInContinent.has(Number(spawn.map_id))
    );
  }, [allSpawns, mapIdsInContinent, selectedContinentId]);

  const selectedMap = useMemo(() => {
    return maps.find((row) => Number(row.id) === Number(selectedMapId)) ?? null;
  }, [maps, selectedMapId]);

  const mapLayers = useMemo(() => {
    return Array.isArray(selectedMap?.layers) ? selectedMap.layers : [];
  }, [selectedMap]);

  const spawnsForSelectedMap = useMemo(() => {
    if (!selectedMapId) return [];

    return allSpawns.filter(
      (row) => Number(row.map_id) === Number(selectedMapId)
    );
  }, [allSpawns, selectedMapId]);

  const monsterIdsToLoad = useMemo(() => {
    const source = searchMode === "system" ? spawnsInContinent : spawnsForSelectedMap;

    return Array.from(
      new Set(source.map((spawn) => Number(spawn.monster_id)).filter(Boolean))
    );
  }, [searchMode, spawnsInContinent, spawnsForSelectedMap]);

  useEffect(() => {
    let ignore = false;
    const localeChanged = monsterMasterLocale !== locale;

    if (monsterIdsToLoad.length === 0) {
      setLoadingMonsterMaster(false);

      if (localeChanged) {
        setMonsterMaster({});
        setResolvedMonsterIds(new Set());
        setMonsterMasterLocale(locale);
      }

      return undefined;
    }

    if (loadingMonsterIndex && !localeChanged) {
      setLoadingMonsterMaster(true);
      return undefined;
    }

    const resolvedIds = localeChanged ? new Set() : resolvedMonsterIds;
    const missingIds = monsterIdsToLoad.filter(
      (id) => !resolvedIds.has(Number(id))
    );

    if (missingIds.length === 0) {
      setLoadingMonsterMaster(false);
      return undefined;
    }

    async function fillMonsterDetails() {
      setLoadingMonsterMaster(true);

      try {
        const results = await fetchMonsterDetailsInBatches(missingIds, locale);
        if (ignore) return;

        setMonsterMaster((previous) =>
          mergeMonsterRows(localeChanged ? {} : previous, results)
        );
        setResolvedMonsterIds((previous) => {
          const next = localeChanged ? new Set() : new Set(previous);
          for (const id of missingIds) next.add(Number(id));
          return next;
        });
        setMonsterMasterLocale(locale);
      } finally {
        if (!ignore) setLoadingMonsterMaster(false);
      }
    }

    fillMonsterDetails();

    return () => {
      ignore = true;
    };
  }, [
    locale,
    monsterIdsToLoad,
    monsterMasterLocale,
    resolvedMonsterIds,
    loadingMonsterIndex,
  ]);

  const monsterDetailsReady = useMemo(() => {
    if (monsterMasterLocale !== locale) return false;

    return monsterIdsToLoad.every((id) =>
      resolvedMonsterIds.has(Number(id))
    );
  }, [
    locale,
    monsterIdsToLoad,
    monsterMasterLocale,
    resolvedMonsterIds,
  ]);

  const normalizedDropQuery = useMemo(
    () => normalizeText(dropKeyword),
    [dropKeyword]
  );

  const dropSearchReady =
    normalizedDropQuery.length >= DROP_SEARCH_MIN_LENGTH &&
    normalizeText(dropSearchCompletedQuery) === normalizedDropQuery &&
    !dropSearchLoading &&
    !dropSearchError;

  const dropMatchedMonsterIds = useMemo(() => {
    return new Set(
      dropSearchResults
        .map((monster) => Number(monster?.id))
        .filter(Boolean)
    );
  }, [dropSearchResults]);

  const systemTypesInContinent = useMemo(() => {
    return Array.from(
      new Set(
        spawnsInContinent
          .map((spawn) => monsterMaster[spawn.monster_id]?.system_type)
          .map(normalizeText)
          .filter(Boolean)
      )
    ).sort((a, b) => sortJa(a, b));
  }, [spawnsInContinent, monsterMaster]);

  const mapIdsForSelectedSystem = useMemo(() => {
    if (!selectedSystemType) return new Set();

    const target = normalizeText(selectedSystemType);
    const ids = new Set();

    for (const spawn of spawnsInContinent) {
      const monster = monsterMaster[spawn.monster_id];
      if (normalizeText(monster?.system_type) === target) {
        ids.add(Number(spawn.map_id));
      }
    }

    return ids;
  }, [spawnsInContinent, monsterMaster, selectedSystemType]);

  const mapIdsForSelectedDrop = useMemo(() => {
    if (!dropSearchReady || dropMatchedMonsterIds.size === 0) {
      return new Set();
    }

    const ids = new Set();

    for (const spawn of spawnsInContinent) {
      if (dropMatchedMonsterIds.has(Number(spawn.monster_id))) {
        ids.add(Number(spawn.map_id));
      }
    }

    return ids;
  }, [dropSearchReady, dropMatchedMonsterIds, spawnsInContinent]);

  const mapsForSearch = useMemo(() => {
    if (searchMode === "system") {
      if (!selectedSystemType) return [];

      return mapsInContinent.filter((map) =>
        mapIdsForSelectedSystem.has(Number(map.id))
      );
    }

    if (searchMode === "drop") {
      if (!dropSearchReady) return [];

      return mapsInContinent.filter((map) =>
        mapIdsForSelectedDrop.has(Number(map.id))
      );
    }

    return mapsInContinent;
  }, [
    searchMode,
    mapsInContinent,
    selectedSystemType,
    mapIdsForSelectedSystem,
    dropSearchReady,
    mapIdsForSelectedDrop,
  ]);

  useEffect(() => {
    if (!selectedContinentId || continents.length === 0) return;

    const exists = continents.some(
      (continent) => Number(continent.id) === Number(selectedContinentId)
    );

    if (!exists) {
      setSelectedContinentId("");
      setSelectedMapId("");
      setSelectedLayerId("all");
      setSelectedMonsterId("");
      setSelectedSystemType("");
      setDropKeyword("");
      setDropSearchResults([]);
      setDropSuggestions([]);
      syncUrl({
        continentId: "",
        mapId: "",
        layerId: "all",
        systemType: "",
        dropName: "",
      });
    }
  }, [continents, selectedContinentId]);

  useEffect(() => {
    if (!selectedMapId || loading) return;
    if (searchMode === "system" && loadingMonsterIndex) return;
    if (searchMode === "system" && !monsterDetailsReady) return;
    if (searchMode === "system" && !selectedSystemType) return;
    if (searchMode === "drop" && !dropSearchReady) return;

    const exists = mapsForSearch.some(
      (row) => Number(row.id) === Number(selectedMapId)
    );

    if (!exists) {
      setSelectedMapId("");
      setSelectedLayerId("all");
      setSelectedMonsterId("");
      syncUrl({ mapId: "", layerId: "all" });
    }
  }, [
    mapsForSearch,
    selectedMapId,
    searchMode,
    selectedSystemType,
    monsterDetailsReady,
    dropSearchReady,
    loading,
    loadingMonsterIndex,
  ]);

  useEffect(() => {
    if (loading) return;
    if (!selectedLayerId || selectedLayerId === "all") return;

    const exists = mapLayers.some(
      (layer) => Number(layer.id) === Number(selectedLayerId)
    );

    if (!exists) {
      setSelectedLayerId("all");
      setSelectedMonsterId("");
      syncUrl({ layerId: "all" });
    }
  }, [mapLayers, selectedLayerId, loading]);

  const candidateSpawns = useMemo(() => {
    if (!selectedMapId) return [];
    if (selectedLayerId === "all") return spawnsForSelectedMap;

    return spawnsForSelectedMap.filter(
      (spawn) => Number(spawn.map_layer_id) === Number(selectedLayerId)
    );
  }, [selectedMapId, spawnsForSelectedMap, selectedLayerId]);

  const monstersOnCurrentScope = useMemo(() => {
    const rows = candidateSpawns
      .map((spawn) => monsterMaster[spawn.monster_id])
      .filter(Boolean);

    return uniqBy(rows, (row) => row.id).sort((a, b) => {
      const aOrder = Number(a?.display_order ?? 999999);
      const bOrder = Number(b?.display_order ?? 999999);
      if (aOrder !== bOrder) return aOrder - bOrder;

      return sortJa(
        getDisplayValue(a, ["monster_name", "name"]),
        getDisplayValue(b, ["monster_name", "name"])
      );
    });
  }, [candidateSpawns, monsterMaster]);

  const monstersMatchingPrimarySearch = useMemo(() => {
    if (searchMode !== "drop") return monstersOnCurrentScope;
    if (!dropSearchReady) return [];

    return monstersOnCurrentScope.filter((monster) =>
      dropMatchedMonsterIds.has(Number(monster?.id))
    );
  }, [
    monstersOnCurrentScope,
    searchMode,
    dropSearchReady,
    dropMatchedMonsterIds,
  ]);

  const monstersVisibleInAside = useMemo(() => {
    if (!selectedSystemType) return monstersMatchingPrimarySearch;

    const target = normalizeText(selectedSystemType);
    return monstersMatchingPrimarySearch.filter(
      (monster) => normalizeText(monster?.system_type) === target
    );
  }, [monstersMatchingPrimarySearch, selectedSystemType]);

  const relatedSelectedMonsterIds = useMemo(() => {
    if (!selectedMonsterId) return new Set();
    return getRelatedMonsterIds(selectedMonsterId, monsterMaster);
  }, [selectedMonsterId, monsterMaster]);

  const systemTypesOnCurrentScope = useMemo(() => {
    return Array.from(
      new Set(
        monstersMatchingPrimarySearch
          .map((row) => normalizeText(row.system_type))
          .filter(Boolean)
      )
    ).sort((a, b) => sortJa(a, b));
  }, [monstersMatchingPrimarySearch]);

  const filteredSpawns = useMemo(() => {
    return candidateSpawns.filter((spawn) => {
      const monster = monsterMaster[spawn.monster_id];

      if (
        searchMode === "drop" &&
        (!dropSearchReady ||
          !dropMatchedMonsterIds.has(Number(spawn.monster_id)))
      ) {
        return false;
      }

      if (
        selectedMonsterId &&
        !relatedSelectedMonsterIds.has(Number(spawn.monster_id))
      ) {
        return false;
      }

      if (
        selectedSystemType &&
        normalizeText(monster?.system_type) !== normalizeText(selectedSystemType)
      ) {
        return false;
      }

      return true;
    });
  }, [
    candidateSpawns,
    monsterMaster,
    selectedMonsterId,
    selectedSystemType,
    relatedSelectedMonsterIds,
    searchMode,
    dropSearchReady,
    dropMatchedMonsterIds,
  ]);

  const layerSections = useMemo(() => {
    if (!selectedMap) return [];

    const layers = Array.isArray(selectedMap.layers) ? selectedMap.layers : [];

    return layers
      .map((layer) => {
        const layerSpawns = filteredSpawns.filter(
          (spawn) => Number(spawn.map_layer_id) === Number(layer.id)
        );

        return {
          layer,
          spawns: layerSpawns.map((spawn, index) => ({
            ...spawn,
            __key: `${layer.id}-${spawn.monster_id}-${index}`,
          })),
        };
      })
      .filter((section) => section.spawns.length > 0);
  }, [selectedMap, filteredSpawns]);

  useEffect(() => {
    if (!selectedMonsterId) return;

    const exists = candidateSpawns.some(
      (spawn) =>
        relatedSelectedMonsterIds.has(Number(spawn.monster_id)) ||
        Number(spawn.monster_id) === Number(selectedMonsterId)
    );

    if (!exists) setSelectedMonsterId("");
  }, [candidateSpawns, selectedMonsterId, relatedSelectedMonsterIds]);

  useEffect(() => {
    if (
      !selectedSystemType ||
      searchMode === "system" ||
      loading ||
      loadingMonsterIndex ||
      loadingMonsterMaster
    ) {
      return;
    }

    const exists = systemTypesOnCurrentScope.some(
      (systemType) =>
        normalizeText(systemType) === normalizeText(selectedSystemType)
    );

    if (!exists) {
      setSelectedSystemType("");
      syncUrl({ systemType: "" });
    }
  }, [
    systemTypesOnCurrentScope,
    selectedSystemType,
    searchMode,
    loading,
    loadingMonsterIndex,
    loadingMonsterMaster,
  ]);

  function handleContinentChange(value) {
    setSelectedContinentId(value);
    setSelectedMapId("");
    setSelectedLayerId("all");
    setSelectedMonsterId("");
    setSelectedSystemType("");
    setDropKeyword("");
    setDropSearchResults([]);
    setDropSuggestions([]);
    setDropSearchCompletedQuery("");

    syncUrl({
      continentId: value,
      mapId: "",
      layerId: "all",
      systemType: "",
      dropName: "",
    });
  }

  function handleSearchModeChange(nextMode) {
    const normalizedMode =
      nextMode === "system" || nextMode === "drop" ? nextMode : "map";

    setSearchMode(normalizedMode);
    setSelectedMapId("");
    setSelectedLayerId("all");
    setSelectedMonsterId("");
    setSelectedSystemType("");

    if (normalizedMode !== "drop") {
      setDropKeyword("");
      setDropSearchResults([]);
      setDropSuggestions([]);
      setDropSearchCompletedQuery("");
    }

    syncUrl({
      mode: normalizedMode,
      mapId: "",
      layerId: "all",
      systemType: "",
      dropName: normalizedMode === "drop" ? dropKeyword : "",
    });
  }

  function handleSearchSystemChange(systemType) {
    setSelectedSystemType(systemType);
    setSelectedMapId("");
    setSelectedLayerId("all");
    setSelectedMonsterId("");

    syncUrl({
      mapId: "",
      layerId: "all",
      mode: "system",
      systemType,
      dropName: "",
    });
  }

  function handleDropKeywordChange(nextValue, option) {
    const nextKeyword = String(nextValue ?? "");

    setDropKeyword(nextKeyword);
    setSelectedMapId("");
    setSelectedLayerId("all");
    setSelectedMonsterId("");
    setSelectedSystemType("");

    if (!normalizeText(nextKeyword)) {
      setDropSearchResults([]);
      setDropSuggestions([]);
      setDropSearchCompletedQuery("");
    }

    if (option || !normalizeText(nextKeyword)) {
      syncUrl({
        mapId: "",
        layerId: "all",
        mode: "drop",
        systemType: "",
        dropName: nextKeyword,
      });
    }
  }

  function handleMapChange(value) {
    const nextSystemType = searchMode === "system" ? selectedSystemType : "";

    setSelectedMapId(value);
    setSelectedLayerId("all");
    setSelectedMonsterId("");
    setSelectedSystemType(nextSystemType);

    syncUrl({
      mapId: value,
      layerId: "all",
      systemType: nextSystemType,
      dropName: searchMode === "drop" ? dropKeyword : "",
    });
  }

  function handleLayerChange(nextLayerId) {
    setSelectedLayerId(nextLayerId);
    setSelectedMonsterId("");
    syncUrl({ layerId: nextLayerId });
  }

  function handleMonsterToggle(monsterId) {
    if (Number(selectedMonsterId) === Number(monsterId)) {
      setSelectedMonsterId("");
      return;
    }

    setSelectedMonsterId(monsterId);

    if (searchMode !== "system") {
      setSelectedSystemType("");
      syncUrl({ systemType: "" });
    }
  }

  function handleSystemTypeToggle(systemType) {
    const isActive =
      normalizeText(selectedSystemType) === normalizeText(systemType);

    if (isActive && searchMode === "system") return;

    const nextSystemType = isActive ? "" : systemType;
    setSelectedSystemType(nextSystemType);
    setSelectedMonsterId("");
    syncUrl({ systemType: nextSystemType });
  }

  const shouldUseCarousel =
    selectedLayerId === "all" && layerSections.length > 1;

  const backHref = useMemo(() => {
    const query = searchParams?.toString?.() || "";
    return query
      ? `/tools/map-monster-browser?${query}`
      : "/tools/map-monster-browser";
  }, [searchParams]);

  const continentLabel = getDisplayValue(
    selectedMap,
    ["continent_name", "continent"],
    getDisplayValue(selectedContinent, ["continent_name", "name"], "")
  );

  const mapLabel = getDisplayValue(selectedMap, ["map_name", "name"], "");

  const mapSearchDisabled =
    loading ||
    !selectedContinentId ||
    (searchMode === "system" &&
      (!selectedSystemType || !monsterDetailsReady)) ||
    (searchMode === "drop" && !dropSearchReady);

  const mapPlaceholder = !selectedContinentId
    ? t("selectContinentFirst")
    : loading
      ? t("loadingContinentData")
      : searchMode === "system" &&
          (loadingMonsterIndex || !monsterDetailsReady)
        ? labels.loadingSystems
        : searchMode === "system" && !selectedSystemType
          ? labels.selectSystemFirst
          : searchMode === "drop" &&
              normalizedDropQuery.length < DROP_SEARCH_MIN_LENGTH
            ? labels.selectDropFirst
            : searchMode === "drop" && dropSearchLoading
              ? labels.loadingDrops
              : t("mapPlaceholder");

  const dropEmptyText = dropSearchError
    ? dropSearchError
    : dropSearchLoading
      ? labels.loadingDrops
      : normalizedDropQuery.length < DROP_SEARCH_MIN_LENGTH
        ? labels.dropMinLength
        : labels.noDrops;

  return (
    <main className={styles.page}>
      <PageHeroTitle kicker="DQX MAP DATABASE" title={t("title")} />

      <div className={styles.filterPanel}>
        <div className={styles.filterField}>
          <span className={styles.labelText}>{t("continent")}</span>
          <SearchableSelect
            disabled={loadingContinents}
            value={selectedContinentId}
            onChange={handleContinentChange}
            options={continents}
            selectOnFocus
            placeholder={
              loadingContinents
                ? t("loadingContinentData")
                : t("continentPlaceholder")
            }
            emptyText={t("noCandidates")}
            ariaLabel={t("continent")}
            getOptionValue={(option) => option?.id}
            getOptionLabel={(option) =>
              getDisplayValue(option, ["continent_name", "name"], "")
            }
            getOptionSearchText={(option) =>
              [
                getDisplayValue(option, ["continent_name", "name"], ""),
                normalizeText(option?.continent_name_en ?? option?.name_en),
              ]
                .filter(Boolean)
                .join(" ")
            }
            sortOptions={(a, b) => {
              const aOrder = Number(a?.display_order ?? 0);
              const bOrder = Number(b?.display_order ?? 0);

              if (aOrder !== bOrder) return aOrder - bOrder;

              return sortJa(
                getDisplayValue(a, ["continent_name", "name"]),
                getDisplayValue(b, ["continent_name", "name"])
              );
            }}
          />
        </div>

        <div className={styles.filterField}>
          <span className={styles.labelText}>{labels.searchMethod}</span>
          <DropdownSelect
            value={searchMode}
            onChange={handleSearchModeChange}
            ariaLabel={labels.searchMethod}
            options={[
              { value: "map", label: labels.searchByMap },
              { value: "system", label: labels.searchBySystem },
              { value: "drop", label: labels.searchByDrop },
            ]}
          />
        </div>

        {searchMode === "system" ? (
          <div className={styles.filterField}>
            <span className={styles.labelText}>{labels.systemSearch}</span>
            <DropdownSelect
              value={selectedSystemType}
              onChange={handleSearchSystemChange}
              disabled={
                !selectedContinentId ||
                loading ||
                loadingMonsterIndex ||
                !monsterDetailsReady
              }
              ariaLabel={labels.systemSearch}
              options={[
                {
                  value: "",
                  label: !selectedContinentId
                    ? labels.selectSystem
                    : loading || loadingMonsterIndex || !monsterDetailsReady
                      ? labels.loadingSystems
                      : systemTypesInContinent.length === 0
                        ? labels.noSystems
                        : labels.selectSystem,
                },
                ...systemTypesInContinent.map((systemType) => ({
                  value: systemType,
                  label: systemType,
                })),
              ]}
            />
          </div>
        ) : null}

        {searchMode === "drop" ? (
          <div className={styles.filterField}>
            <span className={styles.labelText}>{labels.dropSearch}</span>
            <SearchableSelect
              value={dropKeyword}
              onChange={handleDropKeywordChange}
              options={dropSuggestions}
              disabled={!selectedContinentId}
              placeholder={
                selectedContinentId ? labels.selectDrop : t("selectContinentFirst")
              }
              emptyText={dropEmptyText}
              maxResults={12}
              allowCustomValue
              selectOnFocus
              selectSingleOnEnter
              ariaLabel={labels.dropSearch}
              getOptionValue={(option) => option?.label ?? ""}
              getOptionLabel={(option) => option?.label ?? ""}
              getOptionSearchText={(option) =>
                option?.searchText || option?.label || ""
              }
            />
          </div>
        ) : null}

        <div
          className={cn(
            styles.filterField,
            styles.mapField,
            searchMode === "map" && styles.mapFieldWide
          )}
        >
          <span className={styles.labelText}>
            {searchMode === "system" || searchMode === "drop"
              ? labels.filteredMapSearch
              : t("mapSearch")}
          </span>
          <SearchableSelect
            disabled={mapSearchDisabled}
            value={selectedMapId}
            onChange={handleMapChange}
            options={mapsForSearch}
            placeholder={mapPlaceholder}
            selectOnFocus
            emptyText={t("noCandidates")}
            ariaLabel={
              searchMode === "system" || searchMode === "drop"
                ? labels.filteredMapSearch
                : t("mapSearch")
            }
            getOptionValue={(option) => option?.id}
            getOptionLabel={(option) =>
              getDisplayValue(option, ["map_name", "name"], "")
            }
            getOptionSearchText={(option) =>
              [
                getDisplayValue(option, ["map_name", "name"], ""),
                normalizeText(option?.map_name_en ?? option?.name_en),
              ]
                .filter(Boolean)
                .join(" ")
            }
            sortOptions={(a, b) =>
              sortJa(
                getDisplayValue(a, ["map_name", "name"]),
                getDisplayValue(b, ["map_name", "name"])
              )
            }
          />
          {searchMode === "system" &&
          selectedSystemType &&
          monsterDetailsReady ? (
            <div className={styles.searchInfo}>
              {labels.matchedMaps(mapsForSearch.length)}
            </div>
          ) : null}

          {searchMode === "drop" && dropSearchReady ? (
            <div className={styles.searchInfo}>
              {labels.matchedMaps(mapsForSearch.length)}
            </div>
          ) : null}
        </div>

        <div className={styles.filterField}>
          <span className={styles.labelText}>{t("displayLayer")}</span>
          <DropdownSelect
            value={selectedLayerId}
            onChange={handleLayerChange}
            disabled={!selectedMap}
            ariaLabel={t("displayLayer")}
            options={[
              { value: "all", label: t("all") },
              ...mapLayers.map((layer) => ({
                value: String(layer.id),
                label:
                  getDisplayValue(layer, ["map_layer_name", "layer_name"]) ||
                  t("floorLabel", { floor: layer.floor_no ?? "" }),
              })),
            ]}
          />
        </div>
      </div>

      {searchMode === "system" && selectedSystemType ? (
        <div className={styles.searchInfo}>
          {labels.selectedSystem(selectedSystemType)}
        </div>
      ) : null}

      {searchMode === "drop" && dropSearchReady ? (
        <div className={styles.searchInfo}>
          {labels.selectedDrop(normalizedDropQuery)}
        </div>
      ) : null}

      {loading ? (
        <>
          <span
            className={styles.visuallyHidden}
            role="status"
            aria-live="polite"
          >
            {t("loadingContinentData")}
          </span>
          <MapMonsterBrowserContentSkeleton
            hasSelectedMap={Boolean(selectedMapId)}
          />
        </>
      ) : null}

      {error ? (
        <div className={cn("mt-6 p-4", styles.errorBox)}>{error}</div>
      ) : null}

      {!loading && !error ? (
        <div
          className={cn(
            "mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]",
            styles.pageColumnsDesktop
          )}
        >
          <aside className={cn("rounded-2xl p-4", styles.asideCard)}>
            {selectedMap ? (
              <>
                <div className={cn("text-sm", styles.continentText)}>
                  {continentLabel}
                </div>

                <h2 className={cn("mt-1 text-xl font-bold", styles.mapTitle)}>
                  {mapLabel}
                </h2>

                <div className={cn("mt-2 text-sm", styles.countText)}>
                  {t("countShown", { count: filteredSpawns.length })}
                </div>

                <div className="mt-6">
                  <div
                    className={cn(
                      "mb-2 text-sm font-semibold",
                      styles.sectionTitle
                    )}
                  >
                    {t("systemType")}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {systemTypesOnCurrentScope.length === 0 ? (
                      <div
                        className={cn(
                          "rounded-2xl px-3 py-2 text-sm",
                          styles.emptyDashed
                        )}
                      >
                        {t("noSystemType")}
                      </div>
                    ) : (
                      systemTypesOnCurrentScope.map((systemType) => (
                        <MonsterChip
                          key={systemType}
                          active={
                            normalizeText(systemType) ===
                            normalizeText(selectedSystemType)
                          }
                          onClick={() => handleSystemTypeToggle(systemType)}
                        >
                          {systemType}
                        </MonsterChip>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-6">
                  <div
                    className={cn(
                      "mb-2 text-sm font-semibold",
                      styles.sectionTitle
                    )}
                  >
                    {t("monster")}
                  </div>

                  <div className={styles.monsterGrid}>
                    {monstersVisibleInAside.length === 0 ? (
                      <div
                        className={cn(
                          "rounded-2xl px-3 py-2 text-sm",
                          styles.emptyDashed,
                          styles.monsterGridEmpty
                        )}
                      >
                        {t("noMonster")}
                      </div>
                    ) : (
                      monstersVisibleInAside.map((monster) => {
                        const emphasized =
                          selectedMonsterId &&
                          relatedSelectedMonsterIds.has(Number(monster.id));

                        const monsterLabel = getDisplayValue(
                          monster,
                          ["monster_name", "name"],
                          t("unknownMonster")
                        );

                        return (
                          <MonsterChip
                            key={monster.id}
                            active={
                              Number(selectedMonsterId) === Number(monster.id)
                            }
                            emphasized={Boolean(emphasized)}
                            onClick={() => handleMonsterToggle(monster.id)}
                            className={styles.monsterGridChip}
                          >
                            <span className={styles.monsterGridChipContent}>
                              <span className={styles.monsterGridChipName}>
                                {monsterLabel}
                              </span>
                              {monster.is_reincarnated ? (
                                <span
                                  className={cn(
                                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                                    styles.reincarnationMiniBadge,
                                    styles.monsterGridReincarnationBadge
                                  )}
                                >
                                  {t("reincarnated")}
                                </span>
                              ) : null}
                            </span>
                          </MonsterChip>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div
                className={cn(
                  "rounded-2xl px-4 py-5 text-sm",
                  styles.emptyDashed
                )}
              >
                {t("emptyGuide")}
              </div>
            )}
          </aside>

          <div className={styles.rightColumnDesktop}>
            {!selectedMap ? (
              <div
                className={cn(
                  "rounded-2xl px-4 py-5 text-sm",
                  styles.emptyDashed
                )}
              >
                {t("selectMap")}
              </div>
            ) : selectedLayerId !== "all" ? (
              <LayerSection
                layer={
                  mapLayers.find(
                    (layer) => Number(layer.id) === Number(selectedLayerId)
                  ) ?? null
                }
                spawns={filteredSpawns}
                monstersById={monsterMaster}
                selectedMonsterId={selectedMonsterId}
                selectedSystemType={selectedSystemType}
                relatedSelectedMonsterIds={relatedSelectedMonsterIds}
                isMobile={isMobile}
                backHref={backHref}
                mapLabel={mapLabel}
                continentLabel={continentLabel}
                t={t}
              />
            ) : shouldUseCarousel ? (
              <LayerCarousel
                sections={layerSections}
                monstersById={monsterMaster}
                selectedSystemType={selectedSystemType}
                isMobile={isMobile}
                backHref={backHref}
                mapLabel={mapLabel}
                continentLabel={continentLabel}
                t={t}
              />
            ) : layerSections.length > 0 ? (
              <div className="grid gap-4">
                {layerSections.map((section) => (
                  <LayerSection
                    key={section.layer.id}
                    layer={section.layer}
                    spawns={section.spawns}
                    monstersById={monsterMaster}
                    selectedMonsterId={selectedMonsterId}
                    selectedSystemType={selectedSystemType}
                    relatedSelectedMonsterIds={relatedSelectedMonsterIds}
                    isMobile={isMobile}
                    backHref={backHref}
                    mapLabel={mapLabel}
                    continentLabel={continentLabel}
                    t={t}
                  />
                ))}
              </div>
            ) : (
              <div
                className={cn(
                  "rounded-2xl px-4 py-5 text-sm",
                  styles.emptyDashed
                )}
              >
                {t("noMatchedMonster")}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
