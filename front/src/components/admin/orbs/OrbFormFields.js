"use client";

import MonsterPicker from "@/components/admin/shared/MonsterPicker";
import { ORB_COLORS } from "@/lib/orbs";

export default function OrbFormFields({
  form,
  setForm,
  errors = {},
}) {
  function onChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  return (
    <>
      <style>{`
        .orb-form-input::placeholder,
        .orb-form-textarea::placeholder {
          color: var(--input-placeholder);
          opacity: 1;
        }

        .orb-form-input:focus,
        .orb-form-select:focus,
        .orb-form-textarea:focus {
          outline: none;
          border-color: var(--selected-border);
          box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.18);
        }
      `}</style>

      <div style={wrapStyle}>
        <div style={fieldStyle}>
          <label htmlFor="name" style={labelStyle()}>名前</label>
          <input
            id="name"
            name="name"
            value={form.name}
            onChange={onChange}
            style={inputStyle()}
            placeholder="例: 炎の宝珠"
            className="orb-form-input"
          />
          {errors.name ? <div style={errorStyle()}>{errors.name}</div> : null}
        </div>

        <div style={fieldStyle}>
          <label htmlFor="name_kana" style={labelStyle()}>名前（読み）</label>
          <input
            id="name_kana"
            name="name_kana"
            value={form.name_kana ?? ""}
            onChange={onChange}
            style={inputStyle()}
            placeholder="例: ほのおのほうじゅ"
            className="orb-form-input"
          />
          {errors.name_kana ? (
            <div style={errorStyle()}>{errors.name_kana}</div>
          ) : null}
        </div>

        <div style={fieldStyle}>
          <label htmlFor="name_en" style={labelStyle()}>名前（英語）</label>
          <input
            id="name_en"
            name="name_en"
            value={form.name_en ?? ""}
            onChange={onChange}
            style={inputStyle()}
            placeholder="English name"
            className="orb-form-input"
          />
          {errors.name_en ? (
            <div style={errorStyle()}>{errors.name_en}</div>
          ) : null}
        </div>

        <div style={fieldStyle}>
          <label htmlFor="color" style={labelStyle()}>色</label>
          <select
            id="color"
            name="color"
            value={form.color}
            onChange={onChange}
            style={inputStyle()}
            className="orb-form-select"
          >
            <option value="">選択してください</option>
            {ORB_COLORS.map((color) => (
              <option key={color} value={color}>
                {color}
              </option>
            ))}
          </select>
          {errors.color ? <div style={errorStyle()}>{errors.color}</div> : null}
        </div>

        <div style={fieldStyle}>
          <label htmlFor="effect" style={labelStyle()}>効果</label>
          <textarea
            id="effect"
            name="effect"
            value={form.effect}
            onChange={onChange}
            rows={8}
            style={textareaStyle()}
            placeholder="効果を入力"
            className="orb-form-textarea"
          />
          {errors.effect ? <div style={errorStyle()}>{errors.effect}</div> : null}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={labelStyle()}>落とすモンスター</label>

          <MonsterPicker
            value={form.drop_monsters}
            defaultDropType="orb"
            enableDropTypeSelect={false}
            dropTypeOptions={[]}
            titleWhenEmpty="まだ登録されていない"
            onChange={(rows) =>
              setForm((prev) => ({
                ...prev,
                drop_monsters: rows.map((row, index) => ({
                  ...row,
                  drop_type: "orb",
                  sort_order: index + 1,
                })),
              }))
            }
          />
        </div>
      </div>
    </>
  );
}

const wrapStyle = {
  display: "grid",
  gap: 20,
};

const fieldStyle = {
  display: "grid",
  gap: 6,
};

const labelStyle = () => ({
  fontWeight: 700,
  color: "var(--text-sub)",
  fontSize: 14,
});

const inputStyle = () => ({
  width: "100%",
  border: "1px solid var(--input-border)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 16,
  boxSizing: "border-box",
  background: "var(--input-bg)",
  color: "var(--input-text)",
});

const textareaStyle = () => ({
  ...inputStyle(),
  resize: "vertical",
});

const errorStyle = () => ({
  color: "var(--danger-text)",
  fontSize: 13,
});
