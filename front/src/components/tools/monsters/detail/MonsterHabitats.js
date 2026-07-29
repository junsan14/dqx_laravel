"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { FcLike } from "react-icons/fc";
import { FaMoon } from "react-icons/fa6";
import { IoSunnyOutline } from "react-icons/io5";
import { getMonsterAssetUrl } from "@/lib/monsters";
import styles from "./MonsterHabitats.module.css";

const GRID_SIZE = 8;
const ORIGINAL_IMAGE_WIDTH = 490;
const ORIGINAL_IMAGE_HEIGHT = 565;
const CROP_TOP_PX = ORIGINAL_IMAGE_HEIGHT - ORIGINAL_IMAGE_WIDTH;
const TOP_AXIS_PX = 13;
const LEFT_AXIS_PX = 3.3;
const RIGHT_TRIM_PX = 0;
const BOTTOM_TRIM_PX = 0;

/**
 * 位置微調整
 */
const BUBBLE_OFFSET_X_PERCENT = 3;
const BUBBLE_OFFSET_Y_PERCENT = 3;

/**
 * 長方形サイズ調整
 * 1.0 だとほぼセルいっぱい
 * 0.88〜0.94 くらいが見やすい
 */
const BUBBLE_WIDTH_SCALE = 1;
const BUBBLE_HEIGHT_SCALE = 1;

/**
 * 長方形の角丸
 */


/**
 * 長方形の内側余白
 */
const BUBBLE_INNER_PADDING_CELLS = 0.08;

const GRID_SOURCE_X = LEFT_AXIS_PX;
const GRID_SOURCE_Y = CROP_TOP_PX + TOP_AXIS_PX;

const GRID_SOURCE_SIZE = Math.min(
  ORIGINAL_IMAGE_WIDTH - LEFT_AXIS_PX - RIGHT_TRIM_PX,
  ORIGINAL_IMAGE_HEIGHT - GRID_SOURCE_Y - BOTTOM_TRIM_PX
);

const MAP_CROP = {
  sourceX: GRID_SOURCE_X,
  sourceY: GRID_SOURCE_Y,
  sourceSize: GRID_SOURCE_SIZE,
  widthPercent: (ORIGINAL_IMAGE_WIDTH / GRID_SOURCE_SIZE) * 100,
  heightPercent: (ORIGINAL_IMAGE_HEIGHT / GRID_SOURCE_SIZE) * 100,
  offsetXPercent: (GRID_SOURCE_X / ORIGINAL_IMAGE_WIDTH) * 100,
  offsetYPercent: (GRID_SOURCE_Y / ORIGINAL_IMAGE_HEIGHT) * 100,
};

function useOverlayIsMobile(breakpoint = 920) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleResize() {
      setIsMobile(window.innerWidth < breakpoint);
    }

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [breakpoint]);

  return isMobile;
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

function normalizeAreaCell(value) {
  if (!value) return null;

  const raw = String(value).trim().toUpperCase().replace(/[^A-H1-8]/g, "");
  const match = raw.match(/^([A-H])([1-8])$/);
  if (!match) return null;

  return `${match[1]}${match[2]}`;
}

function parseCell(cell) {
  const normalized = normalizeAreaCell(cell);
  if (!normalized) return null;

  const col = normalized.charCodeAt(0) - "A".charCodeAt(0);
  const row = Number(normalized.slice(1)) - 1;

  if (col < 0 || col >= GRID_SIZE || row < 0 || row >= GRID_SIZE) return null;

  return {
    col,
    row,
    key: normalized,
    label: normalized,
  };
}

function collectUniqueCells(spawns = []) {
  const seen = new Set();
  const result = [];

  spawns.forEach((spawn) => {
    const cells = parseAreaList(spawn?.area ?? spawn?.coords)
      .map(normalizeAreaCell)
      .filter(Boolean);

    for (const cell of cells) {
      if (seen.has(cell)) continue;
      seen.add(cell);

      const parsed = parseCell(cell);
      if (parsed) result.push(parsed);
    }
  });

  return result;
}

function compareCells(a, b) {
  if (a.row !== b.row) return a.row - b.row;
  return a.col - b.col;
}

function buildRectLabel(cells = []) {
  return cells
    .map((cell) => cell.label)
    .sort((a, b) => a.localeCompare(b, "ja"))
    .join(", ");
}

