export const JOB_OVERRIDE_MODE_OPTIONS = ["inherit", "add", "replace"];

export const GROUP_KIND_OPTIONS = [
  "armor_set",
  "tailoring_set",
  "shield_set",
  "weapon_set",
  "craft_tool_set",
  "other_set",
  "single",
];

export const GROUP_MEMBER_PRESETS = {
  armor_set: [
    { key: "head", label: "鎧頭", craftProductTypeKey: "armor_head" },
    { key: "bodyTop", label: "鎧上", craftProductTypeKey: "armor_upper" },
    { key: "bodyBottom", label: "鎧下", craftProductTypeKey: "armor_lower" },
    { key: "arm", label: "鎧腕", craftProductTypeKey: "armor_arms" },
    { key: "foot", label: "鎧足", craftProductTypeKey: "armor_feet" },
  ],
  tailoring_set: [
    { key: "head", label: "裁縫頭", craftProductTypeKey: "tailoring_head" },
    { key: "bodyTop", label: "裁縫上", craftProductTypeKey: "tailoring_upper" },
    { key: "bodyBottom", label: "裁縫下", craftProductTypeKey: "tailoring_lower" },
    { key: "arm", label: "裁縫腕", craftProductTypeKey: "tailoring_arms" },
    { key: "foot", label: "裁縫足", craftProductTypeKey: "tailoring_feet" },
  ],
  shield_set: [
    { key: "shield", label: "盾", craftProductTypeKey: "shield_small" },
  ],
  weapon_set: [
    { key: "weapon", label: "武器", craftProductTypeKey: "" },
  ],
  other_set: [],
  craft_tool_set: [
    {
      key: "needle",
      label: "さいほう針",
      craftProductTypeKey: "tool_sewing_needle",
    },
    {
      key: "wood",
      label: "木工刀",
      craftProductTypeKey: "tool_woodworking_knife",
    },
    {
      key: "lamp",
      label: "錬金ランプ",
      craftProductTypeKey: "tool_alchemy_lamp",
    },
    {
      key: "pot",
      label: "錬金ツボ",
      craftProductTypeKey: "tool_alchemy_pot",
    },
    {
      key: "pan",
      label: "フライパン",
      craftProductTypeKey: "tool_frying_pan",
    },
    {
      key: "hammer",
      label: "鍛冶ハンマー",
      craftProductTypeKey: "tool_hammer",
    },
  ],
};

export function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function str(value) {
  return value == null ? "" : String(value);
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

export function makeKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `k_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function slugify(text) {
  return str(text)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
}

export function getCraftProductType(row) {
  return row?.craftProductType ?? row?.craft_product_type ?? null;
}

export function getCraftProductTypeName(row) {
  const craftProductType = getCraftProductType(row);
  return str(craftProductType?.name).trim();
}

export function getCraftTypeFromProductType(craftProductType) {
  return (
    craftProductType?.craftType ??
    craftProductType?.craft_type ??
    null
  );
}

export function getCraftTypeIdFromProductType(craftProductType) {
  const craftType = getCraftTypeFromProductType(craftProductType);

  return str(
    craftProductType?.craftTypeId ??
      craftProductType?.craft_type_id ??
      craftType?.id
  ).trim();
}

export function getCraftTypeNameFromProductType(craftProductType) {
  const craftType = getCraftTypeFromProductType(craftProductType);

  return str(
    craftProductType?.craftTypeName ??
      craftProductType?.craft_type_name ??
      craftType?.name
  ).trim();
}

export function buildCraftTypeOptions(craftProductTypes = []) {
  const map = new Map();

  (Array.isArray(craftProductTypes) ? craftProductTypes : []).forEach((type) => {
    const id = getCraftTypeIdFromProductType(type);
    if (!id) return;

    const name = getCraftTypeNameFromProductType(type) || `#${id}`;

    if (!map.has(id)) {
      map.set(id, { id, name });
    }
  });

  return Array.from(map.values()).sort((a, b) =>
    str(a.name).localeCompare(str(b.name), "ja")
  );
}

export function filterCraftProductTypesByCraftType(
  craftProductTypes = [],
  craftTypeId = ""
) {
  const targetId = str(craftTypeId).trim();
  if (!targetId) return [];

  return (Array.isArray(craftProductTypes) ? craftProductTypes : []).filter(
    (type) => getCraftTypeIdFromProductType(type) === targetId
  );
}

export function getCraftProductGrid(craftProductTypeLike) {
  const craftProductType =
    craftProductTypeLike?.craftProductType ??
    craftProductTypeLike?.craft_product_type ??
    craftProductTypeLike ??
    null;

  const raw = craftProductType?.gridJson ?? craftProductType?.grid_json ?? null;
  const parsed = safeJsonParse(raw, null);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const rows = Number(parsed.rows ?? 0);
  const cols = Number(parsed.cols ?? 0);
  const disabledCells = Array.isArray(parsed.disabledCells)
    ? parsed.disabledCells
    : Array.isArray(parsed.disabled_cells)
    ? parsed.disabled_cells
    : [];

  if (!Number.isFinite(rows) || rows <= 0 || !Number.isFinite(cols) || cols <= 0) {
    return null;
  }

  return {
    rows,
    cols,
    disabledCells: disabledCells
      .filter((cell) => Array.isArray(cell) && cell.length >= 2)
      .map((cell) => [Number(cell[0]), Number(cell[1])]),
  };
}

export function isDisabledCraftProductCell(craftProductType, rowIndex, colIndex) {
  const preset = getCraftProductGrid(craftProductType);
  if (!preset) return false;

  return preset.disabledCells.some(
    ([row, col]) => row === rowIndex && col === colIndex
  );
}

