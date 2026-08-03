"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeMapRow } from "@/lib/monsterMapSpawns";
import Image from "next/image";

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

function getMapGridInset(mapName = "") {
  const key = String(mapName ?? "").trim();

  const presets = {
    // "アグラニの街": { top: "10%", right: "2%", bottom: "2%", left: "10%" },
  };

  return presets[key] ?? DEFAULT_MAP_GRID_INSET;
}

function makeSpawn() {
  return {
    id: null,
    __key: `new-spawn-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    monster_id: null,
    map_id: "",
    map_layer_id: "",
    map_name: "",
    map_layer_name: "",
    map_image_url: "",
    area: "[]",
    coords: [],
    spawn_time: "normal",
    spawn_count: "",
    symbol_count: "",
    imported_note: "",
    note: "",
    is_hunting_ground: false,
    grid_mode: "single",
  };
}

function stringifyCoords(coords = []) {
  return JSON.stringify(coords);
}

function uniqCoords(coords = []) {
  return [
    ...new Set(
      (coords ?? []).map((value) => String(value ?? "").trim()).filter(Boolean)
    ),
  ];
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

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= 768;
}

function SpawnMapGrid({
  mapImageUrl = "",
  mapName = "",
  coords = [],
  onApplyCoords,
  gridMode = "single",
  disabled = false,
  styles,
}) {
  const activeSet = useMemo(() => new Set(uniqCoords(coords)), [coords]);
  const isMobile = isMobileViewport();
  const inset = getMapGridInset(mapName);

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
      <div className="monster-spawns-map-board" style={styles.mapBoard}>
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
                    <span
                      style={{
                        ...styles.gridCellLabelSingle,
                        ...(isMobile ? styles.gridCellLabelSingleMobile : {}),
                      }}
                    >
                      {label}
                    </span>
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

                    <span
                      style={{
                        ...styles.gridCellLabel,
                        ...(isMobile ? styles.gridCellLabelMobile : {}),
                      }}
                    >
                      {label}
                    </span>
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

function normalizeLayerDisplayName(name = "") {
  return String(name ?? "").trim();
}

function getDisplayLayerNamesForMap(map = null) {
  const layers = Array.isArray(map?.layers) ? map.layers : [];

  const uniqueNames = [
    ...new Set(
      layers
        .map((layer, index) => getLayerLabel(layer, index))
        .map(normalizeLayerDisplayName)
        .filter(Boolean)
    ),
  ];

  if (uniqueNames.length === 0) return [];
  if (uniqueNames.length === 1 && uniqueNames[0] === "地上") return [];

  return uniqueNames;
}

function shouldHideLayerSelect(map = null) {
  const layers = Array.isArray(map?.layers) ? map.layers : [];
  if (layers.length === 0) return true;

  const displayNames = getDisplayLayerNamesForMap(map);
  return displayNames.length === 0;
}

function getDefaultLayerForMap(map = null) {
  const layers = Array.isArray(map?.layers) ? map.layers : [];
  if (layers.length === 0) return null;
  return layers[0] ?? null;
}

function getSpawnTabLabel(spawn, index) {
  const mapName = String(spawn?.map_name ?? "").trim();
  if (mapName) return mapName;
  return `生息地${index + 1}`;
}

function MapSearchInput({
  maps = [],
  selectedContinent = "",
  selectedMap = null,
  onSelect,
  disabled = false,
  styles,
}) {
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

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
    setKeyword("");
    setOpen(false);
  }, [selectedContinent]);

  useEffect(() => {
    if (selectedMap?.name) {
      setKeyword(selectedMap.name);
    } else {
      setKeyword("");
    }
  }, [selectedMap]);

  const continentMaps = useMemo(() => {
    const list = Array.isArray(maps) ? maps : [];
    if (!selectedContinent) return [];
    return list.filter(
      (map) => String(map?.continent ?? "") === String(selectedContinent)
    );
  }, [maps, selectedContinent]);

  const filteredMaps = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return continentMaps
      .filter((map) => {
        if (String(map?.map_type ?? "") === "town") return false;

        const name = String(map?.name ?? "").toLowerCase();
        if (!q) return true;

        return name.includes(q);
      })
      .slice(0, 30);
  }, [continentMaps, keyword]);

  return (
    <div ref={wrapRef} style={styles.mapSearchWrap}>
      <input
        type="text"
        value={keyword}
        placeholder={
          selectedContinent ? "その大陸の地名を入力" : "先に大陸を選択"
        }
        onChange={(e) => {
          if (!selectedContinent || disabled) return;
          setKeyword(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (selectedContinent && !disabled) setOpen(true);
        }}
        style={{
          ...styles.input,
          ...(!selectedContinent || disabled ? styles.inputDisabled : {}),
        }}
        disabled={!selectedContinent || disabled}
        className="monster-spawns-input"
      />

      {open && selectedContinent && !disabled ? (
        <div style={styles.mapSearchDropdown}>
          {filteredMaps.length > 0 ? (
            filteredMaps.map((map) => (
              <button
                key={map.id}
                type="button"
                onClick={() => {
                  onSelect(map);
                  setKeyword(map.name ?? "");
                  setOpen(false);
                }}
                style={styles.mapSearchItem}
                className="monster-spawns-search-item"
              >
                <div style={styles.mapSearchItemName}>{map.name}</div>
              </button>
            ))
          ) : (
            <div style={styles.mapSearchEmpty}>見つからない</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SpawnCard({
  spawn,
  maps,
  onChange,
  onRemove,
  layerNamesForMap = [],
  isReincarnated = false,
  styles,
}) {
  const selectedMap = useMemo(() => {
    return maps.find((row) => Number(row.id) === Number(spawn?.map_id)) ?? null;
  }, [maps, spawn?.map_id]);

  const [selectedContinent, setSelectedContinent] = useState(
    selectedMap?.continent ?? ""
  );

  useEffect(() => {
    if (selectedMap?.continent) {
      setSelectedContinent(selectedMap.continent);
    }
  }, [selectedMap?.continent]);

  const continentOptions = useMemo(() => {
    const values = [
      ...new Set(
        (maps ?? [])
          .map((map) => String(map?.continent ?? "").trim())
          .filter(Boolean)
      ),
    ];

    return values.sort((a, b) => a.localeCompare(b, "ja"));
  }, [maps]);

  const selectedLayer = useMemo(() => {
    const layers = selectedMap?.layers ?? [];
    if (!layers.length) return null;

    if (spawn?.map_layer_id) {
      const matched =
        layers.find((row) => Number(row.id) === Number(spawn.map_layer_id)) ??
        null;
      if (matched) return matched;
    }

    return getDefaultLayerForMap(selectedMap);
  }, [selectedMap, spawn?.map_layer_id]);

  const hideLayerSelect = useMemo(
    () => shouldHideLayerSelect(selectedMap),
    [selectedMap]
  );

  useEffect(() => {
    if (!selectedMap) return;

    const nextName = selectedMap.name ?? "";
    const nextLayerId = selectedLayer?.id ?? "";
    const nextLayerName = selectedLayer ? getLayerLabel(selectedLayer) : "";
    const nextImage =
      selectedLayer?.image_url ??
      selectedMap?.image_url ??
      spawn?.map_image_url ??
      "";

    if (
      nextName !== (spawn?.map_name ?? "") ||
      String(nextLayerId ?? "") !== String(spawn?.map_layer_id ?? "") ||
      nextLayerName !== (spawn?.map_layer_name ?? "") ||
      nextImage !== (spawn?.map_image_url ?? "")
    ) {
      onChange({
        ...spawn,
        map_name: nextName,
        map_layer_id: nextLayerId || "",
        map_layer_name: nextLayerName,
        map_image_url: nextImage,
      });
    }
  }, [selectedMap, selectedLayer, spawn, onChange]);

  function setField(key, value) {
    if (isReincarnated) return;

    onChange({
      ...spawn,
      [key]: value,
    });
  }

  function handleApplyCoords(targetCoords, mode = "add") {
    if (isReincarnated) return;

    const nextCoords = applyCoordSet(spawn?.coords ?? [], targetCoords, mode);

    onChange({
      ...spawn,
      coords: nextCoords,
      area: stringifyCoords(nextCoords),
    });
  }

  function setGridMode(nextMode) {
    if (isReincarnated) return;

    onChange({
      ...spawn,
      grid_mode: nextMode,
    });
  }

  function handleChangeContinent(nextContinent) {
    if (isReincarnated) return;

    setSelectedContinent(nextContinent);

    const currentMapContinent = selectedMap?.continent ?? "";

    if (!nextContinent) {
      onChange({
        ...spawn,
        map_id: "",
        map_name: "",
        map_layer_id: "",
        map_layer_name: "",
        map_image_url: "",
      });
      return;
    }

    if (currentMapContinent && currentMapContinent !== nextContinent) {
      onChange({
        ...spawn,
        map_id: "",
        map_name: "",
        map_layer_id: "",
        map_layer_name: "",
        map_image_url: "",
      });
    }
  }

  return (
    <div className="monster-spawns-card" style={styles.spawnCard}>
      <div style={styles.spawnCardHeader}>
        <div style={styles.spawnHeaderMain}>
          <h3 style={styles.spawnTitle}>{spawn?.map_name || "生息地"}</h3>

          {layerNamesForMap.length > 0 ? (
            <div style={styles.layerListWrap}>
              {layerNamesForMap.map((name) => (
                <span key={name} style={styles.layerBadge}>
                  {name}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <label
          style={{
            ...styles.checkboxRow,
            ...(isReincarnated ? styles.disabledRow : {}),
          }}
        >
          <input
            type="checkbox"
            checked={Boolean(spawn?.is_hunting_ground)}
            onChange={(e) => setField("is_hunting_ground", e.target.checked)}
            style={styles.checkbox}
            disabled={isReincarnated}
          />
          <span style={styles.checkboxLabel}>狩場</span>
        </label>

        <button
          type="button"
          onClick={onRemove}
          style={{
            ...styles.removeButton,
            ...(isReincarnated ? styles.buttonDisabled : {}),
          }}
          disabled={isReincarnated}
          title={isReincarnated ? "転生モンスターは編集できない" : "削除"}
        >
          削除
        </button>
      </div>

      <div className="monster-spawns-form-grid" style={styles.formGrid}>
        <label style={styles.field}>
          <span style={styles.label}>大陸</span>
          <select
            value={selectedContinent}
            onChange={(e) => handleChangeContinent(e.target.value)}
            style={{
              ...styles.input,
              ...(isReincarnated ? styles.inputDisabled : {}),
            }}
            className="monster-spawns-input"
            disabled={isReincarnated}
          >
            <option value="">選択してください</option>
            {continentOptions.map((continent) => (
              <option key={continent} value={continent}>
                {continent}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.field}>
          <span style={styles.label}>地名</span>

          <MapSearchInput
            maps={maps}
            selectedContinent={selectedContinent}
            selectedMap={selectedMap}
            onSelect={(nextMap) => {
              if (isReincarnated) return;

              const firstLayer = getDefaultLayerForMap(nextMap);

              onChange({
                ...spawn,
                map_id: nextMap?.id ?? "",
                map_name: nextMap?.name ?? "",
                map_layer_id: firstLayer?.id ?? "",
                map_layer_name: firstLayer ? getLayerLabel(firstLayer, 0) : "",
                map_image_url:
                  firstLayer?.image_url ?? nextMap?.image_url ?? "",
              });
            }}
            disabled={isReincarnated}
            styles={styles}
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>階層</span>
          <select
            value={spawn?.map_layer_id ?? ""}
            onChange={(e) => {
              if (isReincarnated) return;

              const nextLayerId = e.target.value;
              const nextLayer =
                selectedMap?.layers?.find(
                  (row) => String(row.id) === String(nextLayerId)
                ) ?? null;

              onChange({
                ...spawn,
                map_layer_id: nextLayerId ? Number(nextLayerId) : "",
                map_layer_name: nextLayer ? getLayerLabel(nextLayer) : "",
                map_image_url:
                  nextLayer?.image_url ?? selectedMap?.image_url ?? "",
              });
            }}
            style={{
              ...styles.input,
              ...(hideLayerSelect || isReincarnated ? styles.inputDisabled : {}),
            }}
            disabled={
              isReincarnated ||
              !selectedMap ||
              !(selectedMap?.layers?.length > 0) ||
              hideLayerSelect
            }
            className="monster-spawns-input"
          >
            {!selectedMap ? (
              <option value="">先に地名を選択</option>
            ) : hideLayerSelect ? (
              <option value="">階層なし</option>
            ) : (
              (selectedMap.layers ?? []).map((layer, index) => (
                <option key={layer.id} value={layer.id}>
                  {getLayerLabel(layer, index)}
                </option>
              ))
            )}
          </select>
        </label>

        <label style={styles.field}>
          <span style={styles.label}>出現時間</span>
          <select
            value={spawn?.spawn_time ?? "normal"}
            onChange={(e) => setField("spawn_time", e.target.value)}
            style={{
              ...styles.input,
              ...(isReincarnated ? styles.inputDisabled : {}),
            }}
            className="monster-spawns-input"
            disabled={isReincarnated}
          >
            {SPAWN_TIME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="monster-spawns-area-row" style={styles.areaRow}>
        <label style={styles.field}>
          <span style={styles.label}>生息エリア</span>
          <textarea
            value={JSON.stringify(spawn?.coords ?? [])}
            readOnly
            style={styles.textareaReadonly}
            rows={1}
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>出現数</span>
          <input
            type="text"
            value={spawn?.spawn_count ?? ""}
            onChange={(e) => setField("spawn_count", e.target.value)}
            style={{
              ...styles.input,
              ...(isReincarnated ? styles.inputDisabled : {}),
            }}
            placeholder="1 / 1〜2 / 2-3"
            className="monster-spawns-input"
            disabled={isReincarnated}
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>シンボル数</span>
          <input
            type="text"
            value={spawn?.symbol_count ?? ""}
            onChange={(e) => setField("symbol_count", e.target.value)}
            style={{
              ...styles.input,
              ...(isReincarnated ? styles.inputDisabled : {}),
            }}
            placeholder="1 / 2 / 多数"
            className="monster-spawns-input"
            disabled={isReincarnated}
          />
        </label>
      </div>

      <div className="monster-spawns-note-grid" style={styles.noteGrid}>
        <label style={styles.field}>
          <span style={styles.label}>既存メモ</span>
          <textarea
            value={spawn?.imported_note ?? ""}
            readOnly
            style={styles.textareaReadonlyLarge}
            rows={4}
          />
        </label>

        <label style={styles.field}>
          <span style={styles.label}>表示メモ</span>
          <textarea
            value={spawn?.note ?? ""}
            onChange={(e) => setField("note", e.target.value)}
            style={{
              ...styles.textarea,
              ...(isReincarnated ? styles.inputDisabled : {}),
            }}
            rows={4}
            className="monster-spawns-textarea"
            placeholder="表示用メモを入力"
            disabled={isReincarnated}
          />
        </label>
      </div>

      <div style={styles.modeRow}>
        <span style={styles.modeLabel}>選択モード</span>

        <div style={styles.modeButtons}>
          <button
            type="button"
            onClick={() => setGridMode("block")}
            disabled={isReincarnated}
            style={{
              ...styles.modeButton,
              ...(spawn?.grid_mode !== "single" ? styles.modeButtonActive : {}),
              ...(isReincarnated ? styles.buttonDisabled : {}),
            }}
            className="monster-spawns-chip-button"
          >
            4マス
          </button>

          <button
            type="button"
            onClick={() => setGridMode("single")}
            disabled={isReincarnated}
            style={{
              ...styles.modeButton,
              ...(spawn?.grid_mode === "single" ? styles.modeButtonActive : {}),
              ...(isReincarnated ? styles.buttonDisabled : {}),
            }}
            className="monster-spawns-chip-button"
          >
            1マス
          </button>
        </div>
      </div>

      <SpawnMapGrid
        mapImageUrl={spawn?.map_image_url ?? ""}
        mapName={spawn?.map_name ?? ""}
        coords={spawn?.coords ?? []}
        onApplyCoords={handleApplyCoords}
        gridMode={spawn?.grid_mode ?? "single"}
        disabled={isReincarnated}
        styles={styles}
      />
    </div>
  );
}

export default function MonsterSpawnsEditor({
  spawns = [],
  maps = [],
  is_reincarnated = false,
  onChange,
}) {
  const styles = useMemo(() => getComponentStyles(), []);
  const mapOptions = useMemo(
    () => (Array.isArray(maps) ? maps.map(normalizeMapRow) : []),
    [maps]
  );
  const [activeIndex, setActiveIndex] = useState(0);

  const displayLayerNamesByMapId = useMemo(() => {
    const grouped = new Map();

    for (const map of mapOptions) {
      const mapId = String(map?.id ?? "").trim();
      if (!mapId) continue;

      grouped.set(mapId, getDisplayLayerNamesForMap(map));
    }

    return grouped;
  }, [mapOptions]);

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
    if (is_reincarnated) return;
    onChange(nextSpawns);
  }

  function addSpawn() {
    if (is_reincarnated) return;

    const next = [...(spawns ?? []), makeSpawn()];
    setNextSpawns(next);
    setActiveIndex(next.length - 1);
  }

  function updateSpawn(spawnKey, nextSpawn) {
    if (is_reincarnated) return;

    setNextSpawns(
      (spawns ?? []).map((spawn) =>
        spawn.__key === spawnKey ? nextSpawn : spawn
      )
    );
  }

  function removeSpawn(spawnKey) {
    if (is_reincarnated) return;

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
        * {
          box-sizing: border-box;
        }

        .monster-spawns-input::placeholder,
        .monster-spawns-textarea::placeholder {
          color: ${styles.placeholderColor};
          opacity: 1;
        }

        .monster-spawns-input,
        .monster-spawns-textarea,
        .monster-spawns-search-item,
        .monster-spawns-chip-button,
        .monster-spawns-tab {
          transition:
            background-color 0.18s ease,
            border-color 0.18s ease,
            color 0.18s ease,
            box-shadow 0.18s ease,
            opacity 0.18s ease;
        }

        .monster-spawns-input:focus,
        .monster-spawns-textarea:focus {
          outline: none;
          border-color: ${styles.focusRingColor};
          box-shadow: 0 0 0 3px ${styles.focusRingShadow};
        }

        .monster-spawns-search-item:hover {
          background: ${styles.mapSearchItemHover.background} !important;
        }

        .monster-spawns-chip-button:hover:not(:disabled) {
          background: ${styles.modeButtonHover.background} !important;
          color: ${styles.modeButtonHover.color} !important;
        }

        .monster-spawns-tab:hover {
          background: ${styles.tabHover.background} !important;
          color: ${styles.tabHover.color} !important;
          border-color: ${styles.tabHover.borderColor} !important;
        }

        @media (max-width: 768px) {
          .monster-spawns-card {
            padding: 14px !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }

          .monster-spawns-form-grid {
            grid-template-columns: 1fr !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }

          .monster-spawns-area-row {
            grid-template-columns: 1fr !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }

          .monster-spawns-note-grid {
            grid-template-columns: 1fr !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
          }

          .monster-spawns-map-board {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            border-radius: 12px !important;
          }

          .monster-spawns-tabs {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: thin;
          }
        }

        @media (max-width: 640px) {
          .monster-spawns-map-board {
            aspect-ratio: 1 / 1 !important;
          }
        }
      `}</style>

      <section style={styles.wrapper}>
        <div style={styles.header}>
          <div style={styles.headerTextBlock}>
            <h2 style={styles.title}>生息地編集</h2>
            <p style={styles.desc}>
              {is_reincarnated
                ? "転生モンスターは転生元の生息地情報を使うため編集できない"
                : "先に大陸を選んでから地名を検索する"}
            </p>
          </div>

          <button
            type="button"
            onClick={addSpawn}
            style={{
              ...styles.addButton,
              ...(is_reincarnated ? styles.buttonDisabled : {}),
            }}
            disabled={is_reincarnated}
            title={
              is_reincarnated
                ? "転生モンスターは編集できない"
                : "生息地を追加"
            }
          >
            生息地を追加
          </button>
        </div>

        {spawns.length > 0 ? (
          <div className="monster-spawns-tabs" style={styles.tabWrap}>
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
                  title={getSpawnTabLabel(spawn, index)}
                  className="monster-spawns-tab"
                >
                  {getSpawnTabLabel(spawn, index)}
                </button>
              );
            })}
          </div>
        ) : null}

        {spawns.length === 0 ? (
          <div style={styles.empty}>生息地は未登録</div>
        ) : (
          <div style={styles.list}>
            {activeSpawn ? (
              <SpawnCard
                key={activeSpawn.__key}
                spawn={activeSpawn}
                maps={mapOptions}
                layerNamesForMap={
                  displayLayerNamesByMapId.get(
                    String(activeSpawn?.map_id ?? "")
                  ) ?? []
                }
                onChange={(nextSpawn) =>
                  updateSpawn(activeSpawn.__key, nextSpawn)
                }
                onRemove={() => removeSpawn(activeSpawn.__key)}
                isReincarnated={Boolean(is_reincarnated)}
                styles={styles}
              />
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}

const baseStyles = {
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
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  headerTextBlock: {
    minWidth: 0,
    maxWidth: "100%",
    flex: 1,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: "var(--text-title)",
    wordBreak: "break-word",
  },
  desc: {
    margin: "4px 0 0",
    color: "var(--text-muted)",
    fontSize: 13,
    wordBreak: "break-word",
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
    flexShrink: 0,
    maxWidth: "100%",
  },
  buttonDisabled: {
    opacity: 0.55,
    cursor: "not-allowed",
    pointerEvents: "auto",
  },
  disabledRow: {
    opacity: 0.7,
    cursor: "not-allowed",
  },
  tabWrap: {
    display: "flex",
    gap: 8,
    overflowX: "visible",
    overflowY: "visible",
    flexWrap: "wrap",
    paddingBottom: 4,
    marginTop: -2,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },
  tab: {
    flex: "0 1 auto",
    maxWidth: "100%",
    border: "1px solid var(--soft-border)",
    background: "var(--soft-bg)",
    color: "var(--text-muted)",
    borderRadius: 999,
    padding: "8px 12px",
    cursor: "pointer",
    whiteSpace: "normal",
    overflow: "visible",
    textOverflow: "clip",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.4,
    minHeight: 38,
    boxSizing: "border-box",
    wordBreak: "break-word",
  },
  tabHover: {
    background: "var(--card-bg)",
    color: "var(--text-main)",
    borderColor: "var(--soft-border)",
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
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  spawnCard: {
    border: "1px solid var(--card-border)",
    borderRadius: 14,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    background: "var(--card-bg)",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    overflowX: "hidden",
  },
  spawnCardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  spawnHeaderMain: {
    minWidth: 0,
    maxWidth: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    flex: 1,
  },
  spawnTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 800,
    color: "var(--text-title)",
    wordBreak: "break-word",
  },
  layerListWrap: {
    marginTop: 2,
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    minWidth: 0,
  },
  layerBadge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 24,
    padding: "4px 8px",
    borderRadius: 999,
    background: "var(--soft-bg)",
    color: "var(--text-sub)",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.2,
    maxWidth: "100%",
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
    flexShrink: 0,
    maxWidth: "100%",
  },
  modeRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
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
    minWidth: 0,
    maxWidth: "100%",
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
    maxWidth: "100%",
  },
  modeButtonHover: {
    background: "var(--soft-bg)",
    color: "var(--text-main)",
  },
  modeButtonActive: {
    borderColor: "var(--selected-border)",
    background: "var(--selected-bg)",
    color: "var(--selected-text)",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  areaRow: {
    display: "grid",
    gridTemplateColumns:
      "minmax(0, 1fr) minmax(220px, 220px) minmax(220px, 220px)",
    gap: 12,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    alignItems: "end",
  },
  noteGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
    maxWidth: "100%",
    width: "100%",
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-muted)",
    wordBreak: "break-word",
  },
  input: {
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
    minHeight: 42,
    borderRadius: 10,
    border: "1px solid var(--input-border)",
    padding: "0 12px",
    background: "var(--input-bg)",
    color: "var(--input-text)",
    outline: "none",
    boxSizing: "border-box",
  },
  inputDisabled: {
    background: "var(--input-disabled-bg)",
    color: "var(--text-muted)",
    cursor: "not-allowed",
  },
  textarea: {
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
    borderRadius: 10,
    border: "1px solid var(--input-border)",
    padding: 12,
    background: "var(--input-bg)",
    color: "var(--input-text)",
    outline: "none",
    resize: "vertical",
    minHeight: 84,
    boxSizing: "border-box",
  },
  textareaReadonly: {
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
    borderRadius: 10,
    border: "1px solid var(--soft-border)",
    padding: "10px 12px",
    background: "var(--soft-bg)",
    color: "var(--text-sub)",
    outline: "none",
    resize: "none",
    minHeight: 42,
    height: 42,
    lineHeight: "20px",
    overflow: "hidden",
    boxSizing: "border-box",
  },
  textareaReadonlyLarge: {
    width: "100%",
    minWidth: 0,
    maxWidth: "100%",
    borderRadius: 10,
    border: "1px solid var(--soft-border)",
    padding: 12,
    background: "var(--soft-bg)",
    color: "var(--text-sub)",
    outline: "none",
    resize: "vertical",
    minHeight: 96,
    boxSizing: "border-box",
  },
  checkboxRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    width: "fit-content",
    maxWidth: "100%",
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
    wordBreak: "break-word",
  },
  mapBoardWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  mapBoard: {
    position: "relative",
    width: "min(100%, 560px)",
    maxWidth: "100%",
    minWidth: 0,
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
    maxWidth: "100%",
    boxSizing: "border-box",
    pointerEvents: "none",
  },
  gridCellLabelMobile: {
    fontSize: 11,
    padding: "1px 5px",
  },
  gridCellLabelSingle: {
    fontSize: 10,
    fontWeight: 700,
    color: "#0f172a",
    background: "rgba(255,255,255,0.72)",
    padding: "1px 4px",
    borderRadius: 999,
    maxWidth: "100%",
    boxSizing: "border-box",
    pointerEvents: "none",
  },
  gridCellLabelSingleMobile: {
    fontSize: 9,
    padding: "1px 3px",
  },
  mapSearchWrap: {
    position: "relative",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  mapSearchDropdown: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    zIndex: 30,
    background: "var(--card-bg)",
    border: "1px solid var(--soft-border)",
    borderRadius: 10,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
    maxHeight: 240,
    overflow: "auto",
    width: "100%",
    boxSizing: "border-box",
  },
  mapSearchItem: {
    width: "100%",
    border: "none",
    borderBottom: "1px solid var(--soft-border)",
    background: "var(--card-bg)",
    padding: "10px 12px",
    textAlign: "left",
    cursor: "pointer",
    boxSizing: "border-box",
  },
  mapSearchItemHover: {
    background: "var(--soft-bg)",
  },
  mapSearchItemName: {
    fontSize: 14,
    color: "var(--text-main)",
    wordBreak: "break-word",
  },
  mapSearchEmpty: {
    padding: 12,
    color: "var(--text-muted)",
    fontSize: 14,
  },
  focusRingColor: "var(--selected-border)",
  focusRingShadow: "rgba(148, 163, 184, 0.18)",
  placeholderColor: "var(--input-placeholder)",
};

function getComponentStyles() {
  return baseStyles;
}