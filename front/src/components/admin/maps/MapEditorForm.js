"use client";

import { useEffect, useMemo } from "react";
import { resolveMapImageUrl } from "@/lib/maps";
import Image from "next/image";
import {
  DEFAULT_CONTINENT_OPTIONS,
  DEFAULT_MAP_TYPE_OPTIONS,
  DEFAULT_LAYER_NAME_OPTIONS,
} from "./mapOptions";

function normalizeOption(option) {
  if (typeof option === "string") {
    return {
      id: null,
      label: option,
      value: option,
      folder: "",
      fileName: "",
      display_id: null,
      name: option,
      name_en: "",
    };
  }

  const id =
    option?.id !== null &&
    option?.id !== undefined &&
    String(option.id).trim() !== ""
      ? Number(option.id)
      : null;

  const value =
    id !== null
      ? String(id)
      : String(option?.value ?? option?.label ?? "");

  return {
    id,
    value,
    label:
      option?.label ??
      option?.name ??
      option?.value ??
      option?.continent_name ??
      "",
    folder: String(
      option?.map_image_folder ??
        option?.continent_folder ??
        option?.folder ??
        ""
    ).trim(),
    fileName: option?.fileName ?? "",
    display_id:
      option?.display_id !== null &&
      option?.display_id !== undefined &&
      String(option.display_id).trim() !== ""
        ? Number(option.display_id)
        : null,
    name: option?.name ?? option?.label ?? option?.value ?? "",
    name_en: option?.name_en ?? "",
  };
}

function mergeContinentOptions(defaultOptions = [], apiOptions = []) {
  const defaultItems = Array.isArray(defaultOptions)
    ? defaultOptions.map(normalizeOption)
    : [];

  const apiItems = Array.isArray(apiOptions)
    ? apiOptions.map(normalizeOption)
    : [];

  if (apiItems.length > 0 && apiItems.some((item) => item.id !== null)) {
    return apiItems.map((item) => ({
      ...item,
      value: item.id !== null ? String(item.id) : String(item.value ?? ""),
      label:
        item.display_id !== null && item.display_id !== undefined
          ? `${item.display_id}. ${item.name || item.label || item.value}`
          : item.name || item.label || item.value,
    }));
  }

  const defaultMap = new Map();

  for (const item of defaultItems) {
    const key = String(item?.value ?? "");
    if (!key) continue;

    if (!defaultMap.has(key)) {
      defaultMap.set(key, item);
    }
  }

  const used = new Set();
  const merged = [];

  for (const api of apiItems) {
    const key = String(api?.value ?? "");
    if (!key) continue;

    const def = defaultMap.get(key);

    merged.push({
      ...api,
      label: api?.label || def?.label || key,
      folder: api?.folder || def?.folder || "",
      fileName: api?.fileName || def?.fileName || "",
    });

    used.add(key);
  }

  for (const def of defaultItems) {
    const key = String(def?.value ?? "");
    if (!key || used.has(key)) continue;

    merged.push(def);
  }

  return merged;
}

function mergeOptionsByDefaultOrder(defaultOptions = [], apiOptions = []) {
  const defaultItems = Array.isArray(defaultOptions)
    ? defaultOptions.map(normalizeOption)
    : [];

  const apiItems = Array.isArray(apiOptions)
    ? apiOptions.map(normalizeOption)
    : [];

  const apiMap = new Map();

  for (const item of apiItems) {
    const key = String(item?.value ?? "");
    if (!key) continue;

    if (!apiMap.has(key)) {
      apiMap.set(key, item);
    }
  }

  const used = new Set();
  const merged = [];

  for (const def of defaultItems) {
    const key = String(def?.value ?? "");
    if (!key) continue;

    const api = apiMap.get(key);

    merged.push({
      value: key,
      label: def?.label || api?.label || key,
      folder: def?.folder || api?.folder || "",
      fileName: def?.fileName || api?.fileName || "",
    });

    used.add(key);
  }

  for (const api of apiItems) {
    const key = String(api?.value ?? "");
    if (!key || used.has(key)) continue;

    merged.push({
      value: key,
      label: api?.label || key,
      folder: api?.folder || "",
      fileName: api?.fileName || "",
    });
  }

  return merged;
}

