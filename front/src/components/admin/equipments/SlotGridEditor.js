"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getCraftProductGrid,
  safeJsonParse,
  toJsonString,
  str,
} from "./equipmentFormHelpers";
import LabeledField from "./LabeledField";

const CUSTOM_GRID_MIN = 1;
const CUSTOM_GRID_MAX = 12;

function clampGridSize(value) {
  const numericValue = Number.parseInt(value, 10);

  if (!Number.isFinite(numericValue)) return CUSTOM_GRID_MIN;

  return Math.min(
    CUSTOM_GRID_MAX,
    Math.max(CUSTOM_GRID_MIN, numericValue)
  );
}

function getGridDimensions(gridLike) {
  if (!Array.isArray(gridLike) || gridLike.length === 0) {
    return { rows: 0, cols: 0 };
  }

  if (!Array.isArray(gridLike[0])) {
    return { rows: 1, cols: gridLike.length };
  }

  return {
    rows: gridLike.length,
    cols: Math.max(
      ...gridLike.map((row) => (Array.isArray(row) ? row.length : 0)),
      0
    ),
  };
}

function getRawGridValue(gridLike, rowIndex, colIndex) {
  if (!Array.isArray(gridLike)) return undefined;

  if (!Array.isArray(gridLike[0])) {
    return rowIndex === 0 ? gridLike[colIndex] : undefined;
  }

  return gridLike?.[rowIndex]?.[colIndex];
}

function makeCellKey(rowIndex, colIndex) {
  return `${rowIndex}:${colIndex}`;
}

function buildGrid(gridLike, rows, cols, disabledCellSet) {
  return Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: cols }, (_, colIndex) => {
      const key = makeCellKey(rowIndex, colIndex);
      if (disabledCellSet.has(key)) return null;

      const value = getRawGridValue(gridLike, rowIndex, colIndex);
      return value == null ? "" : value;
    })
  );
}

function resizeGrid(currentGrid, rows, cols, disabledCellSet) {
  return Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: cols }, (_, colIndex) => {
      const key = makeCellKey(rowIndex, colIndex);
      if (disabledCellSet.has(key)) return null;

      const value = currentGrid?.[rowIndex]?.[colIndex];
      return value == null ? "" : value;
    })
  );
}

function serializeGrid(grid2d, disabledCellSet) {
  if (!Array.isArray(grid2d) || grid2d.length === 0) return null;

  const rows = grid2d.length;
  const cols = Math.max(
    ...grid2d.map((row) => (Array.isArray(row) ? row.length : 0)),
    0
  );

  const normalized = Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: cols }, (_, colIndex) => {
      const key = makeCellKey(rowIndex, colIndex);
      if (disabledCellSet.has(key)) return null;

      const value = grid2d?.[rowIndex]?.[colIndex];
      return value == null ? "" : value;
    })
  );

  return rows === 1 ? normalized[0] : normalized;
}

