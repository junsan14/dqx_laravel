"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { searchMonsters } from "@/lib/monsters";
import { resolveImageUrl } from "@/lib/monsterMapSpawns";

const COLS_8 = ["A", "B", "C", "D", "E", "F", "G", "H"];
const ROWS_8 = [1, 2, 3, 4, 5, 6, 7, 8];

const COLS_4 = ["A", "B", "C", "D"];
const ROWS_4 = [1, 2, 3, 4];

const SPAWN_TIME_OPTIONS = [
  { value: "いつでも", label: "いつでも" },
  { value: "昼", label: "昼のみ" },
  { value: "夜", label: "夜のみ" },
  { value: "吹雪", label: "吹雪" },
];

const DEFAULT_MAP_GRID_INSET = {
  top: "3.4%",
  right: "0%",
  bottom: "0%",
  left: "4%",
};

function uniqCoords(coords = []) {
  return [
    ...new Set(
      (coords ?? []).map((value) => String(value ?? "").trim()).filter(Boolean)
    ),
  ];
}

function stringifyCoords(coords = []) {
  return JSON.stringify(uniqCoords(coords));
}

function applyCoordSet(currentCoords = [], targetCoords = [], mode = "add") {
  const current = uniqCoords(currentCoords);
  const targets = uniqCoords(targetCoords);

  if (mode === "remove") {
    return current.filter((coord) => !targets.includes(coord));
  }

  return uniqCoords([...current, ...targets]);
}

function getCoordsFor4x4Cell(colIndex, rowIndex) {
  const startCol = colIndex * 2;
  const startRow = rowIndex * 2;
  const coords = [];

  for (let y = startRow; y < startRow + 2; y += 1) {
    for (let x = startCol; x < startCol + 2; x += 1) {
      coords.push(`${COLS_8[x]}${ROWS_8[y]}`);
    }
  }

  return coords;
}

function get4x4CellMiniMap(coords = [], colIndex, rowIndex) {
  const activeSet = new Set(uniqCoords(coords));
  const blockCoords = getCoordsFor4x4Cell(colIndex, rowIndex);

  return blockCoords.map((coord) => ({
    coord,
    active: activeSet.has(coord),
  }));
}

function getLayerLabel(layer = {}, index = 0) {
  const explicit = String(layer?.layer_name ?? "").trim();
  if (explicit) return explicit;

  if (layer?.floor_no !== null && layer?.floor_no !== undefined) {
    const floorNo = Number(layer.floor_no);

    if (floorNo === 0) return "地上";
    if (floorNo < 0) return `地下${Math.abs(floorNo)}階`;

    return `${floorNo}階`;
  }

  return `階層${index + 1}`;
}

function getLayerImageUrl(layer = {}, map = {}) {
  const path =
    layer?.image_url ??
    layer?.image_path ??
    layer?.map_image_url ??
    map?.image_url ??
    map?.image_path ??
    "";

  return resolveImageUrl(path);
}

function getDefaultLayer(map = {}) {
  const layers = Array.isArray(map?.layers) ? map.layers : [];
  return layers[0] ?? null;
}

function getMapGridInset() {
  return DEFAULT_MAP_GRID_INSET;
}

function makeSpawn(map = {}) {
  const firstLayer = getDefaultLayer(map);

  return {
    id: null,
    __key: `map-spawn-${Date.now()}-${Math.random().toString(36).slice(2)}`,

    monster_id: null,
    monster_name: "",

    map_id: map?.id ?? "",
    map_name: map?.name ?? "",

    map_layer_id: firstLayer?.id ?? "",
    map_layer_name: firstLayer ? getLayerLabel(firstLayer, 0) : "",
    map_image_url: firstLayer ? getLayerImageUrl(firstLayer, map) : "",

    area: "[]",
    coords: [],

    spawn_time: "いつでも",
    spawn_count: "",
    symbol_count: "",

    imported_note: "",
    note: "",

    is_hunting_ground: false,
    grid_mode: "block",
  };
}

function getSpawnTabLabel(spawn, index) {
  const monsterName = String(spawn?.monster_name ?? "").trim();
  if (monsterName) return monsterName;

  return `モンスター${index + 1}`;
}