export function normalizeGrid(gridLike, colsHint = 0) {
  if (!gridLike) return { grid: [], rows: 0, cols: colsHint };

  if (Array.isArray(gridLike) && gridLike.every((item) => Array.isArray(item))) {
    const rows = gridLike.length;
    const cols = Math.max(
      colsHint,
      ...gridLike.map((row) => (Array.isArray(row) ? row.length : 0)),
      0
    );

    return {
      grid: Array.from({ length: rows }, (_, rowIndex) =>
        Array.from(
          { length: cols },
          (_, colIndex) => gridLike?.[rowIndex]?.[colIndex] ?? ""
        )
      ),
      rows,
      cols,
    };
  }

  if (Array.isArray(gridLike)) {
    const cols = Math.max(colsHint, gridLike.length, 0);

    return {
      grid: [Array.from({ length: cols }, (_, index) => gridLike?.[index] ?? "")],
      rows: 1,
      cols,
    };
  }

  return { grid: [], rows: 0, cols: colsHint };
}

export function ensureGridSize(currentGrid, rowsCount, colsCount) {
  return Array.from({ length: rowsCount }, (_, rowIndex) =>
    Array.from(
      { length: colsCount },
      (_, colIndex) => currentGrid?.[rowIndex]?.[colIndex] ?? ""
    )
  );
}

export function denormalizeGrid(grid2d) {
  if (!Array.isArray(grid2d) || grid2d.length === 0) return null;

  const rows = grid2d.length;
  const cols = Math.max(...grid2d.map((row) => row.length), 0);
  const normalized = grid2d.map((row) =>
    Array.from({ length: cols }, (_, index) => row?.[index] ?? "")
  );

  return rows === 1 ? normalized[0] : normalized;
}

export function getGroupDisplayName(row) {
  return str(row?.groupName).trim() || str(row?.itemName).trim();
}

export function buildGroupedRows(rows) {
  const map = new Map();
  const counts = new Map();

  for (const row of rows) {
    const groupId = str(row?.groupId).trim();
    if (!groupId) continue;
    counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  }

  for (const row of rows) {
    const groupId = str(row?.groupId).trim();
    const grouped = groupId && (counts.get(groupId) ?? 0) > 1;
    const craftProductTypeName = getCraftProductTypeName(row);

    if (!grouped) {
      map.set(`single:${row.__key}`, {
        __kind: "single",
        __key: row.__key,
        label: row.itemName,
        searchText: [
          row.itemName,
          row.groupName,
          craftProductTypeName,
          row.recipeBook,
          row.recipePlace,
          row.equipmentTypeName,
        ]
          .filter(Boolean)
          .join(" "),
        row,
      });
      continue;
    }

    const existing =
      map.get(`group:${groupId}`) ??
      {
        __kind: "group",
        __key: `group:${groupId}`,
        groupId,
        label: getGroupDisplayName(row),
        groupKind: row.groupKind,
        rows: [],
        items: [],
        searchText: "",
      };

    existing.rows.push(row);
    existing.items.push({
      __key: row.__key,
      itemName: row.itemName,
      craftProductTypeName,
    });

    existing.searchText = [
      existing.label,
      existing.groupKind,
      ...existing.items.map(
        (item) => `${item.itemName} ${item.craftProductTypeName}`
      ),
    ]
      .filter(Boolean)
      .join(" ");

    map.set(`group:${groupId}`, existing);
  }

  return Array.from(map.values());
}

export function buildEmptyGroupMembers(groupKind) {
  const preset = GROUP_MEMBER_PRESETS[groupKind] ?? [];

  return preset.map((item) => ({
    key: item.key,
    enabled: true,
    slotLabel: item.label,
    craftProductTypeKey: item.craftProductTypeKey,
    craftProductTypeId: "",
    itemName: item.label,
  }));
}

export function makeGroupId(groupName) {
  return slugify(groupName);
}

export function getDefaultGroupItemName(groupName, productTypeLabel) {
  return `${str(groupName).trim()}${str(productTypeLabel).trim()}`.trim();
}

export function findEquipmentTypeById(equipmentTypes = [], equipmentTypeId) {
  return (
    equipmentTypes.find(
      (type) => String(type.id) === String(equipmentTypeId ?? "")
    ) ?? null
  );
}

export function findCraftProductTypeById(
  craftProductTypes = [],
  craftProductTypeId
) {
  return (
    craftProductTypes.find(
      (type) => String(type.id) === String(craftProductTypeId ?? "")
    ) ?? null
  );
}

export function findCraftProductTypeByKey(craftProductTypes = [], key) {
  const normalizedKey = str(key).trim();

  return (
    craftProductTypes.find(
      (type) => str(type?.key).trim() === normalizedKey
    ) ?? null
  );
}

export function getCraftProductPartKey(craftProductTypeLike) {
  const type =
    craftProductTypeLike?.craftProductType ??
    craftProductTypeLike?.craft_product_type ??
    craftProductTypeLike ??
    null;
  const key = str(type?.key).trim();

  const map = {
    armor_head: "head",
    tailoring_head: "head",
    armor_upper: "body_top",
    tailoring_upper: "body_top",
    armor_lower: "body_bottom",
    tailoring_lower: "body_bottom",
    armor_arms: "arm",
    tailoring_arms: "arm",
    armor_feet: "foot",
    tailoring_feet: "foot",
  };

  return map[key] ?? "";
}

export function isArmorCraftProductType(craftProductTypeLike) {
  const type =
    craftProductTypeLike?.craftProductType ??
    craftProductTypeLike?.craft_product_type ??
    craftProductTypeLike ??
    null;
  const key = str(type?.key).trim();

  return key.startsWith("armor_") || key.startsWith("tailoring_");
}
