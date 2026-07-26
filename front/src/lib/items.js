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

function normalizeDropMonster(row = {}, index = 0) {
  return {
    id: row?.id ?? null,
    monster_id: row?.monster_id ?? row?.monsterId ?? row?.monster?.id ?? null,
    monsterId: row?.monsterId ?? row?.monster_id ?? row?.monster?.id ?? null,
    drop_type: row?.drop_type ?? row?.dropType ?? "normal",
    dropType: row?.dropType ?? row?.drop_type ?? "normal",
    sort_order: row?.sort_order ?? row?.sortOrder ?? index + 1,
    sortOrder: row?.sortOrder ?? row?.sort_order ?? index + 1,
    monster: row?.monster ?? null,
  };
}

function normalizeDropMonsters(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => normalizeDropMonster(row, index));
}

export function createEmptyItemForm() {
  return {
    id: null,
    name: "",
    name_kana: "",
    name_en: "",
    buy_price: "",
    sell_price: "",
    category: "",
    drop_monsters: [],
  };
}

export function normalizeItemForm(row = {}) {
  const item = normalizeItem(row);

  return {
    ...createEmptyItemForm(),
    id: item.id,
    name: item.name,
    name_kana: item.name_kana,
    name_en: item.name_en,
    buy_price: item.buy_price == null ? "" : item.buy_price,
    sell_price: item.sell_price == null ? "" : item.sell_price,
    category: item.category,
    drop_monsters: item.drop_monsters,
  };
}

export function buildItemPayload(form = {}) {
  return {
    name: String(form.name ?? "").trim(),
    name_kana: String(form.name_kana ?? "").trim() || null,
    name_en: String(form.name_en ?? "").trim() || null,
    buy_price:
      form.buy_price === "" || form.buy_price == null
        ? null
        : Number(form.buy_price),
    sell_price:
      form.sell_price === "" || form.sell_price == null
        ? null
        : Number(form.sell_price),
    category: String(form.category ?? "").trim() || null,
    drop_monsters: Array.isArray(form.drop_monsters)
      ? form.drop_monsters.map((row, index) => ({
          id: row.id ?? null,
          monster_id: row.monster_id,
          drop_type: row.drop_type === "rare" ? "rare" : "normal",
          sort_order: index + 1,
        }))
      : [],
  };
}

function normalizeItem(row = {}) {
  const dropMonsters = normalizeDropMonsters(
    row?.drop_monsters ??
      row?.monster_drops ??
      row?.dropMonsters ??
      row?.monsterDrops ??
      []
  );

  return {
    id: row?.id ?? null,

    name: row?.name ?? "",
    nameKana: row?.name_kana ?? row?.nameKana ?? "",
    name_kana: row?.name_kana ?? row?.nameKana ?? "",
    nameEn: row?.name_en ?? row?.nameEn ?? "",
    name_en: row?.name_en ?? row?.nameEn ?? "",

    buy_price: row?.buy_price ?? row?.buyPrice ?? null,
    buyPrice: row?.buyPrice ?? row?.buy_price ?? null,

    sell_price: row?.sell_price ?? row?.sellPrice ?? null,
    sellPrice: row?.sellPrice ?? row?.sell_price ?? null,

    category: row?.category ?? "",

    created_at: row?.created_at ?? row?.createdAt ?? null,
    createdAt: row?.createdAt ?? row?.created_at ?? null,

    updated_at: row?.updated_at ?? row?.updatedAt ?? null,
    updatedAt: row?.updatedAt ?? row?.updated_at ?? null,

    drop_monsters: dropMonsters,
    monster_drops: dropMonsters,
    dropMonsters: dropMonsters,
    monsterDrops: dropMonsters,
  };
}

function extractItemList(json) {
  if (Array.isArray(json?.data)) return json.data.map(normalizeItem);
  if (Array.isArray(json?.data?.data)) return json.data.data.map(normalizeItem);
  return [];
}

export async function fetchItems(q = "", category = "") {
  try {
    const params = {};

    if (q) params.q = q;
    if (category) params.category = category;

    const res = await api.get(`${API_URL}/api/items`, { params });

    return extractItemList(res.data);
  } catch (error) {
    console.error(error);
    throw new Error("アイテム一覧取得失敗");
  }
}

export async function fetchItemsByIds(ids = [], locale = "ja") {
  try {
    const safeIds = Array.from(
      new Set(
        (Array.isArray(ids) ? ids : [])
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )
    );

    if (safeIds.length === 0) return [];

    const res = await api.get(`${API_URL}/api/items`, {
      params: { ids: safeIds.join(",") },
    });

    const json = res.data;

    const rows = Array.isArray(json)
      ? json.map(normalizeItem)
      : Array.isArray(json?.data)
      ? json.data.map(normalizeItem)
      : Array.isArray(json?.data?.data)
      ? json.data.data.map(normalizeItem)
      : [];

    return rows.map((item) => {
      const localizedName =
        locale === "en"
          ? String(item.nameEn ?? item.name_en ?? "").trim()
          : item.name ?? "";

      return {
        ...item,
        name: localizedName,
      };
    });
  } catch (error) {
    console.error(error);
    throw new Error("アイテム一括取得失敗");
  }
}

export async function fetchItem(id) {
  try {
    const res = await api.get(`${API_URL}/api/items/${id}`);
    return normalizeItem(res.data?.data ?? res.data);
  } catch (error) {
    console.error(error);
    throw new Error("アイテム取得失敗");
  }
}

export async function createItem(data) {
  try {
    const res = await api.post(`${API_URL}/api/items`, data);
    return normalizeItem(res.data?.data ?? res.data);
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("アイテム作成失敗");
  }
}

export async function updateItem(id, data) {
  try {
    const res = await api.put(`${API_URL}/api/items/${id}`, data);
    return normalizeItem(res.data?.data ?? res.data);
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("アイテム更新失敗");
  }
}

export async function deleteItem(id) {
  try {
    const res = await api.delete(`${API_URL}/api/items/${id}`);
    return res.data;
  } catch (error) {
    console.error(error);

    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }

    throw new Error("アイテム削除失敗");
  }
}

export async function updateMaterialPrices() {
  try {
    const res = await api.post(
      `${API_URL}/api/admin/items/update-market-prices`,
      {},
      {
        timeout: 120000,
      }
    );

    return res.data;
  } catch (error) {
    console.error("updateMaterialPrices error:", error);

    if (error?.code === "ECONNABORTED") {
      throw new Error("価格取得がタイムアウトしました");
    }

    if (error?.response?.status === 401) {
      throw new Error("ログインが必要です");
    }

    if (error?.response?.status === 403) {
      throw new Error(
        error?.response?.data?.message ||
          "管理者だけが素材価格を更新できます"
      );
    }

    if (error?.response?.status === 409) {
      throw new Error(
        error?.response?.data?.message ||
          "別の価格更新処理が実行中です"
      );
    }

    throw new Error(
      error?.response?.data?.message ||
        error?.response?.data?.error ||
        "素材価格の更新に失敗しました"
    );
  }
}
