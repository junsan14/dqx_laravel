"use client";

export default function EquipmentTypeList({
  equipmentTypes,
  loading,
  selectedId,
  onSelect,
}) {
  if (loading) {
    return <div style={styles.empty}>読み込み中...</div>;
  }

  if (!equipmentTypes?.length) {
    return <div style={styles.empty}>装備種別が見つからない</div>;
  }

  return (
    <div style={styles.list}>
      {equipmentTypes.map((item) => {
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
              <span style={styles.name}>{item.name || "名称未設定"}</span>
              <span
                style={{
                  ...styles.badge,
                  ...(item.kind === "weapon"
                    ? styles.weaponBadge
                    : styles.armorBadge),
                }}
              >
                {getCraftTypeName(item)}
              </span>
            </div>

          </button>
        );
      })}
    </div>
  );
}
/*
function getKindLabel(kind) {
  if (kind === "weapon") return "武器";
  if (kind === "armor") return "防具";
  return "未設定";
}
*/
function getCraftTypeName(item) {
  if (item?.craftType?.name) {
    return item.craftType.name;
  }

  if (item?.craft_type?.name) {
    return item.craft_type.name;
  }

  if (item?.craftTypeId) {
    return `ID: ${item.craftTypeId}`;
  }

  return "未設定";
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

  badge: {
    flex: "0 0 auto",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
  },

  weaponBadge: {
    background: "rgba(239, 68, 68, 0.12)",
    color: "#ef4444",
  },

  armorBadge: {
    background: "rgba(59, 130, 246, 0.12)",
    color: "#3b82f6",
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