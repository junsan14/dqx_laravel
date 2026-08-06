"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  MdOutlineSwipe,
  MdOutlineSwipeLeft,
  MdOutlineSwipeRight,
} from "react-icons/md";
import ProgressIntlLink from "@/components/common/route-progress/ProgressIntlLink";
import ContentReportArea from "@/components/common/content-report-area/ContentReportArea";
import MonsterMapOverlay from "./MonsterMapOverlay";
import styles from "./MapMonsterBrowser.module.css";
import {
  cn,
  compareSpawnsByMonsterDisplayOrder,
  getDisplayValue,
  normalizeText,
  parseAreaList,
} from "./mapMonsterBrowserUtils";

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

export function MapMonsterBrowserContentSkeleton({ hasSelectedMap = false }) {
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

  const orderedSpawns = useMemo(
    () =>
      [...(Array.isArray(spawns) ? spawns : [])].sort((a, b) =>
        compareSpawnsByMonsterDisplayOrder(a, b, monstersById)
      ),
    [spawns, monstersById]
  );

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
  }, [orderedSpawns, mobile]);

  if (!orderedSpawns.length) return null;

  const showSwipeHint = orderedSpawns.length > 1;

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
      {orderedSpawns.map((spawn) => {
        const monster = monstersById[spawn.monster_id];
        const spawnKey =
          spawn.__key ||
          (spawn.id
            ? `spawn-${spawn.id}`
            : `spawn-${spawn.monster_id}-${spawn.map_layer_id ?? "none"}-${normalizeText(spawn.area)}`);
        const emphasized =
          normalizeText(selectedSystemType) &&
          normalizeText(monster?.system_type) === normalizeText(selectedSystemType);

        return (
          <MonsterSpawnCard
            key={spawnKey}
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
    t("report.layerFallback", { id: layer?.id ?? "" });
  const reportTargetLabel = [mapLabel, layerLabel].filter(Boolean).join(" / ");

  const reportFields = [
    { value: "map_name", label: t("report.fields.mapName") },
    { value: "continent_name", label: t("report.fields.continentName") },
    { value: "layer_name", label: t("report.fields.layerName") },
    { value: "floor_no", label: t("report.fields.floorNo") },
    { value: "image", label: t("report.fields.image") },
    { value: "other", label: t("report.fields.other") },
  ];

  const layerReport = canReportLayer ? (
    <ContentReportArea
      reportableType="map_layer"
      reportableId={layerId}
      targetLabel={reportTargetLabel || layerLabel}
      fieldOptions={reportFields}
      context={{
        page: "map-monster-browser",
        map_id: layer?.map_id ?? null,
        map_name: mapLabel || null,
        continent_name: continentLabel || null,
        map_layer_id: layerId,
        layer_name: layerLabel,
        floor_no: layer?.floor_no ?? null,
      }}
      description={t("report.description")}
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

export default function MapMonsterHabitatArea({
  selectedMap = null,
  selectedLayerId = "all",
  mapLayers = [],
  filteredSpawns = [],
  monstersById = {},
  selectedMonsterId = "",
  selectedSystemType = "",
  relatedSelectedMonsterIds = new Set(),
  isMobile = false,
  backHref = "/tools/map-monster-browser",
  mapLabel = "",
  continentLabel = "",
  shouldUseCarousel = false,
  layerSections = [],
}) {
  const t = useTranslations("MapMonsterBrowser");

  return (
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
          monstersById={monstersById}
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
          monstersById={monstersById}
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
              monstersById={monstersById}
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
  );
}
