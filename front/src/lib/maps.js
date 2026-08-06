import axios from "axios";

function getApiUrl() {
  const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
  return apiUrl.replace(/\/$/, "");
}

const API_URL = getApiUrl();

const api = axios.create({
  withCredentials: true,
  headers: {
    Accept: "application/json",
  },
});

function pickLocalizedValue(row = {}, jaKey, enKey, locale = "ja") {
  const ja = typeof row?.[jaKey] === "string" ? row[jaKey].trim() : "";
  const en = typeof row?.[enKey] === "string" ? row[enKey].trim() : "";

  if (locale === "en") {
    return en || ja || "";
  }

  return ja || en || "";
}

export function resolveMapImageUrl(path = "") {
  const value = String(path ?? "").trim();
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${API_URL}${value}`;
  return `${API_URL}/${value}`;
}

function normalizeLayer(row = {}, locale = "ja") {
  const rawImagePath =
    row?.image_path ??
    row?.image_url ??
    row?.map_image_url ??
    row?.map_image_path ??
    "";

  const layerName = pickLocalizedValue(
    row,
    "layer_name",
    "layer_name_en",
    locale
  );

  return {
    ...row,
    id: row?.id ?? null,
    map_id: row?.map_id ?? null,
    layer_name: layerName,
    layer_name_ja: row?.layer_name ?? "",
    layer_name_en: row?.layer_name_en ?? "",
    floor_no: Number(row?.floor_no ?? 0),
    image_path: rawImagePath,
    image_url: resolveMapImageUrl(rawImagePath),
    source_url: row?.source_url ?? "",
    display_order: Number(row?.display_order ?? 1),
    image_file: null,
    layer_file_name: String(row?.layer_file_name ?? "").trim(),
  };
}

function normalizeContinent(row = {}, locale = "ja") {
  const continentName = pickLocalizedValue(row, "name", "name_en", locale);
  const mapImageFolder = String(
    row?.map_image_folder ??
      row?.continent_folder ??
      row?.folder ??
      ""
  ).trim();

  return {
    ...row,
    id: row?.id ?? null,
    display_id: Number(row?.display_id ?? row?.display_order ?? 0),
    name: continentName,
    continent_name: continentName,
    name_ja: row?.name ?? "",
    name_en: row?.name_en ?? "",
    map_image_folder: mapImageFolder,
    continent_folder: mapImageFolder,
    folder: mapImageFolder,
  };
}

function normalizeMap(row = {}, locale = "ja") {
  const layers = Array.isArray(row?.layers)
    ? row.layers
        .map((layer) => normalizeLayer(layer, locale))
        .sort((a, b) => {
          const aOrder = Number(a?.display_order ?? 1);
          const bOrder = Number(b?.display_order ?? 1);
          if (aOrder !== bOrder) return aOrder - bOrder;

          const aFloor = Number(a?.floor_no ?? 0);
          const bFloor = Number(b?.floor_no ?? 0);
          return aFloor - bFloor;
        })
    : [];

  const mapName = pickLocalizedValue(row, "name", "name_en", locale);
  const continentName = pickLocalizedValue(
    row,
    "continent_name",
    "continent_name_en",
    locale
  );

  return {
    ...row,
    id: row?.id ?? null,
    continent_id:
      row?.continent_id != null && row?.continent_id !== ""
        ? Number(row.continent_id)
        : null,
    continent_display_id:
      row?.continent_display_id != null && row?.continent_display_id !== ""
        ? Number(row.continent_display_id)
        : null,
    continent: continentName,
    continent_name: continentName,
    continent_name_ja: row?.continent_name ?? row?.continent ?? "",
    continent_name_en: row?.continent_name_en ?? "",
    continent_folder: String(
      row?.continent_folder ??
        row?.map_image_folder ??
        ""
    ).trim(),
    name: mapName,
    map_name: mapName,
    name_ja: row?.name ?? "",
    name_kana: row?.name_kana ?? "",
    map_name_kana: row?.name_kana ?? "",
    name_en: row?.name_en ?? "",
    map_type: row?.map_type ?? "",
    source_url: row?.source_url ?? "",
    layers,
  };
}

function extractRows(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.data?.data)) return json.data.data;
  return [];
}

function extractOne(json) {
  if (json?.data?.data) return json.data.data;
  if (json?.data) return json.data;
  return json;
}

function buildMapFormData(payload = {}) {
  const formData = new FormData();

  formData.append("continent_id", String(payload?.continent_id ?? ""));
  formData.append("continent_folder", String(payload?.continent_folder ?? ""));
  formData.append("name", String(payload?.name ?? ""));
  formData.append("name_kana", String(payload?.name_kana ?? ""));
  formData.append("name_en", String(payload?.name_en ?? ""));
  formData.append("map_type", String(payload?.map_type ?? ""));
  formData.append("source_url", String(payload?.source_url ?? ""));

  const layers = Array.isArray(payload?.layers) ? payload.layers : [];

  layers.forEach((layer, index) => {
    if (layer?.id != null && layer?.id !== "") {
      formData.append(`layers[${index}][id]`, String(layer.id));
    }

    formData.append(
      `layers[${index}][layer_name]`,
      String(layer?.layer_name ?? "")
    );

    formData.append(
      `layers[${index}][layer_name_en]`,
      String(layer?.layer_name_en ?? "")
    );

    formData.append(
      `layers[${index}][layer_file_name]`,
      String(layer?.layer_file_name ?? "")
    );

    formData.append(
      `layers[${index}][floor_no]`,
      String(layer?.floor_no ?? 0)
    );

    formData.append(
      `layers[${index}][source_url]`,
      String(layer?.source_url ?? "")
    );

    formData.append(
      `layers[${index}][display_order]`,
      String(layer?.display_order ?? index + 1)
    );

    if (layer?.image_file instanceof File) {
      formData.append(`layers[${index}][image]`, layer.image_file);
    }
  });

  return formData;
}

export async function fetchMaps(q = "", locale = "ja") {
  try {
    const res = await api.get(`${API_URL}/api/maps`, {
      params: q ? { q, locale } : { locale },
    });

    return extractRows(res.data).map((row) => normalizeMap(row, locale));
  } catch (error) {
    console.error(error);
    throw new Error("マップ一覧取得失敗");
  }
}

export async function fetchMap(id, locale = "ja") {
  try {
    const res = await api.get(`${API_URL}/api/maps/${id}`, {
      params: { locale },
    });
    return normalizeMap(extractOne(res.data), locale);
  } catch (error) {
    console.error(error);
    throw new Error("マップ詳細取得失敗");
  }
}

export async function createMap(payload) {
  try {
    const formData = buildMapFormData(payload);

    const res = await api.post(`${API_URL}/api/maps`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return normalizeMap(extractOne(res.data));
  } catch (error) {
    console.error(error?.response?.data || error);
    throw new Error(error?.response?.data?.message || "マップ作成失敗");
  }
}

export async function updateMap(id, payload) {
  try {
    const formData = buildMapFormData(payload);
    formData.append("_method", "PUT");

    const res = await api.post(`${API_URL}/api/maps/${id}`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return normalizeMap(extractOne(res.data));
  } catch (error) {
    console.error(error?.response?.data || error);
    throw new Error(error?.response?.data?.message || "マップ更新失敗");
  }
}

export async function deleteMap(id) {
  try {
    await api.delete(`${API_URL}/api/maps/${id}`);
    return true;
  } catch (error) {
    console.error(error);
    throw new Error("マップ削除失敗");
  }
}

export async function fetchMapOptions(locale = "ja") {
  try {
    const res = await api.get(`${API_URL}/api/maps/options`, {
      params: { locale },
    });

    const data = extractOne(res.data) ?? {};

    return {
      continents: Array.isArray(data?.continents)
        ? data.continents.map((row) => normalizeContinent(row, locale))
        : [],
      map_types: Array.isArray(data?.map_types) ? data.map_types : [],
    };
  } catch (error) {
    console.error(error);
    return {
      continents: [],
      map_types: [],
    };
  }
}