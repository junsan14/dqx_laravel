"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { FcLike } from "react-icons/fc";
import { FaMoon } from "react-icons/fa6";
import { IoSunnyOutline } from "react-icons/io5";
import { getMonsterAssetUrl } from "@/lib/monsters";
import moduleStyles from "./MonsterHabitats.module.css";

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
const BUBBLE_BORDER_RADIUS_PX = 5;

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

function StatBlock({ label, value, styles }) {
  if (!value) return null;

  return (
    <div style={styles.summaryStat}>
      <span style={styles.summaryStatLabel}>{label}</span>
      <span style={styles.summaryStatValue}>{value}</span>
    </div>
  );
}

function BubbleInfoContent({ bubble, styles, t }) {
  if (!bubble) return null;

  return (
    <div style={styles.infoCardContent}>
      <div style={styles.infoRows}>
        {bubble.isHuntingGround ? (
          <div style={styles.huntingBadgeRow}>
            <span style={styles.huntingBadge}>{t("huntingGround")}</span>
          </div>
        ) : null}

        {bubble.symbolCount || bubble.spawnCount || bubble.spawnTimes ? (
          <div style={styles.summaryRow}>
            <StatBlock
              label={t("symbolCount")}
              value={bubble.symbolCount}
              styles={styles}
            />
            <StatBlock
              label={t("spawnCount")}
              value={bubble.spawnCount}
              styles={styles}
            />
            <StatBlock
              label={t("timeZone")}
              value={bubble.spawnTimes}
              styles={styles}
            />
          </div>
        ) : null}

        {bubble.notes ? (
          <div style={styles.infoBlock}>
            <span style={styles.infoLabel}>{t("memo")}</span>
            <span style={styles.infoValue}>{bubble.notes}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getOverlayStyles() {
  return {
    mapCard: {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      height: "100%",
      overflow: "visible",
    },
    mapImageFrame: {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      overflow: "visible",
    },
    linkWrap: {
      display: "block",
      textDecoration: "none",
      height: "100%",
      overflow: "visible",
    },
    mapImageBox: {
      position: "relative",
      width: "100%",
      aspectRatio: "1 / 1",
      borderRadius: "18px",
      overflow: "hidden",
      background: "var(--page-bg)",
      border: `1px solid var(--panel-border)`,
      flexShrink: 0,
    },
    loadingOverlay: {
      position: "absolute",
      inset: 0,
      zIndex: 3,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "10px",
      background: "color-mix(in srgb, var(--page-bg) 92%, transparent)",
    },
    loadingShimmer: {
      width: "100%",
      height: "100%",
      position: "absolute",
      inset: 0,
      background:
        "linear-gradient(90deg, color-mix(in srgb, var(--soft-border) 88%, transparent) 0%, color-mix(in srgb, var(--soft-bg) 100%, white 0%) 50%, color-mix(in srgb, var(--soft-border) 88%, transparent) 100%)",
      backgroundSize: "200% 100%",
      animation: "monsterMapShimmer 1.2s ease-in-out infinite",
    },
    loadingText: {
      position: "relative",
      zIndex: 1,
      fontSize: "13px",
      fontWeight: 700,
      color: "var(--text-sub)",
      background: "var(--panel-bg)",
      borderRadius: "999px",
      padding: "6px 10px",
      border: `1px solid var(--input-border)`,
    },
    imageInner: {
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      transition: "opacity 0.18s ease",
      zIndex: 1,
    },
    imageCropInner: {
      position: "absolute",
      top: 0,
      left: 0,
    },
    mapImage: {
      display: "block",
      width: "100%",
      height: "100%",
      objectFit: "fill",
    },
    bubbleLayer: {
      position: "absolute",
      inset: 0,
      zIndex: 2,
    },
    spawnBubble: {
      position: "absolute",
      transform: "translate(-50%, -50%)",
      borderRadius: `${BUBBLE_BORDER_RADIUS_PX}px`,
      border: "1px solid color-mix(in srgb, var(--page-text) 56%, transparent)",
      background: "color-mix(in srgb, var(--panel-bg) 24%, transparent)",
      backdropFilter: "blur(2px)",
      WebkitBackdropFilter: "blur(2px)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
      transition: "all 0.16s ease",
    },
    spawnBubbleSelected: {
      background: "color-mix(in srgb, var(--selected-border) 26%, transparent)",
      border: "2px solid var(--selected-border)",
      boxShadow:
        "0 0 0 3px color-mix(in srgb, var(--selected-border) 18%, transparent)",
    },
    bubbleInner: {
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "4px",
      pointerEvents: "none",
    },
    bubbleText: {
      fontSize: "11px",
      fontWeight: 800,
      color: "var(--text-main)",
      background: "color-mix(in srgb, var(--panel-bg) 90%, transparent)",
      borderRadius: "999px",
      padding: "3px 7px",
      lineHeight: 1.1,
      boxShadow:
        "0 2px 8px color-mix(in srgb, var(--page-text) 10%, transparent)",
      whiteSpace: "nowrap",
      border: "1px solid color-mix(in srgb, var(--soft-border) 80%, transparent)",
    },
    bubbleHintIcon: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "18px",
      height: "18px",
      borderRadius: "999px",
      fontSize: "11px",
      lineHeight: 1,
      background: "var(--selected-border)",
      color: "#ffffff",
      boxShadow:
        "0 3px 10px color-mix(in srgb, var(--selected-border) 28%, transparent)",
      transform: "translateY(-1px)",
    },
    centerTooltip: {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 5,
      pointerEvents: "none",
      width: "min(420px, calc(100% - 24px), 78vw)",
    },
    infoCardContent: {
      background: "color-mix(in srgb, var(--panel-bg) 96%, transparent)",
      border: `1px solid var(--panel-border)`,
      borderRadius: "16px",
      boxShadow:
        "0 18px 40px color-mix(in srgb, var(--page-text) 12%, transparent)",
      padding: "12px",
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
    },
    infoRows: {
      display: "grid",
      gap: "10px",
    },
    huntingBadgeRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      marginBottom: "2px",
    },
    huntingBadge: {
      display: "inline-flex",
      alignItems: "center",
      minHeight: "24px",
      padding: "4px 10px",
      borderRadius: "999px",
      background: "color-mix(in srgb, var(--selected-border) 16%, transparent)",
      color: "var(--selected-text)",
      border:
        "1px solid color-mix(in srgb, var(--selected-border) 40%, transparent)",
      fontSize: "12px",
      fontWeight: 900,
      lineHeight: 1.1,
      whiteSpace: "nowrap",
    },
    summaryRow: {
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: "10px",
      alignItems: "center",
    },
    summaryStat: {
      minWidth: 0,
      display: "grid",
      gap: "4px",
      justifyItems: "center",
      textAlign: "center",
    },
    summaryStatLabel: {
      fontSize: "12px",
      fontWeight: 900,
      color: "var(--text-muted)",
      lineHeight: 1.2,
      whiteSpace: "nowrap",
      textAlign: "center",
    },
    summaryStatValue: {
      fontSize: "13px",
      fontWeight: 700,
      color: "var(--text-main)",
      lineHeight: 1.45,
      paddingLeft: 0,
      wordBreak: "break-word",
      whiteSpace: "pre-wrap",
      textAlign: "center",
    },
    infoBlock: {
      display: "grid",
      gap: "4px",
    },
    infoLabel: {
      fontSize: "12px",
      fontWeight: 900,
      color: "var(--text-muted)",
      lineHeight: 1.2,
    },
    infoValue: {
      fontSize: "13px",
      fontWeight: 700,
      color: "var(--text-main)",
      lineHeight: 1.5,
      paddingLeft: "6px",
      wordBreak: "break-word",
      whiteSpace: "pre-wrap",
    },
    mobileInfoCard: {
      position: "relative",
    },
    mobileInfoClose: {
      position: "absolute",
      top: "8px",
      right: "8px",
      width: "28px",
      height: "28px",
      borderRadius: "999px",
      border: `1px solid var(--input-border)`,
      background: "var(--input-bg)",
      color: "var(--input-text)",
      fontSize: "16px",
      fontWeight: 900,
      cursor: "pointer",
      zIndex: 2,
    },
    mobileInfoTop: {
      display: "block",
    },
    mobileInfoBody: {
      paddingTop: "6px",
    },
    noImageBox: {
      width: "100%",
      aspectRatio: "1 / 1",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "18px",
      background: "var(--soft-bg)",
      border: `1px dashed var(--soft-border)`,
      color: "var(--text-muted)",
      fontWeight: 700,
    },
  };
}

function MonsterMapOverlay({
  spawns = [],
  imagePath,
  href,
}) {
  const t = useTranslations("MonsterMapOverlay");
  const isMobile = useOverlayIsMobile();
  const styles = useMemo(() => getOverlayStyles(), []);

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

  const bubbles = useMemo(() => {
    return buildMergedGroups(cells)
      .map((group) => getBubblePosition(group, spawns))
      .filter(Boolean);
  }, [cells, spawns]);

  const activeDesktopBubble = useMemo(() => {
    if (selectedBubbleKey) {
      return bubbles.find((bubble) => bubble.key === selectedBubbleKey) ?? null;
    }

    if (!hoveredBubbleKey) return null;
    return bubbles.find((bubble) => bubble.key === hoveredBubbleKey) ?? null;
  }, [bubbles, hoveredBubbleKey, selectedBubbleKey]);

  const activeMobileBubble = useMemo(() => {
    if (!bubbles.length) return null;

    if (!selectedBubbleKey) {
      return bubbles[0];
    }

    return (
      bubbles.find((bubble) => bubble.key === selectedBubbleKey) ?? bubbles[0]
    );
  }, [bubbles, selectedBubbleKey]);

  function handleBubbleClick(bubbleKey) {
    if (!isMobile) return;
    setSelectedBubbleKey((prev) => (prev === bubbleKey ? "" : bubbleKey));
  }

  if (!resolvedImageUrl) {
    return (
      <div style={styles.mapCard}>
        <div style={styles.noImageBox}>{t("noImage")}</div>
      </div>
    );
  }

  const content = (
    <div style={styles.mapCard}>
      <div style={styles.mapImageFrame}>
        <div
          style={styles.mapImageBox}
          onClick={() => {
            if (isMobile) {
              setSelectedBubbleKey("");
            }
          }}
        >
          {!imageLoaded ? (
            <div style={styles.loadingOverlay}>
              <div style={styles.loadingShimmer} />
              <span style={styles.loadingText}>{t("loading")}</span>
            </div>
          ) : null}

          <div
            style={{
              ...styles.imageInner,
              opacity: imageLoaded ? 1 : 0,
            }}
          >
            <div
              style={{
                ...styles.imageCropInner,
                width: `${MAP_CROP.widthPercent}%`,
                height: `${MAP_CROP.heightPercent}%`,
                left: `-${MAP_CROP.offsetXPercent}%`,
                top: `-${MAP_CROP.offsetYPercent}%`,
              }}
            >
              <Image
                src={resolvedImageUrl}
                alt={t("mapAlt")}
                fill
                sizes="(max-width: 920px) 100vw, 50vw"
                style={styles.mapImage}
                onLoad={() => setImageLoaded(true)}
                unoptimized
              />
            </div>
          </div>

          <div style={styles.bubbleLayer}>
            {bubbles.map((bubble) => {
              const bubbleStyle = {
                ...styles.spawnBubble,
                ...(selectedBubbleKey === bubble.key
                  ? styles.spawnBubbleSelected
                  : {}),
                ...(bubble.isWideArea
                  ? {
                      backdropFilter: "none",
                      WebkitBackdropFilter: "none",
                    }
                  : {}),
                left: `${bubble.left}%`,
                top: `${bubble.top}%`,
                width: `${bubble.width}%`,
                height: `${bubble.height}%`,
              };

              return (
                <button
                  key={bubble.key}
                  type="button"
                  style={bubbleStyle}
                  aria-label={t("bubbleAriaLabel", { area: bubble.shortLabel })}
                  onMouseEnter={() => {
                    if (!isMobile) setHoveredBubbleKey(bubble.key);
                  }}
                  onMouseLeave={() => {
                    if (!isMobile && !selectedBubbleKey) {
                      setHoveredBubbleKey("");
                    }
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleBubbleClick(bubble.key);
                  }}
                >
                  <span style={styles.bubbleInner}>
                    <span style={styles.bubbleText}>{bubble.shortLabel}</span>
                    {isMobile ? (
                      <span style={styles.bubbleHintIcon}>i</span>
                    ) : null}
                  </span>
                </button>
              );
            })}

            {!isMobile && activeDesktopBubble ? (
              <div style={styles.centerTooltip}>
                <BubbleInfoContent
                  bubble={activeDesktopBubble}
                  styles={styles}
                  t={t}
                />
              </div>
            ) : null}
          </div>
        </div>

        {isMobile && activeMobileBubble ? (
          <div style={styles.mobileInfoCard}>
            <button
              type="button"
              style={styles.mobileInfoClose}
              aria-label={t("close")}
              onClick={() => setSelectedBubbleKey("")}
            >
              ×
            </button>

            <div style={styles.mobileInfoTop}>
              <div style={styles.mobileInfoBody}>
                <BubbleInfoContent
                  bubble={activeMobileBubble}
                  styles={styles}
                  t={t}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <style>{`
        @keyframes monsterMapShimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={styles.linkWrap}>
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

function getMapCardStyles() {
  return {
    card: {
      width: "100%",
      maxWidth: "100%",
      minWidth: 0,
      boxSizing: "border-box",
      overflow: "hidden",
      background: "var(--soft-bg)",
      borderRadius: "5px",
      padding: "16px",
      height: "100%",
      minHeight: "100%",
      border: `1px solid var(--card-border)`,
      display: "flex",
      flexDirection: "column",
      gap: "14px",
    },
    topRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "14px",
    },
    topRowMobile: {
      flexDirection: "column",
      alignItems: "stretch",
    },
    titleWrap: {
      minWidth: 0,
      flex: 1,
    },
    titleLine: {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "8px 10px",
    },
    mapTitle: {
      margin: 0,
      fontSize: "18px",
      lineHeight: 1.35,
      fontWeight: 900,
      color: "var(--text-title)",
      wordBreak: "break-word",
    },
    titleMetaRow: {
      display: "inline-flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "8px",
      minWidth: 0,
    },
    continentText: {
      display: "inline-flex",
      alignItems: "center",
      minHeight: "28px",
      padding: "4px 10px",
      borderRadius: "999px",
      fontSize: "12px",
      fontWeight: 800,
      background: "var(--badge-bg)",
      color: "var(--badge-text)",
      border: `1px solid var(--tag-border)`,
    },
    huntingBadge: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "28px",
      padding: "4px 10px",
      borderRadius: "999px",
      fontSize: "12px",
      fontWeight: 900,
      lineHeight: 1,
      color: "var(--selected-text)",
      background:
        "color-mix(in srgb, var(--selected-border) 16%, transparent)",
      border:
        "1px solid color-mix(in srgb, var(--selected-border) 38%, transparent)",
      whiteSpace: "nowrap",
    },
    timeIconGroup: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "0 2px",
    },
    timeIcon: {
      width: "18px",
      height: "18px",
      display: "block",
      flexShrink: 0,
      color: "var(--text-main)",
    },
    layerSwitchRow: {
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      gap: "8px",
      flexShrink: 0,
    },
    layerSwitchRowMobile: {
      justifyContent: "flex-start",
    },
    layerSwitchButton: {
      appearance: "none",
      border: `1px solid var(--panel-border)`,
      background: "var(--secondary-bg)",
      color: "var(--secondary-text)",
      borderRadius: "999px",
      padding: "8px 12px",
      fontSize: "12px",
      fontWeight: 800,
      cursor: "pointer",
    },
    layerSwitchButtonActive: {
      background: "var(--primary-bg)",
      color: "var(--primary-text)",
      border: `1px solid var(--primary-border)`,
      boxShadow:
        "0 10px 22px color-mix(in srgb, var(--primary-border) 16%, transparent)",
    },
    spawnInfoSection: {
      display: "grid",
      gap: "12px",
      padding: "14px",
      borderRadius: "16px",
      background: "var(--panel-bg)",
      border: `1px solid var(--panel-border)`,
      boxShadow:
        "0 14px 30px color-mix(in srgb, var(--page-text) 8%, transparent)",
    },
    spawnInfoRow: {
      display: "flex",
      justifyContent: "space-between",
      gap: "12px",
    },
    spawnInfoLabel: {
      minWidth: "42px",
      paddingTop: "6px",
      fontSize: "12px",
      fontWeight: 900,
      letterSpacing: "0.04em",
      color: "var(--text-muted)",
    },
    spawnInfoLabelSub: {
      minWidth: "42px",
      paddingTop: "4px",
      fontSize: "12px",
      fontWeight: 900,
      letterSpacing: "0.04em",
      color: "var(--text-muted)",
    },
    spawnMetaWrap: {
      minWidth: 0,
      flex: 1,
      display: "grid",
      gap: "8px",
    },
    spawnMetaWrapTag: {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
    },
    timeTagWrap: {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
    },
    tag: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "28px",
      padding: "4px 10px",
      borderRadius: "999px",
      fontSize: "12px",
      fontWeight: 800,
      lineHeight: 1.2,
      border: `1px solid var(--tag-border)`,
    },
    tagArea: {
      background: "var(--tag-bg)",
      color: "var(--tag-text)",
    },
    tagNight: {
      background: "var(--badge-bg)",
      color: "var(--badge-text)",
    },
    tagDay: {
      background: "var(--selected-bg)",
      color: "var(--secondary-text)",
      border: `1px solid var(--selected-border)`,
    },
    tagAnytime: {
      background: "var(--warning-bg)",
      color: "var(--warning-text)",
      border: `1px solid var(--warning-border)`,
    },
    coordsToggleButton: {
      appearance: "none",
      border: `1px solid var(--input-border)`,
      background: "var(--input-bg)",
      color: "var(--input-text)",
      borderRadius: "999px",
      minHeight: "28px",
      padding: "4px 10px",
      fontSize: "12px",
      fontWeight: 900,
      cursor: "pointer",
    },
    coordsAccordion: {
      display: "grid",
      gap: "10px",
      paddingTop: "4px",
      borderTop: `1px dashed var(--soft-border)`,
    },
    coordsCloseButton: {
      appearance: "none",
      alignSelf: "flex-start",
      border: `1px solid var(--panel-border)`,
      background: "var(--panel-bg)",
      color: "var(--text-sub)",
      borderRadius: "999px",
      padding: "7px 12px",
      fontSize: "12px",
      fontWeight: 800,
      cursor: "pointer",
    },
    mapWrap: {
      minWidth: 0,
    },
  };
}

function MonsterMapCard({ mapItem }) {
  const isMobile = useMapCardIsMobile();
  const styles = useMemo(() => getMapCardStyles(), []);

  
  const layerGroups = useMemo(() => buildLayerGroups(mapItem), [mapItem]);

  const hasLayerSwitch = layerGroups.length > 0;

  const [activeLayerName, setActiveLayerName] = useState(
    layerGroups[0]?.layerName ?? ""
  );

  useEffect(() => {
    if (!hasLayerSwitch) {
      setActiveLayerName("");
      return;
    }

    const exists = layerGroups.some(
      (group) => group.layerName === activeLayerName
    );
    if (!exists) {
      setActiveLayerName(layerGroups[0]?.layerName ?? "");
    }
  }, [activeLayerName, hasLayerSwitch, layerGroups]);

  const activeLayerGroup = useMemo(() => {
    if (!hasLayerSwitch) return null;
    return (
      layerGroups.find((group) => group.layerName === activeLayerName) ??
      layerGroups[0] ??
      null
    );
  }, [activeLayerName, hasLayerSwitch, layerGroups]);

  const displaySpawns = hasLayerSwitch
    ? activeLayerGroup?.spawns ?? []
    : mapItem?.spawns ?? [];

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
    <article style={styles.card}>
      <div
        style={{
          ...styles.topRow,
          ...(isMobile ? styles.topRowMobile : {}),
        }}
      >
        <div style={styles.titleWrap}>
          <div style={styles.titleLine}>
            <h3 style={styles.mapTitle}>{mapItem?.name || "マップ"}</h3>

            <div style={styles.titleMetaRow}>
              {continentName ? (
                <span style={styles.continentText}>{continentName}</span>
              ) : null}

              {isHuntingGround ? (
                <span style={styles.huntingBadge}>狩場</span>
              ) : null}

              {hasDay || hasNight ? (
                <span style={styles.timeIconGroup}>
                  {hasDay ? <IoSunnyOutline style={styles.timeIcon} /> : null}
                  {hasNight ? <FaMoon style={styles.timeIcon} /> : null}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {hasLayerSwitch ? (
          <div
            style={{
              ...styles.layerSwitchRow,
              ...(isMobile ? styles.layerSwitchRowMobile : {}),
            }}
          >
            {layerGroups.map((group) => {
              const active = group.layerName === activeLayerName;

              return (
                <button
                  key={group.layerName}
                  type="button"
                  onClick={() => setActiveLayerName(group.layerName)}
                  style={{
                    ...styles.layerSwitchButton,
                    ...(active ? styles.layerSwitchButtonActive : {}),
                  }}
                >
                  {group.layerName}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div style={styles.mapWrap}>
        <MonsterMapOverlay
          spawns={displaySpawns}
          imagePath={displayImagePath}
          href={mapItem?.url}
        />
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

function getHabitatsStyles() {
  return {
    section: {
      marginTop: "8px",
      width: "100%",
      maxWidth: "100%",
      minWidth: 0,
      overflowX: "clip",
      boxSizing: "border-box",
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
    tabScroller: {
      display: "flex",
      gap: "8px",
      width: "100%",
      maxWidth: "100%",
      minWidth: 0,
      overflowX: "auto",
      overflowY: "hidden",
      WebkitOverflowScrolling: "touch",
      overscrollBehaviorX: "contain",
      marginBottom: "14px",
      paddingBottom: "4px",
      boxSizing: "border-box",
      scrollbarWidth: "thin",
    },
    tabGroup: {
      display: "flex",
      gap: "8px",
      flex: "0 0 auto",
      minWidth: 0,
      maxWidth: "100%",
    },
    tabButton: {
      appearance: "none",
      border: `1px solid var(--panel-border)`,
      background: "var(--panel-bg)",
      color: "var(--text-sub)",
      padding: "8px 12px",
      borderRadius: "999px",
      fontSize: "12px",
      fontWeight: 700,
      lineHeight: 1.2,
      cursor: "pointer",
      transition: "all 0.2s ease",
      whiteSpace: "nowrap",
      flex: "0 0 auto",
      flexShrink: 0,
      boxSizing: "border-box",
      maxWidth: "100%",
    },
    tabButtonActive: {
      background: "var(--primary-bg)",
      color: "var(--primary-text)",
      border: `1px solid var(--primary-border)`,
    },
    tabButtonContent: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      minWidth: 0,
    },
    tabButtonText: {
      display: "inline-block",
      minWidth: 0,
    },
    huntingLikeIcon: {
      display: "inline-block",
      width: "14px",
      height: "14px",
      flexShrink: 0,
      color: "var(--warning-text, #f59e0b)",
      transform: "translateY(-0.5px)",
    },
    huntingLikeIconActive: {
      color: "var(--primary-text)",
      opacity: 0.92,
    },
    emptyCard: {
      borderRadius: "18px",
      padding: "18px",
      background: "var(--soft-bg)",
      border: `1px dashed var(--soft-border)`,
      color: "var(--text-muted)",
      fontWeight: 700,
    },
    mobileContentScroller: {
      display: "flex",
      overflowX: "auto",
      scrollSnapType: "x mandatory",
      WebkitOverflowScrolling: "touch",
      scrollbarWidth: "none",
      msOverflowStyle: "none",
      width: "100%",
    },
    mobilePage: {
      minWidth: "100%",
      width: "100%",
      flex: "0 0 100%",
      scrollSnapAlign: "start",
      boxSizing: "border-box",
    },
    mobilePageInner: {
      width: "100%",
      boxSizing: "border-box",
    },
    mobileCardWrap: {
      width: "100%",
      boxSizing: "border-box",
    },
    desktopGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0,1fr))",
      gap: "14px",
      width: "100%",
      minWidth: 0,
    },
    desktopCardWrap: {
      minWidth: 0,
    },
  };
}

function MapTabButton({ mapItem, isActive, onClick, styles }) {
  const liked = hasHabitatHuntingGround(mapItem);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles.tabButton,
        ...(isActive ? styles.tabButtonActive : {}),
      }}
    >
      <span style={styles.tabButtonContent}>
        <span style={styles.tabButtonText}>{mapItem?.name || "地名なし"}</span>
        {liked ? (
          <FcLike
            style={{
              ...styles.huntingLikeIcon,
              ...(isActive ? styles.huntingLikeIconActive : {}),
            }}
          />
        ) : null}
      </span>
    </button>
  );
}

export default function MonsterHabitats({ maps = [] }) {
  const isMobile = useHabitatsIsMobile();
  const styles = useMemo(() => getHabitatsStyles(), []);

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

  const pagedMaps = useMemo(() => {
    return chunkArray(normalizedMaps, pageSize);
  }, [normalizedMaps, pageSize]);

  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (activeTab > pagedMaps.length - 1) {
      setActiveTab(0);
    }
  }, [pagedMaps, activeTab]);

  useEffect(() => {
    const scroller = tabScrollerRef.current;
    const target = tabRefs.current[activeTab];
    if (!scroller || !target) return;

    const nextLeft =
      target.offsetLeft - (scroller.clientWidth - target.offsetWidth) / 2;

    scroller.scrollTo({
      left: Math.max(0, nextLeft),
      behavior: "smooth",
    });
  }, [activeTab]);

  useEffect(() => {
    if (!isMobile) return;

    const el = contentScrollerRef.current;
    if (!el) return;

    const pageWidth = el.clientWidth;
    isProgrammaticScrollRef.current = true;

    el.scrollTo({
      left: pageWidth * activeTab,
      behavior: "auto",
    });

    const timer = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 300);

    return () => clearTimeout(timer);
  }, [activeTab, isMobile]);

  useEffect(() => {
    if (!isMobile) return;

    const el = contentScrollerRef.current;
    if (!el) return;

    function handleScroll() {
      if (isProgrammaticScrollRef.current) return;

      const pageWidth = el.clientWidth || 1;
      const nextTab = Math.round(el.scrollLeft / pageWidth);

      if (nextTab !== activeTab && nextTab >= 0 && nextTab < pagedMaps.length) {
        setActiveTab(nextTab);
      }
    }

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [activeTab, isMobile, pagedMaps.length]);

  if (normalizedMaps.length === 0) {
    return (
      <section className={moduleStyles.root} style={styles.section}>
        <div style={styles.header}>
          <h2 style={styles.title}>出現場所</h2>
        </div>
        <div style={styles.emptyCard}>出現場所データなし</div>
      </section>
    );
  }

  return (
    <section className={moduleStyles.root} style={styles.section}>
      <div style={styles.header}>
        <h2 style={styles.title}>出現場所</h2>
      </div>

      <div ref={tabScrollerRef} style={styles.tabScroller}>
        {pagedMaps.map((group, index) => {
          const isActive = index === activeTab;

          return (
            <div
              key={`tab-group-${index}`}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              style={styles.tabGroup}
            >
              {group.map((mapItem) => (
                <MapTabButton
                  key={`tab-${index}-${mapItem.id ?? mapItem.name}`}
                  mapItem={mapItem}
                  isActive={isActive}
                  onClick={() => setActiveTab(index)}
                  styles={styles}
                />
              ))}
            </div>
          );
        })}
      </div>

      {isMobile ? (
        <div ref={contentScrollerRef} style={styles.mobileContentScroller}>
          {pagedMaps.map((group, index) => (
            <div key={`page-${index}`} style={styles.mobilePage}>
              <div style={styles.mobilePageInner}>
                {group.map((mapItem) => (
                  <div
                    key={mapItem.id ?? mapItem.name}
                    style={styles.mobileCardWrap}
                  >
                    <MonsterMapCard mapItem={mapItem} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.desktopGrid}>
          {(pagedMaps[activeTab] ?? []).map((mapItem) => (
            <div
              key={mapItem.id ?? mapItem.name}
              style={styles.desktopCardWrap}
            >
              <MonsterMapCard mapItem={mapItem} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
