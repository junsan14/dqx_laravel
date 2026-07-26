"use client";

export default function AccessoryList({
  accessories = [],
  loading = false,
  selectedId = null,
  onSelect,
  isMobile = false,
}) {
  if (loading) {
    return <div style={loadingStyle}>読み込み中...</div>;
  }

  if (!accessories.length) {
    return <div style={emptyStyle}>データがない</div>;
  }

  return (
    <div style={listStyle(isMobile)}>
      {accessories.map((accessory) => {
        const active = Number(selectedId) === Number(accessory.id);
        const chain =
          Array.isArray(accessory.inheritance_chain) &&
          accessory.inheritance_chain.length > 0
            ? accessory.inheritance_chain
            : [accessory];

        return (
          <button
            key={accessory.id}
            type="button"
            onClick={() => onSelect(accessory.id)}
            style={{
              ...itemStyle,
              ...(active ? activeItemStyle : null),
            }}
          >
            <div style={titleStyle}>{accessory.name || "名称未設定"}</div>
            {accessory.name_kana ? (
              <div style={readingStyle}>{accessory.name_kana}</div>
            ) : null}

            <div style={metaStyle}>
              {accessory.slot || "-"} / {accessory.accessory_type || "-"}
            </div>

            <div style={generationStyle}>
              {accessory.inheritance_type || "第一世代"}
            </div>

            {chain.length > 1 ? (
              <div style={chainStyle}>
                {chain.map((item, index) => {
                  const isCurrent = Number(item.id) === Number(accessory.id);

                  return (
                    <span key={`${accessory.id}-${item.id}-${index}`}>
                      {index > 0 && <span style={chainArrowStyle}>→</span>}
                      <span
                        style={
                          isCurrent ? currentChainItemStyle : chainItemStyle
                        }
                      >
                        {item.name || "名称未設定"}
                      </span>
                    </span>
                  );
                })}
              </div>
            ) : (
              <div style={rootStyle}>第一世代</div>
            )}

            <div style={subStyle}>{accessory.item_id || "-"}</div>
          </button>
        );
      })}
    </div>
  );
}

const listStyle = (isMobile) => ({
  display: "grid",
  gap: 8,
  maxHeight: isMobile ? "none" : "calc(100vh - 240px)",
  overflow: isMobile ? "visible" : "auto",
});

const itemStyle = {
  textAlign: "left",
  border: "1px solid var(--card-border)",
  borderRadius: 10,
  padding: 12,
  background: "var(--card-bg)",
  cursor: "pointer",
  minWidth: 0,
};

const activeItemStyle = {
  border: "2px solid var(--selected-border)",
  background: "var(--selected-bg)",
};

const titleStyle = {
  fontWeight: 700,
  marginBottom: 4,
  wordBreak: "break-word",
  color: "var(--text-main)",
};

const readingStyle = {
  marginBottom: 4,
  fontSize: 12,
  color: "var(--text-sub)",
  wordBreak: "break-word",
};

const metaStyle = {
  fontSize: 12,
  color: "var(--text-sub)",
  marginBottom: 6,
  wordBreak: "break-word",
};

const generationStyle = {
  fontSize: 12,
  color: "var(--text-sub)",
  marginBottom: 6,
  padding: "4px 7px",
  borderRadius: 999,
  background: "var(--soft-bg, transparent)",
  border: "1px solid var(--soft-border, transparent)",
  width: "fit-content",
  maxWidth: "100%",
  wordBreak: "break-word",
};

const chainStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 4,
  marginBottom: 6,
  color: "var(--text-sub)",
  fontSize: 12,
  lineHeight: 1.7,
};

const chainArrowStyle = {
  margin: "0 4px",
  color: "var(--text-muted)",
  fontWeight: 700,
};

const chainItemStyle = {
  color: "var(--text-sub)",
};

const currentChainItemStyle = {
  color: "var(--text-main)",
  fontWeight: 700,
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

const rootStyle = {
  fontSize: 12,
  color: "var(--text-muted)",
  marginBottom: 6,
  padding: "4px 7px",
  borderRadius: 999,
  background: "var(--soft-bg, transparent)",
  border: "1px dashed var(--soft-border, var(--card-border))",
  width: "fit-content",
  maxWidth: "100%",
  wordBreak: "break-word",
};

const subStyle = {
  fontSize: 12,
  color: "var(--text-muted)",
  wordBreak: "break-all",
};

const emptyStyle = {
  padding: "16px 8px",
  color: "var(--text-muted)",
};

const loadingStyle = {
  color: "var(--text-sub)",
};
