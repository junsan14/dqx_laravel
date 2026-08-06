"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createMap,
  deleteMap,
  fetchMap,
  fetchMaps,
  fetchMapOptions,
  updateMap,
} from "@/lib/maps";
import {
  fetchMapMonsterSpawns,
  saveMapMonsterSpawns,
} from "@/lib/monsterMapSpawns";
import MapListPane from "./MapListPane";
import MapEditorForm from "./MapEditorForm";
import MapMonsterSpawnsEditor from "./MapMonsterSpawnsEditor";
import { DEFAULT_LAYER_NAME_OPTIONS } from "./mapOptions";

import EditorShell from "@/components/admin/shared/editor/EditorShell";
import EditorSidebar from "@/components/admin/shared/editor/EditorSidebar";
import EditorHeader from "@/components/admin/shared/editor/EditorHeader";
import useEditorLayout from "@/components/admin/shared/editor/useEditorLayout";
import FloatingToast from "@/components/admin/shared/editor/FloatingToast";
import useFloatingToast from "@/components/admin/shared/editor/useFloatingToast";

function getLayerMetaByName(layerName) {
  const normalized = String(layerName ?? "").trim();
  const matched = DEFAULT_LAYER_NAME_OPTIONS.find(
    (option) => option.value === normalized || option.label === normalized
  );

  if (!matched) {
    return null;
  }

  const value = String(matched.value ?? "").trim();

  let floorNo = 1;

  if (
    value === "地上" ||
    value === "下層" ||
    value === "中層" ||
    value === "上層" ||
    value === "洞窟"
  ) {
    floorNo = 1;
  } else if (/^地下(\d+)階$/.test(value)) {
    floorNo = -Number(value.match(/^地下(\d+)階$/)?.[1] ?? 1);
  } else if (/^\d+$/.test(value)) {
    floorNo = Number(value);
  }

  return {
    layer_name: matched.value,
    layer_file_name: String(matched.fileName ?? "").trim(),
    floor_no: floorNo,
  };
}

function createEmptyLayer(order = 1) {
  return {
    id: null,
    map_id: null,
    layer_name: "地上",
    layer_file_name: "1",
    floor_no: 1,
    image_path: "",
    image_url: "",
    image_file: null,
    source_url: "",
    display_order: order,
  };
}

function normalizeLayer(layer, index = 0) {
  const fallback = createEmptyLayer(index + 1);
  const base = {
    ...fallback,
    ...layer,
    image_file: null,
  };

  const derived = getLayerMetaByName(base.layer_name);

  return {
    ...base,
    layer_name: derived?.layer_name ?? base.layer_name ?? "地上",
    layer_file_name:
      String(base.layer_file_name ?? "").trim() ||
      derived?.layer_file_name ||
      "ground",
    floor_no:
      base.floor_no !== null &&
      base.floor_no !== undefined &&
      String(base.floor_no) !== ""
        ? Number(base.floor_no)
        : Number(derived?.floor_no ?? 1),
    display_order: Number(base.display_order ?? index + 1),
  };
}

function createEmptyMap() {
  return {
    id: null,
    continent_id: "",
    continent: "",
    continent_folder: "",
    name: "",
    name_kana: "",
    name_en: "",
    map_type: "",
    source_url: "",
    layers: [createEmptyLayer(1)],
  };
}

function isNumericIdKeyword(value) {
  return /^\d+$/.test(String(value ?? "").trim());
}

