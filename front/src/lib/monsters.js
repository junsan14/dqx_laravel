import axios from "axios";

function getApiUrl() {
  const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  return apiUrl.replace(/\/$/, "");
}

const API_URL = getApiUrl();

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    Accept: "application/json",
  },
});

export function getMonsterAssetUrl(path = "") {
  if (!path) return "";

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${normalized}`;
}

function appendIfPresent(formData, key, value) {
  if (value === undefined || value === null) return;
  formData.append(key, value);
}

function buildMonsterFormData(payload = {}) {
  const formData = new FormData();

  appendIfPresent(formData, "display_order", payload.display_order ?? 0);
  appendIfPresent(formData, "name", payload.name ?? "");
  if (Object.prototype.hasOwnProperty.call(payload, "name_kana")) {
    appendIfPresent(formData, "name_kana", payload.name_kana ?? "");
  }
  appendIfPresent(formData, "name_en", payload.name_en ?? "");
  appendIfPresent(formData, "system_type", payload.system_type ?? "");
  appendIfPresent(formData, "system_type_en", payload.system_type_en ?? "");
  appendIfPresent(formData, "source_url", payload.source_url ?? "");
  appendIfPresent(formData, "trivia_1", payload.trivia_1 ?? "");
  appendIfPresent(formData, "trivia_2", payload.trivia_2 ?? "");
  appendIfPresent(
    formData,
    "reincarnation_parent_id",
    payload.reincarnation_parent_id ?? ""
  );

  appendIfPresent(formData, "crop_top", payload.crop_top ?? 0);
  appendIfPresent(formData, "crop_left", payload.crop_left ?? 0);
  appendIfPresent(formData, "crop_right", payload.crop_right ?? 0);
  appendIfPresent(formData, "crop_bottom", payload.crop_bottom ?? 0);

  if (payload.remove_image) {
    formData.append("remove_image", "1");
  }

  if (payload.image_file instanceof File) {
    formData.append("image_file", payload.image_file);
  }

  const drops = Array.isArray(payload.drops) ? payload.drops : [];

  drops.forEach((drop, index) => {
    appendIfPresent(formData, `drops[${index}][id]`, drop.id ?? "");
    appendIfPresent(
      formData,
      `drops[${index}][drop_target_type]`,
      drop.drop_target_type ?? ""
    );
    appendIfPresent(
      formData,
      `drops[${index}][drop_target_id]`,
      drop.drop_target_id ?? ""
    );
    appendIfPresent(
      formData,
      `drops[${index}][drop_type]`,
      drop.drop_type ?? ""
    );
    appendIfPresent(
      formData,
      `drops[${index}][sort_order]`,
      drop.sort_order ?? index + 1
    );
  });

  return formData;
}

function pickLocalizedValue(row = {}, jaKey, enKey, locale = "ja") {
  const ja = typeof row?.[jaKey] === "string" ? row[jaKey].trim() : "";
  const en = typeof row?.[enKey] === "string" ? row[enKey].trim() : "";

  if (locale === "en") {
    return en || ja || "";
  }

  return ja || en || "";
}

function normalizeDrop(row = {}, locale = "ja") {
  return {
    ...row,
    nameJa: row?.name ?? "",
    nameKana: row?.name_kana ?? "",
    name_kana: row?.name_kana ?? "",
    nameEn: row?.name_en ?? "",
    name: pickLocalizedValue(row, "name", "name_en", locale),

    target_name: pickLocalizedValue(
      row,
      "target_name",
      "target_name_en",
      locale
    ),
    target_name_kana: row?.target_name_kana ?? row?.name_kana ?? "",

    colorJa: row?.color ?? "",
    colorEn: row?.color_en ?? "",
    color: pickLocalizedValue(row, "color", "color_en", locale),

    effectJa: row?.effect ?? "",
    effectEn: row?.effect_en ?? "",
    effect: pickLocalizedValue(row, "effect", "effect_en", locale),

    equipment_type_name: pickLocalizedValue(
      row,
      "equipment_type_name",
      "equipment_type_name_en",
      locale
    ),

    accessory_type: pickLocalizedValue(
      row,
      "accessory_type",
      "accessory_type_en",
      locale
    ),
  };
}

function normalizeDropList(rows = [], locale = "ja") {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizeDrop(row, locale));
}

function normalizeSpawn(row = {}, locale = "ja") {
  return {
    ...row,
    monster_name: pickLocalizedValue(
      row,
      "monster_name",
      "monster_name_en",
      locale
    ),
    map_name: pickLocalizedValue(row, "map_name", "map_name_en", locale),
    continent_name: pickLocalizedValue(
      row,
      "continent_name",
      "continent_name_en",
      locale
    ),
    map_layer_name: pickLocalizedValue(
      row,
      "map_layer_name",
      "map_layer_name_en",
      locale
    ),
    note: Array.isArray(row?.note) ? row.note : row?.note ?? "",
    area: Array.isArray(row?.area) ? row.area : row?.area ?? [],
  };
}

function normalizeMap(row = {}, locale = "ja") {
  return {
    ...row,
    name: pickLocalizedValue(row, "name", "name_en", locale),
    map_name: pickLocalizedValue(row, "map_name", "map_name_en", locale),
    continent: pickLocalizedValue(row, "continent", "continent_en", locale),
    continent_name: pickLocalizedValue(
      row,
      "continent_name",
      "continent_name_en",
      locale
    ),
    spawns: Array.isArray(row?.spawns)
      ? row.spawns.map((spawn) => normalizeSpawn(spawn, locale))
      : [],
  };
}

function normalizeMonster(row = {}, locale = "ja") {
  const normalized = {
    ...row,

    nameJa: row?.name ?? "",
    nameKana: row?.name_kana ?? "",
    name_kana: row?.name_kana ?? "",
    nameEn: row?.name_en ?? "",
    name_en: row?.name_en ?? "",

    trivia_1: row?.trivia_1 ?? "",
    trivia_2: row?.trivia_2 ?? "",

    monster_name_ja: row?.monster_name ?? row?.name ?? "",
    monster_name_en: row?.monster_name_en ?? row?.name_en ?? "",

    systemTypeJa: row?.system_type ?? "",
    systemTypeEn: row?.system_type_en ?? "",
    system_type_en: row?.system_type_en ?? "",

    matchedNameJa: row?.matched_name ?? "",
    matchedNameKana: row?.matched_name_kana ?? "",
    matched_name_kana: row?.matched_name_kana ?? "",
    matchedNameEn: row?.matched_name_en ?? "",
    matched_name_en: row?.matched_name_en ?? "",

    matchedColorJa: row?.matched_color ?? "",
    matchedColorEn: row?.matched_color_en ?? "",
    matched_color_en: row?.matched_color_en ?? "",

    reincarnationParentNameJa: row?.reincarnation_parent_name ?? "",
    reincarnationParentNameKana: row?.reincarnation_parent_name_kana ?? "",
    reincarnation_parent_name_kana:
      row?.reincarnation_parent_name_kana ?? "",
    reincarnationParentNameEn: row?.reincarnation_parent_name_en ?? "",
    reincarnation_parent_name_en: row?.reincarnation_parent_name_en ?? "",
  };

  const monsterName = pickLocalizedValue(
    {
      ...row,
      monster_name: row?.monster_name ?? row?.name ?? "",
      monster_name_en: row?.monster_name_en ?? row?.name_en ?? "",
    },
    "monster_name",
    "monster_name_en",
    locale
  );

  return {
    ...normalized,
    name: monsterName,
    monster_name: monsterName,
    system_type: pickLocalizedValue(row, "system_type", "system_type_en", locale),
    matched_name: pickLocalizedValue(
      row,
      "matched_name",
      "matched_name_en",
      locale
    ),
    matched_color: pickLocalizedValue(
      row,
      "matched_color",
      "matched_color_en",
      locale
    ),
    reincarnation_parent_name: pickLocalizedValue(
      row,
      "reincarnation_parent_name",
      "reincarnation_parent_name_en",
      locale
    ),

    normal_drops: normalizeDropList(row?.normal_drops ?? [], locale),
    rare_drops: normalizeDropList(row?.rare_drops ?? [], locale),
    white_box_drops: normalizeDropList(row?.white_box_drops ?? [], locale),
    orb_drops: normalizeDropList(row?.orb_drops ?? [], locale),
    equipment_drops: normalizeDropList(row?.equipment_drops ?? [], locale),
    accessory_drops: normalizeDropList(row?.accessory_drops ?? [], locale),
    drops: normalizeDropList(row?.drops ?? [], locale),
    maps: Array.isArray(row?.maps)
      ? row.maps.map((map) => normalizeMap(map, locale))
      : [],
    spawns: Array.isArray(row?.spawns)
      ? row.spawns.map((spawn) => normalizeSpawn(spawn, locale))
      : [],
  };
}

function normalizeMonsterList(rows = [], locale = "ja") {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizeMonster(row, locale));
}

export async function searchMonsters(
  keyword = "",
  searchType = "monster",
  locale = "ja"
) {
  try {
    const res = await api.get("/api/monster-search", {
      params: {
        keyword,
        search_type: searchType,
        locale,
      },
    });

    if (Array.isArray(res.data?.data)) {
      return normalizeMonsterList(res.data.data, locale);
    }

    if (Array.isArray(res.data)) {
      return normalizeMonsterList(res.data, locale);
    }

    return [];
  } catch (error) {
    console.error(error);

    if (error.response) {
      throw new Error(`モンスター取得失敗: ${error.response.status}`);
    }

    throw new Error("モンスター取得失敗");
  }
}

export async function fetchMonsterDetail(id, locale = "ja") {
  try {
    const res = await api.get(`/api/monster-search/${id}`, {
      params: { locale },
    });
    return normalizeMonster(res.data?.data ?? res.data ?? null, locale);
  } catch (error) {
    console.error(error);

    if (error.response) {
      throw new Error(`モンスター詳細取得失敗: ${error.response.status}`);
    }

    throw new Error("モンスター詳細取得失敗");
  }
}

export async function createMonster(payload) {
  try {
    const body = buildMonsterFormData(payload);

    const res = await api.post("/api/monster-search", body, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return res.data?.data ?? res.data ?? null;
  } catch (error) {
    console.error(error);

    if (error.response?.data?.errors) {
      const firstError = Object.values(error.response.data.errors)?.[0]?.[0];
      if (firstError) throw new Error(firstError);
    }

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    if (error.response) {
      throw new Error(`モンスター作成失敗: ${error.response.status}`);
    }

    throw new Error("モンスター作成失敗");
  }
}

export async function updateMonster(id, payload) {
  try {
    const body = buildMonsterFormData(payload);
    body.append("_method", "PUT");

    const res = await api.post(`/api/monster-search/${id}`, body, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return res.data?.data ?? res.data ?? null;
  } catch (error) {
    console.error(error);

    if (error.response?.data?.errors) {
      const firstError = Object.values(error.response.data.errors)?.[0]?.[0];
      if (firstError) throw new Error(firstError);
    }

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    if (error.response) {
      throw new Error(`モンスター更新失敗: ${error.response.status}`);
    }

    throw new Error("モンスター更新失敗");
  }
}

export async function deleteMonster(id) {
  try {
    const res = await api.delete(`/api/monster-search/${id}`);
    return res.data?.data ?? res.data ?? null;
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    if (error.response) {
      throw new Error(`モンスター削除失敗: ${error.response.status}`);
    }

    throw new Error("モンスター削除失敗");
  }
}

export async function fetchMonstersAroundDisplayOrder(
  displayOrder,
  { range = 5, excludeId = null, locale = "ja" } = {}
) {
  try {
    const res = await api.get("/api/monsters/around-display-order", {
      params: {
        display_order: displayOrder,
        range,
        ...(excludeId ? { exclude_id: excludeId } : {}),
        locale,
      },
    });

    const rows = res.data?.data ?? [];
    return normalizeMonsterList(Array.isArray(rows) ? rows : [], locale);
  } catch (error) {
    console.error(error);
    throw new Error("前後モンスター取得失敗");
  }
}

export async function fetchMonsterZukanPage(
  page = 1,
  perPage = 16,
  sort = "no",
  locale = "ja"
) {
  try {
    const safePage = Math.max(1, Number(page) || 1);
    const safePerPage = Math.max(1, Number(perPage) || 16);
    const safeSort = sort === "kana" ? "kana" : "no";

    const res = await api.get("/api/monsters/zukan", {
      params: {
        page: safePage,
        per_page: safePerPage,
        sort: safeSort,
        locale,
      },
    });

    const payload = res.data ?? {};

    return {
      data: normalizeMonsterList(
        Array.isArray(payload.data) ? payload.data : [],
        locale
      ),
      current_page: Number(payload.current_page) || safePage,
      last_page: Number(payload.last_page) || 1,
      per_page: Number(payload.per_page) || safePerPage,
      total: Number(payload.total) || 0,
    };
  } catch (error) {
    console.error(error);

    if (error.response) {
      throw new Error(`モンスター図鑑取得失敗: ${error.response.status}`);
    }

    throw new Error("モンスター図鑑取得失敗");
  }
}
