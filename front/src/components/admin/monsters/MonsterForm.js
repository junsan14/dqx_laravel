"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MonsterImageCropper from "./MonsterImageCropper";
import { getMonsterAssetUrl } from "@/lib/monsters";

function selectAllInput(event) {
  const input = event.currentTarget;

  if (typeof window === "undefined") {
    input.select();
    return;
  }

  window.requestAnimationFrame(() => {
    input.select();
  });
}

const appendCacheBust = (url, version) => {
  if (!url) return "";
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${version}`;
};

export default function MonsterForm({
  monster,
  onChange,
  systemTypes = [],
  systemTypesLoading = false,
  parentCandidates = [],
  onSearchParents,
  disabled = false,
  defaultOpen = false,
  children = null,
}) {
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  const [parentKeyword, setParentKeyword] = useState(
    monster?.reincarnation_parent_name ?? ""
  );
  const [parentOpen, setParentOpen] = useState(false);
  const [loadingParents, setLoadingParents] = useState(false);
  const [open, setOpen] = useState(defaultOpen);

  const normalizedSystemTypes = useMemo(() => {
    return (Array.isArray(systemTypes) ? systemTypes : [])
      .map((row) => ({
        id: Number(row?.id ?? 0),
        name: String(row?.name ?? "").trim(),
        name_en: String(row?.name_en ?? "").trim(),
        display_order: Number(row?.display_order ?? 0),
      }))
      .filter((row) => row.id > 0 && row.name)
      .sort((a, b) => {
        const orderDiff = a.display_order - b.display_order;
        if (orderDiff !== 0) return orderDiff;
        return a.id - b.id;
      });
  }, [systemTypes]);

  const imageValue = useMemo(() => {
    if (monster?.image_preview_url) {
      return monster.image_preview_url;
    }

    const assetUrl = getMonsterAssetUrl(monster?.image_path || "");
    const version =
      monster?.image_updated_at ||
      monster?.updated_at ||
      monster?.image_version ||
      "";

    return version ? appendCacheBust(assetUrl, version) : assetUrl;
  }, [
    monster?.image_preview_url,
    monster?.image_path,
    monster?.image_updated_at,
    monster?.updated_at,
    monster?.image_version,
  ]);

  useEffect(() => {
    setParentKeyword(monster?.reincarnation_parent_name ?? "");
  }, [monster?.reincarnation_parent_name, monster?.id]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!containerRef.current?.contains(event.target)) {
        setParentOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!parentOpen || disabled) return;

    const keyword = String(parentKeyword ?? "").trim();

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!keyword) {
      setLoadingParents(false);
      onSearchParents?.("");
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setLoadingParents(true);
        await onSearchParents?.(keyword);
      } finally {
        setLoadingParents(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [parentKeyword, parentOpen, onSearchParents, disabled]);

  const safeCandidates = useMemo(() => {
    const currentId = Number(monster?.id ?? 0);

    return (Array.isArray(parentCandidates) ? parentCandidates : [])
      .filter((row) => Number(row?.id ?? 0) > 0)
      .filter((row) => Number(row.id) !== currentId)
      .map((row) => ({
        id: Number(row.id),
        name: row.name ?? "",
        display_order: Number(row.display_order ?? row.monster_no ?? 0),
      }));
  }, [parentCandidates, monster?.id]);

  const patch = (key, value) => {
    if (disabled) return;

    onChange((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const selectParent = (row) => {
    if (disabled) return;

    onChange((prev) => ({
      ...prev,
      reincarnation_parent_id: row?.id ?? null,
      reincarnation_parent_name: row?.name ?? null,
      is_reincarnated: Boolean(row?.id),
    }));

    setParentKeyword(row?.name ?? "");
    setParentOpen(false);
  };

  const clearParent = () => {
    if (disabled) return;

    onChange((prev) => ({
      ...prev,
      reincarnation_parent_id: null,
      reincarnation_parent_name: null,
      is_reincarnated: false,
    }));

    setParentKeyword("");
    setParentOpen(false);
    onSearchParents?.("");
  };

  const handleParentInputChange = (event) => {
    if (disabled) return;

    const value = event.target.value;
    setParentKeyword(value);
    setParentOpen(true);

    onChange((prev) => ({
      ...prev,
      reincarnation_parent_id: null,
      reincarnation_parent_name: null,
      is_reincarnated: false,
    }));
  };

  const handleParentFocus = () => {
    if (disabled) return;
    setParentOpen(true);
  };

  const handleParentKeyDown = (event) => {
    if (event.key === "Escape") {
      setParentOpen(false);
    }
  };

  return (
    <section style={cardStyle()}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={accordionButtonStyle()}
        aria-expanded={open}
      >
        <div style={accordionHeaderMainStyle}>
          <h2 style={titleStyle()}>基本情報</h2>
        </div>

        <div style={accordionRightStyle}>
          <span style={accordionHintStyle()}>
            {open ? "閉じる" : "開く"}
          </span>
          <span style={accordionIconStyle(open)}>⌄</span>
        </div>
      </button>

      {open && (
        <div style={accordionBodyStyle}>
          <div style={gridStyle}>
            <label style={fieldStyle}>
              <span style={labelStyle()}>表示順</span>
              <input
                type="number"
                min="1"
                value={monster?.display_order ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  patch("display_order", Number(e.target.value || 0))
                }
                style={inputStyle(disabled)}
                onFocus={selectAllInput}
                onClick={selectAllInput}
              />
            </label>

            <label style={fieldStyle}>
              <span style={labelStyle()}>名前</span>
              <input
                type="text"
                value={monster?.name ?? ""}
                disabled={disabled}
                onChange={(e) => patch("name", e.target.value)}
                style={inputStyle(disabled)}
                onFocus={selectAllInput}
                onClick={selectAllInput}
              />
            </label>

            <label style={fieldStyle}>
              <span style={labelStyle()}>カナ名</span>
              <input
                type="text"
                value={monster?.name_kana ?? ""}
                disabled={disabled}
                onChange={(e) => patch("name_kana", e.target.value)}
                placeholder="例：スライム"
                style={inputStyle(disabled)}
                onFocus={selectAllInput}
                onClick={selectAllInput}
              />
            </label>

            <label style={fieldStyle}>
              <span style={labelStyle()}>名前(en)</span>
              <input
                type="text"
                value={monster?.name_en ?? ""}
                disabled={disabled}
                onChange={(e) => patch("name_en", e.target.value)}
                style={inputStyle(disabled)}
                onFocus={selectAllInput}
                onClick={selectAllInput}
              />
            </label>

            <label style={fieldStyle}>
              <span style={labelStyle()}>系統</span>
              <select
                value={
                  monster?.monster_system_type_id
                    ? String(monster.monster_system_type_id)
                    : ""
                }
                disabled={disabled || systemTypesLoading}
                onChange={(event) => {
                  if (disabled) return;

                  const nextId = Number(event.target.value || 0);
                  const selectedType =
                    normalizedSystemTypes.find((row) => row.id === nextId) ??
                    null;

                  onChange((prev) => ({
                    ...prev,
                    monster_system_type_id: selectedType?.id ?? null,
                    system_type: selectedType?.name ?? "",
                    system_type_en: selectedType?.name_en ?? "",
                  }));
                }}
                style={inputStyle(disabled || systemTypesLoading)}
              >
                <option value="">
                  {systemTypesLoading ? "系統を読み込み中..." : "系統を選択"}
                </option>

                {normalizedSystemTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                    {type.name_en ? ` / ${type.name_en}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label style={fieldStyle}>
              <span style={labelStyle()}>参照URL</span>
              <input
                type="text"
                value={monster?.source_url ?? ""}
                disabled={disabled}
                onChange={(e) => patch("source_url", e.target.value)}
                style={inputStyle(disabled)}
                onFocus={selectAllInput}
                onClick={selectAllInput}
              />
            </label>

            <div
              ref={containerRef}
              style={{
                ...fieldStyle,
                gridColumn: "1 / -1",
                position: "relative",
              }}
            >
              <span style={labelStyle()}>転生元モンスター</span>

              <div style={searchRowStyle}>
                <input
                  type="text"
                  value={parentKeyword}
                  disabled={disabled}
                  onChange={handleParentInputChange}
                  onFocus={handleParentFocus}
                  onKeyDown={handleParentKeyDown}
                  placeholder="モンスター名を入力して候補から選ぶ"
                  style={inputStyle(disabled)}
      
                  onClick={selectAllInput}
                />

                <button
                  type="button"
                  onClick={clearParent}
                  disabled={disabled}
                  style={clearButtonStyle(disabled)}
                >
                  クリア
                </button>
              </div>

              {!disabled && parentOpen && (
                <div style={suggestionBoxStyle()}>
                  {loadingParents ? (
                    <div style={suggestionEmptyStyle()}>検索中...</div>
                  ) : safeCandidates.length > 0 ? (
                    safeCandidates.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => selectParent(row)}
                        style={suggestionItemStyle()}
                      >
                        <span style={suggestionNameStyle()}>{row.name}</span>
                        <span style={suggestionMetaStyle()}>
                          {row.display_order > 0 ? `No.${row.display_order}` : ""}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div style={suggestionEmptyStyle()}>候補なし</div>
                  )}
                </div>
              )}
            </div>

            {monster?.reincarnation_parent_name &&
            monster?.reincarnation_parent_id ? (
              <div style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                <span style={labelStyle()}>転生状態</span>
                <div style={badgeStyle()}>
                  転生モンスター / 元: {monster.reincarnation_parent_name}
                </div>
              </div>
            ) : (
              <div style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                <span style={labelStyle()}>転生状態</span>
                <div style={mutedBoxStyle()}>通常モンスター</div>
              </div>
            )}
          </div>

          <div style={embeddedSectionStyle()}>
            <MonsterImageCropper
              value={imageValue}
              aspect={1}
              disabled={disabled}
              onApply={({ file, previewUrl }) =>
                onChange((prev) => ({
                  ...prev,
                  image_file: file,
                  image_preview_url: previewUrl,
                  remove_image: false,
                }))
              }
            />
          </div>

          {children ? <div style={embeddedSectionStyle()}>{children}</div> : null}
        </div>
      )}
    </section>
  );
}