export default function MapsClient() {
  const [keyword, setKeyword] = useState("");
  const [maps, setMaps] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [currentMap, setCurrentMap] = useState(createEmptyMap());
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingSpawns, setLoadingSpawns] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [continentOptions, setContinentOptions] = useState([]);
  const [mapTypeOptions, setMapTypeOptions] = useState([]);

  const [mapSpawns, setMapSpawns] = useState([]);
  const [initialMapSpawns, setInitialMapSpawns] = useState([]);

  const { toast, showToast } = useFloatingToast();

  const {
    isMobile,
    sidebarOpen,
    closeSidebar,
    openSidebar,
    toggleSidebar,
  } = useEditorLayout(768);

  async function loadMaps(q = "") {
    setLoadingList(true);
    setMessage("");

    try {
      const rows = await fetchMaps(q);
      const normalized = Array.isArray(rows) ? rows : [];

      setMaps(normalized);

      return normalized;
    } catch (error) {
      console.error(error);
      setMessage(error.message || "マップ一覧取得失敗");
      showToast(error.message || "マップ一覧取得失敗", "error");

      return [];
    } finally {
      setLoadingList(false);
    }
  }

  async function loadOptions() {
    try {
      const data = await fetchMapOptions();

      const nextContinents = Array.isArray(data?.continents)
        ? data.continents.map((continent) => ({
            ...continent,
            folder: String(
              continent?.map_image_folder ??
                continent?.continent_folder ??
                continent?.folder ??
                ""
            ).trim(),
          }))
        : [];

      setContinentOptions(nextContinents);
      setMapTypeOptions(Array.isArray(data?.map_types) ? data.map_types : []);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadMapSpawns(mapId) {
    if (!mapId) {
      setMapSpawns([]);
      setInitialMapSpawns([]);
      return [];
    }

    setLoadingSpawns(true);

    try {
      const rows = await fetchMapMonsterSpawns(mapId);
      const normalized = Array.isArray(rows) ? rows : [];

      setMapSpawns(normalized);
      setInitialMapSpawns(normalized);

      return normalized;
    } catch (error) {
      console.error(error);
      setMapSpawns([]);
      setInitialMapSpawns([]);
      showToast(error.message || "生息モンスター取得失敗", "error");

      return [];
    } finally {
      setLoadingSpawns(false);
    }
  }

  async function loadMapDetail(id) {
    if (!id) return;

    setLoadingDetail(true);
    setMessage("");

    try {
      const row = await fetchMap(id);

      const normalizedMap = {
        ...createEmptyMap(),
        ...row,
        continent_id:
          row?.continent_id !== null &&
          row?.continent_id !== undefined &&
          String(row.continent_id).trim() !== ""
            ? Number(row.continent_id)
            : "",
        continent_folder: row?.continent_folder ?? "",
        layers:
          Array.isArray(row?.layers) && row.layers.length > 0
            ? row.layers.map((layer, index) => normalizeLayer(layer, index))
            : [createEmptyLayer(1)],
      };

      setCurrentMap(normalizedMap);
      setSelectedId(row.id);

      await loadMapSpawns(row.id);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "マップ詳細取得失敗");
      showToast(error.message || "マップ詳細取得失敗", "error");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function runKeywordSearch(q, currentSelectedId = selectedId) {
    const trimmedKeyword = String(q ?? "").trim();

    if (!trimmedKeyword) {
      const rows = await loadMaps("");

      if (rows.length === 0) {
        setSelectedId(null);
        setCurrentMap(createEmptyMap());
        setMapSpawns([]);
        setInitialMapSpawns([]);
        return;
      }

      const stillExists = rows.some(
        (row) => Number(row.id) === Number(currentSelectedId)
      );

      if (stillExists && currentSelectedId) {
        await loadMapDetail(currentSelectedId);
      } else {
        await loadMapDetail(rows[0].id);
      }

      return;
    }

    if (isNumericIdKeyword(trimmedKeyword)) {
      setLoadingList(true);
      setMessage("");

      try {
        const row = await fetchMap(Number(trimmedKeyword));

        if (!row?.id) {
          setMaps([]);
          setSelectedId(null);
          setCurrentMap(createEmptyMap());
          setMapSpawns([]);
          setInitialMapSpawns([]);
          setMessage("その map id は見つからなかった");
          return;
        }

        setMaps([row]);
        await loadMapDetail(row.id);
      } catch (error) {
        console.error(error);
        setMaps([]);
        setSelectedId(null);
        setCurrentMap(createEmptyMap());
        setMapSpawns([]);
        setInitialMapSpawns([]);
        setMessage(error.message || "その map id は見つからなかった");
      } finally {
        setLoadingList(false);
      }

      return;
    }

    const rows = await loadMaps(trimmedKeyword);

    if (rows.length === 0) {
      setSelectedId(null);
      setCurrentMap(createEmptyMap());
      setMapSpawns([]);
      setInitialMapSpawns([]);
      setMessage("検索結果なし");
      return;
    }

    const stillExists = rows.some(
      (row) => Number(row.id) === Number(currentSelectedId)
    );

    if (stillExists && currentSelectedId) {
      await loadMapDetail(currentSelectedId);
    } else {
      await loadMapDetail(rows[0].id);
    }
  }

  useEffect(() => {
    (async () => {
      await loadOptions();

      const rows = await loadMaps("");

      if (rows.length > 0) {
        await loadMapDetail(rows[0].id);
      } else {
        setCurrentMap(createEmptyMap());
        setMapSpawns([]);
        setInitialMapSpawns([]);
      }
    })();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      runKeywordSearch(keyword);
    }, 250);

    return () => clearTimeout(timer);
  }, [keyword]);

  const selectedMapSummary = useMemo(() => {
    return maps.find((row) => Number(row.id) === Number(selectedId)) ?? null;
  }, [maps, selectedId]);

  function handleCreateNew() {
    setSelectedId(null);
    setCurrentMap(createEmptyMap());
    setMapSpawns([]);
    setInitialMapSpawns([]);
    setMessage("新規作成モード");

    if (isMobile) {
      closeSidebar();
    }
  }

  async function handleSelect(id) {
    if (!id) return;

    await loadMapDetail(id);

    if (isMobile) {
      closeSidebar();
    }
  }

  function handleChangeField(key, value) {
    setCurrentMap((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function handleAddLayer() {
    setCurrentMap((prev) => {
      const nextOrder = (prev.layers?.length ?? 0) + 1;

      return {
        ...prev,
        layers: [...(prev.layers ?? []), createEmptyLayer(nextOrder)],
      };
    });
  }

  function handleChangeLayer(index, key, value) {
    setCurrentMap((prev) => {
      const nextLayers = [...(prev.layers ?? [])];
      const target = nextLayers[index] ?? createEmptyLayer(index + 1);

      let nextLayer = {
        ...target,
        [key]:
          key === "floor_no" || key === "display_order"
            ? Number(value || 0)
            : value,
      };

      if (key === "layer_name") {
        const derived = getLayerMetaByName(value);

        if (derived) {
          nextLayer = {
            ...nextLayer,
            layer_name: derived.layer_name,
            layer_file_name: derived.layer_file_name,
            floor_no: derived.floor_no,
          };
        }
      }

      nextLayers[index] = nextLayer;

      return {
        ...prev,
        layers: nextLayers,
      };
    });
  }

  function handleRemoveLayer(index) {
    setCurrentMap((prev) => {
      const nextLayers = [...(prev.layers ?? [])].filter((_, i) => i !== index);

      return {
        ...prev,
        layers:
          nextLayers.length > 0
            ? nextLayers.map((layer, i) => ({
                ...layer,
                display_order: i + 1,
              }))
            : [createEmptyLayer(1)],
      };
    });
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");

    try {
      const payload = {
        continent_id:
          currentMap.continent_id !== null &&
          currentMap.continent_id !== undefined &&
          String(currentMap.continent_id).trim() !== ""
            ? Number(currentMap.continent_id)
            : "",
        continent_folder: currentMap.continent_folder?.trim() ?? "",
        name: currentMap.name?.trim() ?? "",
        name_kana: currentMap.name_kana?.trim() ?? "",
        name_en: currentMap.name_en?.trim() ?? "",
        map_type: currentMap.map_type?.trim() ?? "",
        source_url: currentMap.source_url?.trim() ?? "",
        layers: (currentMap.layers ?? []).map((layer, index) => {
          const derived = getLayerMetaByName(layer.layer_name);

          return {
            id: layer.id ?? null,
            layer_name: layer.layer_name?.trim() ?? derived?.layer_name ?? "地上",
            layer_file_name:
              String(layer.layer_file_name ?? "").trim() ||
              derived?.layer_file_name ||
              String(layer.floor_no ?? derived?.floor_no ?? 1),
            floor_no:
              layer.floor_no !== null &&
              layer.floor_no !== undefined &&
              String(layer.floor_no) !== ""
                ? Number(layer.floor_no)
                : Number(derived?.floor_no ?? 1),
            image_file: layer.image_file ?? null,
            source_url: layer.source_url?.trim() ?? "",
            display_order: Number(layer.display_order ?? index + 1),
          };
        }),
      };

      if (!payload.name) {
        throw new Error("マップ名は必須");
      }

      if (!payload.continent_id) {
        throw new Error("continent_id は必須");
      }

      if (!payload.continent_folder) {
        throw new Error("continent_folder は必須");
      }

      if (!payload.map_type) {
        throw new Error("map_type は必須");
      }

      const isEdit = Boolean(currentMap.id);
      const targetName = payload.name || currentMap.name || "マップ";

      let saved;

      if (isEdit) {
        saved = await updateMap(currentMap.id, payload);
        setMessage("更新した");
      } else {
        saved = await createMap(payload);
        setMessage("作成した");
      }

      const savedMapId = saved?.id ?? currentMap.id ?? null;

      if (!savedMapId) {
        throw new Error("マップ保存後のID取得に失敗");
      }

      if (Array.isArray(mapSpawns) && mapSpawns.length > 0) {
        await saveMapMonsterSpawns(savedMapId, mapSpawns, initialMapSpawns);
      } else if (
        Array.isArray(initialMapSpawns) &&
        initialMapSpawns.length > 0
      ) {
        await saveMapMonsterSpawns(savedMapId, [], initialMapSpawns);
      }

      showToast(
        isEdit
          ? `「${targetName}」を更新した`
          : `「${targetName}」を作成した`
      );

      await loadOptions();

      const rows = await loadMaps(keyword);
      const nextId = savedMapId ?? rows?.[0]?.id ?? null;

      if (nextId) {
        await loadMapDetail(nextId);
      }
    } catch (error) {
      console.error(error);
      setMessage(error.message || "保存失敗");
      showToast(error.message || "保存失敗", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!currentMap?.id) {
      setCurrentMap(createEmptyMap());
      setSelectedId(null);
      setMapSpawns([]);
      setInitialMapSpawns([]);
      setMessage("未保存データを破棄した");
      showToast("未保存データを破棄した");
      return;
    }

    const targetName = currentMap.name || "このマップ";
    const ok = window.confirm(`「${targetName}」を削除する?`);

    if (!ok) return;

    setSaving(true);
    setMessage("");

    try {
      await deleteMap(currentMap.id);

      setMessage("削除した");
      showToast(`「${targetName}」を削除した`);

      await loadOptions();

      const rows = await loadMaps(keyword);

      if (rows.length > 0) {
        await loadMapDetail(rows[0].id);
      } else {
        setSelectedId(null);
        setCurrentMap(createEmptyMap());
        setMapSpawns([]);
        setInitialMapSpawns([]);
      }

      if (isMobile) {
        openSidebar();
      }
    } catch (error) {
      console.error(error);
      setMessage(error.message || "削除失敗");
      showToast(error.message || "削除失敗", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <EditorShell
        isMobile={isMobile}
        sidebar={
          <EditorSidebar
            isMobile={isMobile}
            isOpen={sidebarOpen}
            onToggle={toggleSidebar}
            keyword={keyword}
            onKeywordChange={setKeyword}
            onCreateNew={handleCreateNew}
            createLabel="新規追加"
            loading={loadingList}
            title="マップ編集"
            searchPlaceholder="マップ名・かな / マップID で検索"
          >
            <MapListPane
              maps={maps}
              loading={loadingList}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          </EditorSidebar>
        }
      >
        <EditorHeader
          isMobile={isMobile}
          title={
            currentMap?.id
              ? `${selectedMapSummary?.name || currentMap.name}を編集中`
              : "新規マップ作成"
          }
          description={message}
          onSave={handleSave}
          onDelete={handleDelete}
          saving={saving}
          saveDisabled={saving || loadingDetail || loadingSpawns}
          deleteDisabled={saving}
          deleteTitle=""
        />

        <MapEditorForm
          value={currentMap}
          loading={loadingDetail}
          continentOptions={continentOptions}
          mapTypeOptions={mapTypeOptions}
          layerNameOptions={DEFAULT_LAYER_NAME_OPTIONS}
          onChangeField={handleChangeField}
          onAddLayer={handleAddLayer}
          onChangeLayer={handleChangeLayer}
          onRemoveLayer={handleRemoveLayer}
          isMobile={isMobile}
          afterLayerContent={
            <MapMonsterSpawnsEditor
              map={currentMap}
              spawns={mapSpawns}
              loading={loadingDetail || loadingSpawns}
              onChange={setMapSpawns}
            />
          }
        />
      </EditorShell>

      <FloatingToast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        isMobile={isMobile}
      />
    </>
  );
}