function MonsterSearchInput({
  selectedMonsterName = "",
  onSelect,
  disabled = false,
  styles,
}) {
  const [keyword, setKeyword] = useState(selectedMonsterName ?? "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const wrapRef = useRef(null);

  useEffect(() => {
    setKeyword(selectedMonsterName ?? "");
  }, [selectedMonsterName]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const q = String(keyword ?? "").trim();

    if (!open || disabled) return;

    if (!q) {
      setRows([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const result = await searchMonsters(q, "monster");
        setRows(Array.isArray(result) ? result.slice(0, 30) : []);
      } catch (error) {
        console.error(error);
        setRows([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [keyword, open, disabled]);

  return (
    <div ref={wrapRef} style={styles.searchWrap}>
      <input
        type="text"
        value={keyword}
        placeholder="モンスター名を入力"
        disabled={disabled}
        onChange={(e) => {
          setKeyword(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        style={{
          ...styles.input,
          ...(disabled ? styles.inputDisabled : {}),
        }}
        className="map-monster-spawns-input"
      />

      {open && !disabled ? (
        <div style={styles.searchDropdown}>
          {loading ? (
            <div style={styles.searchEmpty}>検索中...</div>
          ) : rows.length > 0 ? (
            rows.map((monster) => (
              <button
                key={monster.id}
                type="button"
                onClick={() => {
                  onSelect(monster);
                  setKeyword(monster?.name ?? "");
                  setOpen(false);
                }}
                style={styles.searchItem}
                className="map-monster-spawns-search-item"
              >
                <div style={styles.searchItemName}>{monster?.name}</div>
                {monster?.name_en ? (
                  <div style={styles.searchItemSub}>{monster.name_en}</div>
                ) : null}
              </button>
            ))
          ) : (
            <div style={styles.searchEmpty}>
              {keyword.trim() ? "見つからない" : "入力してください"}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SpawnMapGrid({
  mapImageUrl = "",
  coords = [],
  onApplyCoords,
  gridMode = "block",
  disabled = false,
  styles,
}) {
  const activeSet = useMemo(() => new Set(uniqCoords(coords)), [coords]);
  const inset = getMapGridInset();

  const dragStateRef = useRef({
    active: false,
    mode: "add",
    visited: new Set(),
  });

  useEffect(() => {
    function handleWindowMouseUp() {
      dragStateRef.current.active = false;
      dragStateRef.current.visited = new Set();
    }

    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, []);

  function getDragKey(targetCoords = []) {
    return uniqCoords(targetCoords).join("|");
  }

  function startDrag(targetCoords = []) {
    if (disabled) return;

    const normalized = uniqCoords(targetCoords);
    if (!normalized.length) return;

    const shouldRemove = normalized.every((coord) => activeSet.has(coord));
    const mode = shouldRemove ? "remove" : "add";

    dragStateRef.current.active = true;
    dragStateRef.current.mode = mode;
    dragStateRef.current.visited = new Set([getDragKey(normalized)]);

    onApplyCoords(normalized, mode);
  }

  function moveDrag(targetCoords = []) {
    if (disabled) return;
    if (!dragStateRef.current.active) return;

    const normalized = uniqCoords(targetCoords);
    if (!normalized.length) return;

    const key = getDragKey(normalized);
    if (dragStateRef.current.visited.has(key)) return;

    dragStateRef.current.visited.add(key);
    onApplyCoords(normalized, dragStateRef.current.mode);
  }

  function endDrag() {
    dragStateRef.current.active = false;
    dragStateRef.current.visited = new Set();
  }

  const overlayStyle =
    gridMode === "single"
      ? {
          ...styles.singleOverlay,
          top: inset.top,
          right: inset.right,
          bottom: inset.bottom,
          left: inset.left,
        }
      : {
          ...styles.gridOverlay,
          top: inset.top,
          right: inset.right,
          bottom: inset.bottom,
          left: inset.left,
        };

  return (
    <div style={styles.mapBoardWrap}>
      <div className="map-monster-spawns-map-board" style={styles.mapBoard}>
        {mapImageUrl ? (
          <Image
            src={mapImageUrl}
            alt="map"
            fill
            sizes="(max-width: 768px) calc(100vw - 56px), 560px"
            style={styles.mapImage}
            unoptimized
          />
        ) : (
          <div style={styles.mapPlaceholder}>マップ画像なし</div>
        )}

        {gridMode === "single" ? (
          <div style={overlayStyle}>
            {ROWS_8.map((row) =>
              COLS_8.map((col) => {
                const label = `${col}${row}`;
                const active = activeSet.has(label);

                return (
                  <button
                    key={label}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      startDrag([label]);
                    }}
                    onMouseEnter={() => moveDrag([label])}
                    onMouseUp={endDrag}
                    onDragStart={(e) => e.preventDefault()}
                    disabled={disabled}
                    style={{
                      ...styles.gridCellSingle,
                      ...(active ? styles.gridCellActive : {}),
                      ...(disabled ? styles.gridCellDisabled : {}),
                    }}
                    title={label}
                  >
                    <span style={styles.gridCellLabelSingle}>{label}</span>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div style={overlayStyle}>
            {ROWS_4.map((row, rowIndex) =>
              COLS_4.map((colLabel, colIndex) => {
                const blockCoords = getCoordsFor4x4Cell(colIndex, rowIndex);
                const miniCells = get4x4CellMiniMap(coords, colIndex, rowIndex);
                const hasAnyActive = miniCells.some((cell) => cell.active);
                const label = `${colLabel}${row}`;

                return (
                  <button
                    key={label}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      startDrag(blockCoords);
                    }}
                    onMouseEnter={() => moveDrag(blockCoords)}
                    onMouseUp={endDrag}
                    onDragStart={(e) => e.preventDefault()}
                    disabled={disabled}
                    style={{
                      ...styles.gridCell,
                      ...(hasAnyActive ? styles.gridCellPartialActive : {}),
                      ...(disabled ? styles.gridCellDisabled : {}),
                    }}
                    title={`${label} → ${blockCoords.join(", ")}`}
                  >
                    <div style={styles.gridCellMiniMap}>
                      {miniCells.map((cell) => (
                        <span
                          key={cell.coord}
                          style={{
                            ...styles.gridCellMini,
                            ...(cell.active ? styles.gridCellMiniActive : {}),
                          }}
                        />
                      ))}
                    </div>

                    <span style={styles.gridCellLabel}>{label}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SpawnCard({ spawn, map, onChange, onRemove, disabled = false, styles }) {
  const layers = Array.isArray(map?.layers) ? map.layers : [];

  const selectedLayer = useMemo(() => {
    if (!layers.length) return null;

    if (spawn?.map_layer_id) {
      const matched =
        layers.find((layer) => Number(layer.id) === Number(spawn.map_layer_id)) ??
        null;

      if (matched) return matched;
    }

    return getDefaultLayer(map);
  }, [layers, map, spawn?.map_layer_id]);

  useEffect(() => {
    if (!map?.id) return;

    const nextMapName = map?.name ?? "";
    const nextLayerId = selectedLayer?.id ?? "";
    const nextLayerName = selectedLayer ? getLayerLabel(selectedLayer, 0) : "";
    const nextImage = selectedLayer ? getLayerImageUrl(selectedLayer, map) : "";

    if (
      Number(spawn?.map_id ?? 0) !== Number(map.id) ||
      nextMapName !== (spawn?.map_name ?? "") ||
      String(nextLayerId ?? "") !== String(spawn?.map_layer_id ?? "") ||
      nextLayerName !== (spawn?.map_layer_name ?? "") ||
      nextImage !== (spawn?.map_image_url ?? "")
    ) {
      onChange({
        ...spawn,
        map_id: map.id,
        map_name: nextMapName,
        map_layer_id: nextLayerId || "",
        map_layer_name: nextLayerName,
        map_image_url: nextImage,
      });
    }
  }, [map, selectedLayer, spawn, onChange]);

  function setField(key, value) {
    if (disabled) return;

    onChange({
      ...spawn,
      [key]: value,
    });
  }

  function handleApplyCoords(targetCoords, mode = "add") {
    if (disabled) return;

    const nextCoords = applyCoordSet(spawn?.coords ?? [], targetCoords, mode);

    onChange({
      ...spawn,
      coords: nextCoords,
      area: stringifyCoords(nextCoords),
    });
  }

  function setGridMode(nextMode) {
    if (disabled) return;

    onChange({
      ...spawn,
      grid_mode: nextMode,
    });
  }

  return (
    <div className="map-monster-spawns-card" style={styles.spawnCard}>
      <div style={styles.spawnCardHeader}>
        <div style={styles.spawnHeaderMain}>
          <h3 style={styles.spawnTitle}>
            {spawn?.monster_name || "モンスター未選択"}
          </h3>

          {spawn?.map_layer_name ? (
            <div style={styles.layerBadge}>{spawn.map_layer_name}</div>
          ) : null}
        </div>

        <label
          style={{
            ...styles.checkboxRow,
            ...(disabled ? styles.disabledRow : {}),
          }}
        >
          <input
            type="checkbox"
            checked={Boolean(spawn?.is_hunting_ground)}
            onChange={(e) => setField("is_hunting_ground", e.target.checked)}
            disabled={disabled}
            style={styles.checkbox}
          />
          <span style={styles.checkboxLabel}>狩場</span>
        </label>

        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          style={{
            ...styles.removeButton,
            ...(disabled ? styles.buttonDisabled : {}),
          }}
        >
          削除
        </button>
      </div>

      <div className="map-monster-spawns-form-grid" style={styles.formGrid}>
        <label style={styles.field}>
          <span style={styles.label}>モンスター</span>
          <MonsterSearchInput
            selectedMonsterName={spawn?.monster_name ?? ""}
            disabled={disabled}
            styles={styles}
            onSelect={(monster) => {
              setField("monster_id", monster?.id ?? null);
              onChange({
                ...spawn,
                monster_id: monster?.id ?? null,
                monster_name: monster?.name ?? "",
              });
            }}
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>階層</span>
          <select
            value={spawn?.map_layer_id ?? ""}
            disabled={disabled || layers.length === 0}
            onChange={(e) => {
              const nextLayerId = e.target.value;
              const nextLayer =
                layers.find((layer) => String(layer.id) === String(nextLayerId)) ??
                null;

              onChange({
                ...spawn,
                map_layer_id: nextLayerId ? Number(nextLayerId) : "",
                map_layer_name: nextLayer ? getLayerLabel(nextLayer, 0) : "",
                map_image_url: nextLayer ? getLayerImageUrl(nextLayer, map) : "",
              });
            }}
            style={{
              ...styles.input,
              ...(disabled || layers.length === 0 ? styles.inputDisabled : {}),
            }}
            className="map-monster-spawns-input"
          >
            {layers.length === 0 ? (
              <option value="">階層なし</option>
            ) : (
              layers.map((layer, index) => (
                <option key={layer.id ?? index} value={layer.id ?? ""}>
                  {getLayerLabel(layer, index)}
                </option>
              ))
            )}
          </select>
        </label>

        <label style={styles.field}>
          <span style={styles.label}>出現時間</span>
          <select
            value={spawn?.spawn_time ?? "いつでも"}
            disabled={disabled}
            onChange={(e) => setField("spawn_time", e.target.value)}
            style={{
              ...styles.input,
              ...(disabled ? styles.inputDisabled : {}),
            }}
            className="map-monster-spawns-input"
          >
            {SPAWN_TIME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.field}>
          <span style={styles.label}>出現数</span>
          <input
            type="text"
            value={spawn?.spawn_count ?? ""}
            disabled={disabled}
            onChange={(e) => setField("spawn_count", e.target.value)}
            style={{
              ...styles.input,
              ...(disabled ? styles.inputDisabled : {}),
            }}
            placeholder="1 / 1〜2 / 2-3"
            className="map-monster-spawns-input"
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>シンボル数</span>
          <input
            type="text"
            value={spawn?.symbol_count ?? ""}
            disabled={disabled}
            onChange={(e) => setField("symbol_count", e.target.value)}
            style={{
              ...styles.input,
              ...(disabled ? styles.inputDisabled : {}),
            }}
            placeholder="1 / 2 / 多数"
            className="map-monster-spawns-input"
          />
        </label>
      </div>

      <div className="map-monster-spawns-note-grid" style={styles.noteGrid}>
        <label style={styles.field}>
          <span style={styles.label}>生息エリア</span>
          <textarea
            value={JSON.stringify(spawn?.coords ?? [])}
            readOnly
            rows={1}
            style={styles.textareaReadonly}
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>表示メモ</span>
          <textarea
            value={spawn?.note ?? ""}
            disabled={disabled}
            onChange={(e) => setField("note", e.target.value)}
            rows={3}
            style={{
              ...styles.textarea,
              ...(disabled ? styles.inputDisabled : {}),
            }}
            className="map-monster-spawns-textarea"
            placeholder="表示用メモを入力"
          />
        </label>
      </div>

      <div style={styles.modeRow}>
        <span style={styles.modeLabel}>選択モード</span>

        <div style={styles.modeButtons}>
          <button
            type="button"
            onClick={() => setGridMode("block")}
            disabled={disabled}
            style={{
              ...styles.modeButton,
              ...(spawn?.grid_mode !== "single" ? styles.modeButtonActive : {}),
              ...(disabled ? styles.buttonDisabled : {}),
            }}
            className="map-monster-spawns-chip-button"
          >
            4マス
          </button>

          <button
            type="button"
            onClick={() => setGridMode("single")}
            disabled={disabled}
            style={{
              ...styles.modeButton,
              ...(spawn?.grid_mode === "single" ? styles.modeButtonActive : {}),
              ...(disabled ? styles.buttonDisabled : {}),
            }}
            className="map-monster-spawns-chip-button"
          >
            1マス
          </button>
        </div>
      </div>

      <SpawnMapGrid
        mapImageUrl={spawn?.map_image_url ?? ""}
        coords={spawn?.coords ?? []}
        gridMode={spawn?.grid_mode ?? "block"}
        disabled={disabled}
        onApplyCoords={handleApplyCoords}
        styles={styles}
      />
    </div>
  );
}

export default function MapMonsterSpawnsEditor({
  map = null,
  spawns = [],
  onChange,
  loading = false,
}) {
  const styles = useMemo(() => getStyles(), []);
  const [activeIndex, setActiveIndex] = useState(0);

  const disabled = loading || !map?.id;

  useEffect(() => {
    if (!Array.isArray(spawns) || spawns.length === 0) {
      if (activeIndex !== 0) setActiveIndex(0);
      return;
    }

    if (activeIndex > spawns.length - 1) {
      setActiveIndex(spawns.length - 1);
    }
  }, [spawns, activeIndex]);

  function setNextSpawns(nextSpawns) {
    onChange(Array.isArray(nextSpawns) ? nextSpawns : []);
  }

  function addSpawn() {
    if (disabled) return;

    const next = [...(spawns ?? []), makeSpawn(map)];
    setNextSpawns(next);
    setActiveIndex(next.length - 1);
  }

  function updateSpawn(spawnKey, nextSpawn) {
    setNextSpawns(
      (spawns ?? []).map((spawn) =>
        spawn.__key === spawnKey ? nextSpawn : spawn
      )
    );
  }

  function removeSpawn(spawnKey) {
    const current = spawns ?? [];
    const removeIndex = current.findIndex((spawn) => spawn.__key === spawnKey);
    const next = current.filter((spawn) => spawn.__key !== spawnKey);

    setNextSpawns(next);

    if (next.length === 0) {
      setActiveIndex(0);
      return;
    }

    setActiveIndex((prev) => {
      if (prev > removeIndex) return prev - 1;
      if (prev >= next.length) return next.length - 1;
      return prev;
    });
  }

  const activeSpawn = spawns?.[activeIndex] ?? null;

  return (
    <>
      <style>{`
        .map-monster-spawns-input::placeholder,
        .map-monster-spawns-textarea::placeholder {
          color: ${styles.placeholderColor};
          opacity: 1;
        }

        .map-monster-spawns-input,
        .map-monster-spawns-textarea,
        .map-monster-spawns-search-item,
        .map-monster-spawns-chip-button,
        .map-monster-spawns-tab {
          transition:
            background-color 0.18s ease,
            border-color 0.18s ease,
            color 0.18s ease,
            box-shadow 0.18s ease,
            opacity 0.18s ease;
        }

        .map-monster-spawns-input:focus,
        .map-monster-spawns-textarea:focus {
          outline: none;
          border-color: ${styles.focusRingColor};
          box-shadow: 0 0 0 3px ${styles.focusRingShadow};
        }

        .map-monster-spawns-search-item:hover {
          background: var(--soft-bg) !important;
        }

        .map-monster-spawns-chip-button:hover:not(:disabled) {
          background: var(--soft-bg) !important;
          color: var(--text-main) !important;
        }

        .map-monster-spawns-tab:hover {
          background: var(--card-bg) !important;
          color: var(--text-main) !important;
        }

        @media (max-width: 768px) {
          .map-monster-spawns-form-grid,
          .map-monster-spawns-note-grid {
            grid-template-columns: 1fr !important;
          }

          .map-monster-spawns-map-board {
            width: 100% !important;
            max-width: 100% !important;
          }
        }
      `}</style>

      <section style={styles.wrapper}>
        <div style={styles.header}>
          <div style={styles.headerTextBlock}>
            <h2 style={styles.title}>このMAPの生息モンスター</h2>
            <p style={styles.desc}>
              {map?.id
                ? "このMAPに出現するモンスターを一括登録する"
                : "先にマップを保存すると、生息モンスターを登録できる"}
            </p>
          </div>

          <button
            type="button"
            onClick={addSpawn}
            disabled={disabled}
            style={{
              ...styles.addButton,
              ...(disabled ? styles.buttonDisabled : {}),
            }}
          >
            モンスターを追加
          </button>
        </div>

        {spawns.length > 0 ? (
          <div className="map-monster-spawns-tabs" style={styles.tabWrap}>
            {spawns.map((spawn, index) => {
              const isActive = index === activeIndex;

              return (
                <button
                  key={spawn.__key}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  style={{
                    ...styles.tab,
                    ...(isActive ? styles.tabActive : {}),
                  }}
                  className="map-monster-spawns-tab"
                  title={getSpawnTabLabel(spawn, index)}
                >
                  {getSpawnTabLabel(spawn, index)}
                </button>
              );
            })}
          </div>
        ) : null}

        {loading ? (
          <div style={styles.empty}>読み込み中...</div>
        ) : !map?.id ? (
          <div style={styles.empty}>新規マップは保存後に登録できます</div>
        ) : spawns.length === 0 ? (
          <div style={styles.empty}>このMAPの生息モンスターは未登録</div>
        ) : (
          <div style={styles.list}>
            {activeSpawn ? (
              <SpawnCard
                key={activeSpawn.__key}
                spawn={activeSpawn}
                map={map}
                disabled={disabled}
                onChange={(nextSpawn) =>
                  updateSpawn(activeSpawn.__key, nextSpawn)
                }
                onRemove={() => removeSpawn(activeSpawn.__key)}
                styles={styles}
              />
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}

function getStyles() {
  return {
    wrapper: {
      background: "var(--card-bg)",
      border: "1px solid var(--card-border)",
      borderRadius: 14,
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 16,
      width: "100%",
      maxWidth: "100%",
      minWidth: 0,
      boxSizing: "border-box",
      overflowX: "hidden",
    },
    header: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
    },
    headerTextBlock: {
      minWidth: 0,
      flex: 1,
    },
    title: {
      margin: 0,
      fontSize: 18,
      fontWeight: 800,
      color: "var(--text-title)",
    },
    desc: {
      margin: "4px 0 0",
      color: "var(--text-muted)",
      fontSize: 13,
    },
    addButton: {
      border: "1px solid var(--soft-border)",
      background: "var(--soft-bg)",
      color: "var(--text-main)",
      borderRadius: 10,
      padding: "10px 14px",
      cursor: "pointer",
      fontWeight: 700,
      minHeight: 42,
    },
    buttonDisabled: {
      opacity: 0.55,
      cursor: "not-allowed",
    },
    disabledRow: {
      opacity: 0.7,
      cursor: "not-allowed",
    },
    tabWrap: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      paddingBottom: 4,
      marginTop: -2,
    },
    tab: {
      border: "1px solid var(--soft-border)",
      background: "var(--soft-bg)",
      color: "var(--text-muted)",
      borderRadius: 999,
      padding: "8px 12px",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 700,
    },
    tabActive: {
      borderColor: "var(--selected-border)",
      background: "var(--selected-bg)",
      color: "var(--selected-text)",
    },
    empty: {
      padding: 16,
      borderRadius: 12,
      background: "var(--soft-bg)",
      color: "var(--text-muted)",
    },
    list: {
      display: "flex",
      flexDirection: "column",
      gap: 16,
    },
    spawnCard: {
      border: "1px solid var(--card-border)",
      borderRadius: 14,
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 14,
      background: "var(--card-bg)",
      overflowX: "hidden",
    },
    spawnCardHeader: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
    },
    spawnHeaderMain: {
      display: "flex",
      flexDirection: "column",
      gap: 4,
      flex: 1,
      minWidth: 0,
    },
    spawnTitle: {
      margin: 0,
      fontSize: 17,
      fontWeight: 800,
      color: "var(--text-title)",
      wordBreak: "break-word",
    },
    layerBadge: {
      width: "fit-content",
      minHeight: 24,
      padding: "4px 8px",
      borderRadius: 999,
      background: "var(--soft-bg)",
      color: "var(--text-sub)",
      fontSize: 12,
      fontWeight: 700,
      border: "1px solid var(--soft-border)",
    },
    removeButton: {
      border: "1px solid var(--danger-border)",
      background: "var(--danger-bg)",
      color: "var(--danger-text)",
      borderRadius: 10,
      padding: "8px 12px",
      cursor: "pointer",
      fontWeight: 700,
      minHeight: 38,
    },
    formGrid: {
      display: "grid",
      gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr",
      gap: 12,
      width: "100%",
    },
    noteGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 12,
    },
    field: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      minWidth: 0,
    },
    label: {
      fontSize: 13,
      fontWeight: 700,
      color: "var(--text-muted)",
    },
    input: {
      width: "100%",
      minHeight: 42,
      borderRadius: 10,
      border: "1px solid var(--input-border)",
      padding: "0 12px",
      background: "var(--input-bg)",
      color: "var(--input-text)",
      boxSizing: "border-box",
    },
    inputDisabled: {
      background: "var(--input-disabled-bg)",
      color: "var(--text-muted)",
      cursor: "not-allowed",
    },
    textarea: {
      width: "100%",
      borderRadius: 10,
      border: "1px solid var(--input-border)",
      padding: 12,
      background: "var(--input-bg)",
      color: "var(--input-text)",
      resize: "vertical",
      minHeight: 76,
      boxSizing: "border-box",
    },
    textareaReadonly: {
      width: "100%",
      borderRadius: 10,
      border: "1px solid var(--soft-border)",
      padding: "10px 12px",
      background: "var(--soft-bg)",
      color: "var(--text-sub)",
      resize: "none",
      minHeight: 42,
      height: 42,
      overflow: "hidden",
      boxSizing: "border-box",
    },
    checkboxRow: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      width: "fit-content",
      color: "var(--text-main)",
    },
    checkbox: {
      width: 16,
      height: 16,
      margin: 0,
      cursor: "pointer",
      accentColor: "var(--selected-border)",
    },
    checkboxLabel: {
      fontSize: 14,
      fontWeight: 700,
      color: "var(--text-main)",
    },
    modeRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
    },
    modeLabel: {
      fontSize: 13,
      fontWeight: 700,
      color: "var(--text-muted)",
    },
    modeButtons: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
    },
    modeButton: {
      border: "1px solid var(--soft-border)",
      background: "var(--card-bg)",
      color: "var(--text-muted)",
      borderRadius: 999,
      padding: "8px 12px",
      cursor: "pointer",
      fontWeight: 700,
      minHeight: 36,
    },
    modeButtonActive: {
      borderColor: "var(--selected-border)",
      background: "var(--selected-bg)",
      color: "var(--selected-text)",
    },
    searchWrap: {
      position: "relative",
      width: "100%",
    },
    searchDropdown: {
      position: "absolute",
      top: "calc(100% + 6px)",
      left: 0,
      right: 0,
      zIndex: 40,
      background: "var(--card-bg)",
      border: "1px solid var(--soft-border)",
      borderRadius: 10,
      boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
      maxHeight: 260,
      overflow: "auto",
    },
    searchItem: {
      width: "100%",
      border: "none",
      borderBottom: "1px solid var(--soft-border)",
      background: "var(--card-bg)",
      padding: "10px 12px",
      textAlign: "left",
      cursor: "pointer",
    },
    searchItemName: {
      fontSize: 14,
      color: "var(--text-main)",
      fontWeight: 700,
    },
    searchItemSub: {
      marginTop: 2,
      fontSize: 12,
      color: "var(--text-muted)",
    },
    searchEmpty: {
      padding: 12,
      color: "var(--text-muted)",
      fontSize: 14,
    },
    mapBoardWrap: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      width: "100%",
    },
    mapBoard: {
      position: "relative",
      width: "min(100%, 560px)",
      maxWidth: "100%",
      margin: "0 auto",
      aspectRatio: "1 / 1",
      borderRadius: 16,
      overflow: "hidden",
      border: "1px solid var(--soft-border)",
      background: "var(--soft-bg)",
      boxSizing: "border-box",
    },
    mapImage: {
      display: "block",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      objectPosition: "center 98%",
    },
    mapPlaceholder: {
      width: "100%",
      height: "100%",
      display: "grid",
      placeItems: "center",
      color: "var(--text-muted)",
      fontSize: 14,
      padding: 12,
      textAlign: "center",
    },
    gridOverlay: {
      position: "absolute",
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gridTemplateRows: "repeat(4, 1fr)",
      userSelect: "none",
    },
    singleOverlay: {
      position: "absolute",
      display: "grid",
      gridTemplateColumns: "repeat(8, 1fr)",
      gridTemplateRows: "repeat(8, 1fr)",
      userSelect: "none",
    },
    gridCell: {
      position: "relative",
      border: "1px solid rgba(255,255,255,0.42)",
      background: "rgba(255,255,255,0.04)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: 6,
      cursor: "pointer",
      minWidth: 0,
      minHeight: 0,
      userSelect: "none",
    },
    gridCellSingle: {
      position: "relative",
      border: "1px solid rgba(255,255,255,0.36)",
      background: "rgba(255,255,255,0.03)",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "flex-start",
      padding: 2,
      cursor: "pointer",
      minWidth: 0,
      minHeight: 0,
      userSelect: "none",
    },
    gridCellDisabled: {
      cursor: "not-allowed",
    },
    gridCellActive: {
      background: "rgba(59, 130, 246, 0.55)",
    },
    gridCellPartialActive: {
      background: "rgba(59, 130, 246, 0.16)",
    },
    gridCellMiniMap: {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gridTemplateRows: "repeat(2, 1fr)",
      gap: 2,
      width: 24,
      height: 24,
      background: "rgba(255,255,255,0.18)",
      borderRadius: 6,
      padding: 2,
      flexShrink: 0,
    },
    gridCellMini: {
      borderRadius: 2,
      background: "rgba(255,255,255,0.36)",
    },
    gridCellMiniActive: {
      background: "rgba(59, 130, 246, 0.9)",
    },
    gridCellLabel: {
      alignSelf: "flex-end",
      fontSize: 12,
      fontWeight: 700,
      color: "#0f172a",
      background: "rgba(255,255,255,0.72)",
      padding: "2px 6px",
      borderRadius: 999,
      pointerEvents: "none",
    },
    gridCellLabelSingle: {
      fontSize: 10,
      fontWeight: 700,
      color: "#0f172a",
      background: "rgba(255,255,255,0.72)",
      padding: "1px 4px",
      borderRadius: 999,
      pointerEvents: "none",
    },
    focusRingColor: "var(--selected-border)",
    focusRingShadow: "rgba(148, 163, 184, 0.18)",
    placeholderColor: "var(--input-placeholder)",
  };
}