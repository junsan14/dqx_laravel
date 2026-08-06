"use client";


export default function CraftProductTypeList({
  craftProductTypes,
  loading,
  selectedId,
  onSelect,
}) {
  if (loading) {
    return <div style={styles.empty}>読み込み中...</div>;
  }

  if (!craftProductTypes?.length) {
    return <div style={styles.empty}>職人作成タイプが見つからない</div>;
  }

  return (
    <div style={styles.list}>
      {craftProductTypes.map((item) => {
        const active = Number(selectedId) === Number(item.id);
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
              <span style={styles.name}> {item.name || "-"}</span>
              
             
             
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
    minWidth: 0,
    fontWeight: 800,
    fontSize: 14,
    lineHeight: 1.4,
  },

  subName: {
    marginTop: 4,
    fontSize: 11,
    color: "var(--text-sub)",
  },

  gridBadge: {
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

  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 8,
  },

  badge: {
    borderRadius: 999,
    padding: "3px 7px",
    background: "var(--soft-bg)",
    color: "var(--text-sub)",
    fontSize: 11,
    fontWeight: 700,
  },

  meta: {
    marginTop: 7,
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
