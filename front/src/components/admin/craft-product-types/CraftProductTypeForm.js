"use client";

const KIND_OPTIONS = [
  "weapon",
  "armor",
  "sewing",
  "tool",
  "fishing",
  "furniture",
  "other",
];

function toSafeDimension(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return fallback;
  return Math.min(20, Math.max(1, numeric));
}

function normalizeDisabledCells(cells, rows, cols) {
  if (!Array.isArray(cells)) return [];

  const unique = new Map();

  cells.forEach((cell) => {
    if (!Array.isArray(cell) || cell.length !== 2) return;

    const row = Number(cell[0]);
    const col = Number(cell[1]);

    if (!Number.isInteger(row) || !Number.isInteger(col)) return;
    if (row < 0 || col < 0 || row >= rows || col >= cols) return;

    unique.set(`${row}:${col}`, [row, col]);
  });

  return Array.from(unique.values());
}

function getGrid(craftProductType) {
  const raw = craftProductType?.gridJson;
  if (!raw) return null;

  const rows = toSafeDimension(raw.rows);
  const cols = toSafeDimension(raw.cols);

  return {
    rows,
    cols,
    disabledCells: normalizeDisabledCells(raw.disabledCells, rows, cols),
  };
}

function isDisabledCell(grid, row, col) {
  return (grid?.disabledCells ?? []).some(
    (cell) => Number(cell?.[0]) === row && Number(cell?.[1]) === col
  );
}