export default function MapEditorForm({
  value,
  loading = false,
  continentOptions = [],
  mapTypeOptions = [],
  layerNameOptions = [],
  onChangeField,
  onAddLayer,
  onChangeLayer,
  onRemoveLayer,
  isMobile = false,

  // 追加: レイヤー追加ボタンの下に差し込む表示
  afterLayerContent = null,
}) {
  const mergedContinentOptions = useMemo(() => {
    return mergeContinentOptions(
      DEFAULT_CONTINENT_OPTIONS,
      Array.isArray(continentOptions) ? continentOptions : []
    );
  }, [continentOptions]);

  const mergedMapTypeOptions = useMemo(() => {
    return mergeOptionsByDefaultOrder(
      DEFAULT_MAP_TYPE_OPTIONS,
      Array.isArray(mapTypeOptions) ? mapTypeOptions : []
    );
  }, [mapTypeOptions]);

  const mergedLayerNameOptions = useMemo(() => {
    const options =
      Array.isArray(layerNameOptions) && layerNameOptions.length > 0
        ? layerNameOptions
        : DEFAULT_LAYER_NAME_OPTIONS;

    return Array.isArray(options) ? options.map(normalizeOption) : [];
  }, [layerNameOptions]);

  useEffect(() => {
    const currentContinentId =
      value?.continent_id !== null &&
      value?.continent_id !== undefined &&
      String(value.continent_id).trim() !== ""
        ? String(value.continent_id)
        : "";

    if (!currentContinentId || value?.id) return;

    const matched = mergedContinentOptions.find(
      (item) => String(item.value) === currentContinentId
    );

    const nextFolder = String(matched?.folder ?? "").trim();
    const currentFolder = String(value?.continent_folder ?? "").trim();

    if (nextFolder && nextFolder !== currentFolder) {
      onChangeField?.("continent_folder", nextFolder);
    }
  }, [
    value?.continent_id,
    value?.continent_folder,
    mergedContinentOptions,
    onChangeField,
  ]);

  if (loading) {
    return <div style={styles.loading}>読み込み中...</div>;
  }

  const layers = Array.isArray(value?.layers) ? value.layers : [];

  function handleSelectImage(index, file) {
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);

    onChangeLayer?.(index, "image_file", file);
    onChangeLayer?.(index, "image_url", previewUrl);
  }

  return (
    <div style={styles.wrap}>
      <section style={styles.section}>
        <h2 style={styles.heading}>基本情報</h2>

        <div style={styles.grid(isMobile)}>
          <label style={styles.field}>
            <div style={styles.label}>大陸</div>
            <select
              value={
                value?.continent_id !== null &&
                value?.continent_id !== undefined
                  ? String(value.continent_id)
                  : ""
              }
              onChange={(e) => {
                const val = e.target.value;
                const opt = mergedContinentOptions.find(
                  (o) => String(o.value) === String(val)
                );

                onChangeField?.("continent_id", val ? Number(val) : "");
                onChangeField?.("continent", opt?.name ?? opt?.label ?? "");
                onChangeField?.("continent_folder", opt?.folder ?? "");
              }}
              style={styles.input}
            >
              <option value="">選択</option>
              {mergedContinentOptions.map((opt) => (
                <option key={opt.id ?? opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.field}>
            <div style={styles.label}>マップ名</div>
            <input
              value={value?.name ?? ""}
              onChange={(e) => onChangeField?.("name", e.target.value)}
              style={styles.input}
            />
          </label>

          <label style={styles.field}>
            <div style={styles.label}>マップ名（かな）</div>
            <input
              value={value?.name_kana ?? ""}
              onChange={(e) => onChangeField?.("name_kana", e.target.value)}
              style={styles.input}
              placeholder="オーグリードたいりく"
            />
          </label>

          <label style={styles.field}>
            <div style={styles.label}>マップ名(en)</div>
            <input
              value={value?.name_en ?? ""}
              onChange={(e) => onChangeField?.("name_en", e.target.value)}
              style={styles.input}
            />
          </label>

          <label style={styles.field}>
            <div style={styles.label}>マップ種別</div>
            <select
              value={value?.map_type ?? ""}
              onChange={(e) => onChangeField?.("map_type", e.target.value)}
              style={styles.input}
            >
              <option value="">選択</option>
              {mergedMapTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.field}>
            <div style={styles.label}>画像アップロードフォルダ</div>
            <input
              value={value?.continent_folder ?? ""}
              onChange={(e) =>
                onChangeField?.("continent_folder", e.target.value)
              }
              style={styles.input}
            />
          </label>

          <label style={{ ...styles.field, ...styles.fieldFull }}>
            <div style={styles.label}>元URL</div>
            <input
              value={value?.source_url ?? ""}
              onChange={(e) => onChangeField?.("source_url", e.target.value)}
              style={styles.input}
            />
          </label>
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.layerList}>
          {layers.map((layer, index) => {
            const previewUrl =
              layer?.image_url || resolveMapImageUrl(layer?.image_path || "");

            return (
              <div key={layer?.id ?? `layer_${index}`} style={styles.layerCard}>
                <div style={styles.layerCardHeader}>
                  <div style={styles.layerCardIndex}>{index + 1}</div>

                  <button
                    type="button"
                    onClick={() => onRemoveLayer?.(index)}
                    style={styles.removeButton}
                  >
                    削除
                  </button>
                </div>

                <div style={styles.grid(isMobile)}>
                  <label style={styles.field}>
                    <div style={styles.label}>レイヤー名</div>
                    <input
                      list={`layer-name-options-${index}`}
                      value={layer?.layer_name ?? ""}
                      onChange={(e) =>
                        onChangeLayer?.(index, "layer_name", e.target.value)
                      }
                      style={styles.input}
                    />

                    <datalist id={`layer-name-options-${index}`}>
                      {mergedLayerNameOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </datalist>
                  </label>

                  <label style={styles.field}>
                    <div style={styles.label}>保存ファイル名</div>
                    <input
                      value={layer?.layer_file_name ?? ""}
                      onChange={(e) =>
                        onChangeLayer?.(
                          index,
                          "layer_file_name",
                          e.target.value
                        )
                      }
                      style={styles.input}
                    />
                  </label>

                  <label style={styles.field}>
                    <div style={styles.label}>floor_no</div>
                    <input
                      type="number"
                      value={layer?.floor_no ?? 0}
                      onChange={(e) =>
                        onChangeLayer?.(
                          index,
                          "floor_no",
                          Number(e.target.value)
                        )
                      }
                      style={styles.input}
                    />
                  </label>

                  <label style={styles.field}>
                    <div style={styles.label}>表示順</div>
                    <input
                      type="number"
                      value={layer?.display_order ?? index + 1}
                      onChange={(e) =>
                        onChangeLayer?.(
                          index,
                          "display_order",
                          Number(e.target.value || index + 1)
                        )
                      }
                      style={styles.input}
                    />
                  </label>

                  <label style={styles.field}>
                    <div style={styles.label}>元URL</div>
                    <input
                      value={layer?.source_url ?? ""}
                      onChange={(e) =>
                        onChangeLayer?.(index, "source_url", e.target.value)
                      }
                      style={styles.input}
                    />
                  </label>

                  <label style={{ ...styles.field, ...styles.fieldFull }}>
                    <div style={styles.label}>画像</div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        handleSelectImage(index, e.target.files?.[0])
                      }
                      style={styles.input}
                    />
                    <div style={styles.helpText}>
                      保存時に自動で
                      /storage/images/maps/大陸/map_id_xxx/layer_file_name.webp
                      で保存される
                    </div>
                  </label>
                </div>

                {previewUrl ? (
                  <div style={styles.previewWrap}>
                    <Image
                      src={previewUrl}
                      alt={`map-layer-${index + 1}`}
                      fill
                      sizes="(max-width: 768px) 100vw, 900px"
                      style={styles.previewImage}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div style={styles.layerHeader}>
          <button type="button" onClick={onAddLayer} style={styles.addButton}>
            レイヤー追加
          </button>
        </div>

        {afterLayerContent ? (
          <div style={styles.afterLayerContent}>{afterLayerContent}</div>
        ) : null}
      </section>
    </div>
  );
}

const styles = {
  wrap: {
    display: "grid",
    gap: "20px",
    minWidth: 0,
  },
  section: {
    border: "1px solid var(--card-border, #e2e8f0)",
    padding: "16px",
    borderRadius: "16px",
    minWidth: 0,
    background: "var(--card-bg, #ffffff)",
  },
  heading: {
    fontSize: "18px",
    fontWeight: "700",
    margin: 0,
    color: "var(--text-main, #111827)",
  },
  grid: (isMobile) => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
    gap: "12px",
    marginTop: "10px",
  }),
  field: {
    display: "grid",
    gap: "6px",
    minWidth: 0,
  },
  fieldFull: {
    gridColumn: "1 / -1",
  },
  label: {
    fontSize: "13px",
    fontWeight: "600",
    color: "var(--text-sub, #334155)",
  },
  input: {
    border: "1px solid var(--input-border, #cbd5e1)",
    padding: "10px 12px",
    borderRadius: "8px",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    background: "var(--input-bg, #ffffff)",
    color: "var(--input-text, #111827)",
  },
  layerHeader: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "20px",
    marginBottom: "10px",
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  addButton: {
    background: "var(--primary-bg, #0f172a)",
    color: "var(--primary-text, #ffffff)",
    border: "1px solid var(--primary-border, #0f172a)",
    padding: "8px 12px",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: 700,
  },
  layerList: {
    display: "grid",
    gap: "14px",
  },
  layerCard: {
    border: "1px solid var(--card-border, #cbd5e1)",
    padding: "14px",
    borderRadius: "12px",
    minWidth: 0,
    background: "var(--panel-bg, #ffffff)",
  },
  layerCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "8px",
    gap: "10px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  layerCardIndex: {
    fontWeight: 700,
    color: "var(--text-main, #0f172a)",
  },
removeButton: {
  background: "var(--danger-bg)",
  color: "var(--danger-text)",
  border: "1px solid var(--danger-border, #ef4444)",
  padding: "6px 10px",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 700,
},
  previewWrap: {
    position: "relative",
    width: "100%",
    marginTop: "10px",
    aspectRatio: "16 / 9",
    maxHeight: "480px",
    overflow: "hidden",
    borderRadius: "8px",
    border: "1px solid var(--card-border, #e2e8f0)",
    background: "var(--soft-bg, #f8fafc)",
  },
  previewImage: {
    objectFit: "contain",
  },
  helpText: {
    fontSize: "12px",
    color: "var(--text-muted, #64748b)",
    lineHeight: 1.5,
  },
  loading: {
    padding: "20px",
    color: "var(--text-muted, #64748b)",
  },
  afterLayerContent: {
    marginTop: "18px",
    minWidth: 0,
  },
};