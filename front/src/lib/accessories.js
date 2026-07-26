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

export const ACCESSORY_BASE_EFFECT_FIELDS = [
  { key: "max_hp", label: "さいだいHP" },
  { key: "max_mp", label: "さいだいMP" },
  { key: "attack", label: "こうげき力" },
  { key: "defense", label: "しゅび力" },
  { key: "magic_attack", label: "こうげき魔力" },
  { key: "healing_power", label: "かいふく魔力" },
  { key: "agility", label: "すばやさ" },
  { key: "dexterity", label: "きようさ" },
  { key: "charm", label: "みりょく" },
  { key: "weight", label: "重さ" },
];

export const ACCESSORY_NUMBER_FIELDS = [
  "inheritance_from_accessory_id",
  "equip_level",
  "weight",
  "attack",
  "defense",
  "max_hp",
  "max_mp",
  "charm",
  "agility",
  "dexterity",
  "magic_attack",
  "healing_power",
];

export function createEmptyAccessory() {
  return {
    id: null,
    item_id: "",
    name: "",
    name_kana: "",
    name_en: "",
    item_kind: "accessory",
    slot: "",
    accessory_type: "",

    inheritance_from_accessory_id: "",
    inheritance_type: "",
    inheritance_note: "",
    inheritance_from: null,
    inheritance_chain: [],

    equip_level: "",

    weight: "",
    attack: "",
    defense: "",
    max_hp: "",
    max_mp: "",
    charm: "",
    agility: "",
    dexterity: "",
    magic_attack: "",
    healing_power: "",

    description: "",
    effects_json: [],
    synthesis_effects_json: [],
    obtain_methods_json: [],
    image_url: "",
    source_url: "",
    detail_url: "",
    drop_monsters: [],
  };
}

export function createEmptyJsonRow() {
  return {
    text: "",
    note: "",
    recommended: false,
  };
}

function normalizeNumberInput(value) {
  if (value === null || value === undefined) return "";
  return value;
}

export function normalizeJsonRows(value) {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    if (typeof item === "string") {
      return {
        text: item,
        note: "",
        recommended: false,
      };
    }

    return {
      text: item?.text ?? "",
      note: item?.note ?? "",
      recommended: Boolean(item?.recommended),
    };
  });
}

function normalizeInheritanceAccessory(row = null) {
  if (!row || typeof row !== "object") return null;

  return {
    id: row?.id ?? null,
    item_id: row?.item_id ?? "",
    name: row?.name ?? "",
    name_kana: row?.name_kana ?? "",
    name_en: row?.name_en ?? "",
    slot: row?.slot ?? "",
    accessory_type: row?.accessory_type ?? "",
    inheritance_from_accessory_id: normalizeNumberInput(
      row?.inheritance_from_accessory_id
    ),
    inheritance_type: row?.inheritance_type ?? "",
    image_url: row?.image_url ?? "",
  };
}

function normalizeInheritanceChain(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeInheritanceAccessory(item))
    .filter(Boolean);
}

export function normalizeAccessory(row = {}) {
  const empty = createEmptyAccessory();

  return {
    ...empty,

    id: row?.id ?? null,
    item_id: row?.item_id ?? "",
    name: row?.name ?? "",
    name_kana: row?.name_kana ?? "",
    name_en: row?.name_en ?? "",
    item_kind: row?.item_kind ?? "accessory",
    slot: row?.slot ?? "",
    accessory_type: row?.accessory_type ?? "",

    inheritance_from_accessory_id: normalizeNumberInput(
      row?.inheritance_from_accessory_id
    ),
    inheritance_type: row?.inheritance_type ?? "",
    inheritance_note: row?.inheritance_note ?? "",
    inheritance_from: normalizeInheritanceAccessory(row?.inheritance_from),
    inheritance_chain: normalizeInheritanceChain(row?.inheritance_chain),

    equip_level: normalizeNumberInput(row?.equip_level),

    weight: normalizeNumberInput(row?.weight),
    attack: normalizeNumberInput(row?.attack),
    defense: normalizeNumberInput(row?.defense),
    max_hp: normalizeNumberInput(row?.max_hp),
    max_mp: normalizeNumberInput(row?.max_mp),
    charm: normalizeNumberInput(row?.charm),
    agility: normalizeNumberInput(row?.agility),
    dexterity: normalizeNumberInput(row?.dexterity),
    magic_attack: normalizeNumberInput(row?.magic_attack),
    healing_power: normalizeNumberInput(row?.healing_power),

    description: row?.description ?? "",
    effects_json: normalizeJsonRows(row?.effects_json),
    synthesis_effects_json: normalizeJsonRows(row?.synthesis_effects_json),
    obtain_methods_json: normalizeJsonRows(row?.obtain_methods_json),
    image_url: row?.image_url ?? "",
    source_url: row?.source_url ?? "",
    detail_url: row?.detail_url ?? "",
    drop_monsters: Array.isArray(row?.drop_monsters) ? row.drop_monsters : [],
  };
}

