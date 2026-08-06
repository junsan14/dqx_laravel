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

export const EQUIPMENT_BASE_EFFECT_FIELDS = [
  { key: "maxHp", label: "さいだいHP" },
  { key: "maxMp", label: "さいだいMP" },
  { key: "attack", label: "こうげき力" },
  { key: "defense", label: "しゅび力" },
  { key: "magicAttack", label: "こうげき魔力" },
  { key: "healingPower", label: "かいふく魔力" },
  { key: "agility", label: "すばやさ" },
  { key: "dexterity", label: "きようさ" },
  { key: "charm", label: "みりょく" },
  { key: "weight", label: "重さ" },
];

export const EQUIPMENT_NUMBER_FIELDS = [
  "attack",
  "defense",
  "maxHp",
  "maxMp",
  "charm",
  "agility",
  "dexterity",
  "magicAttack",
  "healingPower",
  "craftLevel",
  "equipLevel",
  "defaultPrice",
  "weight",
];

export function str(value) {
  return value == null ? "" : String(value);
}

export function makeKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `equipment_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function safeJsonParse(value, fallback) {
  if (value == null || value === "") return fallback;
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function toJsonString(value, fallbackJson = "[]") {
  try {
    return JSON.stringify(value ?? JSON.parse(fallbackJson));
  } catch {
    return fallbackJson;
  }
}

function normalizeNumberInput(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function toNullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  return Number(value);
}

function normalizeJsonArray(value) {
  const parsed = safeJsonParse(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function createEmptyEquipmentRow() {
  return {
    __key: makeKey(),

    id: null,

    attack: "",
    defense: "",
    maxHp: "",
    maxMp: "",
    charm: "",
    agility: "",
    dexterity: "",
    magicAttack: "",
    healingPower: "",

    itemId: "",
    itemName: "",
    itemNameKana: "", // 追加

    itemNameEn: "",

    equipmentTypeId: "",
    equipmentType: null,
    equipmentTypeName: "",

    craftProductTypeId: "",
    craftProductType: null,
    craftProductTypeName: "",
    craftProductTypeDisplayName: "",
    craftMaterialTrait: "",

    jobOverrideMode: "inherit",
    jobOverrides: [],

    craftLevel: "",
    equipLevel: "",

    recipeBook: "",
    recipePlace: "",
    description: "",

    groupKind: "",
    groupId: "",
    groupName: "",

    materialsJson: "[]",
    slotGridJson: "",
    sourceUrl: "",
    detailUrl: "",
    effectsJson: "[]",

    defaultPrice: "",
    weight: "",

    createdAt: null,
    updatedAt: null,
  };
}

export function normalizeMaterial(raw) {
  if (!raw) return null;

  if (typeof raw === "string") {
    return {
      item_id: null,
      name: raw,
      count: 1,
    };
  }

  return {
    item_id: raw.item_id ?? raw.itemId ?? null,
    name: raw.name ?? raw.item_name ?? raw.itemName ?? "",
    count: Number(raw.count ?? raw.qty ?? raw.quantity ?? 1) || 1,
  };
}

export function normalizeEffect(raw) {
  if (raw == null) return null;
  return raw;
}

export function normalizeEquipmentJob(job, source = "unknown") {
  if (!job) return null;

  if (typeof job === "string") {
    return {
      id: null,
      game_job_id: null,
      key: job,
      name: job,
      mode: "allow",
      source,
    };
  }

  const gameJob = job?.gameJob ?? job?.game_job ?? null;

  const gameJobId =
    job?.game_job_id ??
    job?.gameJobId ??
    gameJob?.id ??
    job?.id ??
    null;

  const name = gameJob?.name ?? job?.name ?? job?.label ?? "";

  const key = String(gameJob?.key ?? job?.key ?? gameJobId ?? name);

  if (!gameJobId && !name && !key) return null;

  return {
    id: gameJobId,
    game_job_id: gameJobId,
    key,
    name: name || key,
    mode: job?.mode ?? "allow",
    source,
  };
}

export function getInheritedEquipmentJobs(row = {}) {
  const equipmentType = row?.equipmentType ?? row?.equipment_type ?? null;

  const equipableTypes =
    equipmentType?.equipableTypes ?? equipmentType?.equipable_types ?? [];

  if (!Array.isArray(equipableTypes)) return [];

  return equipableTypes
    .map((item) => {
      const job = item?.gameJob ?? item?.game_job ?? item;

      return normalizeEquipmentJob(
        {
          ...job,
          game_job_id: job?.id ?? item?.game_job_id ?? null,
        },
        "inherit"
      );
    })
    .filter(Boolean);
}

export function getOverrideEquipmentJobs(row = {}) {
  const overrides = row?.jobOverrides ?? row?.job_overrides ?? [];

  if (!Array.isArray(overrides)) return [];

  return overrides
    .map((item) => normalizeEquipmentJob(item, "override"))
    .filter(Boolean);
}

export function uniqueEquipmentJobs(jobs = []) {
  const map = new Map();

  jobs.filter(Boolean).forEach((job) => {
    const key = String(job.key ?? job.game_job_id ?? job.name ?? "");
    if (!key) return;
    map.set(key, job);
  });

  return Array.from(map.values());
}

export function resolveEquipmentJobs(row = {}) {
  const mode = row?.jobOverrideMode ?? row?.job_override_mode ?? "inherit";

  const inheritedJobs = getInheritedEquipmentJobs(row);
  const overrideJobs = getOverrideEquipmentJobs(row);

  const allowJobs = overrideJobs.filter((job) => job.mode !== "deny");
  const denyKeys = new Set(
    overrideJobs
      .filter((job) => job.mode === "deny")
      .map((job) => String(job.key))
  );

  let result = [];

  if (mode === "replace") {
    result = allowJobs;
  } else if (mode === "add") {
    result = [...inheritedJobs, ...allowJobs];
  } else {
    result = inheritedJobs;
  }

  return uniqueEquipmentJobs(result).filter(
    (job) => !denyKeys.has(String(job.key))
  );
}

export function resolveEquipmentJobNames(row = {}) {
  return resolveEquipmentJobs(row).map((job) => job.name);
}

export function normalizeEquipmentRow(row = {}) {
  const empty = createEmptyEquipmentRow();

  const materials = normalizeJsonArray(row?.materials_json ?? row?.materialsJson);
  const slotGrid = safeJsonParse(row?.slot_grid_json ?? row?.slotGridJson, null);
  const effects = normalizeJsonArray(row?.effects_json ?? row?.effectsJson);

  const jobOverrides = Array.isArray(row?.job_overrides)
    ? row.job_overrides
    : Array.isArray(row?.jobOverrides)
    ? row.jobOverrides
    : [];

  const equipmentType = row?.equipment_type ?? row?.equipmentType ?? null;
  const craftProductType =
    row?.craft_product_type ?? row?.craftProductType ?? null;
  const craftProductTypeName = str(
    craftProductType?.name ??
      row?.craft_product_type_name ??
      row?.craftProductTypeName
  ).trim();
  const craftProductTypeDisplayName = str(
    craftProductType?.display_name ??
      craftProductType?.displayName ??
      row?.craft_product_type_display_name ??
      row?.craftProductTypeDisplayName ??
      craftProductTypeName
  ).trim();

  const normalizedJobOverrides = jobOverrides
    .map((override) => {
      const job = override?.game_job ?? override?.gameJob ?? null;

      return {
        id: override?.id ?? null,
        game_job_id:
          override?.game_job_id ??
          override?.gameJobId ??
          job?.id ??
          null,
        key: job?.key ?? override?.key ?? "",
        name: job?.name ?? override?.name ?? "",
        mode: override?.mode ?? "allow",
      };
    })
    .filter((job) => job.game_job_id);

  const normalizedRow = {
    ...empty,

    __key: row?.__key ?? row?.id ?? makeKey(),

    id: row?.id ?? null,

    attack: normalizeNumberInput(row?.attack),
    defense: normalizeNumberInput(row?.defense),
    maxHp: normalizeNumberInput(row?.max_hp ?? row?.maxHp),
    maxMp: normalizeNumberInput(row?.max_mp ?? row?.maxMp),
    charm: normalizeNumberInput(row?.charm),
    agility: normalizeNumberInput(row?.agility),
    dexterity: normalizeNumberInput(row?.dexterity),
    magicAttack: normalizeNumberInput(row?.magic_attack ?? row?.magicAttack),
    healingPower: normalizeNumberInput(row?.healing_power ?? row?.healingPower),

    itemId: str(row?.item_id ?? row?.itemId),
    itemName: str(row?.item_name ?? row?.itemName),
    itemNameKana: str(row?.item_name_kana ?? row?.itemNameKana), // 追加

    itemNameEn: str(row?.item_name_en ?? row?.itemNameEn),

    equipmentTypeId:
      row?.equipment_type_id == null && row?.equipmentTypeId == null
        ? ""
        : String(row?.equipment_type_id ?? row?.equipmentTypeId),

    equipmentType,
    equipmentTypeName: str(equipmentType?.name ?? row?.equipmentTypeName),

    craftProductTypeId:
      row?.craft_product_type_id == null && row?.craftProductTypeId == null
        ? ""
        : String(row?.craft_product_type_id ?? row?.craftProductTypeId),
    craftProductType,
    craftProductTypeName,
    craftProductTypeDisplayName,
    craftMaterialTrait: str(
      row?.craft_material_trait ??
        row?.craftMaterialTrait ??
        row?.fabric_type ??
        row?.fabricType
    ),

    jobOverrideMode:
      str(row?.job_override_mode ?? row?.jobOverrideMode) || "inherit",
    jobOverrides: normalizedJobOverrides,

    craftLevel: normalizeNumberInput(row?.craft_level ?? row?.craftLevel),
    equipLevel: normalizeNumberInput(row?.equip_level ?? row?.equipLevel),

    recipeBook: str(row?.recipe_book ?? row?.recipeBook),
    recipePlace: str(row?.recipe_place ?? row?.recipePlace),
    description: str(row?.description),

    groupKind: str(row?.group_kind ?? row?.groupKind),
    groupId: str(row?.group_id ?? row?.groupId),
    groupName: str(row?.group_name ?? row?.groupName),

    materialsJson: toJsonString(
      Array.isArray(materials)
        ? materials.map(normalizeMaterial).filter(Boolean)
        : [],
      "[]"
    ),

    slotGridJson: slotGrid == null ? "" : toJsonString(slotGrid, "[]"),

    sourceUrl: str(row?.source_url ?? row?.sourceUrl),
    detailUrl: str(row?.detail_url ?? row?.detailUrl),

    effectsJson: toJsonString(
      Array.isArray(effects)
        ? effects.map(normalizeEffect).filter((x) => x != null)
        : [],
      "[]"
    ),

    defaultPrice: normalizeNumberInput(row?.default_price ?? row?.defaultPrice),
    weight: normalizeNumberInput(row?.weight),

    createdAt: row?.created_at ?? row?.createdAt ?? null,
    updatedAt: row?.updated_at ?? row?.updatedAt ?? null,
  };

  return {
    ...normalizedRow,
    jobs: resolveEquipmentJobNames(normalizedRow),
  };
}

export function hydrateRowMaterialsWithItems(row) {
  const rawMaterials = Array.isArray(row?.materialsJson)
    ? row.materialsJson
    : safeJsonParse(row?.materialsJson, []);

  const normalizedMaterials = Array.isArray(rawMaterials)
    ? rawMaterials
        .map((mat) => ({
          item_id: Number(mat?.item_id ?? mat?.itemId ?? 0),
          count: Number(mat?.count ?? 1),
        }))
        .filter((mat) => mat.item_id > 0)
    : [];

  return {
    ...row,
    materialsJson: normalizedMaterials,
  };
}

export function buildEquipmentPayload(row = {}) {
  return {
    attack: toNullableNumber(row.attack),
    defense: toNullableNumber(row.defense),
    max_hp: toNullableNumber(row.maxHp),
    max_mp: toNullableNumber(row.maxMp),
    charm: toNullableNumber(row.charm),
    agility: toNullableNumber(row.agility),
    dexterity: toNullableNumber(row.dexterity),
    magic_attack: toNullableNumber(row.magicAttack),
    healing_power: toNullableNumber(row.healingPower),

    item_id: str(row.itemId).trim() || null,
    item_name: str(row.itemName).trim(),
    item_name_kana: str(row.itemNameKana).trim() || null, // 追加

    item_name_en: str(row.itemNameEn).trim() || null,

    equipment_type_id:
      str(row.equipmentTypeId).trim() === ""
        ? null
        : Number(row.equipmentTypeId),

    craft_product_type_id:
      str(row.craftProductTypeId).trim() === ""
        ? null
        : Number(row.craftProductTypeId),

    craft_material_trait: str(row.craftMaterialTrait).trim() || null,

    job_override_mode: str(row.jobOverrideMode).trim() || "inherit",

    job_overrides: Array.isArray(row.jobOverrides)
      ? row.jobOverrides
          .map((job) => ({
            game_job_id: Number(job.game_job_id ?? job.gameJobId ?? job.id),
            mode: job.mode ?? "allow",
          }))
          .filter(
            (job) =>
              Number.isInteger(job.game_job_id) && job.game_job_id > 0
          )
      : [],

    craft_level: toNullableNumber(row.craftLevel),
    equip_level: toNullableNumber(row.equipLevel),

    recipe_book: str(row.recipeBook).trim() || null,
    recipe_place: str(row.recipePlace).trim() || null,
    description: str(row.description).trim() || null,

    group_kind: str(row.groupKind).trim() || null,
    group_id: str(row.groupId).trim() || null,
    group_name: str(row.groupName).trim() || null,

    materials_json: Array.isArray(row.materialsJson)
      ? row.materialsJson
      : normalizeJsonArray(row.materialsJson),

    slot_grid_json:
      str(row.slotGridJson).trim() === ""
        ? null
        : safeJsonParse(row.slotGridJson, []),

    source_url: str(row.sourceUrl).trim() || null,
    detail_url: str(row.detailUrl).trim() || null,

    effects_json: Array.isArray(row.effectsJson)
      ? row.effectsJson
      : normalizeJsonArray(row.effectsJson),

    default_price: toNullableNumber(row.defaultPrice),
    weight: toNullableNumber(row.weight),
  };
}

export async function fetchEquipments(params = {}) {
  try {
    const res = await api.get(`${API_URL}/api/equipments`, { params });
    const json = res.data;

    if (Array.isArray(json)) return json.map(normalizeEquipmentRow);
    if (Array.isArray(json?.data)) return json.data.map(normalizeEquipmentRow);
    if (Array.isArray(json?.data?.data)) {
      return json.data.data.map(normalizeEquipmentRow);
    }

    return [];
  } catch (error) {
    console.error(error);
    throw new Error("装備一覧取得失敗");
  }
}

export async function searchEquipments(query, limit = 60) {
  const q = str(query).trim();

  if (q.length < 2) {
    return [];
  }

  return fetchEquipments({
    q,
    summary: 1,
    limit,
  });
}

export async function fetchEquipmentSelection({
  groupId = "",
  itemId = "",
} = {}) {
  const normalizedGroupId = str(groupId).trim();
  const normalizedItemId = str(itemId).trim();

  if (normalizedGroupId) {
    return fetchEquipments({
      group_id: normalizedGroupId,
    });
  }

  if (normalizedItemId) {
    return fetchEquipments({
      item_id: normalizedItemId,
    });
  }

  return [];
}

export async function fetchCraftTools() {
  try {
    return await fetchEquipments({
      group_kind: "craft_tool_set",
    });
  } catch (error) {
    console.error(error);
    throw new Error("職人道具一覧取得失敗");
  }
}

export async function fetchEquipment(id) {
  try {
    const res = await api.get(`${API_URL}/api/equipments/${id}`);
    const json = res.data;
    return normalizeEquipmentRow(json?.data ?? json);
  } catch (error) {
    console.error(error);
    throw new Error("装備取得失敗");
  }
}

export async function createEquipment(data) {
  try {
    const res = await api.post(
      `${API_URL}/api/equipments`,
      buildEquipmentPayload(data)
    );

    return normalizeEquipmentRow(res.data?.data ?? res.data);
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("装備作成失敗");
  }
}

export async function updateEquipment(id, data) {
  try {
    const res = await api.put(
      `${API_URL}/api/equipments/${id}`,
      buildEquipmentPayload(data)
    );

    return normalizeEquipmentRow(res.data?.data ?? res.data);
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("装備更新失敗");
  }
}

export async function deleteEquipment(id) {
  try {
    const res = await api.delete(`${API_URL}/api/equipments/${id}`);
    return res.data;
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("装備削除失敗");
  }
}

export async function createItem(data) {
  try {
    const res = await api.post(`${API_URL}/api/items`, data);
    return res.data?.data ?? res.data;
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("アイテム作成失敗");
  }
}

// 互換用。既存importが残っていても壊れにくくする。
export const createEmptyRow = createEmptyEquipmentRow;
export const normalizeOneRowFromApi = normalizeEquipmentRow;
export const buildApiPayload = buildEquipmentPayload;
