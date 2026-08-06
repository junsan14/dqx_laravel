"use client";

export default function CraftTypeList({
  craftTypes,
  loading,
  selectedId,
  onSelect,
}) {
  if (loading) {
    return <div style={styles.empty}>読み込み中...</div>;
  }

  if (!craftTypes?.length) {
    return <div style={styles.empty}>職人種別が見つからない</div>;
  }

  return (
    <div style={styles.list}>
      {craftTypes.map((item) => {
        const active = Number(selectedId) === Number(item.id);
        const greatSuccessRate =
          item?.greatSuccessRate == null || item?.greatSuccessRate === ""
            ? null
            : Number(item.greatSuccessRate);
        const rateLabel = Number.isFinite(greatSuccessRate)
          ? `大成功 ${greatSuccessRate.toLocaleString("ja-JP", {
              maximumFractionDigits: 2,
            })}%`
          : "大成功率 未設定";

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            style={{
              ...styles.item,
              ...(active ? styles.activeItem : {}),
            }}
          >
            <div style={styles.topRow}>
              <span style={styles.name}>{item.name || "名称未設定"}</span>
              <span style={styles.rateBadge}>{rateLabel}</span>
            </div>

            <div style={styles.meta}>key: {item.key || "-"}</div>
          </button>
        );
      })}
    </div>
  );
}

const styles = {
  list: {
    display: "grid",
    gap: 8,
  },

  item: {
    width: "100%",
    textAlign: "left",
    border: "1px solid var(--soft-border)",
    background: "var(--panel-bg)",
    color: "var(--page-text)",
    borderRadius: 10,
    padding: 12,
    cursor: "pointer",
    boxSizing: "border-box",
  },

  activeItem: {
    borderColor: "var(--accent)",
    boxShadow: "0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent)",
  },

  topRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
  },

  name: {
    fontWeight: 800,
    fontSize: 14,
    lineHeight: 1.4,
  },

  rateBadge: {
    flexShrink: 0,
    border: "1px solid var(--soft-border)",
    background: "var(--soft-bg)",
    color: "var(--text-sub)",
    borderRadius: 999,
    padding: "3px 7px",
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  meta: {
    marginTop: 6,
    fontSize: 12,
    color: "var(--text-sub)",
    wordBreak: "break-all",
  },

  empty: {
    padding: 14,
    color: "var(--text-sub)",
    fontSize: 13,
  },
};