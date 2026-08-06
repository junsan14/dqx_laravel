"use client";

function getGreatSuccessRate(value) {
  if (value == null || value === "") return null;

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function getRecommendedPriceRate(greatSuccessRate) {
  const rate = getGreatSuccessRate(greatSuccessRate);

  if (!rate || rate <= 0) return null;
  return 100 / rate;
}

function formatRate(value) {
  const rate = getGreatSuccessRate(value);
  if (rate == null) return "未設定";
  return `${rate.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}%`;
}

export default function CraftTypeForm({ craftType, onChange, isMobile }) {
  function updateField(name, value) {
    onChange({
      ...craftType,
      [name]: value,
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
          <Field label="表示名">
            <input
              value={craftType.name ?? ""}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="例：武器鍛冶 / 防具鍛冶 / 裁縫"
              style={styles.input}
            />
          </Field>

          <Field label="key">
            <input
              value={craftType.key ?? ""}
              onChange={(e) => updateField("key", e.target.value)}
              placeholder="例：weapon_smith"
              style={styles.input}
            />
          </Field>

          <Field label="大成功率（%）">
            <div style={styles.rateInputWrap}>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                value={craftType.greatSuccessRate ?? ""}
                onChange={(e) =>
                  updateField("greatSuccessRate", e.target.value)
                }
                placeholder="例：90"
                style={{ ...styles.input, ...styles.rateInput }}
              />
              <span style={styles.percentSign}>%</span>
            </div>
            <span style={styles.helpText}>
              0〜100で入力。未設定の場合は販売目安を表示しない。
            </span>
          </Field>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>登録プレビュー</h2>

        <div style={styles.previewCard}>
          <div style={styles.previewTop}>
            <strong>{craftType.name || "名称未設定"}</strong>
          </div>

          <div style={styles.previewMeta}>key: {craftType.key || "-"}</div>
          <div style={styles.previewMeta}>
            大成功率: {formatRate(craftType.greatSuccessRate)}
          </div>
          <div style={styles.previewMeta}>
            販売目安倍率（手数料除く）: {(() => {
              const priceRate = getRecommendedPriceRate(
                craftType.greatSuccessRate
              );

              return priceRate == null
                ? "—"
                : `原価の${priceRate.toFixed(2)}倍`;
            })()}
          </div>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>注意</h2>

        <p style={styles.note}>
          この画面は <code>craft_types</code> の追加・編集用だ。
          装備種別側では、この職人種別を選択して紐づける。
        </p>
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
    gap: 18,
  },

  section: {
    display: "grid",
    gap: 12,
  },

  sectionTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 900,
    color: "var(--page-text)",
  },

  grid: {
    display: "grid",
    gap: 12,
  },

  field: {
    display: "grid",
    gap: 6,
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

  rateInputWrap: {
    position: "relative",
  },

  rateInput: {
    paddingRight: 36,
  },

  percentSign: {
    position: "absolute",
    top: "50%",
    right: 12,
    transform: "translateY(-50%)",
    color: "var(--text-sub)",
    pointerEvents: "none",
    fontSize: 13,
    fontWeight: 800,
  },

  helpText: {
    color: "var(--text-sub)",
    fontSize: 12,
    lineHeight: 1.6,
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
  },

  previewMeta: {
    fontSize: 13,
    color: "var(--text-sub)",
    wordBreak: "break-all",
  },

  note: {
    margin: 0,
    color: "var(--text-sub)",
    fontSize: 13,
    lineHeight: 1.7,
  },
};