const cardStyle = () => ({
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
  borderRadius: 14,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 0,
});

const accordionButtonStyle = () => ({
  width: "100%",
  border: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  cursor: "pointer",
  textAlign: "left",
});

const accordionHeaderMainStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  minWidth: 0,
};

const accordionRightStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexShrink: 0,
};

const accordionHintStyle = () => ({
  color: "var(--text-muted)",
  fontSize: 12,
  fontWeight: 700,
});

const accordionIconStyle = (open) => ({
  color: "var(--text-muted)",
  fontSize: 18,
  lineHeight: 1,
  transform: open ? "rotate(180deg)" : "rotate(0deg)",
  transition: "transform 0.2s ease",
});

const accordionBodyStyle = {
  paddingTop: 16,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const titleStyle = () => ({
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
  color: "var(--text-main)",
});

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 0,
};

const labelStyle = () => ({
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text-sub)",
});

const inputStyle = (disabled) => ({
  width: "100%",
  border: "1px solid var(--input-border)",
  background: disabled ? "var(--bg-muted)" : "var(--input-bg)",
  color: "var(--text-main)",
  borderRadius: 10,
  padding: "10px 12px",
  outline: "none",
  minHeight: 42,
});

const searchRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 8,
  alignItems: "center",
};

const clearButtonStyle = (disabled) => ({
  border: "1px solid var(--card-border)",
  background: disabled ? "var(--bg-muted)" : "var(--card-bg)",
  color: "var(--text-sub)",
  borderRadius: 10,
  padding: "10px 12px",
  fontWeight: 700,
  cursor: disabled ? "not-allowed" : "pointer",
});

const suggestionBoxStyle = () => ({
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  marginTop: 6,
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
  borderRadius: 12,
  overflow: "hidden",
  zIndex: 20,
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
});

const suggestionItemStyle = () => ({
  width: "100%",
  border: "none",
  background: "transparent",
  padding: "10px 12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  cursor: "pointer",
  textAlign: "left",
});

const suggestionNameStyle = () => ({
  color: "var(--text-main)",
  fontWeight: 700,
});

const suggestionMetaStyle = () => ({
  color: "var(--text-muted)",
  fontSize: 12,
  flexShrink: 0,
});

const suggestionEmptyStyle = () => ({
  padding: "10px 12px",
  color: "var(--text-muted)",
  fontSize: 13,
});

const badgeStyle = () => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(59,130,246,0.08)",
  border: "1px solid rgba(59,130,246,0.18)",
  color: "var(--text-main)",
  fontWeight: 700,
});

const mutedBoxStyle = () => ({
  padding: "10px 12px",
  borderRadius: 10,
  background: "var(--bg-muted)",
  color: "var(--text-muted)",
  border: "1px solid var(--card-border)",
});

const embeddedSectionStyle = () => ({
  borderTop: "1px solid var(--card-border)",
  paddingTop: 16,
});