"use client";

export default function ContinentFormFields({
  form,
  setForm,
  errors = {},
}) {
  function updateField(key, value) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.section}>
        <div style={styles.grid}>
          <label style={styles.field}>
            <span style={styles.label}>表示順</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={form.display_order ?? ""}
              onChange={(event) => updateField("display_order", event.target.value)}
              style={{
                ...styles.input,
                ...(errors.display_order ? styles.inputError : {}),
              }}
              placeholder="1"
            />
            {errors.display_order ? (
              <span style={styles.errorText}>{errors.display_order}</span>
            ) : null}
          </label>

          <label style={styles.field}>
            <span style={styles.label}>名前</span>
            <input
              type="text"
              value={form.name ?? ""}
              onChange={(event) => updateField("name", event.target.value)}
              style={{
                ...styles.input,
                ...(errors.name ? styles.inputError : {}),
              }}
              placeholder="オーグリード大陸"
            />
            {errors.name ? (
              <span style={styles.errorText}>{errors.name}</span>
            ) : null}
          </label>

          <label style={styles.field}>
            <span style={styles.label}>名前（かな）</span>
            <input
              type="text"
              value={form.name_kana ?? ""}
              onChange={(event) => updateField("name_kana", event.target.value)}
              style={{
                ...styles.input,
                ...(errors.name_kana ? styles.inputError : {}),
              }}
              placeholder="オーグリードたいりく"
            />
            {errors.name_kana ? (
              <span style={styles.errorText}>{errors.name_kana}</span>
            ) : null}
          </label>

          <label style={styles.field}>
            <span style={styles.label}>名前（英語）</span>
            <input
              type="text"
              value={form.name_en ?? ""}
              onChange={(event) => updateField("name_en", event.target.value)}
              style={{
                ...styles.input,
                ...(errors.name_en ? styles.inputError : {}),
              }}
              placeholder="Ogride Continent"
            />
            {errors.name_en ? (
              <span style={styles.errorText}>{errors.name_en}</span>
            ) : null}
          </label>

          <label style={styles.field}>
            <span style={styles.label}>MAP画像フォルダ名</span>
            <input
              type="text"
              value={form.map_image_folder ?? ""}
              onChange={(event) =>
                updateField("map_image_folder", event.target.value)
              }
              style={{
                ...styles.input,
                ...(errors.map_image_folder ? styles.inputError : {}),
              }}
              placeholder="ogride"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <span style={styles.helpText}>
              例: ogride（フォルダ名だけを入力）
            </span>
            {errors.map_image_folder ? (
              <span style={styles.errorText}>
                {errors.map_image_folder}
              </span>
            ) : null}
          </label>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    display: "grid",
    gap: 16,
  },

  section: {
    display: "grid",
    gap: 12,
  },

  grid: {
    display: "grid",
    gap: 14,
  },

  field: {
    display: "grid",
    gap: 6,
    minWidth: 0,
  },

  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-sub)",
  },

  input: {
    width: "100%",
    minHeight: 42,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid var(--soft-border)",
    background: "var(--input-bg, #fff)",
    color: "var(--page-text)",
    boxSizing: "border-box",
    outline: "none",
  },

  inputError: {
    border: "1px solid #d33",
  },

  helpText: {
    fontSize: 12,
    color: "var(--text-muted)",
  },

  errorText: {
    fontSize: 12,
    color: "#d33",
  },
};