function buildShortLabel(cells = []) {
  if (!cells.length) return "";

  const sorted = [...cells].sort(compareCells);

  if (sorted.length === 1) return sorted[0].label;
  if (sorted.length === 2) return `${sorted[0].label}, ${sorted[1].label}`;

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return `${first.label}〜${last.label}`;
}

function areCellsOrthogonallyAdjacent(a, b) {
  const colDiff = Math.abs(a.col - b.col);
  const rowDiff = Math.abs(a.row - b.row);

  return colDiff + rowDiff === 1;
}

function buildMergedGroups(cells = []) {
  if (!cells.length) return [];

  const sortedCells = [...cells].sort(compareCells);
  const visited = new Set();
  const groups = [];

  for (let i = 0; i < sortedCells.length; i += 1) {
    if (visited.has(i)) continue;

    const stack = [i];
    visited.add(i);

    const groupCells = [];

    while (stack.length) {
      const currentIndex = stack.pop();
      const current = sortedCells[currentIndex];
      groupCells.push(current);

      for (let j = 0; j < sortedCells.length; j += 1) {
        if (visited.has(j)) continue;

        const target = sortedCells[j];

        if (areCellsOrthogonallyAdjacent(current, target)) {
          visited.add(j);
          stack.push(j);
        }
      }
    }

    const normalizedCells = groupCells.sort(compareCells);

    groups.push({
      cells: normalizedCells,
      minCol: Math.min(...normalizedCells.map((cell) => cell.col)),
      maxCol: Math.max(...normalizedCells.map((cell) => cell.col)),
      minRow: Math.min(...normalizedCells.map((cell) => cell.row)),
      maxRow: Math.max(...normalizedCells.map((cell) => cell.row)),
      label: buildRectLabel(normalizedCells),
      shortLabel: buildShortLabel(normalizedCells),
      isMerged: normalizedCells.length > 1,
    });
  }

  return groups;
}

function normalizeMetaValue(value) {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (text === "[]" || text === "null" || text === "undefined") return "";
  return text;
}

function joinUniqueValues(values = []) {
  const uniq = [];
  const seen = new Set();

  for (const value of values) {
    const normalized = normalizeMetaValue(value);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    uniq.push(normalized);
  }

  return uniq.join(" / ");
}

function getPreferredNote(spawn) {
  const note = normalizeMetaValue(spawn?.note);
  if (note) return note;

  return normalizeMetaValue(spawn?.imported_note);
}

function bubbleContainsSpawn(group, spawn) {
  const bubbleCellSet = new Set(group.cells.map((cell) => cell.label));
  const spawnCells = parseAreaList(spawn?.area ?? spawn?.coords)
    .map(normalizeAreaCell)
    .filter(Boolean);

  return spawnCells.some((cell) => bubbleCellSet.has(cell));
}

function getBubblePosition(group, spawns = []) {
  const cellPercent = 100 / GRID_SIZE;
  const paddingPercent = cellPercent * BUBBLE_INNER_PADDING_CELLS;

  const widthCells = group.maxCol - group.minCol + 1;
  const heightCells = group.maxRow - group.minRow + 1;

  const left =
    group.minCol * cellPercent +
    (widthCells * cellPercent) / 2 +
    BUBBLE_OFFSET_X_PERCENT;

  const top =
    group.minRow * cellPercent +
    (heightCells * cellPercent) / 2 +
    BUBBLE_OFFSET_Y_PERCENT;

  const width = Math.max(
    cellPercent * BUBBLE_WIDTH_SCALE,
    widthCells * cellPercent * BUBBLE_WIDTH_SCALE - paddingPercent
  );

  const height = Math.max(
    cellPercent * BUBBLE_HEIGHT_SCALE,
    heightCells * cellPercent * BUBBLE_HEIGHT_SCALE - paddingPercent
  );

  const relatedSpawns = (spawns ?? []).filter((spawn) =>
    bubbleContainsSpawn(group, spawn)
  );

  const symbolCount = joinUniqueValues(
    relatedSpawns.map((spawn) => spawn?.symbol_count)
  );

  const spawnCount = joinUniqueValues(
    relatedSpawns.map((spawn) => spawn?.spawn_count)
  );

  const spawnTimes = joinUniqueValues(
    relatedSpawns
      .map((spawn) => spawn?.spawn_time)
      .filter(Boolean)
  );

  const notes = joinUniqueValues(relatedSpawns.map(getPreferredNote));
  const isHuntingGround = relatedSpawns.some(
    (spawn) => Boolean(spawn?.is_hunting_ground)
  );

  return {
    key: group.label,
    label: group.label,
    shortLabel: group.shortLabel,
    left,
    top,
    width,
    height,
    isMerged: group.isMerged,
    isWideArea: widthCells >= 4 || heightCells >= 4,
    symbolCount,
    spawnCount,
    spawnTimes,
    notes,
    isHuntingGround,
    relatedSpawns,
  };
}


