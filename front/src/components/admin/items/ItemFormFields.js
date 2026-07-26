"use client";

import { useEffect, useState } from "react";
import MonsterPicker from "@/components/admin/shared/MonsterPicker";

export default function ItemFormFields({
  form,
  setForm,
  errors = {},
  categories = [],
}) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 900);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function updateField(key, value) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  return (
    <div style={wrapStyle}>
      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>基本情報</h3>

        <div style={gridStyle(isMobile)}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>名前</span>
            <input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              style={inputStyle}
              placeholder="アイテム名"
            />
            {errors.name ? <span style={errorStyle}>{errors.name}</span> : null}
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>名前（読み）</span>
            <input
              value={form.name_kana ?? ""}
              onChange={(e) => updateField("name_kana", e.target.value)}
              style={inputStyle}
              placeholder="ひらがなで入力"
            />
            {errors.name_kana ? (
              <span style={errorStyle}>{errors.name_kana}</span>
            ) : null}
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>名前（英語）</span>
            <input
              value={form.name_en ?? ""}
              onChange={(e) => updateField("name_en", e.target.value)}
              style={inputStyle}
              placeholder="English item name"
            />
            {errors.name_en ? (
              <span style={errorStyle}>{errors.name_en}</span>
            ) : null}
          </label>
          <label style={labelStyle}>
            <span style={labelTextStyle}>カテゴリ</span>
            <input
              value={form.category}
              onChange={(e) => updateField("category", e.target.value)}
              style={inputStyle}
              placeholder="素材 / 消費アイテム など"
              list="item-category-list"
            />
            <datalist id="item-category-list">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>

          <label style={labelStyle}>
            <span style={labelTextStyle}>買値</span>
            <input
              type="number"
              value={form.buy_price}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) =>
                updateField("buy_price", event.target.value)
              }
              style={inputStyle}
              placeholder="0"
            />
          </label>

          <label style={labelStyle}>
            <span style={labelTextStyle}>売値</span>
            <input
              type="number"
              value={form.sell_price}
              onChange={(e) => updateField("sell_price", e.target.value)}
              style={inputStyle}
              placeholder="0"
            />
          </label>
        </div>
      </section>

      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>このアイテムを落とすモンスター</h3>

        <MonsterPicker
          value={form.drop_monsters}
          defaultDropType="normal"
          enableDropTypeSelect={true}
          dropTypeOptions={[
            { value: "normal", label: "通常" },
            { value: "rare", label: "レア" },
          ]}
          titleWhenEmpty="まだ登録されていない"
          onChange={(rows) =>
            setForm((prev) => ({
              ...prev,
              drop_monsters: rows,
            }))
          }
        />
      </section>
    </div>
  );
}

const wrapStyle = {
  display: "grid",
  gap: 24,
  minWidth: 0,
};

const sectionStyle = {
  display: "grid",
  gap: 12,
  background: "var(--card-bg, var(--panel-bg, #ffffff))",
  border: "1px solid var(--card-border, var(--panel-border, #e5e7eb))",
  borderRadius: 14,
  padding: 16,
  minWidth: 0,
};

const sectionTitleStyle = {
  margin: 0,
  fontSize: 18,
  color: "var(--text-title, var(--page-text, #111827))",
};

function gridStyle(isMobile) {
  return {
    display: "grid",
    gridTemplateColumns: isMobile
      ? "minmax(0, 1fr)"
      : "repeat(2, minmax(0, 1fr))",
    gap: 12,
  };
}

const labelStyle = {
  display: "grid",
  gap: 8,
  fontSize: 14,
  minWidth: 0,
};

const labelTextStyle = {
  color: "var(--text-sub, #334155)",
  fontWeight: 700,
};

const inputStyle = {
  width: "100%",
  minWidth: 0,
  padding: "10px 12px",
  border: "1px solid var(--input-border, #cbd5e1)",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
  background: "var(--input-bg, #ffffff)",
  color: "var(--input-text, #111827)",
};

const errorStyle = {
  color: "var(--danger-text, #c62828)",
  fontSize: 13,
};