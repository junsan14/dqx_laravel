"use client";

export default function OrbList({
  orbs = [],
  selectedId,
  onSelect,
}) {
  if (!orbs.length) {
    return <div style={emptyStyle()}>オーブがない</div>;
  }

  return (
    <>
      <style>{`
        .orb-list-item {
          transition:
            background-color 0.18s ease,
            border-color 0.18s ease,
            color 0.18s ease,
            box-shadow 0.18s ease;
        }

        .orb-list-item:hover {
          background: var(--hover-bg) !important;
        }

        .orb-list-item:focus {
          outline: none;
          border-color: var(--selected-border);
          box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.18);
        }
      `}</style>

      <div style={listWrapStyle}>
        {orbs.map((orb) => {
          const active = orb.id === selectedId;

          return (
            <button
              key={orb.id}
              type="button"
              onClick={() => onSelect(orb.id)}
              className="orb-list-item"
              style={{
                ...itemStyle(),
                ...(active ? activeItemStyle() : {}),
              }}
            >
              <div style={nameStyle()}>{orb.name}</div>
              {orb.name_kana ? (
                <div style={readingStyle()}>{orb.name_kana}</div>
              ) : null}
              <div style={metaStyle()}>
                {orb.color || "色なし"} / ID: {orb.id}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

const listWrapStyle = {
  display: "grid",
  gap: 8,
  padding: 8,
};

const emptyStyle = () => ({
  padding: 16,
  color: "var(--text-muted)",
});

const itemStyle = () => ({
  display: "grid",
  gap: 4,
  width: "100%",
  textAlign: "left",
  padding: 12,
  border: "1px solid var(--card-border)",
  borderRadius: 10,
  background: "var(--card-bg)",
  cursor: "pointer",
  color: "var(--text-main)",
});

const activeItemStyle = () => ({
  background: "var(--selected-bg)",
  borderColor: "var(--selected-border)",
});

const nameStyle = () => ({
  fontSize: 15,
  fontWeight: 700,
  wordBreak: "break-word",
  color: "var(--text-main)",
});

const readingStyle = () => ({
  fontSize: 12,
  color: "var(--text-sub)",
  wordBreak: "break-word",
});

const metaStyle = () => ({
  fontSize: 12,
  color: "var(--text-muted)",
  wordBreak: "break-word",
});