function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function StatBlock({ label, value }) {
  if (!value) return null;

  return (
    <div className={styles.summaryStat}>
      <span className={styles.summaryStatLabel}>{label}</span>
      <span className={styles.summaryStatValue}>{value}</span>
    </div>
  );
}

function BubbleInfoContent({ bubble, t }) {
  if (!bubble) return null;

  return (
    <div className={styles.infoCardContent}>
      <div className={styles.infoRows}>
        {bubble.isHuntingGround ? (
          <div className={styles.huntingBadgeRow}>
            <span className={styles.overlayHuntingBadge}>{t("huntingGround")}</span>
          </div>
        ) : null}

        {bubble.symbolCount || bubble.spawnCount || bubble.spawnTimes ? (
          <div className={styles.summaryRow}>
            <StatBlock label={t("symbolCount")} value={bubble.symbolCount} />
            <StatBlock label={t("spawnCount")} value={bubble.spawnCount} />
            <StatBlock label={t("timeZone")} value={bubble.spawnTimes} />
          </div>
        ) : null}

        {bubble.notes ? (
          <div className={styles.infoBlock}>
            <span className={styles.infoLabel}>{t("memo")}</span>
            <span className={styles.infoValue}>{bubble.notes}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MonsterMapOverlay({ spawns = [], imagePath, href }) {
  const t = useTranslations("MonsterMapOverlay");
  const isMobile = useOverlayIsMobile();
  const resolvedImageUrl = useMemo(
    () => getMonsterAssetUrl(imagePath),
    [imagePath]
  );

  const [imageLoaded, setImageLoaded] = useState(false);
  const [hoveredBubbleKey, setHoveredBubbleKey] = useState("");
  const [selectedBubbleKey, setSelectedBubbleKey] = useState("");

  useEffect(() => {
    setImageLoaded(false);
    setHoveredBubbleKey("");
    setSelectedBubbleKey("");
  }, [resolvedImageUrl, spawns]);

  const cells = useMemo(() => collectUniqueCells(spawns), [spawns]);
  const bubbles = useMemo(
    () =>
      buildMergedGroups(cells)
        .map((group) => getBubblePosition(group, spawns))
        .filter(Boolean),
    [cells, spawns]
  );

  const activeDesktopBubble = useMemo(() => {
    if (selectedBubbleKey) {
      return bubbles.find((bubble) => bubble.key === selectedBubbleKey) ?? null;
    }
    if (!hoveredBubbleKey) return null;
    return bubbles.find((bubble) => bubble.key === hoveredBubbleKey) ?? null;
  }, [bubbles, hoveredBubbleKey, selectedBubbleKey]);

  const activeMobileBubble = useMemo(() => {
    if (!bubbles.length) return null;
    if (!selectedBubbleKey) return bubbles[0];
    return bubbles.find((bubble) => bubble.key === selectedBubbleKey) ?? bubbles[0];
  }, [bubbles, selectedBubbleKey]);

  function handleBubbleClick(bubbleKey) {
    if (!isMobile) return;
    setSelectedBubbleKey((prev) => (prev === bubbleKey ? "" : bubbleKey));
  }

  if (!resolvedImageUrl) {
    return (
      <div className={styles.mapCard}>
        <div className={styles.noImageBox}>{t("noImage")}</div>
      </div>
    );
  }

  const content = (
    <div className={styles.mapCard}>
      <div className={styles.mapImageFrame}>
        <div
          className={styles.mapImageBox}
          onClick={() => {
            if (isMobile) setSelectedBubbleKey("");
          }}
        >
          {!imageLoaded ? (
            <div className={styles.loadingOverlay}>
              <div className={styles.loadingShimmer} />
              <span className={styles.loadingText}>{t("loading")}</span>
            </div>
          ) : null}

          <div className={cx(styles.imageInner, imageLoaded && styles.imageInnerLoaded)}>
            <div
              className={styles.imageCropInner}
              style={{
                "--crop-width": `${MAP_CROP.widthPercent}%`,
                "--crop-height": `${MAP_CROP.heightPercent}%`,
                "--crop-left": `-${MAP_CROP.offsetXPercent}%`,
                "--crop-top": `-${MAP_CROP.offsetYPercent}%`,
              }}
            >
              <Image
                src={resolvedImageUrl}
                alt={t("mapAlt")}
                fill
                sizes="(max-width: 920px) 100vw, 50vw"
                className={styles.mapImage}
                onLoad={() => setImageLoaded(true)}
                unoptimized
              />
            </div>
          </div>

          <div className={styles.bubbleLayer}>
            {bubbles.map((bubble) => (
              <button
                key={bubble.key}
                type="button"
                className={cx(
                  styles.spawnBubble,
                  selectedBubbleKey === bubble.key && styles.spawnBubbleSelected,
                  bubble.isWideArea && styles.spawnBubbleWide
                )}
                style={{
                  "--bubble-left": `${bubble.left}%`,
                  "--bubble-top": `${bubble.top}%`,
                  "--bubble-width": `${bubble.width}%`,
                  "--bubble-height": `${bubble.height}%`,
                }}
                aria-label={t("bubbleAriaLabel", { area: bubble.shortLabel })}
                onMouseEnter={() => {
                  if (!isMobile) setHoveredBubbleKey(bubble.key);
                }}
                onMouseLeave={() => {
                  if (!isMobile && !selectedBubbleKey) setHoveredBubbleKey("");
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleBubbleClick(bubble.key);
                }}
              >
                <span className={styles.bubbleInner}>
                  <span className={styles.bubbleText}>{bubble.shortLabel}</span>
                  {isMobile ? <span className={styles.bubbleHintIcon}>i</span> : null}
                </span>
              </button>
            ))}

            {!isMobile && activeDesktopBubble ? (
              <div className={styles.centerTooltip}>
                <BubbleInfoContent bubble={activeDesktopBubble} t={t} />
              </div>
            ) : null}
          </div>
        </div>

        {isMobile && activeMobileBubble ? (
          <div className={styles.mobileInfoCard}>
            <button
              type="button"
              className={styles.mobileInfoClose}
              aria-label={t("close")}
              onClick={() => setSelectedBubbleKey("")}
            >
              ×
            </button>
            <div className={styles.mobileInfoBody}>
              <BubbleInfoContent bubble={activeMobileBubble} t={t} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={styles.linkWrap}>
        {content}
      </Link>
    );
  }

  return content;
}

function normalizeSpawnTime(value) {
  const v = String(value ?? "").trim().toLowerCase();

  if (v.includes("night") || v.includes("夜")) return "夜";
  if (v.includes("day") || v.includes("昼") || v.includes("日中")) return "日中";
  if (v.includes("normal") || v.includes("always") || v.includes("いつでも")) {
    return "いつでも";
  }

  return String(value ?? "").trim();
}

function normalizeLayerName(value) {
  return String(value ?? "").trim();
}



function getSpawnLayerName(spawn = {}) {
  return normalizeLayerName(spawn?.map_layer_name ?? spawn?.layer_name ?? "");
}

function getSpawnImagePath(spawn = {}, mapItem = {}) {
  return (
    spawn?.map_image_path ??
    spawn?.map_image_url ??
    mapItem?.image_path ??
    mapItem?.image_url ??
    ""
  );
}

function buildLayerGroups(mapItem) {
  const spawns = Array.isArray(mapItem?.spawns) ? mapItem.spawns : [];
  const groups = new Map();

  for (const spawn of spawns) {
    const layerName = getSpawnLayerName(spawn);

    if (!layerName || layerName === "地上") {
      continue;
    }

    if (!groups.has(layerName)) {
      groups.set(layerName, {
        layerName,
        imagePath: getSpawnImagePath(spawn, mapItem),
        spawns: [],
      });
    }

    const current = groups.get(layerName);
    current.spawns.push(spawn);

    if (!current.imagePath) {
      current.imagePath = getSpawnImagePath(spawn, mapItem);
    }
  }

  return Array.from(groups.values());
}



function useMapCardIsMobile(breakpoint = 920) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < breakpoint);
    }

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [breakpoint]);

  return isMobile;
}

function getContinentName(mapItem = {}) {
  return String(
    mapItem?.continent_name ??
      mapItem?.continent ??
      mapItem?.continentLabel ??
      ""
  ).trim();
}

function hasMapCardHuntingGround(mapItem = {}, spawns = []) {
  if (mapItem?.is_hunting_ground) return true;

  const list = Array.isArray(spawns) ? spawns : [];
  return list.some((spawn) => spawn?.is_hunting_ground);
}

function getSpawnTimeFlags(spawns = []) {
  const list = Array.isArray(spawns) ? spawns : [];

  let hasDay = false;
  let hasNight = false;

  for (const spawn of list) {
    const normalized = normalizeSpawnTime(spawn?.spawn_time);

    if (normalized === "日中") hasDay = true;
    if (normalized === "夜") hasNight = true;

    if (hasDay && hasNight) break;
  }

  return { hasDay, hasNight };
}


function MonsterMapCard({ mapItem }) {
  const t = useTranslations("MonsterHabitatSection");
  const isMobile = useMapCardIsMobile();
  const layerGroups = useMemo(() => buildLayerGroups(mapItem), [mapItem]);
  const hasLayerSwitch = layerGroups.length > 0;
  const [activeLayerName, setActiveLayerName] = useState(layerGroups[0]?.layerName ?? "");

  useEffect(() => {
    if (!hasLayerSwitch) {
      setActiveLayerName("");
      return;
    }
    const exists = layerGroups.some((group) => group.layerName === activeLayerName);
    if (!exists) setActiveLayerName(layerGroups[0]?.layerName ?? "");
  }, [activeLayerName, hasLayerSwitch, layerGroups]);

  const activeLayerGroup = useMemo(() => {
    if (!hasLayerSwitch) return null;
    return layerGroups.find((group) => group.layerName === activeLayerName) ?? layerGroups[0] ?? null;
  }, [activeLayerName, hasLayerSwitch, layerGroups]);

  const displaySpawns = hasLayerSwitch ? activeLayerGroup?.spawns ?? [] : mapItem?.spawns ?? [];
  const displayImagePath = hasLayerSwitch
    ? activeLayerGroup?.imagePath ?? mapItem?.image_path ?? ""
    : mapItem?.image_path ?? mapItem?.image_url ?? "";

  const continentName = getContinentName(mapItem);
  const isHuntingGround = useMemo(
    () => hasMapCardHuntingGround(mapItem, displaySpawns),
    [mapItem, displaySpawns]
  );
  const { hasDay, hasNight } = useMemo(
    () => getSpawnTimeFlags(displaySpawns),
    [displaySpawns]
  );

  return (
    <article className={styles.mapItemCard}>
      <div className={cx(styles.mapItemTopRow, isMobile && styles.mapItemTopRowMobile)}>
        <div className={styles.mapItemTitleWrap}>
          <div className={styles.mapItemTitleLine}>
            <h3 className={styles.mapItemTitle}>{mapItem?.name || t("unnamedMap")}</h3>
            <div className={styles.mapItemMetaRow}>
              {continentName ? <span className={styles.continentText}>{continentName}</span> : null}
              {isHuntingGround ? (
                <span className={styles.mapHuntingBadge}>{t("huntingGround")}</span>
              ) : null}
              {hasDay || hasNight ? (
                <span className={styles.timeIconGroup}>
                  {hasDay ? <IoSunnyOutline className={styles.timeIcon} aria-label={t("daytime")} /> : null}
                  {hasNight ? <FaMoon className={styles.timeIcon} aria-label={t("night")} /> : null}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {hasLayerSwitch ? (
          <div className={cx(styles.layerSwitchRow, isMobile && styles.layerSwitchRowMobile)}>
            {layerGroups.map((group) => {
              const active = group.layerName === activeLayerName;
              return (
                <button
                  key={group.layerName}
                  type="button"
                  onClick={() => setActiveLayerName(group.layerName)}
                  className={cx(styles.layerSwitchButton, active && styles.layerSwitchButtonActive)}
                >
                  {group.layerName}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className={styles.mapWrap}>
        <MonsterMapOverlay spawns={displaySpawns} imagePath={displayImagePath} href={mapItem?.url} />
      </div>
    </article>
  );
}

function useHabitatsIsMobile(breakpoint = 920) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < breakpoint);
    }

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [breakpoint]);

  return isMobile;
}

function chunkArray(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

function hasHabitatHuntingGround(mapItem) {
  if (!mapItem) return false;
  if ((mapItem.is_hunting_ground)) return true;

  const spawns = Array.isArray(mapItem.spawns) ? mapItem.spawns : [];
  return spawns.some((spawn) => Boolean(spawn?.is_hunting_ground));
}

function sortMapsByHuntingGround(items = []) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aHunting = hasHabitatHuntingGround(a.item);
      const bHunting = hasHabitatHuntingGround(b.item);

      if (aHunting !== bHunting) {
        return aHunting ? -1 : 1;
      }

      return a.index - b.index;
    })
    .map(({ item }) => item);
}


function MapTabButton({ mapItem, isActive, onClick }) {
  const t = useTranslations("MonsterHabitatSection");
  const liked = hasHabitatHuntingGround(mapItem);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(styles.tabButton, isActive && styles.tabButtonActive)}
    >
      <span className={styles.tabButtonContent}>
        <span className={styles.tabButtonText}>{mapItem?.name || t("unnamedMap")}</span>
        {liked ? (
          <FcLike className={cx(styles.huntingLikeIcon, isActive && styles.huntingLikeIconActive)} />
        ) : null}
      </span>
    </button>
  );
}

export default function MonsterHabitats({ maps = [] }) {
  const t = useTranslations("MonsterHabitatSection");
  const isMobile = useHabitatsIsMobile();
  const contentScrollerRef = useRef(null);
  const tabScrollerRef = useRef(null);
  const tabRefs = useRef({});
  const isProgrammaticScrollRef = useRef(false);

  const normalizedMaps = useMemo(() => {
    const filtered = Array.isArray(maps)
      ? maps.filter((item) => item && (item.name || item.id))
      : [];
    return sortMapsByHuntingGround(filtered);
  }, [maps]);

  const pageSize = isMobile ? 1 : 2;
  const pagedMaps = useMemo(() => chunkArray(normalizedMaps, pageSize), [normalizedMaps, pageSize]);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (activeTab > pagedMaps.length - 1) setActiveTab(0);
  }, [pagedMaps, activeTab]);

  useEffect(() => {
    const scroller = tabScrollerRef.current;
    const target = tabRefs.current[activeTab];
    if (!scroller || !target) return;

    const nextLeft = target.offsetLeft - (scroller.clientWidth - target.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, nextLeft), behavior: "smooth" });
  }, [activeTab]);

  useEffect(() => {
    if (!isMobile) return undefined;
    const element = contentScrollerRef.current;
    if (!element) return undefined;

    isProgrammaticScrollRef.current = true;
    element.scrollTo({ left: element.clientWidth * activeTab, behavior: "auto" });
    const timer = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 300);
    return () => clearTimeout(timer);
  }, [activeTab, isMobile]);

  useEffect(() => {
    if (!isMobile) return undefined;
    const element = contentScrollerRef.current;
    if (!element) return undefined;

    function handleScroll() {
      if (isProgrammaticScrollRef.current) return;
      const nextTab = Math.round(element.scrollLeft / (element.clientWidth || 1));
      if (nextTab >= 0 && nextTab < pagedMaps.length && nextTab !== activeTab) {
        setActiveTab(nextTab);
      }
    }

    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => element.removeEventListener("scroll", handleScroll);
  }, [activeTab, isMobile, pagedMaps.length]);

  if (normalizedMaps.length === 0) {
    return (
      <section className={styles.root}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t("title")}</h2>
        </div>
        <div className={styles.emptyCard}>{t("noData")}</div>
      </section>
    );
  }

  return (
    <section className={styles.root}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{t("title")}</h2>
      </div>

      <div ref={tabScrollerRef} className={styles.tabScroller}>
        {pagedMaps.map((group, index) => {
          const isActive = index === activeTab;
          return (
            <div
              key={`tab-group-${index}`}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              className={styles.tabGroup}
            >
              {group.map((mapItem) => (
                <MapTabButton
                  key={`tab-${index}-${mapItem.id ?? mapItem.name}`}
                  mapItem={mapItem}
                  isActive={isActive}
                  onClick={() => setActiveTab(index)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {isMobile ? (
        <div ref={contentScrollerRef} className={styles.mobileContentScroller}>
          {pagedMaps.map((group, index) => (
            <div key={`page-${index}`} className={styles.mobilePage}>
              <div className={styles.mobilePageInner}>
                {group.map((mapItem) => (
                  <div key={mapItem.id ?? mapItem.name} className={styles.mobileCardWrap}>
                    <MonsterMapCard mapItem={mapItem} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.desktopGrid}>
          {(pagedMaps[activeTab] ?? []).map((mapItem) => (
            <div key={mapItem.id ?? mapItem.name} className={styles.desktopCardWrap}>
              <MonsterMapCard mapItem={mapItem} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
