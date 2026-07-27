function makeSpawnKey(spawn, index) {
  if (spawn?.id) return `spawn-${spawn.id}`;
  return `new-spawn-${index}-${Date.now()}-${Math.random()}`;
}

export function parseAreaToCoords(area) {
  if (Array.isArray(area)) {
    return area
      .map((value) => String(value ?? "").trim().toUpperCase())
      .filter(Boolean);
  }

  if (typeof area === "string") {
    const trimmed = area.trim();

    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((value) => String(value ?? "").trim().toUpperCase())
          .filter(Boolean);
      }
    } catch (_error) {
      // noop
    }

    return trimmed
      .split(/[,\s、]+/)
      .map((value) => String(value ?? "").trim().toUpperCase())
      .filter(Boolean);
  }

  return [];
}

export function stringifyCoords(coords) {
  return JSON.stringify(
    Array.isArray(coords)
      ? coords
          .map((value) => String(value ?? "").trim().toUpperCase())
          .filter(Boolean)
      : []
  );
}

export function emptyMonster() {
  return {
    id: null,
    display_order: 0,
    name: "",
    name_kana: "",
    name_en: "",
    system_type: "",
    system_type_en: "",
    source_url: "",
    trivia_1: "",
    trivia_2: "",
    is_reincarnated: false,
    reincarnation_parent_id: null,
    reincarnation_parent_name: null,
    drops: [],
    spawns: [],
    image_path: "",
    image_file: null,
    image_preview_url: "",
    remove_image: false,
    crop_top: 0,
    crop_left: 0,
    crop_right: 0,
    crop_bottom: 0,
  };
}

export function normalizeMonster(row = {}) {
  const rawDrops = Array.isArray(row?.drops) ? row.drops : [];
  const rawSpawns = Array.isArray(row?.spawns) ? row.spawns : [];

  return {
    id: row?.id ?? null,
    display_order: row?.display_order ?? 0,
    name: row?.name ?? "",
    name_kana: row?.name_kana ?? row?.nameKana ?? "",
    name_en: row?.name_en ?? row?.nameEn ?? "",
    system_type: row?.system_type ?? "",
    system_type_en: row?.system_type_en ?? row?.systemTypeEn ?? "",
    source_url: row?.source_url ?? "",
    trivia_1: row?.trivia_1 ?? "",
    trivia_2: row?.trivia_2 ?? "",
    image_path: row?.image_path ?? "",
    image_file: null,
    image_preview_url: "",
    remove_image: false,
    crop_top: Number(row?.crop_top ?? 0),
    crop_left: Number(row?.crop_left ?? 0),
    crop_right: Number(row?.crop_right ?? 0),
    crop_bottom: Number(row?.crop_bottom ?? 0),
    is_reincarnated: Boolean(
      row?.is_reincarnated || row?.reincarnation_parent_id
    ),
    reincarnation_parent_id: row?.reincarnation_parent_id ?? null,
    reincarnation_parent_name: row?.reincarnation_parent_name ?? null,
    drops: rawDrops.map((drop, index) => ({
      id: drop?.id ?? null,
      __key: drop?.id
        ? `drop-${drop.id}`
        : `new-drop-${index}-${Date.now()}-${Math.random()}`,
      drop_target_type: drop?.drop_target_type ?? "item",
      drop_target_id: drop?.drop_target_id ?? null,
      drop_type: drop?.drop_type ?? "normal",
      sort_order: drop?.sort_order ?? index + 1,
      target_name:
        drop?.target_name ??
        drop?.target?.name ??
        drop?.item_name ??
        "",
    })),
    spawns: rawSpawns.map((spawn, index) => {
      const coords = parseAreaToCoords(spawn?.area);

      return {
        id: spawn?.id ?? null,
        __key: makeSpawnKey(spawn, index),
        monster_id: spawn?.monster_id ?? row?.id ?? null,
        map_id: spawn?.map_id ?? spawn?.map?.id ?? null,
        map_layer_id: spawn?.map_layer_id ?? spawn?.map_layer?.id ?? null,
        map_name: spawn?.map?.name ?? spawn?.map_name ?? "",
        map_layer_name:
          spawn?.map_layer_name ??
          spawn?.layer_name ??
          spawn?.map_layer?.layer_name ??
          "",
        map_image_url:
          spawn?.map_layer?.image_url ??
          spawn?.map_layer?.image_path ??
          spawn?.map?.image_url ??
          spawn?.map?.image_path ??
          spawn?.map_image_url ??
          spawn?.image_url ??
          spawn?.image_path ??
          "",
        area:
          typeof spawn?.area === "string"
            ? spawn.area
            : stringifyCoords(coords),
        coords,
        spawn_time: spawn?.spawn_time ?? "normal",
        spawn_count: spawn?.spawn_count ?? "",
        symbol_count: spawn?.symbol_count ?? "",
        imported_note: spawn?.imported_note ?? "",
        note: spawn?.note ?? "",
        is_hunting_ground: Boolean(spawn?.is_hunting_ground ?? false),
        grid_mode: spawn?.grid_mode ?? "block",
      };
    }),
  };
}

