"use client";

export default function ContinentList({
  continents = [],
  selectedId = null,
  onSelect,
}) {
  if (!continents.length) {
    return <div style={styles.empty}>大陸がありません</div>;
  }

  return (
    <div style={styles.wrap}>
      {continents.map((continent) => {
        
        const active = selectedId === continent.id;

        return (
          <button
            key={continent.id}
            type="button"
            onClick={() => onSelect?.(continent.id)}
            style={{
              ...styles.item,
              ...(active ? styles.itemActive : {}),
            }}
          >
            <div style={styles.topRow}>
              <span style={styles.displayOrder}>
                {continent.display_order ?? "-"}
              </span>
              <span style={styles.name}>{continent.name || "名称未設定"}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

const styles = {
  wrap: {
    display: "grid",
    gap: 8,
  },

  empty: {
    padding: "12px 8px",
    color: "var(--text-muted)",
    fontSize: 14,
  },

  item: {
    width: "100%",
    textAlign: "left",
    padding: "12px 12px",
    borderRadius: 10,
    border: "1px solid var(--soft-border)",
    background: "var(--soft-bg)",
    color: "var(--page-text)",
    cursor: "pointer",
    transition: "0.2s ease",
  },

  itemActive: {
    border: "1px solid var(--accent, var(--panel-border))",
    background: "var(--panel-bg)",
  },

  topRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },

  displayOrder: {
    flex: "0 0 auto",
    minWidth: 36,
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
  },

  name: {
    minWidth: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "var(--page-text)",
    wordBreak: "break-word",
  },

  subText: {
    marginTop: 6,
    fontSize: 12,
    color: "var(--text-muted)",
    wordBreak: "break-word",
  },

  folderText: {
    marginTop: 6,
    fontSize: 11,
    color: "var(--text-muted)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    wordBreak: "break-all",
  },
};