export default function CraftProductTypeForm({
  craftProductType,
  craftTypes = [],
  onChange,
  isMobile,
}) {
  const grid = getGrid(craftProductType);
  const selectedCraftType = craftTypes.find(
    (item) => String(item.id) === String(craftProductType?.craftTypeId)
  );

  function updateField(name, value) {
    onChange({
      ...craftProductType,
      [name]: value,
    });
  }

  function setGrid(nextGrid) {
    updateField("gridJson", nextGrid);
  }

  function toggleGridEnabled(enabled) {
    if (!enabled) {
      setGrid(null);
      return;
    }

    setGrid({
      rows: 1,
      cols: 1,
      disabledCells: [],
    });
  }

  function updateGridDimension(name, value) {
    const current = grid ?? { rows: 1, cols: 1, disabledCells: [] };
    const nextRows =
      name === "rows" ? toSafeDimension(value) : toSafeDimension(current.rows);
    const nextCols =
      name === "cols" ? toSafeDimension(value) : toSafeDimension(current.cols);

    setGrid({
      ...current,
      [name]: name === "rows" ? nextRows : nextCols,
      rows: nextRows,
      cols: nextCols,
      disabledCells: normalizeDisabledCells(
        current.disabledCells,
        nextRows,
        nextCols
      ),
    });
  }

  function toggleDisabledCell(row, col) {
    if (!grid) return;

    const key = `${row}:${col}`;
    const current = new Map(
      grid.disabledCells.map((cell) => [`${cell[0]}:${cell[1]}`, cell])
    );

    if (current.has(key)) {
      current.delete(key);
    } else {
      current.set(key, [row, col]);
    }

    setGrid({
      ...grid,
      disabledCells: Array.from(current.values()).sort(
        (a, b) => a[0] - b[0] || a[1] - b[1]
      ),
    });
  }

  return (
    <div style={styles.form}>
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>基本情報</h2>

        <div
          style={{
            ...styles.grid,
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          }}
        >
          <Field label="管理名">
            <input
              value={craftProductType?.name ?? ""}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="例：鎧頭 / 裁縫上 / 片手剣"
              style={styles.input}
            />
            <span style={styles.helpText}>
              管理画面や内部判定で使う名称。既存データとの対応用に残す。
            </span>
          </Field>

          <Field label="ゲスト表示名">
            <input
              value={craftProductType?.displayName ?? ""}
              onChange={(event) =>
                updateField("displayName", event.target.value)
              }
              placeholder="例：頭 / 体上 / 片手剣"
              style={styles.input}
            />
            <span style={styles.helpText}>
              空欄の場合は管理名を表示する。
            </span>
          </Field>

          <Field label="key">
            <input
              value={craftProductType?.key ?? ""}
              onChange={(event) => updateField("key", event.target.value)}
              placeholder="例：armor_head / sword_1h"
              style={styles.input}
            />
          </Field>

          <Field label="kind">
            <input
              list="craft-product-kind-options"
              value={craftProductType?.kind ?? ""}
              onChange={(event) => updateField("kind", event.target.value)}
              placeholder="例：armor / weapon"
              style={styles.input}
            />
            <datalist id="craft-product-kind-options">
              {KIND_OPTIONS.map((kind) => (
                <option key={kind} value={kind} />
              ))}
            </datalist>
          </Field>

          <Field label="作成する職人">
            <select
              value={craftProductType?.craftTypeId ?? ""}
              onChange={(event) => {
                const nextId = event.target.value;
                const nextCraftType = craftTypes.find(
                  (item) => String(item.id) === String(nextId)
                );

                onChange({
                  ...craftProductType,
                  craftTypeId: nextId,
                  craftType: nextCraftType ?? null,
                });
              }}
              style={styles.input}
            >
              <option value="">選択してください</option>
              {craftTypes.map((craftType) => (
                <option key={craftType.id} value={craftType.id}>
                  {craftType.name || craftType.key || `#${craftType.id}`}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHead}>
          <div>
            <h2 style={styles.sectionTitle}>作成グリッド</h2>
            <p style={styles.sectionLead}>
              行・列と使用しないマスを設定する。マスをクリックすると有効・無効を切り替えられる。
            </p>
          </div>

          <label style={styles.toggleRow}>
            <input
              type="checkbox"
              checked={Boolean(grid)}
              onChange={(event) => toggleGridEnabled(event.target.checked)}
            />
            <span>グリッド設定を使う</span>
          </label>
        </div>

        {grid ? (
          <div style={styles.gridEditorWrap}>
            <div
              style={{
                ...styles.dimensionGrid,
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              }}
            >
              <Field label="行数 rows">
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={grid.rows}
                  onChange={(event) =>
                    updateGridDimension("rows", event.target.value)
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="列数 cols">
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={grid.cols}
                  onChange={(event) =>
                    updateGridDimension("cols", event.target.value)
                  }
                  style={styles.input}
                />
              </Field>
            </div>

            <div style={styles.gridViewport}>
              <div
                style={{
                  ...styles.cellGrid,
                  gridTemplateColumns: `repeat(${grid.cols}, minmax(58px, 74px))`,
                }}
              >
                {Array.from({ length: grid.rows }).flatMap((_, row) =>
                  Array.from({ length: grid.cols }).map((__, col) => {
                    const disabled = isDisabledCell(grid, row, col);

                    return (
                      <button
                        key={`${row}-${col}`}
                        type="button"
                        onClick={() => toggleDisabledCell(row, col)}
                        style={{
                          ...styles.cell,
                          ...(disabled ? styles.disabledCell : {}),
                        }}
                        aria-pressed={disabled}
                        title={
                          disabled
                            ? `行${row + 1} 列${col + 1}: 無効`
                            : `行${row + 1} 列${col + 1}: 有効`
                        }
                      >
                        <span style={styles.cellIndex}>
                          {row},{col}
                        </span>
                        <strong>{disabled ? "無効" : "有効"}</strong>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div style={styles.jsonPreview}>
              <div style={styles.jsonTitle}>保存される grid_json</div>
              <pre style={styles.pre}>{JSON.stringify(grid, null, 2)}</pre>
            </div>
          </div>
        ) : (
          <div style={styles.emptyGrid}>グリッド設定なし</div>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>登録プレビュー</h2>

        <div style={styles.previewCard}>
          <div style={styles.previewTop}>
            <strong>
              {craftProductType?.displayName ||
                craftProductType?.name ||
                "名称未設定"}
            </strong>
            <span style={styles.previewBadge}>
              {selectedCraftType?.name ||
                craftProductType?.craftType?.name ||
                "職人未設定"}
            </span>
          </div>

          <div style={styles.previewMeta}>
            管理名: {craftProductType?.name || "-"}
          </div>
          <div style={styles.previewMeta}>
            key: {craftProductType?.key || "-"}
          </div>
          <div style={styles.previewMeta}>
            kind: {craftProductType?.kind || "-"}
          </div>
          <div style={styles.previewMeta}>
            grid: {grid ? `${grid.rows}行 × ${grid.cols}列` : "未設定"}
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  );
}

const styles = {
  form: {
    display: "grid",
    gap: 22,
  },

  section: {
    display: "grid",
    gap: 12,
  },

  sectionHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },

  sectionTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 900,
    color: "var(--page-text)",
  },

  sectionLead: {
    margin: "6px 0 0",
    color: "var(--text-sub)",
    fontSize: 12,
    lineHeight: 1.6,
  },

  grid: {
    display: "grid",
    gap: 12,
  },

  field: {
    display: "grid",
    gap: 6,
    minWidth: 0,
  },

  label: {
    fontSize: 12,
    fontWeight: 800,
    color: "var(--text-sub)",
  },

  input: {
    width: "100%",
    minHeight: 42,
    borderRadius: 10,
    border: "1px solid var(--soft-border)",
    background: "var(--input-bg, var(--panel-bg))",
    color: "var(--page-text)",
    padding: "9px 11px",
    boxSizing: "border-box",
    outline: "none",
  },

  helpText: {
    color: "var(--text-sub)",
    fontSize: 11,
    lineHeight: 1.55,
  },

  toggleRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "var(--page-text)",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  },

  gridEditorWrap: {
    display: "grid",
    gap: 14,
    border: "1px solid var(--soft-border)",
    background: "var(--soft-bg)",
    borderRadius: 12,
    padding: 14,
    minWidth: 0,
  },

  dimensionGrid: {
    display: "grid",
    gap: 12,
  },

  gridViewport: {
    overflowX: "auto",
    paddingBottom: 4,
  },

  cellGrid: {
    display: "grid",
    gap: 7,
    width: "max-content",
    minWidth: "100%",
    justifyContent: "center",
  },

  cell: {
    minWidth: 58,
    height: 58,
    border: "1px solid var(--soft-border)",
    borderRadius: 10,
    background: "var(--panel-bg)",
    color: "var(--page-text)",
    cursor: "pointer",
    display: "grid",
    placeContent: "center",
    gap: 2,
    padding: 5,
  },

  disabledCell: {
    background:
      "repeating-linear-gradient(-45deg, var(--soft-bg), var(--soft-bg) 7px, var(--panel-bg) 7px, var(--panel-bg) 14px)",
    color: "var(--text-sub)",
    opacity: 0.72,
  },

  cellIndex: {
    fontSize: 10,
    color: "var(--text-sub)",
    fontWeight: 700,
  },

  jsonPreview: {
    display: "grid",
    gap: 7,
  },

  jsonTitle: {
    color: "var(--text-sub)",
    fontSize: 12,
    fontWeight: 800,
  },

  pre: {
    margin: 0,
    maxHeight: 230,
    overflow: "auto",
    border: "1px solid var(--soft-border)",
    borderRadius: 10,
    background: "var(--panel-bg)",
    color: "var(--page-text)",
    padding: 12,
    fontSize: 12,
    lineHeight: 1.55,
  },

  emptyGrid: {
    border: "1px dashed var(--soft-border)",
    borderRadius: 10,
    padding: 16,
    color: "var(--text-sub)",
    fontSize: 13,
    textAlign: "center",
  },

  previewCard: {
    border: "1px solid var(--soft-border)",
    background: "var(--soft-bg)",
    borderRadius: 12,
    padding: 14,
    display: "grid",
    gap: 8,
  },

  previewTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },

  previewBadge: {
    borderRadius: 999,
    padding: "4px 9px",
    background: "var(--panel-bg)",
    color: "var(--text-sub)",
    fontSize: 11,
    fontWeight: 800,
  },

  previewMeta: {
    fontSize: 13,
    color: "var(--text-sub)",
    wordBreak: "break-all",
  },
};
