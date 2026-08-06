"use client";

import { useEffect, useState } from "react";

export const DROP_SEARCH_MIN_LENGTH = 2;

export const UNKNOWN_MONSTER_DISPLAY_ORDER = Number.MAX_SAFE_INTEGER;

export function normalizeMonsterDisplayOrder(value) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0
    ? number
    : null;
}

export function mergeMonsterRows(previous = {}, rows = []) {
  const next = { ...previous };

  for (const row of Array.isArray(rows) ? rows : []) {
    const id = Number(row?.id ?? row?.monster_id);
    if (!id) continue;

    const existing = next[id] ?? {};
    const isSeedRow = row?.__spawnSeed === true;

    // 出現情報は仮データとして扱う。
    // モンスター一覧・詳細が先に取得済みなら、仮データで上書きしない。
    const merged = isSeedRow
      ? { ...row, ...existing }
      : { ...existing, ...row };

    const incomingOrder = normalizeMonsterDisplayOrder(
      row?.display_order ?? row?.monster_display_order
    );
    const existingOrder = normalizeMonsterDisplayOrder(
      existing?.display_order ?? existing?.monster_no
    );

    const monsterName =
      normalizeText(merged?.monster_name) ||
      normalizeText(merged?.name) ||
      normalizeText(existing?.monster_name) ||
      normalizeText(existing?.name);

    delete merged.__spawnSeed;

    next[id] = {
      ...merged,
      id,
      display_order:
        isSeedRow && existingOrder !== null
          ? existingOrder
          : incomingOrder ?? existingOrder ?? UNKNOWN_MONSTER_DISPLAY_ORDER,
      name: monsterName,
      monster_name: monsterName,
    };
  }

  return next;
}

export function buildMonsterSeedsFromSpawns(spawns = []) {
  const rows = [];
  const seen = new Set();

  for (const spawn of Array.isArray(spawns) ? spawns : []) {
    const id = Number(spawn?.monster_id);
    if (!id || seen.has(id)) continue;

    const displayOrder = normalizeMonsterDisplayOrder(
      spawn?.monster_display_order
    );

    seen.add(id);
    rows.push({
      __spawnSeed: true,
      id,
      name: spawn?.monster_name ?? "",
      monster_name: spawn?.monster_name ?? "",
      system_type: spawn?.system_type ?? "",
      system_type_en: spawn?.system_type_en ?? "",
      ...(displayOrder !== null ? { display_order: displayOrder } : {}),
      is_reincarnated: Boolean(spawn?.is_reincarnated),
      reincarnation_parent_id: spawn?.reincarnation_parent_id ?? null,
    });
  }

  return rows;
}

export function getMatchedDropName(monster = {}) {
  const matchedName = normalizeText(monster?.matched_name);
  if (matchedName) return matchedName;

  const matchText = normalizeText(monster?.match_text);
  if (matchText.includes(":")) {
    return normalizeText(matchText.split(":").slice(1).join(":"));
  }

  return matchText || normalizeText(monster?.name);
}

export function buildDropSuggestions(monsters = []) {
  const unique = new Map();

  for (const monster of Array.isArray(monsters) ? monsters : []) {
    const label = getMatchedDropName(monster);
    if (!label || unique.has(label)) continue;

    unique.set(label, {
      label,
      searchText: [
        label,
        normalizeText(monster?.matched_name_kana),
        normalizeText(monster?.name_kana),
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  return Array.from(unique.values()).slice(0, 12);
}

export function uniqBy(array, keyGetter) {
  const map = new Map();

  for (const item of array) {
    const key = keyGetter(item);
    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

export function normalizeText(value) {
  return String(value ?? "").trim();
}

export function parseAreaList(area) {
  if (!area) return [];

  if (Array.isArray(area)) return area;

  if (typeof area === "string") {
    try {
      const parsed = JSON.parse(area);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      return area
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
  }

  return [];
}

export function sortJa(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), "ja");
}

export function compareSpawnsByMonsterDisplayOrder(a, b, monstersById = {}) {
  const aMonster = monstersById?.[a?.monster_id] ?? {};
  const bMonster = monstersById?.[b?.monster_id] ?? {};

  const aOrder =
    normalizeMonsterDisplayOrder(
      aMonster?.display_order ??
        aMonster?.monster_no ??
        a?.monster_display_order
    ) ?? UNKNOWN_MONSTER_DISPLAY_ORDER;
  const bOrder =
    normalizeMonsterDisplayOrder(
      bMonster?.display_order ??
        bMonster?.monster_no ??
        b?.monster_display_order
    ) ?? UNKNOWN_MONSTER_DISPLAY_ORDER;

  if (aOrder !== bOrder) return aOrder - bOrder;

  const nameDiff = sortJa(
    getDisplayValue(aMonster, ["monster_name", "name"], a?.monster_name ?? ""),
    getDisplayValue(bMonster, ["monster_name", "name"], b?.monster_name ?? "")
  );

  if (nameDiff !== 0) return nameDiff;

  const idDiff = Number(a?.monster_id ?? 0) - Number(b?.monster_id ?? 0);
  if (idDiff !== 0) return idDiff;

  return Number(a?.id ?? 0) - Number(b?.id ?? 0);
}

export function useIsMobile(breakpoint = 1200) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleResize() {
      setIsMobile(window.innerWidth < breakpoint);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [breakpoint]);

  return isMobile;
}

export function isBrowsableMapType(mapType) {
  const value = normalizeText(mapType).toLowerCase();

  return (
    value === "field" ||
    value === "dungeon" ||
    value === "フィールド" ||
    value === "ダンジョン"
  );
}

export function getRelatedMonsterIds(targetMonsterId, monsters = {}) {
  const ids = new Set();

  if (!targetMonsterId) return ids;

  const selected = monsters[targetMonsterId];
  const selectedId = Number(targetMonsterId);

  ids.add(selectedId);

  if (selected?.reincarnation_parent_id) {
    ids.add(Number(selected.reincarnation_parent_id));
  }

  for (const monster of Object.values(monsters)) {
    if (!monster?.id) continue;

    const monsterId = Number(monster.id);
    const parentId = Number(monster.reincarnation_parent_id);

    if (parentId && parentId === selectedId) {
      ids.add(monsterId);
    }

    if (
      selected?.reincarnation_parent_id &&
      parentId === Number(selected.reincarnation_parent_id)
    ) {
      ids.add(monsterId);
    }
  }

  return ids;
}

export function getDisplayValue(row, keys = [], fallback = "") {
  if (!row) return fallback;

  for (const key of keys) {
    const value = normalizeText(row?.[key]);
    if (value) return value;
  }

  return fallback;
}

export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}