export function buildMonsterPayload(monster = {}) {
  return {
    display_order: Number(monster?.display_order ?? 0),
    name: String(monster?.name ?? "").trim(),
    name_kana: String(
      monster?.name_kana ?? monster?.nameKana ?? ""
    ).trim(),
    name_en: String(monster?.name_en ?? "").trim(),
    system_type: String(monster?.system_type ?? "").trim(),
    system_type_en: String(monster?.system_type_en ?? "").trim(),
    source_url: String(monster?.source_url ?? "").trim(),
    trivia_1: String(monster?.trivia_1 ?? "").trim(),
    trivia_2: String(monster?.trivia_2 ?? "").trim(),
    reincarnation_parent_id:
      Number(monster?.reincarnation_parent_id ?? 0) || null,

    remove_image: Boolean(monster?.remove_image),
    image_path: String(monster?.image_path ?? "").trim(),
    image_file: monster?.image_file ?? null,
    crop_top: Number(monster?.crop_top ?? 0),
    crop_left: Number(monster?.crop_left ?? 0),
    crop_right: Number(monster?.crop_right ?? 0),
    crop_bottom: Number(monster?.crop_bottom ?? 0),

    drops: Array.isArray(monster?.drops)
      ? monster.drops.map((drop, index) => ({
          id: drop?.id ?? null,
          drop_target_type: String(drop?.drop_target_type ?? "item"),
          drop_target_id: Number(drop?.drop_target_id ?? 0) || null,
          drop_type: String(drop?.drop_type ?? "normal"),
          sort_order: Number(drop?.sort_order ?? index + 1),
        }))
      : [],

    spawns: Array.isArray(monster?.spawns)
      ? monster.spawns.map((spawn) => ({
          id: spawn?.id ?? null,
          map_id: Number(spawn?.map_id ?? 0) || null,
          map_layer_id: Number(spawn?.map_layer_id ?? 0) || null,
          area: stringifyCoords(
            spawn?.coords ?? parseAreaToCoords(spawn?.area)
          ),
          spawn_time:
            String(spawn?.spawn_time ?? "normal").trim() || "normal",
          spawn_count: String(spawn?.spawn_count ?? "").trim(),
          symbol_count: String(spawn?.symbol_count ?? "").trim(),
          note: String(spawn?.note ?? "").trim(),
        }))
      : [],
  };
}

export const DROP_TARGET_TYPE_OPTIONS = [
  { value: "item", label: "アイテム" },
  { value: "orb", label: "宝珠" },
  { value: "equipment", label: "装備" },
  { value: "accessory", label: "アクセサリ" },
];

export const DROP_TYPE_OPTIONS = [
  { value: "normal", label: "通常" },
  { value: "rare", label: "レア" },
  { value: "steal", label: "ぬすむ" },
  { value: "other", label: "その他" },
];