export async function fetchAccessories(q = "") {
  try {
    const res = await api.get(`${API_URL}/api/accessories`, {
      params: q ? { q } : {},
    });

    const json = res.data;

    if (Array.isArray(json?.data)) {
      return json.data.map(normalizeAccessory);
    }

    if (Array.isArray(json?.data?.data)) {
      return json.data.data.map(normalizeAccessory);
    }

    return [];
  } catch (error) {
    console.error(error);
    throw new Error("アクセサリ一覧取得失敗");
  }
}

export async function fetchAccessory(id) {
  try {
    const res = await api.get(`${API_URL}/api/accessories/${id}`);
    return normalizeAccessory(res.data.data);
  } catch (error) {
    console.error(error);
    throw new Error("アクセサリ取得失敗");
  }
}

export async function createAccessory(data) {
  try {
    const res = await api.post(
      `${API_URL}/api/accessories`,
      cleanAccessoryPayload(data)
    );

    return normalizeAccessory(res.data.data);
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("アクセサリ作成失敗");
  }
}

export async function updateAccessory(id, data) {
  try {
    const res = await api.put(
      `${API_URL}/api/accessories/${id}`,
      cleanAccessoryPayload(data)
    );

    return normalizeAccessory(res.data.data);
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("アクセサリ更新失敗");
  }
}

export async function deleteAccessory(id) {
  try {
    const res = await api.delete(`${API_URL}/api/accessories/${id}`);
    return res.data;
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("アクセサリ削除失敗");
  }
}

function cleanAccessoryPayload(data = {}) {
  const payload = {
    ...createEmptyAccessory(),
    ...data,

    effects_json: cleanJsonRows(data.effects_json),
    synthesis_effects_json: cleanJsonRows(data.synthesis_effects_json),
    obtain_methods_json: cleanJsonRows(data.obtain_methods_json),
  };

  ACCESSORY_NUMBER_FIELDS.forEach((key) => {
    if (payload[key] === "" || payload[key] === undefined) {
      payload[key] = null;
    }
  });

  delete payload.inheritance_from;
  delete payload.inheritance_chain;

  return payload;
}

function cleanJsonRows(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      if (typeof row === "string") {
        return {
          text: row.trim(),
          note: "",
          recommended: false,
        };
      }

      return {
        text: String(row?.text ?? "").trim(),
        note: String(row?.note ?? "").trim(),
        recommended: Boolean(row?.recommended),
      };
    })
    .filter((row) => row.text !== "" || row.note !== "");
}

export async function uploadAccessoryImage(file, options = {}) {
  try {
    const formData = new FormData();

    formData.append("image", file);

    if (options.accessoryId) {
      formData.append("accessory_id", String(options.accessoryId));
    }

    if (options.itemId) {
      formData.append("item_id", String(options.itemId));
    }

    const res = await api.post(
      `${API_URL}/api/accessories/upload-image`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );

    return res.data;
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("アクセサリ画像アップロード失敗");
  }
}
export function getAccessoryAssetUrl(path = "") {
  if (!path) return "";

  if (path.startsWith("blob:")) {
    return path;
  }

  if (path.startsWith("data:")) {
    return path;
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const normalized = path.startsWith("/") ? path : `/${path}`;

  return `${API_URL}${normalized}`;
}
