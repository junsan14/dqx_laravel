"use client";

const ORB_COLOR_STYLES = {
  炎: {
    background: "#fee2e2",
    color: "#b91c1c",
    borderColor: "#fecaca",
  },
  ほのお: {
    background: "#fee2e2",
    color: "#b91c1c",
    borderColor: "#fecaca",
  },

  水: {
    background: "#dbeafe",
    color: "#1d4ed8",
    borderColor: "#bfdbfe",
  },
  みず: {
    background: "#dbeafe",
    color: "#1d4ed8",
    borderColor: "#bfdbfe",
  },

  光: {
    background: "#fef3c7",
    color: "#92400e",
    borderColor: "#fde68a",
  },
  ひかり: {
    background: "#fef3c7",
    color: "#92400e",
    borderColor: "#fde68a",
  },

  闇: {
    background: "#ede9fe",
    color: "#6d28d9",
    borderColor: "#ddd6fe",
  },
  やみ: {
    background: "#ede9fe",
    color: "#6d28d9",
    borderColor: "#ddd6fe",
  },

  風: {
    background: "#dcfce7",
    color: "#15803d",
    borderColor: "#bbf7d0",
  },
  かぜ: {
    background: "#dcfce7",
    color: "#15803d",
    borderColor: "#bbf7d0",
  },
};

const DEFAULT_COLOR_STYLE = {
  background: "var(--soft-bg)",
  color: "var(--text-muted)",
  borderColor: "var(--soft-border)",
};

function getOrbColorStyle(color) {
  const normalizedColor = String(color ?? "").trim();

  return ORB_COLOR_STYLES[normalizedColor] ?? DEFAULT_COLOR_STYLE;
}

export default function OrbList({
  orbs = [],
  selectedId,
  onSelect,
}) {
  if (!orbs.length) {
    return <div style={styles.empty}>オーブがない</div>;
  }

  return (
    <div style={styles.list}>
      {orbs.map((orb) => {
        const active = Number(orb.id) === Number(selectedId);
        const colorStyle = getOrbColorStyle(orb.color);

        return (
          <button
            key={orb.id}
            type="button"
            onClick={() => onSelect?.(orb.id)}
            style={{
              ...styles.item,
              ...(active ? styles.itemActive : {}),
            }}
          >
            <span style={styles.name}>
              {orb.name || "名称未設定"}
            </span>

            <span
              style={{
                ...styles.colorBadge,
                ...colorStyle,
              }}
            >
              {orb.color || "色なし"}
            </span>
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
    padding: "8px",
  },

  empty: {
    padding: "16px",
    color: "var(--text-muted)",
  },

  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    width: "100%",
    minWidth: 0,
    padding: "10px 12px",
    border: "1px solid var(--card-border)",
    borderRadius: "10px",
    background: "var(--card-bg)",
    color: "var(--text-main)",
    textAlign: "left",
    cursor: "pointer",
  },

  itemActive: {
    borderColor: "var(--selected-border)",
    background: "var(--selected-bg)",
    boxShadow: "inset 0 0 0 1px var(--selected-border)",
  },

  name: {
    minWidth: 0,
    overflow: "hidden",
    color: "var(--text-main)",
    fontSize: "14px",
    fontWeight: 700,
    lineHeight: 1.4,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  colorBadge: {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "34px",
    minHeight: "24px",
    padding: "3px 9px",
    border: "1px solid",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 700,
    lineHeight: 1,
  },
};