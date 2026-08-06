"use client";

export default function MapListPane({
  maps = [],
  loading = false,
  selectedId = null,
  onSelect,
}) {
  if (loading) {
    return <div style={styles.empty}>読み込み中...</div>;
  }

  if (!maps.length) {
    return <div style={styles.empty}>マップがまだない</div>;
  }

  return (
    <div style={styles.list}>
      {maps.map((row) => {
        const active = Number(row.id) === Number(selectedId);

        return (
          <button
            key={row.id}
            type="button"
            onClick={() => onSelect?.(row.id)}
            style={{
              ...styles.item,
              ...(active ? styles.itemActive : null),
            }}
          >
            <div style={styles.itemInfo}>
              <div style={styles.itemHeader}>
                <span style={styles.idText}>#{row.id}</span>

                <span style={styles.itemTitle}>
                  {row.name || "名称未設定"}
                </span>
              </div>

              <div style={styles.itemMetaRow}>
                <span style={styles.meta}>
                  {row.continent || "大陸未設定"}
                </span>

                <span style={styles.layerBadge}>
                  {Array.isArray(row.layers) ? row.layers.length : 0}層
                </span>
              </div>
            </div>

          </button>
        );
      })}
    </div>
  );
}

const styles = {
  list: {
    display: "grid",
    gap: "8px",
    maxHeight: "min(60vh, 560px)",
    overflowY: "auto",
    minWidth: 0,
    paddingRight: "2px",
  },

  item: {
    width: "100%",
    minWidth: 0,
    padding: "10px 12px",
    border: "1px solid var(--card-border, #e2e8f0)",
    borderRadius: "10px",
    background: "var(--card-bg, #ffffff)",
    color: "var(--text-main, #0f172a)",
    textAlign: "left",
    cursor: "pointer",
    transition:
      "border-color 0.15s ease, background 0.15s ease, transform 0.15s ease",
  },

  itemInfo: {
    display: "grid",
    gap: "6px",
    minWidth: 0,
  },

  itemHeader: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    minWidth: 0,
  },

  idText: {
    flexShrink: 0,
    padding: "2px 5px",
    borderRadius: "5px",
    background: "var(--soft-bg, #f1f5f9)",
    color: "var(--text-muted, #64748b)",
    fontSize: "10px",
    fontWeight: 700,
    lineHeight: 1.2,
  },

  itemTitle: {
    minWidth: 0,
    overflow: "hidden",
    color: "var(--text-main, #0f172a)",
    fontSize: "14px",
    fontWeight: 700,
    lineHeight: 1.35,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  itemMetaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    minWidth: 0,
  },

  meta: {
    minWidth: 0,
    overflow: "hidden",
    color: "var(--text-sub, #475569)",
    fontSize: "12px",
    lineHeight: 1.3,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  layerBadge: {
    flexShrink: 0,
    padding: "2px 7px",
    border: "1px solid var(--soft-border, #dbe3ec)",
    borderRadius: "999px",
    background: "var(--soft-bg, #f8fafc)",
    color: "var(--text-muted, #64748b)",
    fontSize: "10px",
    fontWeight: 700,
    lineHeight: 1.3,
  },

  itemActive: {
    borderColor: "var(--primary-border, #2563eb)",
    background: "var(--selected-bg, var(--soft-bg, #eff6ff))",
  },

  empty: {
    padding: "18px",
    border: "1px dashed var(--card-border, #cbd5e1)",
    borderRadius: "12px",
    background: "var(--card-bg, #ffffff)",
    color: "var(--text-muted, #64748b)",
    fontSize: "13px",
  },
};