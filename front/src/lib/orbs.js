import axios from "axios";

function getApiUrl() {
  const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
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

export const ORB_COLORS = ["炎", "水", "風", "光", "闇"];

function normalizeDropMonsters(rows) {
  if (!Array.isArray(rows)) return [];

  return rows.map((item, index) => ({
    id: item?.id ?? null,
    monster_id: item?.monster_id ?? null,
    drop_type: "orb",
    sort_order: item?.sort_order || index + 1,
    monster: item?.monster ?? null,
  }));
}

export function createEmptyOrbForm() {
  return {
    id: null,
    name: "",
    name_kana: "",
    name_en: "",
    color: "",
    effect: "",
    drop_monsters: [],
  };
}

export function normalizeOrb(row = {}) {
  const dropMonsters = normalizeDropMonsters(
    row?.drop_monsters ?? row?.dropMonsters
  );

  return {
    id: row?.id ?? null,
    name: row?.name ?? "",
    name_kana: row?.name_kana ?? row?.nameKana ?? "",
    name_en: row?.name_en ?? row?.nameEn ?? "",
    color: row?.color ?? "",
    effect: row?.effect ?? "",
    created_at: row?.created_at ?? row?.createdAt ?? null,
    updated_at: row?.updated_at ?? row?.updatedAt ?? null,
    drop_monsters: dropMonsters,
  };
}

export function normalizeOrbForm(row = {}) {
  const orb = normalizeOrb(row);

  return {
    ...createEmptyOrbForm(),
    id: orb.id,
    name: orb.name,
    name_kana: orb.name_kana,
    name_en: orb.name_en,
    color: orb.color,
    effect: orb.effect,
    drop_monsters: orb.drop_monsters,
  };
}

export function buildOrbPayload(form = {}) {
  return {
    name: String(form?.name ?? "").trim(),
    name_kana: String(form?.name_kana ?? "").trim() || null,
    name_en: String(form?.name_en ?? "").trim() || null,
    color: String(form?.color ?? "").trim() || null,
    effect: String(form?.effect ?? "").trim() || null,
    drop_monsters: normalizeDropMonsters(form?.drop_monsters).map(
      (row, index) => ({
        id: row.id,
        monster_id: row.monster_id,
        drop_type: "orb",
        sort_order: index + 1,
      })
    ),
  };
}

/*
--------------------------------
オーブ一覧
--------------------------------
*/
export async function fetchOrbs(q = "", color = "") {
  try {
    const params = {};

    if (q) params.q = q;
    if (color) params.color = color;

    const res = await api.get("/api/orbs", { params });

    const json = res.data;

    const rows = Array.isArray(json)
      ? json
      : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.data?.data)
          ? json.data.data
          : [];

    return rows.map(normalizeOrb);
  } catch (error) {
    console.error(error);
    throw new Error("オーブ一覧取得失敗");
  }
}

/*
--------------------------------
オーブ1件
--------------------------------
*/
export async function fetchOrb(id) {
  try {
    const res = await api.get(`/api/orbs/${id}`);
    return normalizeOrb(res.data.data);
  } catch (error) {
    console.error(error);
    throw new Error("オーブ取得失敗");
  }
}

/*
--------------------------------
作成
--------------------------------
*/
export async function createOrb(data) {
  try {
    const res = await api.post("/api/orbs", data);
    return normalizeOrb(res.data.data);
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("オーブ作成失敗");
  }
}

/*
--------------------------------
更新
--------------------------------
*/
export async function updateOrb(id, data) {
  try {
    const res = await api.put(`/api/orbs/${id}`, data);
    return normalizeOrb(res.data.data);
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("オーブ更新失敗");
  }
}

/*
--------------------------------
削除
--------------------------------
*/
export async function deleteOrb(id) {
  try {
    const res = await api.delete(`/api/orbs/${id}`);
    return res.data;
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("オーブ削除失敗");
  }
}

/*
--------------------------------
モンスター検索
--------------------------------
*/
export async function searchMonsters(keyword = "") {
  try {
    const res = await api.get("/api/monsters/search", {
      params: { q: keyword },
    });

    return Array.isArray(res.data?.data) ? res.data.data : [];
  } catch (error) {
    console.error(error);
    throw new Error("モンスター検索失敗");
  }
}
