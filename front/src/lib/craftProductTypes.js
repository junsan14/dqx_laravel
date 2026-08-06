import axios from "axios";

function getApiUrl() {
  const apiUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

  return apiUrl.replace(/\/$/, "");
}

const API_URL = getApiUrl();

const api = axios.create({
  withCredentials: true,
  headers: {
    Accept: "application/json",
  },
});

function parseJsonObject(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function normalizeDisabledCells(value) {
  if (!Array.isArray(value)) return [];

  const unique = new Map();

  value.forEach((cell) => {
    if (!Array.isArray(cell) || cell.length !== 2) return;

    const row = Number(cell[0]);
    const col = Number(cell[1]);

    if (!Number.isInteger(row) || row < 0) return;
    if (!Number.isInteger(col) || col < 0) return;

    unique.set(`${row}:${col}`, [row, col]);
  });

  return Array.from(unique.values());
}

export function normalizeGridJson(value) {
  const parsed = parseJsonObject(value);
  if (!parsed) return null;

  const rows = Number(parsed.rows);
  const cols = Number(parsed.cols);

  if (!Number.isInteger(rows) || rows < 1) return null;
  if (!Number.isInteger(cols) || cols < 1) return null;

  return {
    rows,
    cols,
    disabledCells: normalizeDisabledCells(parsed.disabledCells).filter(
      ([row, col]) => row < rows && col < cols
    ),
  };
}

export function createEmptyCraftProductType() {
  return {
    id: null,
    key: "",
    name: "",
    displayName: "",
    kind: "",
    craftTypeId: "",
    craftType: null,
    gridJson: null,
    createdAt: null,
    updatedAt: null,
  };
}

export function normalizeCraftProductType(row = {}) {
  const craftType = row?.craft_type ?? row?.craftType ?? null;

  return {
    ...createEmptyCraftProductType(),
    id: row?.id ?? null,
    key: String(row?.key ?? ""),
    name: String(row?.name ?? ""),
    displayName: String(row?.display_name ?? row?.displayName ?? ""),
    kind: String(row?.kind ?? ""),
    craftTypeId:
      row?.craft_type_id == null && row?.craftTypeId == null
        ? ""
        : String(row?.craft_type_id ?? row?.craftTypeId),
    craftType,
    gridJson: normalizeGridJson(row?.grid_json ?? row?.gridJson),
    createdAt: row?.created_at ?? row?.createdAt ?? null,
    updatedAt: row?.updated_at ?? row?.updatedAt ?? null,
  };
}

function buildPayload(row = {}) {
  return {
    key: String(row?.key ?? "").trim(),
    name: String(row?.name ?? "").trim(),
    display_name: String(row?.displayName ?? "").trim() || null,
    kind: String(row?.kind ?? "").trim() || null,
    craft_type_id:
      row?.craftTypeId == null || String(row.craftTypeId).trim() === ""
        ? null
        : Number(row.craftTypeId),
    grid_json: normalizeGridJson(row?.gridJson),
  };
}

function getErrorMessage(error, fallback) {
  const message = error?.response?.data?.message;
  if (message) return message;

  const errors = error?.response?.data?.errors;
  if (errors && typeof errors === "object") {
    const firstMessage = Object.values(errors).flat().find(Boolean);
    if (firstMessage) return String(firstMessage);
  }

  return fallback;
}

export async function fetchCraftProductTypes(q = "") {
  try {
    const response = await api.get(`${API_URL}/api/craft-product-types`, {
      params: String(q).trim() ? { q: String(q).trim() } : {},
    });

    const json = response.data;
    const rows = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.data?.data)
      ? json.data.data
      : Array.isArray(json)
      ? json
      : [];

    return rows.map(normalizeCraftProductType);
  } catch (error) {
    console.error(error);
    throw new Error(
      getErrorMessage(error, "職人作成タイプ一覧取得に失敗しました")
    );
  }
}

export async function fetchCraftProductType(id) {
  try {
    const response = await api.get(
      `${API_URL}/api/craft-product-types/${id}`
    );

    return normalizeCraftProductType(response.data?.data ?? response.data);
  } catch (error) {
    console.error(error);
    throw new Error(
      getErrorMessage(error, "職人作成タイプ詳細取得に失敗しました")
    );
  }
}

export async function createCraftProductType(data) {
  try {
    const response = await api.post(
      `${API_URL}/api/craft-product-types`,
      buildPayload(data)
    );

    return normalizeCraftProductType(response.data?.data ?? response.data);
  } catch (error) {
    console.error(error);
    throw new Error(
      getErrorMessage(error, "職人作成タイプの作成に失敗しました")
    );
  }
}

export async function updateCraftProductType(id, data) {
  try {
    const response = await api.put(
      `${API_URL}/api/craft-product-types/${id}`,
      buildPayload(data)
    );

    return normalizeCraftProductType(response.data?.data ?? response.data);
  } catch (error) {
    console.error(error);
    throw new Error(
      getErrorMessage(error, "職人作成タイプの更新に失敗しました")
    );
  }
}

export async function deleteCraftProductType(id) {
  try {
    const response = await api.delete(
      `${API_URL}/api/craft-product-types/${id}`
    );

    return response.data;
  } catch (error) {
    console.error(error);
    throw new Error(
      getErrorMessage(error, "職人作成タイプの削除に失敗しました")
    );
  }
}
