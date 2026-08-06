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

export function createEmptyCraftType() {
  return {
    id: null,
    key: "",
    name: "",
    greatSuccessRate: "",
    createdAt: null,
    updatedAt: null,
  };
}

function normalizeCraftType(row = {}) {
  return {
    id: row?.id ?? null,
    key: row?.key ?? "",
    name: row?.name ?? "",
    greatSuccessRate:
      row?.great_success_rate == null || row?.great_success_rate === ""
        ? null
        : Number(row.great_success_rate),
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

function toPayload(data = {}) {
  return {
    key: String(data.key ?? "").trim(),
    name: String(data.name ?? "").trim(),
    great_success_rate:
      data.greatSuccessRate == null || data.greatSuccessRate === ""
        ? null
        : Number(data.greatSuccessRate),
  };
}

export async function fetchCraftTypes(q = "") {
  try {
    const res = await api.get(`${API_URL}/api/craft-types`, {
      params: q ? { q } : {},
    });

    const json = res.data;

    if (Array.isArray(json?.data)) {
      return json.data.map(normalizeCraftType);
    }

    if (Array.isArray(json?.data?.data)) {
      return json.data.data.map(normalizeCraftType);
    }

    return [];
  } catch (error) {
    console.error(error);
    throw new Error("職人種別一覧取得失敗");
  }
}

export async function fetchCraftType(id) {
  try {
    const res = await api.get(`${API_URL}/api/craft-types/${id}`);
    return normalizeCraftType(res.data?.data ?? res.data);
  } catch (error) {
    console.error(error);
    throw new Error("職人種別取得失敗");
  }
}

export async function createCraftType(data) {
  try {
    const res = await api.post(`${API_URL}/api/craft-types`, toPayload(data));
    return normalizeCraftType(res.data?.data ?? res.data);
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("職人種別作成失敗");
  }
}

export async function updateCraftType(id, data) {
  try {
    const res = await api.put(
      `${API_URL}/api/craft-types/${id}`,
      toPayload(data)
    );

    return normalizeCraftType(res.data?.data ?? res.data);
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("職人種別更新失敗");
  }
}

export async function deleteCraftType(id) {
  try {
    const res = await api.delete(`${API_URL}/api/craft-types/${id}`);
    return res.data;
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("職人種別削除失敗");
  }
}