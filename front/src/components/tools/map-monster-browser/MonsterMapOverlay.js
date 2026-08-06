"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import Image from "next/image";
import { getMonsterAssetUrl } from "@/lib/monsters";
import styles from "./MonsterMapOverlay.module.css";

const GRID_SIZE = 8;
const ORIGINAL_IMAGE_WIDTH = 490;
const ORIGINAL_IMAGE_HEIGHT = 565;
const CROP_TOP_PX = ORIGINAL_IMAGE_HEIGHT - ORIGINAL_IMAGE_WIDTH;
const TOP_AXIS_PX = 13;
const LEFT_AXIS_PX = 3.3;
const RIGHT_TRIM_PX = 0;
const BOTTOM_TRIM_PX = 0;

const BUBBLE_OFFSET_X_PERCENT = 3;
const BUBBLE_OFFSET_Y_PERCENT = 3;
const BUBBLE_WIDTH_SCALE = 1;
const BUBBLE_HEIGHT_SCALE = 1;
const BUBBLE_INNER_PADDING_CELLS = 0.08;

const DESKTOP_BREAKPOINT = 920;
const LABEL_GAP_PX = 12;
const CONNECTOR_LENGTH_PX = 14;
const LABEL_LANE_STEP_PX = 34;

const GRID_SOURCE_X = LEFT_AXIS_PX;
const GRID_SOURCE_Y = CROP_TOP_PX + TOP_AXIS_PX;

const GRID_SOURCE_SIZE = Math.min(
  ORIGINAL_IMAGE_WIDTH - LEFT_AXIS_PX - RIGHT_TRIM_PX,
  ORIGINAL_IMAGE_HEIGHT - GRID_SOURCE_Y - BOTTOM_TRIM_PX
);

const MAP_CROP = {
  widthPercent: (ORIGINAL_IMAGE_WIDTH / GRID_SOURCE_SIZE) * 100,
  heightPercent: (ORIGINAL_IMAGE_HEIGHT / GRID_SOURCE_SIZE) * 100,
  offsetXPercent: (GRID_SOURCE_X / ORIGINAL_IMAGE_WIDTH) * 100,
  offsetYPercent: (GRID_SOURCE_Y / ORIGINAL_IMAGE_HEIGHT) * 100,
};

function useIsMobile(breakpoint = DESKTOP_BREAKPOINT) {
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
    const minCol = Math.min(...normalizedCells.map((cell) => cell.col));
    const maxCol = Math.max(...normalizedCells.map((cell) => cell.col));
    const minRow = Math.min(...normalizedCells.map((cell) => cell.row));
    const maxRow = Math.max(...normalizedCells.map((cell) => cell.row));
    const widthCells = maxCol - minCol + 1;
    const heightCells = maxRow - minRow + 1;
    const cellCount = normalizedCells.length;

    groups.push({
      cells: normalizedCells,
      minCol,
      maxCol,
      minRow,
      maxRow,
      label: buildRectLabel(normalizedCells),
      isMerged: normalizedCells.length > 1,
      widthCells,
      heightCells,
      cellCount,
      isBigBubble:
        widthCells >= 4 || heightCells >= 4 || cellCount >= 10,
      isFullArea:
        (widthCells >= 7 && heightCells >= 7) ||
        cellCount >= 32 ||
        (widthCells === 8 && heightCells >= 6) ||
        (heightCells === 8 && widthCells >= 6),
    });
  }

  return groups;
}

function normalizeMetaValue(value) {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text || text === "[]" || text === "null" || text === "undefined") return "";
  return text;
}

function joinUniqueMonsterNames(spawns = [], monstersById = {}) {
  const unique = new Map();

  for (const spawn of Array.isArray(spawns) ? spawns : []) {
    const monsterId = Number(spawn?.monster_id);
    const monster = monstersById?.[monsterId] ?? {};
    const name = normalizeMetaValue(monster?.name ?? spawn?.monster_name);

    if (!name) continue;

    const key = monsterId > 0 ? `id-${monsterId}` : `name-${name}`;
    if (unique.has(key)) continue;

    const rawOrder = Number(
      monster?.display_order ??
        monster?.monster_no ??
        spawn?.monster_display_order
    );

    unique.set(key, {
      id: monsterId,
      name,
      displayOrder:
        Number.isFinite(rawOrder) && rawOrder > 0
          ? rawOrder
          : Number.MAX_SAFE_INTEGER,
    });
  }

  return Array.from(unique.values())
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) {
        return a.displayOrder - b.displayOrder;
      }

      const nameDiff = a.name.localeCompare(b.name, "ja");
      if (nameDiff !== 0) return nameDiff;

      return a.id - b.id;
    })
    .map((row) => row.name);
}