export default function SlotGridEditor({ row, onPatch }) {
  const [gridRows, setGridRows] = useState(1);
  const [gridCols, setGridCols] = useState(1);
  const [grid2d, setGrid2d] = useState([[""]]);

  const craftProductType =
    row?.craftProductType ?? row?.craft_product_type ?? null;
  const preset = useMemo(
    () => getCraftProductGrid(craftProductType),
    [craftProductType]
  );
  const isCustomGrid = !preset;

  const parsed = useMemo(() => {
    if (!row) {
      return {
        nextRows: 1,
        nextCols: 1,
        nextGrid: [[""]],
        disabledCellSet: new Set(),
        usesExistingShape: false,
      };
    }

    const gridLike = safeJsonParse(row.slotGridJson, null);
    const existing = getGridDimensions(gridLike);
    const hasExistingGrid = existing.rows > 0 && existing.cols > 0;
    const usesExistingShape =
      hasExistingGrid &&
      !!preset &&
      (existing.rows !== preset.rows || existing.cols !== preset.cols);

    const nextRows = usesExistingShape
      ? existing.rows
      : preset?.rows ?? (existing.rows > 0 ? existing.rows : 1);
    const nextCols = usesExistingShape
      ? existing.cols
      : preset?.cols ?? (existing.cols > 0 ? existing.cols : 1);

    const disabledCellSet = new Set();

    // 通常は作成タイプのテンプレートを使用する。
    // 既存データだけ形が異なる特殊装備は、既存JSON内のnullを優先して保持する。
    if (!usesExistingShape && Array.isArray(preset?.disabledCells)) {
      preset.disabledCells.forEach(([rowIndex, colIndex]) => {
        if (rowIndex < nextRows && colIndex < nextCols) {
          disabledCellSet.add(makeCellKey(rowIndex, colIndex));
        }
      });
    }

    if (hasExistingGrid) {
      for (let rowIndex = 0; rowIndex < existing.rows; rowIndex++) {
        for (let colIndex = 0; colIndex < existing.cols; colIndex++) {
          if (getRawGridValue(gridLike, rowIndex, colIndex) === null) {
            disabledCellSet.add(makeCellKey(rowIndex, colIndex));
          }
        }
      }
    }

    return {
      nextRows,
      nextCols,
      nextGrid: buildGrid(gridLike, nextRows, nextCols, disabledCellSet),
      disabledCellSet,
      usesExistingShape,
    };
  }, [
    row?.__key,
    row?.slotGridJson,
    craftProductType?.id,
    preset?.rows,
    preset?.cols,
    JSON.stringify(preset?.disabledCells ?? []),
  ]);

  useEffect(() => {
    setGridRows(parsed.nextRows);
    setGridCols(parsed.nextCols);
    setGrid2d(parsed.nextGrid);
  }, [parsed]);

  if (!row) return null;

  function patchGrid(nextGrid) {
    const serialized = serializeGrid(nextGrid, parsed.disabledCellSet);

    onPatch?.({
      slotGridJson:
        serialized == null ? "" : toJsonString(serialized, "[]"),
    });
  }

  function updateGridCell(rowIndex, colIndex, value) {
    const next = resizeGrid(
      grid2d,
      gridRows,
      gridCols,
      parsed.disabledCellSet
    );

    next[rowIndex][colIndex] = value;
    setGrid2d(next);
    patchGrid(next);
  }

  function resizeCustomGrid(nextRowsValue, nextColsValue) {
    if (!isCustomGrid) return;

    const nextRows = clampGridSize(nextRowsValue);
    const nextCols = clampGridSize(nextColsValue);
    const nextGrid = resizeGrid(
      grid2d,
      nextRows,
      nextCols,
      parsed.disabledCellSet
    );

    setGridRows(nextRows);
    setGridCols(nextCols);
    setGrid2d(nextGrid);
    patchGrid(nextGrid);
  }

  function handleGridPaste(startRow, startCol, text) {
    const raw = str(text).replace(/\r\n?/g, "\n");
    if (!raw) return;

    const lines = raw.split("\n").filter((line) => line.length > 0);
    if (!lines.length) return;

    const pasted = lines.map((line) => line.split("\t"));
    const pastedRows = pasted.length;
    const pastedCols = Math.max(
      ...pasted.map((rowValues) => rowValues.length),
      0
    );

    const nextRows = preset?.rows ?? Math.max(gridRows, startRow + pastedRows);
    const nextCols = preset?.cols ?? Math.max(gridCols, startCol + pastedCols);
    const nextGrid = resizeGrid(
      grid2d,
      nextRows,
      nextCols,
      parsed.disabledCellSet
    );

    for (let rowIndex = 0; rowIndex < pastedRows; rowIndex++) {
      for (let colIndex = 0; colIndex < pasted[rowIndex].length; colIndex++) {
        const targetRow = startRow + rowIndex;
        const targetCol = startCol + colIndex;
        const targetKey = makeCellKey(targetRow, targetCol);

        if (targetRow >= nextRows || targetCol >= nextCols) continue;
        if (parsed.disabledCellSet.has(targetKey)) continue;

        nextGrid[targetRow][targetCol] = pasted[rowIndex][colIndex];
      }
    }

    setGridRows(nextRows);
    setGridCols(nextCols);
    setGrid2d(nextGrid);
    patchGrid(nextGrid);
  }

  return (
    <LabeledField label="大成功数値">
      <div style={styles.slotGridBox}>
        {isCustomGrid ? (
          <div style={styles.customGridBox}>
            <div style={styles.customGridHead}>
              <div>
                <div style={styles.customGridTitle}>カスタムグリッド</div>
                <div style={styles.customGridText}>
                  この職人作成タイプには標準グリッドがないため、行数と列数を指定できます
                </div>
              </div>

              <div style={styles.customSizeBadge}>
                {gridRows}行 × {gridCols}列
              </div>
            </div>

            <div style={styles.dimensionControls}>
              <label style={styles.dimensionField}>
                <span style={styles.dimensionLabel}>行数</span>
                <input
                  type="number"
                  min={CUSTOM_GRID_MIN}
                  max={CUSTOM_GRID_MAX}
                  style={styles.dimensionInput}
                  value={gridRows}
                  onChange={(event) =>
                    resizeCustomGrid(event.target.value, gridCols)
                  }
                />
              </label>

              <span style={styles.dimensionCross}>×</span>

              <label style={styles.dimensionField}>
                <span style={styles.dimensionLabel}>列数</span>
                <input
                  type="number"
                  min={CUSTOM_GRID_MIN}
                  max={CUSTOM_GRID_MAX}
                  style={styles.dimensionInput}
                  value={gridCols}
                  onChange={(event) =>
                    resizeCustomGrid(gridRows, event.target.value)
                  }
                />
              </label>
            </div>
          </div>
        ) : null}

        {parsed.usesExistingShape ? (
          <div style={styles.noticeText}>
            この装備は作成タイプの標準グリッドと異なるため、既存の形を維持しています
          </div>
        ) : null}

        <div style={styles.gridOuter}>
          <div
            style={{
              ...styles.gridPlain,
              gridTemplateColumns: `repeat(${Math.max(gridCols, 1)}, 78px)`,
            }}
          >
            {Array.from({ length: gridRows }).flatMap((_, rowIndex) =>
              Array.from({ length: gridCols }).map((__, colIndex) => {
                const disabled = parsed.disabledCellSet.has(
                  makeCellKey(rowIndex, colIndex)
                );

                return (
                  <input
                    key={`${rowIndex}-${colIndex}`}
                    style={gridCellStyle(disabled)}
                    value={grid2d?.[rowIndex]?.[colIndex] ?? ""}
                    disabled={disabled}
                    onChange={(event) =>
                      updateGridCell(rowIndex, colIndex, event.target.value)
                    }
                    onPaste={(event) => {
                      const text = event.clipboardData?.getData("text") ?? "";
                      if (!text) return;
                      event.preventDefault();
                      handleGridPaste(rowIndex, colIndex, text);
                    }}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    </LabeledField>
  );
}

const styles = {
  slotGridBox: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minWidth: 0,
  },
  customGridBox: {
    border: "1px dashed var(--soft-border)",
    borderRadius: 12,
    padding: 12,
    background: "var(--soft-bg)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  customGridHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },
  customGridTitle: {
    color: "var(--text-main)",
    fontSize: 13,
    fontWeight: 800,
  },
  customGridText: {
    marginTop: 3,
    color: "var(--text-muted)",
    fontSize: 12,
    lineHeight: 1.6,
  },
  customSizeBadge: {
    border: "1px solid var(--soft-border)",
    borderRadius: 999,
    padding: "4px 9px",
    background: "var(--card-bg)",
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  dimensionControls: {
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  dimensionField: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },
  dimensionLabel: {
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 700,
  },
  dimensionInput: {
    width: 84,
    height: 40,
    border: "1px solid var(--input-border)",
    borderRadius: 9,
    background: "var(--input-bg)",
    color: "var(--input-text)",
    padding: "7px 10px",
    boxSizing: "border-box",
    fontSize: 14,
  },
  dimensionCross: {
    height: 40,
    display: "inline-flex",
    alignItems: "center",
    color: "var(--text-muted)",
    fontWeight: 800,
  },
  gridOuter: {
    overflowX: "auto",
    display: "flex",
    justifyContent: "center",
    width: "100%",
  },
  gridPlain: {
    display: "grid",
    gap: 8,
  },
  noticeText: {
    color: "var(--text-muted)",
    fontSize: 12,
    lineHeight: 1.6,
  },
};

const gridCellStyle = (disabled) => ({
  width: 78,
  height: 44,
  border: "1px solid var(--input-border)",
  borderRadius: 10,
  background: disabled ? "var(--input-disabled-bg)" : "var(--input-bg)",
  color: disabled ? "var(--text-muted)" : "var(--input-text)",
  padding: "8px 10px",
  boxSizing: "border-box",
});
