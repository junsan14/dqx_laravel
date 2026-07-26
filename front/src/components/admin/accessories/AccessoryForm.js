"use client";

import { useEffect, useMemo, useState } from "react";
import MonsterPicker from "@/components/admin/shared/MonsterPicker";
import AccessoryImageCropper from "./AccessoryImageCropper";
import {
  ACCESSORY_BASE_EFFECT_FIELDS,
  createEmptyAccessory,
  normalizeAccessory,
  uploadAccessoryImage,
} from "@/lib/accessories";

const DROP_TYPE_OPTIONS = [
  { value: "normal", label: "通常" },
  { value: "rare", label: "レア" },
  { value: "steal", label: "ぬすむ" },
  { value: "other", label: "その他" },
];

export default function AccessoryForm({
  accessory,
  onChange,
  slots = [],
  accessoryTypes = [],
  allAccessories = [],
  generationOptions = [],
  isMobile = false,
}) {
  const [form, setForm] = useState(() => createEmptyAccessory());
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");

  useEffect(() => {
    if (accessory) {
      setForm(normalizeAccessory(accessory));
      setImageUploadError("");
      return;
    }

    setForm(createEmptyAccessory());
    setImageUploadError("");
  }, [accessory]);

  const safeGenerationOptions = useMemo(() => {
    const currentValue = String(form?.inheritance_type ?? "").trim();

    const values = [
      ...generationOptions.map((item) => String(item ?? "").trim()),
      currentValue,
    ].filter(Boolean);

    return [...new Set(values)].sort(
      (a, b) => getGenerationSortValue(a) - getGenerationSortValue(b)
    );
  }, [generationOptions, form?.inheritance_type]);

  const parentCandidateAccessories = useMemo(() => {
    const blockedIds = new Set([Number(form?.id)]);

    getDescendants(form?.id, allAccessories).forEach((item) => {
      blockedIds.add(Number(item.id));
    });

    const previousGeneration = getPreviousGenerationLabel(
      form?.inheritance_type
    );

    return allAccessories.filter((item) => {
      if (!item?.id) return false;
      if (blockedIds.has(Number(item.id))) return false;

      if (previousGeneration) {
        return String(item.inheritance_type ?? "").trim() === previousGeneration;
      }

      return true;
    });
  }, [allAccessories, form?.id, form?.inheritance_type]);

  const inheritanceChain = useMemo(() => {
    if (
      Array.isArray(form?.inheritance_chain) &&
      form.inheritance_chain.length > 0
    ) {
      return form.inheritance_chain;
    }

    return form?.id ? [form] : [];
  }, [form]);

  function updateForm(nextForm) {
    setForm(nextForm);
    onChange?.(nextForm);
  }

  function updateField(key, value) {
    updateForm({
      ...form,
      [key]: value,
    });
  }

  function handleGenerationChange(value) {
    if (isFirstGeneration(value)) {
      updateForm({
        ...form,
        inheritance_type: value,
        inheritance_from_accessory_id: "",
        inheritance_from: null,
        inheritance_chain: form?.id ? [form] : [],
      });

      return;
    }

    updateForm({
      ...form,
      inheritance_type: value,
    });
  }

  function handleInheritanceFromChange(nextId) {
    const selected = parentCandidateAccessories.find(
      (item) => Number(item.id) === Number(nextId)
    );

    updateForm({
      ...form,
      inheritance_from_accessory_id: nextId,
      inheritance_from: selected
        ? {
            id: selected.id,
            item_id: selected.item_id ?? "",
            name: selected.name ?? "",
            name_kana: selected.name_kana ?? "",
            name_en: selected.name_en ?? "",
            slot: selected.slot ?? "",
            accessory_type: selected.accessory_type ?? "",
            image_url: selected.image_url ?? "",
            inheritance_type: selected.inheritance_type ?? "",
            inheritance_from_accessory_id:
              selected.inheritance_from_accessory_id ?? "",
          }
        : null,
    });
  }

  function updateJsonRow(key, index, field, value) {
    const rows = Array.isArray(form[key]) ? [...form[key]] : [];

    rows[index] = {
      ...rows[index],
      [field]: value,
    };

    updateField(key, rows);
  }

  function addJsonRow(key, text = "") {
    const rows = Array.isArray(form[key]) ? [...form[key]] : [];

    rows.push({
      text,
      note: "",
      recommended: false,
    });

    updateField(key, rows);
  }

  function removeJsonRow(key, index) {
    const rows = Array.isArray(form[key]) ? [...form[key]] : [];
    rows.splice(index, 1);
    updateField(key, rows);
  }

  async function handleAccessoryImageApply({ file }) {
    if (!file) return;

    setImageUploading(true);
    setImageUploadError("");

    try {
      const result = await uploadAccessoryImage(file, {
        accessoryId: form?.id,
        itemId: form?.item_id,
      });

      const nextImageUrl = result?.image_url || result?.url || "";

      if (!nextImageUrl) {
        throw new Error("画像URLが返ってきませんでした");
      }

      updateField("image_url", nextImageUrl);
    } catch (error) {
      console.error(error);
      setImageUploadError(error.message || "画像アップロードに失敗しました");
    } finally {
      setImageUploading(false);
    }
  }

  return (
    <div style={formStyle}>
      <div style={headerStyle(isMobile)}>
        <h2 style={headingStyle}>
          {form?.id ? "アクセサリ編集" : "アクセサリ新規作成"}
        </h2>
      </div>

      <Section title="基本情報">
        <div style={gridStyle(isMobile)}>
          <Field label="アイテムID">
            <input
              value={form.item_id}
              onChange={(e) => updateField("item_id", e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="名前">
            <input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="名前（読み）">
            <input
              value={form.name_kana ?? ""}
              onChange={(e) => updateField("name_kana", e.target.value)}
              style={inputStyle}
              placeholder="例：きんのろざりお"
            />
          </Field>

          <Field label="英語名">
            <input
              value={form.name_en}
              onChange={(e) => updateField("name_en", e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="装備レベル">
            <input
              type="number"
              value={form.equip_level}
              onChange={(e) => updateField("equip_level", e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="部位">
            <>
              <input
                list="accessory-slot-list"
                value={form.slot}
                onChange={(e) => updateField("slot", e.target.value)}
                style={inputStyle}
              />
              <datalist id="accessory-slot-list">
                {slots.map((slot) => (
                  <option key={slot} value={slot} />
                ))}
              </datalist>
            </>
          </Field>

          <Field label="アクセサリータイプ">
            <>
              <input
                list="accessory-type-list"
                value={form.accessory_type}
                onChange={(e) => updateField("accessory_type", e.target.value)}
                style={inputStyle}
              />
              <datalist id="accessory-type-list">
                {accessoryTypes.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
            </>
          </Field>
        </div>
      </Section>

      <Section title="伝承情報">
        <div style={gridStyle(isMobile)}>
          <Field label="世代">
            <>
              <input
                list="inheritance-type-list"
                value={form.inheritance_type ?? ""}
                onChange={(e) => handleGenerationChange(e.target.value)}
                style={inputStyle}
                placeholder="例：第一世代 / 第二世代 / 第三世代"
              />
              <datalist id="inheritance-type-list">
                {safeGenerationOptions.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
            </>
          </Field>

          {!isFirstGeneration(form.inheritance_type) && (
            <Field label="伝承元アクセサリ">
              <AccessoryInheritancePicker
                value={form.inheritance_from_accessory_id}
                options={parentCandidateAccessories}
                onChange={handleInheritanceFromChange}
                isMobile={isMobile}
              />
            </Field>
          )}
        </div>

        {isFirstGeneration(form.inheritance_type) ? (
          <div style={emptySelectedStyle}>第一世代：伝承元アクセサリは不要</div>
        ) : (
          <Field label="伝承メモ">
            <textarea
              rows={3}
              value={form.inheritance_note ?? ""}
              onChange={(e) => updateField("inheritance_note", e.target.value)}
              style={textareaStyle}
              placeholder="例：ひとつ前の世代アクセサリから効果を引き継ぐ。"
            />
          </Field>
        )}

        <InheritanceChainPreview chain={inheritanceChain} currentId={form.id} />
      </Section>

      <Section title="基礎効果">
        <div style={effectTwoColumnsStyle(isMobile)}>
          <div style={effectColumnStyle}>
            {["attack", "defense", "max_hp", "max_mp", "charm"].map((key) => {
              const field = ACCESSORY_BASE_EFFECT_FIELDS.find(
                (item) => item.key === key
              );

              if (!field) return null;

              return (
                <Field key={field.key} label={field.label}>
                  <input
                    type="number"
                    value={form[field.key] ?? ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    style={inputStyle}
                  />
                </Field>
              );
            })}
          </div>

          <div style={effectColumnStyle}>
            {[
              "agility",
              "dexterity",
              "magic_attack",
              "healing_power",
              "weight",
            ].map((key) => {
              const field = ACCESSORY_BASE_EFFECT_FIELDS.find(
                (item) => item.key === key
              );

              if (!field) return null;

              return (
                <Field key={field.key} label={field.label}>
                  <input
                    type="number"
                    value={form[field.key] ?? ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    style={inputStyle}
                  />
                </Field>
              );
            })}
          </div>
        </div>
      </Section>

      <JsonTabsEditor
        title="基礎効果JSON"
        rows={form.effects_json}
        onAdd={(text) => addJsonRow("effects_json", text)}
        onRemove={(index) => removeJsonRow("effects_json", index)}
        onChange={(index, field, value) =>
          updateJsonRow("effects_json", index, field, value)
        }
        isMobile={isMobile}
      />

      <Section title="説明">
        <Field label="説明文">
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => updateField("description", e.target.value)}
            style={textareaStyle}
          />
        </Field>
      </Section>

      <JsonTabsEditor
        title="付く合成効果"
        rows={form.synthesis_effects_json}
        onAdd={(text) => addJsonRow("synthesis_effects_json", text)}
        onRemove={(index) => removeJsonRow("synthesis_effects_json", index)}
        onChange={(index, field, value) =>
          updateJsonRow("synthesis_effects_json", index, field, value)
        }
        isMobile={isMobile}
        enableRecommended={true}
      />

      <JsonTabsEditor
        title="入手場所"
        rows={form.obtain_methods_json}
        onAdd={(text) => addJsonRow("obtain_methods_json", text)}
        onRemove={(index) => removeJsonRow("obtain_methods_json", index)}
        onChange={(index, field, value) =>
          updateJsonRow("obtain_methods_json", index, field, value)
        }
        isMobile={isMobile}
      />

      <Section title="画像・URL">
        <AccessoryImageCropper
          value={form.image_url}
          onApply={handleAccessoryImageApply}
          disabled={imageUploading}
          title="アクセサリ画像"
        />

        {imageUploading && (
          <div style={imageStatusStyle}>画像をアップロード中...</div>
        )}

        {imageUploadError && (
          <div style={imageErrorStyle}>{imageUploadError}</div>
        )}

        <Field label="画像URL">
          <input
            value={form.image_url}
            onChange={(e) => updateField("image_url", e.target.value)}
            style={inputStyle}
            placeholder="/storage/images/accessories/109-.webp"
          />
        </Field>

        <Field label="参照元URL">
          <input
            value={form.source_url}
            onChange={(e) => updateField("source_url", e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="詳細URL">
          <input
            value={form.detail_url}
            onChange={(e) => updateField("detail_url", e.target.value)}
            style={inputStyle}
          />
        </Field>
      </Section>

      <Section title="落とすモンスター">
        <MonsterPicker
          value={form.drop_monsters ?? []}
          onChange={(nextRows) => updateField("drop_monsters", nextRows)}
          defaultDropType="normal"
          dropTypeOptions={DROP_TYPE_OPTIONS}
          enableDropTypeSelect={true}
          titleWhenEmpty="まだモンスターが登録されていない"
        />
      </Section>
    </div>
  );
}

function AccessoryInheritancePicker({
  value = "",
  options = [],
  onChange,
  isMobile = false,
}) {
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const selectedItem = useMemo(() => {
    return options.find((item) => Number(item.id) === Number(value)) ?? null;
  }, [options, value]);

  const inputValue = isEditing ? keyword : selectedItem?.name ?? "";

  const filteredOptions = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    if (!q) {
      return options.slice(0, 30);
    }

    return options
      .filter((item) => {
        const text = [
          item.name,
          item.name_kana,
          item.name_en,
          item.item_id,
          item.slot,
          item.accessory_type,
          item.inheritance_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return text.includes(q);
      })
      .slice(0, 40);
  }, [options, keyword]);

  function handleFocus() {
    setIsEditing(true);
    setKeyword("");
    setOpen(true);
  }

  function handleSelect(item) {
    onChange?.(item.id);
    setKeyword("");
    setIsEditing(false);
    setOpen(false);
  }

  function handleClear() {
    onChange?.("");
    setKeyword("");
    setIsEditing(false);
    setOpen(false);
  }

  function handleClose() {
    setOpen(false);
    setIsEditing(false);
    setKeyword("");
  }

  return (
    <div style={pickerStyle}>
      <div style={pickerInputWrapStyle}>
        <input
          value={inputValue}
          onChange={(e) => {
            setKeyword(e.target.value);
            setIsEditing(true);
            setOpen(true);
          }}
          onFocus={handleFocus}
          style={pickerInputStyle}
          placeholder="伝承元アクセサリを検索"
        />

        {selectedItem && (
          <button
            type="button"
            onClick={handleClear}
            style={pickerClearButtonStyle}
            aria-label="伝承元アクセサリを解除"
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div style={pickerPanelStyle(isMobile)}>
          <div style={pickerPanelHeaderStyle}>
            <span>候補 {filteredOptions.length} 件</span>
            <button type="button" onClick={handleClose} style={smallButtonStyle}>
              閉じる
            </button>
          </div>

          {filteredOptions.length === 0 ? (
            <div style={pickerEmptyStyle}>候補がない</div>
          ) : (
            <div style={pickerListStyle}>
              {filteredOptions.map((item) => {
                const active = Number(item.id) === Number(value);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(item)}
                    style={{
                      ...pickerItemStyle,
                      ...(active ? pickerItemActiveStyle : null),
                    }}
                  >
                    <strong>{item.name}</strong>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InheritanceChainPreview({ chain = [], currentId = null }) {
  const safeChain = chain.filter(Boolean);
  const safeCurrentId = Number(currentId);

  return (
    <div style={chainPreviewStyle}>
      <div style={chainPreviewHeaderStyle}>
        <strong>伝承元チェーン</strong>
        <span>{safeChain.length > 0 ? `${safeChain.length}世代` : "未設定"}</span>
      </div>

      {safeChain.length > 0 ? (
        <div style={chainLineStyle}>
          {safeChain.map((item, index) => {
            const isCurrent = Number(item.id) === safeCurrentId;

            return (
              <div key={`${item.id}-${index}`} style={chainNodeWrapStyle}>
                {index > 0 && <span style={chainArrowStyle}>→</span>}
                <span style={chainNodeStyle(isCurrent)}>
                  {item.name || "名称未設定"}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={mutedTextStyle}>アクセサリ名を入力するとここに表示される。</p>
      )}
    </div>
  );
}

function createChildrenMap(allAccessories = []) {
  const childrenByParentId = new Map();

  allAccessories.forEach((item) => {
    const parentId = Number(item?.inheritance_from_accessory_id);

    if (!parentId) return;

    if (!childrenByParentId.has(parentId)) {
      childrenByParentId.set(parentId, []);
    }

    childrenByParentId.get(parentId).push(item);
  });

  return childrenByParentId;
}

function getDescendants(id, allAccessories = []) {
  const rootId = Number(id);
  if (!rootId) return [];

  const childrenByParentId = createChildrenMap(allAccessories);
  const results = [];
  const visited = new Set();

  function walk(parentId) {
    const children = childrenByParentId.get(Number(parentId)) ?? [];

    children.forEach((child) => {
      const childId = Number(child.id);

      if (!childId || visited.has(childId)) return;

      visited.add(childId);
      results.push(child);
      walk(childId);
    });
  }

  walk(rootId);

  return results;
}

function isFirstGeneration(value = "") {
  return String(value).trim() === "第一世代";
}

function getPreviousGenerationLabel(value = "") {
  const normalized = String(value).trim();

  const generationMap = {
    第一世代: null,
    第二世代: "第一世代",
    第三世代: "第二世代",
    第四世代: "第三世代",
    第五世代: "第四世代",
    第六世代: "第五世代",
    第七世代: "第六世代",
    第八世代: "第七世代",
    第九世代: "第八世代",
    第十世代: "第九世代",
  };

  return generationMap[normalized] ?? null;
}

function getGenerationSortValue(value = "") {
  const normalized = String(value).trim();

  const generationMap = {
    第一世代: 1,
    第二世代: 2,
    第三世代: 3,
    第四世代: 4,
    第五世代: 5,
    第六世代: 6,
    第七世代: 7,
    第八世代: 8,
    第九世代: 9,
    第十世代: 10,
  };

  return generationMap[normalized] ?? 999;
}

function Section({ title, children }) {
  return (
    <section style={sectionStyle}>
      <h3 style={sectionTitleStyle}>{title}</h3>
      <div style={sectionBodyStyle}>{children}</div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label style={fieldStyle}>
      <div style={labelStyle}>{label}</div>
      {children}
    </label>
  );
}

function JsonTabsEditor({
  title,
  rows = [],
  onAdd,
  onRemove,
  onChange,
  isMobile = false,
  enableRecommended = false,
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [draftText, setDraftText] = useState("");

  const safeRows = Array.isArray(rows) ? rows : [];
  const activeRow = safeRows[activeIndex] ?? null;

  function handleAddFromInput() {
    const text = draftText.trim();
    if (!text) return;

    onAdd?.(text);
    setDraftText("");
    setActiveIndex(safeRows.length);
  }

  function handleKeyDown(e) {
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      handleAddFromInput();
    }
  }

  function handleRemove(index) {
    onRemove?.(index);

    if (activeIndex >= safeRows.length - 1) {
      setActiveIndex(Math.max(0, safeRows.length - 2));
    }
  }

  return (
    <Section title={title}>
      <div style={jsonEditorStyle}>
        <Field label="追加する内容">
          <input
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={handleKeyDown}
            style={inputStyle}
            placeholder="入力して Tab または Enter で追加"
          />
        </Field>

        <div style={jsonTabsHeaderStyle}>
          <div style={jsonTabsStyle}>
            {safeRows.map((row, index) => {
              const isRecommended = Boolean(row?.recommended);

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  style={tabButtonStyle(activeIndex === index)}
                >
                  {enableRecommended && isRecommended ? "★ " : ""}
                  {row?.text || index + 1}
                </button>
              );
            })}
          </div>
        </div>

        {safeRows.length === 0 ? (
          <div style={emptyBoxStyle}>
            まだ登録されていない。入力して Tab または Enter で追加できる。
          </div>
        ) : (
          <div style={jsonPanelStyle}>
            <div style={jsonPanelHeaderStyle(isMobile)}>
              <strong>
                {title} {activeIndex + 1}
              </strong>

              <button
                type="button"
                onClick={() => handleRemove(activeIndex)}
                style={dangerButtonStyle}
              >
                削除
              </button>
            </div>

            <Field label="内容">
              <input
                value={activeRow?.text ?? ""}
                onChange={(e) => onChange(activeIndex, "text", e.target.value)}
                style={inputStyle}
                placeholder="例：万魔の塔"
              />
            </Field>

            {enableRecommended && (
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={Boolean(activeRow?.recommended)}
                  onChange={(e) =>
                    onChange(activeIndex, "recommended", e.target.checked)
                  }
                  style={checkboxStyle}
                />
                <span>おすすめ合成効果にする</span>
              </label>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

const checkboxLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  width: "fit-content",
  cursor: "pointer",
  fontWeight: 700,
  color: "var(--text-main)",
};

const checkboxStyle = {
  width: 18,
  height: 18,
  cursor: "pointer",
};

const formStyle = {
  display: "grid",
  gap: 16,
  minWidth: 0,
  color: "var(--text-main)",
};

const headerStyle = (isMobile) => ({
  display: "flex",
  flexDirection: isMobile ? "column" : "row",
  justifyContent: "space-between",
  alignItems: isMobile ? "stretch" : "center",
  gap: 12,
});

const headingStyle = {
  margin: 0,
  lineHeight: 1.3,
  color: "var(--text-title)",
};

const sectionStyle = {
  display: "grid",
  gap: 10,
  padding: 14,
  border: "1px solid var(--border-main, #ddd)",
  borderRadius: 12,
  background: "var(--card-bg, transparent)",
};

const sectionTitleStyle = {
  margin: 0,
  fontSize: 16,
  color: "var(--text-title)",
};

const sectionBodyStyle = {
  display: "grid",
  gap: 12,
};

const gridStyle = (isMobile) => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))",
  gap: 12,
});

const effectTwoColumnsStyle = (isMobile) => ({
  display: "grid",
  gridTemplateColumns: isMobile
    ? "minmax(0, 1fr)"
    : "repeat(2, minmax(0, 1fr))",
  gap: 14,
});

const effectColumnStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minWidth: 0,
};

const fieldStyle = {
  display: "grid",
  gap: 6,
  minWidth: 0,
};

const labelStyle = {
  fontWeight: 700,
  fontSize: 14,
  color: "var(--text-sub)",
};

const inputStyle = {
  width: "100%",
  minWidth: 0,
  height: 40,
  padding: "0 12px",
  border: "1px solid var(--input-border)",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
  background: "var(--input-bg)",
  color: "var(--input-text)",
};

const textareaStyle = {
  width: "100%",
  minWidth: 0,
  padding: "10px 12px",
  border: "1px solid var(--input-border)",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
  resize: "vertical",
  background: "var(--input-bg)",
  color: "var(--input-text)",
};

const emptySelectedStyle = {
  padding: 10,
  border: "1px dashed var(--input-border)",
  borderRadius: 10,
  color: "var(--text-sub)",
  background: "var(--soft-bg, transparent)",
};

const imageStatusStyle = {
  padding: 10,
  border: "1px solid var(--soft-border, var(--input-border))",
  borderRadius: 10,
  background: "var(--soft-bg, transparent)",
  color: "var(--text-sub)",
  fontWeight: 700,
};

const imageErrorStyle = {
  padding: 10,
  border: "1px solid #ef4444",
  borderRadius: 10,
  background: "rgba(239, 68, 68, 0.08)",
  color: "#ef4444",
  fontWeight: 700,
};

const pickerStyle = {
  position: "relative",
  display: "grid",
  gap: 8,
  minWidth: 0,
};

const pickerInputWrapStyle = {
  position: "relative",
  width: "100%",
  minWidth: 0,
};

const pickerInputStyle = {
  width: "100%",
  minWidth: 0,
  height: 40,
  padding: "0 38px 0 12px",
  border: "1px solid var(--input-border)",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
  background: "var(--input-bg)",
  color: "var(--input-text)",
};

const pickerClearButtonStyle = {
  position: "absolute",
  right: 8,
  top: "50%",
  transform: "translateY(-50%)",
  width: 24,
  height: 24,
  border: "1px solid var(--input-border)",
  borderRadius: 999,
  background: "var(--input-bg)",
  color: "var(--input-text)",
  cursor: "pointer",
  fontWeight: 700,
  lineHeight: 1,
};

const pickerPanelStyle = (isMobile) => ({
  position: isMobile ? "static" : "absolute",
  zIndex: 20,
  top: "calc(100% + 8px)",
  left: 0,
  right: 0,
  display: "grid",
  gap: 8,
  padding: 10,
  border: "1px solid var(--input-border)",
  borderRadius: 12,
  background: "var(--panel-bg, var(--card-bg, #fff))",
  boxShadow: isMobile ? "none" : "0 16px 40px rgba(0, 0, 0, 0.16)",
  maxHeight: isMobile ? "none" : 320,
  overflow: "hidden",
});

const pickerPanelHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  color: "var(--text-sub)",
  fontSize: 12,
  fontWeight: 700,
};

const pickerListStyle = {
  display: "grid",
  gap: 6,
  maxHeight: 260,
  overflow: "auto",
};

const pickerItemStyle = {
  display: "grid",
  gap: 3,
  textAlign: "left",
  width: "100%",
  padding: 10,
  border: "1px solid var(--card-border, var(--input-border))",
  borderRadius: 10,
  background: "var(--card-bg, transparent)",
  color: "var(--text-main)",
  cursor: "pointer",
};

const pickerItemActiveStyle = {
  border: "2px solid var(--selected-border)",
  background: "var(--selected-bg)",
};

const pickerEmptyStyle = {
  padding: 12,
  color: "var(--text-sub)",
  border: "1px dashed var(--input-border)",
  borderRadius: 10,
};

const smallButtonStyle = {
  border: "1px solid var(--input-border)",
  borderRadius: 8,
  padding: "5px 9px",
  background: "var(--input-bg)",
  color: "var(--input-text)",
  cursor: "pointer",
  fontWeight: 700,
};

const chainPreviewStyle = {
  display: "grid",
  gap: 10,
  padding: 12,
  border: "1px dashed var(--input-border)",
  borderRadius: 10,
  background: "var(--soft-bg, transparent)",
};

const chainPreviewHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  color: "var(--text-main)",
};

const chainLineStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
};

const chainNodeWrapStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const chainArrowStyle = {
  color: "var(--text-sub)",
  fontWeight: 700,
};

const chainNodeStyle = (isCurrent) => ({
  display: "inline-flex",
  alignItems: "center",
  border: isCurrent
    ? "2px solid var(--selected-border)"
    : "1px solid var(--input-border)",
  borderRadius: 999,
  padding: "6px 10px",
  background: isCurrent ? "var(--selected-bg)" : "var(--input-bg)",
  color: "var(--text-main)",
  fontWeight: 700,
  fontSize: 13,
  boxShadow: isCurrent ? "0 0 0 3px rgba(59, 130, 246, 0.16)" : "none",
});

const mutedTextStyle = {
  margin: 0,
  color: "var(--text-sub)",
  lineHeight: 1.7,
};

const jsonEditorStyle = {
  display: "grid",
  gap: 12,
};

const jsonTabsHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const jsonTabsStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const tabButtonStyle = (isActive) => ({
  border: "1px solid var(--input-border)",
  borderRadius: 999,
  padding: "7px 12px",
  cursor: "pointer",
  background: isActive ? "var(--text-title)" : "var(--input-bg)",
  color: isActive ? "var(--bg-main, #fff)" : "var(--input-text)",
  fontWeight: 700,
});

const dangerButtonStyle = {
  border: "1px solid #ef4444",
  borderRadius: 8,
  padding: "7px 12px",
  cursor: "pointer",
  background: "transparent",
  color: "#ef4444",
  fontWeight: 700,
};

const jsonPanelStyle = {
  display: "grid",
  gap: 12,
  padding: 12,
  border: "1px dashed var(--input-border)",
  borderRadius: 10,
};

const jsonPanelHeaderStyle = (isMobile) => ({
  display: "flex",
  flexDirection: isMobile ? "column" : "row",
  justifyContent: "space-between",
  alignItems: isMobile ? "stretch" : "center",
  gap: 8,
});

const emptyBoxStyle = {
  padding: 14,
  border: "1px dashed var(--input-border)",
  borderRadius: 10,
  color: "var(--text-sub)",
};