function bubbleContainsSpawn(group, spawn) {
  const bubbleCellSet = new Set(group.cells.map((cell) => cell.label));
  const spawnCells = parseAreaList(spawn?.area ?? spawn?.coords)
    .map(normalizeAreaCell)
    .filter(Boolean);

  return spawnCells.some((cell) => bubbleCellSet.has(cell));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getEdgePlacement(leftPercent, topPercent) {
  if (topPercent <= 26) return "top";
  if (leftPercent >= 74) return "right";
  if (leftPercent <= 26) return "left";
  if (topPercent >= 74) return "bottom";
  return "bottom";
}

function getLabelPlacementForBubble(bubbleLike) {
  if (bubbleLike.isFullArea || bubbleLike.isBigBubble) return "center";

  const edge = getEdgePlacement(bubbleLike.left, bubbleLike.top);

  if (edge === "top") return "bottom";
  if (edge === "right") return "left";
  if (edge === "left") return "right";
  if (edge === "bottom") return "top";

  return "bottom";
}

function getBubblePosition(
  group,
  spawns = [],
  monstersById = {},
  showMonsterNameInBubble = false
) {
  const cellPercent = 100 / GRID_SIZE;
  const paddingPercent = cellPercent * BUBBLE_INNER_PADDING_CELLS;

  const widthCells = group.maxCol - group.minCol + 1;
  const heightCells = group.maxRow - group.minRow + 1;

  let left =
    group.minCol * cellPercent +
    (widthCells * cellPercent) / 2 +
    BUBBLE_OFFSET_X_PERCENT;

  let top =
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

  const halfW = width / 2;
  const halfH = height / 2;

  left = clamp(left, halfW + 1, 100 - halfW - 1);
  top = clamp(top, halfH + 1, 100 - halfH - 1);

  const relatedSpawns = (spawns ?? []).filter((spawn) =>
    bubbleContainsSpawn(group, spawn)
  );

  const monsterNames = joinUniqueMonsterNames(relatedSpawns, monstersById);

  const base = {
    key: group.label,
    label: group.label,
    monsterLabel: showMonsterNameInBubble ? monsterNames.join(" / ") : "",
    monsterNames,
    left,
    top,
    width,
    height,
    isFullArea: group.isFullArea,
    isBigBubble: group.isBigBubble,
  };

  return {
    ...base,
    labelPlacement: getLabelPlacementForBubble(base),
  };
}

function withTooltipLanes(bubbles = []) {
  const grouped = { top: [], bottom: [], left: [], right: [] };

  bubbles.forEach((bubble, index) => {
    if (bubble.labelPlacement === "center") return;
    grouped[bubble.labelPlacement]?.push({ bubble, index });
  });

  const result = bubbles.map((bubble) =>
    bubble.labelPlacement === "center" ? { ...bubble, lane: 0 } : null
  );

  Object.entries(grouped).forEach(([placement, items]) => {
    const sorted = [...items].sort((a, b) => {
      if (placement === "left" || placement === "right") {
        return a.bubble.top - b.bubble.top;
      }
      return a.bubble.left - b.bubble.left;
    });

    let lane = 0;
    let prevAnchor = null;

    sorted.forEach(({ bubble, index }) => {
      const anchor =
        placement === "left" || placement === "right" ? bubble.top : bubble.left;
      const threshold = placement === "left" || placement === "right" ? 10 : 12;

      if (prevAnchor == null || Math.abs(anchor - prevAnchor) > threshold) {
        lane = 0;
      } else {
        lane += 1;
      }

      prevAnchor = anchor;
      result[index] = { ...bubble, lane };
    });
  });

  return result.filter(Boolean);
}

function getExternalPositionStyle(placement, lane = 0) {
  const laneOffset = lane * LABEL_LANE_STEP_PX;

  switch (placement) {
    case "top":
      return {
        bottom: `calc(100% + ${LABEL_GAP_PX + laneOffset}px)`,
        left: "50%",
        transform: "translateX(-50%)",
      };
    case "left":
      return {
        right: `calc(100% + ${LABEL_GAP_PX + laneOffset}px)`,
        top: "50%",
        transform: "translateY(-50%)",
      };
    case "right":
      return {
        left: `calc(100% + ${LABEL_GAP_PX + laneOffset}px)`,
        top: "50%",
        transform: "translateY(-50%)",
      };
    case "bottom":
      return {
        top: `calc(100% + ${LABEL_GAP_PX + laneOffset}px)`,
        left: "50%",
        transform: "translateX(-50%)",
      };
    case "center":
    default:
      return {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      };
  }
}

function getConnectorStyle(placement, lane = 0) {
  const length = CONNECTOR_LENGTH_PX + lane * LABEL_LANE_STEP_PX;

  switch (placement) {
    case "top":
      return {
        bottom: "100%",
        left: "50%",
        width: "2px",
        height: `${length}px`,
        transform: "translateX(-50%)",
      };
    case "left":
      return {
        right: "100%",
        top: "50%",
        width: `${length}px`,
        height: "2px",
        transform: "translateY(-50%)",
      };
    case "right":
      return {
        left: "100%",
        top: "50%",
        width: `${length}px`,
        height: "2px",
        transform: "translateY(-50%)",
      };
    case "bottom":
      return {
        top: "100%",
        left: "50%",
        width: "2px",
        height: `${length}px`,
        transform: "translateX(-50%)",
      };
    default:
      return null;
  }
}

function BubbleNameLabel({ bubble }) {
  if (!bubble?.monsterLabel) return null;

  return (
    <span className={styles.externalLabelMonster}>
      {bubble.monsterLabel}
    </span>
  );
}

export default function MonsterMapOverlay({
  spawns = [],
  imagePath,
  href,
  monstersById = {},
  showMonsterNameInBubble = false,
}) {
  const t = useTranslations("MonsterMapOverlay");
  const isMobile = useIsMobile();
  const resolvedImageUrl = useMemo(
    () => getMonsterAssetUrl(imagePath),
    [imagePath]
  );

  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
  }, [resolvedImageUrl]);

  const cells = useMemo(() => collectUniqueCells(spawns), [spawns]);

  const bubbles = useMemo(() => {
    const base = buildMergedGroups(cells)
      .map((group) =>
        getBubblePosition(group, spawns, monstersById, showMonsterNameInBubble)
      )
      .filter(Boolean);

    return withTooltipLanes(base);
  }, [cells, spawns, monstersById, showMonsterNameInBubble]);

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
        <div className={styles.mapImageBox}>
          <div className={styles.mapImageViewport}>
            {!imageLoaded ? (
              <div className={styles.loadingOverlay}>
                <div className={styles.loadingShimmer} />
                <span className={styles.loadingText}>{t("loading")}</span>
              </div>
            ) : null}

            <div
              className={styles.imageInner}
              style={{ opacity: imageLoaded ? 1 : 0 }}
            >
              <div
                className={styles.imageCropInner}
                style={{
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
                  sizes="(max-width: 920px) 100vw, 430px"
                  className={styles.mapImage}
                  onLoad={() => setImageLoaded(true)}
                  unoptimized
                />
              </div>
            </div>
          </div>

          <div className={styles.bubbleLayer}>
            {bubbles.map((bubble) => {
              const wrapperStyle = {
                left: `${bubble.left}%`,
                top: `${bubble.top}%`,
                width: `${bubble.width}%`,
                height: `${bubble.height}%`,
              };

              const labelStyle = getExternalPositionStyle(
                bubble.labelPlacement,
                bubble.lane
              );

              const connectorStyle =
                bubble.labelPlacement === "center"
                  ? null
                  : getConnectorStyle(bubble.labelPlacement, bubble.lane);

              return (
                <div key={bubble.key} className={styles.bubbleWrap} style={wrapperStyle}>
                  <div
                    className={styles.spawnBubble}
                    aria-label={t("bubbleAriaLabel", {
                      area: bubble.label,
                    })}
                    title={t("bubbleAriaLabel", {
                      area: bubble.label,
                    })}
                  >
                    <span className={styles.bubbleInner}>
                      {isMobile ? <span className={styles.bubbleHintIcon}>i</span> : null}
                    </span>
                  </div>

                  {connectorStyle ? (
                    <span
                      className={styles.externalConnector}
                      style={connectorStyle}
                    />
                  ) : null}

                  {bubble.monsterLabel ? (
                    <span className={styles.externalLabel} style={labelStyle}>
                      <BubbleNameLabel bubble={bubble} />
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
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