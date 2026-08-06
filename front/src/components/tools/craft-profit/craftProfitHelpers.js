"use client";

import { clamp0 } from "@/lib/money";
import { resolveEquipmentJobNames } from "@/lib/equipments";

export const SLOT_ORDER_MAP = {
  head: 1,
  upper: 2,
  lower: 3,
  arms: 4,
  feet: 5,
  face: 6,
  shield: 7,
  weapon: 8,
  other: 99,
};

const collatorJa = new Intl.Collator("ja");
const collatorEn = new Intl.Collator("en");

export const DEFAULT_FEE_RATE = 5;

const CRYSTAL_UNIT_PRICE = 3200;
const STANDARD_STAR0_PRICE_RATE = 0.7;
const STANDARD_STAR1_PRICE_RATE = 0.85;
const STANDARD_STAR2_PRICE_RATE = 1;

export const MATERIAL_OUTPUT_COUNTS = Object.freeze({
  star0: 1, // ☆なし
  star1: 2, // ☆1
  star2: 3, // ☆2
  star3: 10, // 大成功
});

export function isMaterialCraftProductType(value) {
  if (!value) return false;

  const craftProductType =
    value?.craftProductType ??
    value?.craft_product_type ??
    value;

  const kind = String(
    craftProductType?.kind ??
      value?.craftProductTypeKind ??
      value?.craft_product_type_kind ??
      ""
  )
    .trim()
    .toLowerCase();

  const key = String(
    craftProductType?.key ??
      value?.craftProductTypeKey ??
      value?.craft_product_type_key ??
      ""
  )
    .trim()
    .toLowerCase();

  const name = String(
    craftProductType?.name ??
      value?.craftProductTypeName ??
      value?.craft_product_type_name ??
      ""
  )
    .trim()
    .toLowerCase();

  const displayName = String(
    craftProductType?.displayName ??
      craftProductType?.display_name ??
      value?.craftProductTypeDisplayName ??
      value?.craft_product_type_display_name ??
      ""
  )
    .trim()
    .toLowerCase();

  return (
    ["material", "materials", "ingredient", "raw_material", "素材"].includes(kind) ||
    key === "material" ||
    key.startsWith("material_") ||
    key.endsWith("_material") ||
    key.includes("raw_material") ||
    name.includes("素材") ||
    displayName.includes("素材")
  );
}

export function getCraftProductOutputCounts(value) {
  if (!value) return null;

  const items =
    Array.isArray(value?.items) && value.items.length
      ? value.items
      : [value];

  return items.length > 0 && items.every(isMaterialCraftProductType)
    ? MATERIAL_OUTPUT_COUNTS
    : null;
}

export function isCrystalEligibleCraftProductType(value) {
  if (!value) return false;

  const items =
    Array.isArray(value?.items) && value.items.length
      ? value.items.filter(Boolean)
      : [];

  // セットの場合は、構成するすべての装備が結晶対象のときだけ対象にする。
  if (items.length) {
    return items.every(isCrystalEligibleCraftProductType);
  }

  const craftProductType =
    value?.craftProductType ??
    value?.craft_product_type ??
    value;

  const kind = String(
    craftProductType?.kind ??
      value?.craftProductTypeKind ??
      value?.craft_product_type_kind ??
      ""
  )
    .trim()
    .toLowerCase();

  const key = String(
    craftProductType?.key ??
      value?.craftProductTypeKey ??
      value?.craft_product_type_key ??
      ""
  )
    .trim()
    .toLowerCase();

  const groupKind = String(
    value?.groupKind ?? value?.group_kind ?? ""
  )
    .trim()
    .toLowerCase();

  const slotKey = normalizeSlotKey(
    value?.slotKey ?? value?.slot ?? ""
  );

  return (
    ["weapon", "armor", "shield"].includes(kind) ||
    ["weapon_set", "armor_set", "tailoring_set", "shield_set"].includes(
      groupKind
    ) ||
    key.startsWith("armor_") ||
    key.startsWith("tailoring_") ||
    key.startsWith("shield_") ||
    slotKey === "weapon" ||
    slotKey === "shield"
  );
}

export function normalizeGreatSuccessRate(value) {
  if (value === null || value === undefined || value === "") return null;

  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) return null;

  return rate;
}

export function calcGreatSuccessPriceRate(
  greatSuccessRate,
  feeRate = 0
) {
  const rate = normalizeGreatSuccessRate(greatSuccessRate);
  if (rate == null) return null;

  const successProbability = rate / 100;
  const netSaleRate = Math.max(0.01, 1 - Math.max(0, Number(feeRate) || 0));

  // 大成功品の期待手取りだけで原価を回収する販売倍率。
  // 固定の利益倍率は使わず、大成功率と販売手数料だけで逆算する。
  return 1 / (successProbability * netSaleRate);
}

const CRYSTAL_ITEM_DISCOUNT = 10000;
const BUYER_PROFIT_RATE = 0.2;
const MARKET_PRICE_ROUND_UNIT = 100;

function getCollator(locale = "ja") {
  return locale === "en" ? collatorEn : collatorJa;
}

function getSlotLabels(locale = "ja") {
  if (locale === "en") {
    return {
      head: "HEAD",
      upper: "UPPER",
      lower: "LOWER",
      arms: "ARMS",
      feet: "FEET",
      face: "FACE",
      shield: "SHIELD",
      weapon: "WEAPON",
      other: "OTHER",
    };
  }

  return {
    head: "頭",
    upper: "体上",
    lower: "体下",
    arms: "腕",
    feet: "足",
    face: "顔",
    shield: "盾",
    weapon: "武器",
    other: "その他",
  };
}

function getSlotKeyLabel(slotKey, locale = "ja") {
  const labels = getSlotLabels(locale);
  return labels[slotKey] ?? labels.other;
}

function getSlotShortLabel(slotKey, locale = "ja") {
  if (locale === "en") {
    return getSlotKeyLabel(slotKey, "en");
  }

  if (slotKey === "upper") return "上";
  if (slotKey === "lower") return "下";

  return getSlotKeyLabel(slotKey, "ja");
}

function getUnknownMaterialLabel(locale = "ja") {
  return locale === "en" ? "Unknown material" : "不明な素材";
}

function getToolFallbackLabel(index = 0, locale = "ja") {
  return locale === "en" ? `Tool ${index + 1}` : `道具${index + 1}`;
}

export function normalizeSlotKey(slot) {
  const text = String(slot ?? "").trim().toLowerCase();

  if (!text) return "other";

  if (
    text === "頭" ||
    text.includes("頭") ||
    text.includes("アタマ") ||
    text === "head"
  ) {
    return "head";
  }

  if (
    text === "体上" ||
    text === "上" ||
    text.includes("体上") ||
    text === "upper"
  ) {
    return "upper";
  }

  if (
    text === "体下" ||
    text === "下" ||
    text.includes("体下") ||
    text === "lower"
  ) {
    return "lower";
  }

  if (
    text === "腕" ||
    text.includes("腕") ||
    text.includes("ウデ") ||
    text === "arms"
  ) {
    return "arms";
  }

  if (text === "足" || text.includes("足") || text === "feet") {
    return "feet";
  }

  if (text === "顔" || text.includes("顔") || text === "face") return "face";
  if (text === "盾" || text.includes("盾") || text === "shield") return "shield";
  if (text === "武器" || text.includes("武器") || text === "weapon") return "weapon";

  return "other";
}

export function normalizeSlotName(slot, locale = "ja") {
  return getSlotKeyLabel(normalizeSlotKey(slot), locale);
}

export function getSlotOrder(slot) {
  return SLOT_ORDER_MAP[normalizeSlotKey(slot)] ?? 999;
}

export function sortSlots(slots = [], locale = "ja") {
  const collator = getCollator(locale);

  return [...slots].sort((a, b) => {
    const ia = getSlotOrder(a);
    const ib = getSlotOrder(b);

    if (ia !== ib) return ia - ib;
    return collator.compare(String(a ?? ""), String(b ?? ""));
  });
}

export function sortItemsBySlot(items = [], locale = "ja") {
  const collator = getCollator(locale);

  return [...items].sort((a, b) => {
    const ia = getSlotOrder(a?.slot);
    const ib = getSlotOrder(b?.slot);

    if (ia !== ib) return ia - ib;

    return collator.compare(String(a?.name ?? ""), String(b?.name ?? ""));
  });
}

export function formatSlotLabel(slot, locale = "ja") {
  return getSlotShortLabel(normalizeSlotKey(slot), locale);
}

export function safeJsonParse(value, fallback) {
  if (value == null || value === "") return fallback;

  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizeMaterial(raw) {
  if (!raw) return null;

  const itemId =
    raw.item_id ??
    raw.itemId ??
    raw.material_id ??
    raw.id ??
    null;

  const name =
    raw.name ??
    raw.material_name ??
    raw.item_name ??
    raw.label ??
    "";

  const qty =
    Number(raw.qty ?? raw.quantity ?? raw.count ?? raw.num ?? 0) || 0;

  const defaultUnitCost =
    Number(
      raw.defaultUnitCost ??
        raw.default_unit_cost ??
        raw.unitCost ??
        raw.unit_cost ??
        raw.price ??
        raw.buy_price ??
        raw.buyPrice ??
        0
    ) || 0;

  if (itemId == null && !name) return null;

  return {
    item_id: itemId == null || itemId === "" ? null : Number(itemId),
    name,
    qty,
    defaultUnitCost,
  };
}

function normalizeJobs(row) {
  return resolveEquipmentJobNames(row);
}

function toItemSummary(item) {
  return {
    id: item.id,
    name: item.name,
    nameKana: item.nameKana, // 追加

    slot: item.slot,
    slotKey: item.slotKey,

    materials: item.materials,
    slotGrid: item.slotGrid,
    jobs: item.jobs,
    greatSuccessRate: item.greatSuccessRate,

    jobOverrideMode: item.jobOverrideMode,
    jobOverrides: item.jobOverrides,
    equipmentType: item.equipmentType,
    equipmentTypeName: item.equipmentTypeName,
    craftProductType: item.craftProductType,
    craftProductTypeName: item.craftProductTypeName,
    craftProductTypeDisplayName: item.craftProductTypeDisplayName,
    craftProductTypeKey: item.craftProductTypeKey,
    craftProductTypeKind: item.craftProductTypeKind,

    craftLevel: item.craftLevel,
    equipLevel: item.equipLevel,
    recipeBook: item.recipeBook,
    recipePlace: item.recipePlace,
    description: item.description,
    craftMaterialTrait:
      item.craftMaterialTrait ?? item.fabricType ?? "",
    // 移行期間中の旧コンポーネント向け互換フィールド。
    fabricType:
      item.craftMaterialTrait ?? item.fabricType ?? "",

    maxHp: item.maxHp,
    maxMp: item.maxMp,
    attack: item.attack,
    defense: item.defense,
    charm: item.charm,
    agility: item.agility,
    dexterity: item.dexterity,
    magicAttack: item.magicAttack,
    healingPower: item.healingPower,
    weight: item.weight,

    effects: item.effects,
  };
}

export function normalizeEquipmentRow(row, itemMap = new Map(), locale = "ja") {
  const materials = safeJsonParse(
    row?.materialsJson ?? row?.materials_json ?? row?.materials,
    []
  );

  const slotGrid = safeJsonParse(
    row?.slotGridJson ?? row?.slot_grid_json,
    null
  );

  const effects = safeJsonParse(row?.effectsJson ?? row?.effects_json, []);

  const normalizedMaterials = Array.isArray(materials)
    ? materials
        .map(normalizeMaterial)
        .filter(Boolean)
        .map((material) => {
          const master = material.item_id
            ? itemMap.get(Number(material.item_id))
            : null;

          const masterName =
            locale === "en"
              ? String(master?.name_en ?? master?.nameEn ?? "").trim()
              : String(master?.name ?? "").trim();

          return {
            ...material,
            name:
              material.name ||
              masterName ||
              getUnknownMaterialLabel(locale),
            defaultUnitCost:
              material.defaultUnitCost ||
              Number(master?.buy_price ?? master?.buyPrice ?? 0) ||
              0,
          };
        })
    : [];

  const equipmentType = row?.equipmentType ?? row?.equipment_type ?? null;
  const craftProductType =
    row?.craftProductType ?? row?.craft_product_type ?? null;
  const craftProductTypeName = String(
    craftProductType?.name ??
      row?.craftProductTypeName ??
      row?.craft_product_type_name ??
      ""
  ).trim();
  const craftProductTypeDisplayName = String(
    craftProductType?.displayName ??
      craftProductType?.display_name ??
      row?.craftProductTypeDisplayName ??
      row?.craft_product_type_display_name ??
      craftProductTypeName
  ).trim();
  const craftProductTypeKey = String(
    craftProductType?.key ??
      row?.craftProductTypeKey ??
      row?.craft_product_type_key ??
      ""
  ).trim().toLowerCase();
  const craftProductTypeKind = String(
    craftProductType?.kind ??
      row?.craftProductTypeKind ??
      row?.craft_product_type_kind ??
      ""
  ).trim().toLowerCase();

  const rawSlotName =
    craftProductTypeDisplayName || craftProductTypeName || "other";
  const normalizedDisplaySlotKey = normalizeSlotKey(rawSlotName);
  const productSlotKey =
    normalizedDisplaySlotKey !== "other"
      ? normalizedDisplaySlotKey
      : craftProductTypeKind === "weapon"
      ? "weapon"
      : craftProductTypeKind === "shield" ||
        craftProductTypeKey.startsWith("shield_")
      ? "shield"
      : "other";

  const craftTypeData =
    craftProductType?.craftType ??
    craftProductType?.craft_type ??
    row?.craftType ??
    row?.craft_type ??
    null;
  const greatSuccessRate = normalizeGreatSuccessRate(
    craftTypeData?.greatSuccessRate ??
      craftTypeData?.great_success_rate ??
      row?.greatSuccessRate ??
      row?.great_success_rate
  );
  const jobOverrideMode =
    row?.jobOverrideMode ?? row?.job_override_mode ?? "inherit";
  const jobOverrides = row?.jobOverrides ?? row?.job_overrides ?? [];

  const normalizedRowForJobs = {
    ...row,
    equipmentType,
    jobOverrideMode,
    jobOverrides,
  };

  return {
    id:
      row?.itemId ??
      row?.item_id ??
      row?.groupId ??
      row?.group_id ??
      row?.itemName ??
      row?.item_name ??
      row?.id ??
      "",

    name: row?.itemName ?? row?.item_name ?? row?.name ?? "",
    nameKana: row?.itemNameKana ?? row?.item_name_kana ?? "", // 追加

    slotKey: productSlotKey,
    slot:
      locale === "ja" && craftProductTypeDisplayName
        ? craftProductTypeDisplayName
        : normalizeSlotName(productSlotKey, locale),

    craftType:
      (typeof craftTypeData === "object" ? craftTypeData?.name : craftTypeData) ??
      "",
    greatSuccessRate,

    craftLevel: Number(row?.craftLevel ?? row?.craft_level ?? 0) || null,
    equipLevel: Number(row?.equipLevel ?? row?.equip_level ?? 0) || null,

    recipeBook: row?.recipeBook ?? row?.recipe_book ?? "",
    recipePlace: row?.recipePlace ?? row?.recipe_place ?? "",
    description: row?.description ?? "",
    craftMaterialTrait: String(
      row?.craftMaterialTrait ??
        row?.craft_material_trait ??
        row?.fabricType ??
        row?.fabric_type ??
        ""
    ).trim(),
    // 旧名称を参照する箇所が残っていても表示が消えないようにする。
    fabricType: String(
      row?.craftMaterialTrait ??
        row?.craft_material_trait ??
        row?.fabricType ??
        row?.fabric_type ??
        ""
    ).trim(),

    maxHp: Number(row?.maxHp ?? row?.max_hp ?? 0) || 0,
    maxMp: Number(row?.maxMp ?? row?.max_mp ?? 0) || 0,
    attack: Number(row?.attack ?? 0) || 0,
    defense: Number(row?.defense ?? 0) || 0,
    charm: Number(row?.charm ?? 0) || 0,
    agility: Number(row?.agility ?? 0) || 0,
    dexterity: Number(row?.dexterity ?? 0) || 0,
    magicAttack: Number(row?.magicAttack ?? row?.magic_attack ?? 0) || 0,
    healingPower:
      Number(row?.healingPower ?? row?.healing_power ?? 0) || 0,
    weight: Number(row?.weight ?? 0) || 0,

    materials: normalizedMaterials,
    slotGrid,
    jobs: normalizeJobs(normalizedRowForJobs),

    jobOverrideMode,
    jobOverrides,
    equipmentType,
    equipmentTypeName: String(
      equipmentType?.name ?? row?.equipmentTypeName ?? row?.equipment_type_name ?? ""
    ).trim(),
    craftProductType,
    craftProductTypeName,
    craftProductTypeDisplayName,
    craftProductTypeKey,
    craftProductTypeKind,

    groupId:
      row?.groupId ??
      row?.group_id ??
      row?.itemId ??
      row?.item_id ??
      row?.itemName ??
      row?.item_name ??
      row?.id ??
      "",

    groupName:
      row?.groupName ??
      row?.group_name ??
      row?.itemName ??
      row?.item_name ??
      row?.name ??
      "",

    groupKind: row?.groupKind ?? row?.group_kind ?? "",
    itemsCount: Number(row?.itemsCount ?? row?.items_count ?? 0) || 0,

    sourceUrl: row?.sourceUrl ?? row?.source_url ?? "",
    detailUrl: row?.detailUrl ?? row?.detail_url ?? "",
    effects: Array.isArray(effects) ? effects : [],
  };
}

export function buildSetsFromEquipments(rows, itemMap = new Map(), locale = "ja") {
  const normalized = (rows || []).map((row) =>
    normalizeEquipmentRow(row, itemMap, locale)
  );

  const groups = new Map();
  const singles = [];

  for (const item of normalized) {
    const isGroup =
      String(item.groupKind || "").endsWith("_set") ||
      (item.itemsCount || 0) > 1;

    if (!isGroup) {
      singles.push({
        ...item,
        items: [toItemSummary(item)],
      });
      continue;
    }

    const key = item.groupId || item.id || item.name;
    const current = groups.get(key) || {
      id: key,
      name: item.groupName || item.name,
      craftType: item.craftType,
      greatSuccessRate: item.greatSuccessRate,
      craftLevel: item.craftLevel,
      equipLevel: item.equipLevel,
      recipeBook: item.recipeBook,
      recipePlace: item.recipePlace,
      groupKind: item.groupKind,
      itemsCount: item.itemsCount,
      jobs: [],
      items: [],
    };

    current.items.push(toItemSummary(item));
    current.jobs = Array.from(new Set([...current.jobs, ...(item.jobs || [])]));

    if (!current.craftType && item.craftType) current.craftType = item.craftType;
    if (current.greatSuccessRate == null && item.greatSuccessRate != null) {
      current.greatSuccessRate = item.greatSuccessRate;
    }
    if (!current.craftLevel && item.craftLevel) current.craftLevel = item.craftLevel;
    if (!current.equipLevel && item.equipLevel) current.equipLevel = item.equipLevel;
    if (!current.recipeBook && item.recipeBook) current.recipeBook = item.recipeBook;
    if (!current.recipePlace && item.recipePlace) current.recipePlace = item.recipePlace;

    groups.set(key, current);
  }

  const grouped = Array.from(groups.values()).map((group) => {
    group.items = sortItemsBySlot(group.items, locale);
    return group;
  });

  const collator = getCollator(locale);

  return [...grouped, ...singles].sort((a, b) =>
    collator.compare(String(a?.name ?? ""), String(b?.name ?? ""))
  );
}

export function defaultStarPrices(setObj) {
  return (
    setObj?.starPrices ?? {
      star0: 0,
      star1: 20000,
      star2: 70000,
      star3: 150000,
    }
  );
}

function roundMarketPrice(value) {
  const safeValue = Math.max(0, Number(value) || 0);
  return Math.round(safeValue / MARKET_PRICE_ROUND_UNIT) * MARKET_PRICE_ROUND_UNIT;
}

function roundUnitPrice(value) {
  const safeValue = Math.max(0, Number(value) || 0);
  return Math.ceil(safeValue);
}

function buildCrystalValues(crystalByEquipLevel) {
  if (!crystalByEquipLevel) return null;

  return {
    star0:
      Math.max(0, Number(crystalByEquipLevel.plus0) || 0) *
      CRYSTAL_UNIT_PRICE,
    star1:
      Math.max(0, Number(crystalByEquipLevel.plus1) || 0) *
      CRYSTAL_UNIT_PRICE,
    star2:
      Math.max(0, Number(crystalByEquipLevel.plus2) || 0) *
      CRYSTAL_UNIT_PRICE,
    star3:
      Math.max(0, Number(crystalByEquipLevel.plus3) || 0) *
      CRYSTAL_UNIT_PRICE,
  };
}

export function isCrystalEquipment({
  costPerItem,
  crystalByEquipLevel,
  craftProductType = null,
}) {
  // 結晶装備として扱うのは、武器・防具・盾だけ。
  if (!isCrystalEligibleCraftProductType(craftProductType)) {
    return false;
  }

  const crystalValues = buildCrystalValues(crystalByEquipLevel);
  if (!crystalValues) return false;

  const cost = Math.max(0, Number(costPerItem) || 0);

  // 原価が★3で取れる結晶価値以下なら結晶装備。
  return cost <= crystalValues.star3;
}

export function calcRecommendedStarPrices({
  costPerItem,
  crystalByEquipLevel,
  craftProductType = null,
  outputCounts = null,
  greatSuccessRate,
  feeRate = 0,
}) {
  const cost = Math.max(0, Number(costPerItem) || 0);
  const crystalEligible =
    isCrystalEligibleCraftProductType(craftProductType);
  const crystalValues = crystalEligible
    ? buildCrystalValues(crystalByEquipLevel)
    : null;
  const greatSuccessPriceRate = calcGreatSuccessPriceRate(
    greatSuccessRate,
    feeRate
  );

  if (outputCounts) {
    if (greatSuccessPriceRate == null) return null;
    // 「素材」タイプだけ、品質によって完成個数が変わる。
    // 大成功時の完成個数と大成功率から、期待手取りが
    // 1回の作成原価と等しくなる1個あたりの単価を逆算する。
    const greatSuccessCount = Math.max(
      1,
      Number(outputCounts.star3) || 1
    );
    const unitPrice = roundUnitPrice(
      (cost * greatSuccessPriceRate) / greatSuccessCount
    );

    // 売られるアイテムは同じなので、結果にかかわらず単価は共通。
    // 損益計算時に完成個数を掛けて総売上へ戻す。
    return {
      star0: unitPrice,
      star1: unitPrice,
      star2: unitPrice,
      star3: unitPrice,
      unitPrice,
    };
  }

  const crystalEquipment = isCrystalEquipment({
    costPerItem: cost,
    crystalByEquipLevel,
    craftProductType,
  });

  if (crystalEquipment) {
    // 結晶装備だけ、購入者が20%利益を取れる価格にする。
    const buyerPriceRate = 1 + BUYER_PROFIT_RATE;

    return {
      star0: roundMarketPrice(crystalValues.star0 / buyerPriceRate),
      star1: roundMarketPrice(crystalValues.star1 / buyerPriceRate),
      star2: roundMarketPrice(crystalValues.star2 / buyerPriceRate),
      star3: roundMarketPrice(crystalValues.star3 / buyerPriceRate),
    };
  }

  // 通常商材は大成功率がなければ販売目安を決められない。
  if (greatSuccessPriceRate == null) return null;

  if (!crystalValues) {
    return {
      star0: roundMarketPrice(cost * STANDARD_STAR0_PRICE_RATE),
      star1: roundMarketPrice(cost * STANDARD_STAR1_PRICE_RATE),
      star2: roundMarketPrice(cost * STANDARD_STAR2_PRICE_RATE),
      star3: roundMarketPrice(cost * greatSuccessPriceRate),
    };
  }

  // 結晶対象の武器・防具・盾だが、結晶装備価格に当てはまらない場合。
  return {
    star0: roundMarketPrice(crystalValues.star0 - CRYSTAL_ITEM_DISCOUNT),
    star1: roundMarketPrice(crystalValues.star1 - CRYSTAL_ITEM_DISCOUNT),
    star2: roundMarketPrice(crystalValues.star2 - CRYSTAL_ITEM_DISCOUNT),
    star3: roundMarketPrice(cost * greatSuccessPriceRate),
  };
}

export function normalizeSlots(items) {
  const slots = Array.from(
    new Set(
      (items || []).map((item) =>
        normalizeSlotKey(item.slotKey ?? item.slot ?? "other")
      )
    )
  );

  return [...slots].sort((a, b) => {
    const ia = SLOT_ORDER_MAP[a] ?? 999;
    const ib = SLOT_ORDER_MAP[b] ?? 999;
    return ia - ib;
  });
}

function isCraftToolSet(selectedSet) {
  return (
    String(selectedSet?.groupKind ?? selectedSet?.group_kind ?? "") ===
    "craft_tool_set"
  );
}

function shouldUseItemAxis(selectedSet, normalizedItems) {
  const groupKind = String(
    selectedSet?.groupKind ?? selectedSet?.group_kind ?? ""
  );

  return (
    isCraftToolSet(selectedSet) ||
    normalizedItems.length > 1 ||
    groupKind.endsWith("_set")
  );
}

function getItemAxisBaseKey(item, index, prefix = "item") {
  return String(
    item?.id ??
      item?.itemId ??
      item?.item_id ??
      item?.equipmentId ??
      item?.equipment_id ??
      item?.name ??
      `${prefix}_${index}`
  );
}

function buildItemAxisKeys(items, prefix = "item") {
  const used = new Set();

  return items.map((item, index) => {
    const baseKey = getItemAxisBaseKey(item, index, prefix);
    let key = baseKey;
    let suffix = 2;

    while (used.has(key)) {
      key = `${baseKey}__${suffix}`;
      suffix += 1;
    }

    used.add(key);
    return key;
  });
}

function getAxisMeta(selectedSet, normalizedItems, locale = "ja") {
  if (shouldUseItemAxis(selectedSet, normalizedItems)) {
    const axisKeys = buildItemAxisKeys(
      normalizedItems,
      isCraftToolSet(selectedSet) ? "tool" : "equipment"
    );
    const slotCounts = normalizedItems.reduce((result, item) => {
      const slotKey = normalizeSlotKey(item.slotKey ?? item.slot ?? "other");
      result[slotKey] = (result[slotKey] || 0) + 1;
      return result;
    }, {});
    const duplicateIndexes = {};
    const axisMeta = {};

    normalizedItems.forEach((item, index) => {
      const key = axisKeys[index];
      const slotKey = normalizeSlotKey(item.slotKey ?? item.slot ?? "other");
      const slotLabel = getSlotKeyLabel(slotKey, locale);
      const duplicateSlot = Number(slotCounts[slotKey] || 0) > 1;
      const duplicateIndex = (duplicateIndexes[slotKey] || 0) + 1;
      duplicateIndexes[slotKey] = duplicateIndex;

      const craftProductDisplayName = String(
        item?.craftProductTypeDisplayName ??
          item?.craft_product_type_display_name ??
          item?.craftProductType?.displayName ??
          item?.craftProductType?.display_name ??
          item?.craft_product_type?.display_name ??
          ""
      ).trim();

      const productLabel =
        locale === "ja" && craftProductDisplayName
          ? craftProductDisplayName
          : slotLabel;

      const fallbackLabel = isCraftToolSet(selectedSet)
        ? getToolFallbackLabel(index, locale)
        : `${productLabel}${duplicateSlot ? duplicateIndex : ""}`;
      const itemName = String(item?.name ?? "").trim() || fallbackLabel;
      const displayLabel =
        isCraftToolSet(selectedSet) || duplicateSlot ? itemName : productLabel;

      axisMeta[key] = {
        key,
        shortLabel: displayLabel,
        label: displayLabel,
        itemName,
        slot: slotLabel,
        slotKey,
        duplicateSlot,
        duplicateIndex,
      };
    });

    return { axisKeys, axisMeta, mode: "item" };
  }

  const axisKeys = normalizeSlots(normalizedItems);
  const axisMeta = {};

  axisKeys.forEach((slotKey) => {
    const item = normalizedItems.find(
      (x) => normalizeSlotKey(x.slotKey ?? x.slot ?? "other") === slotKey
    );

    axisMeta[slotKey] = {
      key: slotKey,
      shortLabel: getSlotShortLabel(slotKey, locale),
      label: getSlotKeyLabel(slotKey, locale),
      itemName: item?.name ?? null,
      slot: getSlotKeyLabel(slotKey, locale),
      slotKey,
      duplicateSlot: false,
      duplicateIndex: 1,
    };
  });

  return { axisKeys, axisMeta, mode: "slot" };
}

export function buildMatrix(selectedSet, locale = "ja") {
  if (!selectedSet) {
    return {
      slots: [],
      rows: [],
      slotGrids: {},
      slotGridMeta: {},
    };
  }

  const normalizedItems =
    Array.isArray(selectedSet.items) && selectedSet.items.length
      ? selectedSet.items.map((item) => ({
          ...item,
          slotKey: normalizeSlotKey(item.slotKey ?? item.slot ?? "other"),
          slot: normalizeSlotName(item.slotKey ?? item.slot ?? "other", locale),
        }))
      : Array.isArray(selectedSet.materials) || selectedSet.slotGrid
      ? [
          {
            id: selectedSet.id,
            name: selectedSet.name,
            slotKey: normalizeSlotKey(selectedSet.slotKey ?? selectedSet.slot ?? "other"),
            slot: normalizeSlotName(selectedSet.slotKey ?? selectedSet.slot ?? "other", locale),
            materials: Array.isArray(selectedSet.materials)
              ? selectedSet.materials
              : [],
            slotGrid: selectedSet.slotGrid,
          },
        ]
      : [];

  const { axisKeys, axisMeta, mode } = getAxisMeta(
    selectedSet,
    normalizedItems,
    locale
  );
  const materialMap = new Map();
  const slotGrids = {};
  const slotGridMeta = {};

  normalizedItems.forEach((item, index) => {
    const axisKey =
      mode === "item"
        ? axisKeys[index]
        : normalizeSlotKey(item.slotKey ?? item.slot ?? "other");

    for (const material of item.materials || []) {
      const key = `${material.item_id ?? "noid"}::${material.name}`;
      const current = materialMap.get(key) || {
        materialKey: key,
        itemId: material.item_id ?? null,
        materialName: material.name,
        perSlotQty: {},
        totalQty: 0,
        defaultUnitCost: 0,
      };

      const qty = Number(material.qty || 0);
      current.perSlotQty[axisKey] = (current.perSlotQty[axisKey] || 0) + qty;
      current.totalQty += qty;

      if (!current.defaultUnitCost && material.defaultUnitCost != null) {
        current.defaultUnitCost = Number(material.defaultUnitCost);
      }

      materialMap.set(key, current);
    }

    if (item.slotGrid) {
      slotGrids[axisKey] = item.slotGrid;
      slotGridMeta[axisKey] = axisMeta[axisKey];
    }
  });

  const collator = getCollator(locale);

  const rows = Array.from(materialMap.values()).sort((a, b) =>
    collator.compare(
      String(a?.materialName ?? ""),
      String(b?.materialName ?? "")
    )
  );

  return {
    slots: axisKeys,
    rows,
    slotGrids,
    slotGridMeta,
  };
}

export function getSlotItemName(selectedSet, slot) {
  if (!selectedSet) return null;

  if (Array.isArray(selectedSet.items)) {
    const items = selectedSet.items;
    const axisKeys = buildItemAxisKeys(
      items,
      isCraftToolSet(selectedSet) ? "tool" : "equipment"
    );
    const exactIndex = axisKeys.findIndex(
      (axisKey) => String(axisKey) === String(slot)
    );

    if (exactIndex >= 0) {
      return items[exactIndex]?.name ?? null;
    }

    const exactItem = items.find((item) => {
      const ids = [
        item?.id,
        item?.itemId,
        item?.item_id,
        item?.equipmentId,
        item?.equipment_id,
      ];

      return ids.some(
        (value) => value != null && String(value) === String(slot)
      );
    });

    if (exactItem) return exactItem.name ?? null;

    const normalizedSlotKey = normalizeSlotKey(slot);
    const item = items.find(
      (it) => normalizeSlotKey(it.slotKey ?? it.slot) === normalizedSlotKey
    );
    return item?.name ?? null;
  }

  if (
    normalizeSlotKey(selectedSet.slotKey ?? selectedSet.slot) ===
    normalizeSlotKey(slot)
  ) {
    return selectedSet.name;
  }

  return null;
}

export function recommendFromP3(
  p3,
  locale = "ja",
  resultMode = "star"
) {
  if (p3 == null) {
    return {
      label: "—",
      tone: "text-slate-700 dark:text-slate-200",
      sub: "",
    };
  }

  const isMaterialOutput = resultMode === "materialOutput";
  const subText =
    locale === "en"
      ? isMaterialOutput
        ? {
            high: "Profitable with little or no great success",
            recommended: "A few great successes should keep profit",
            average: "Needs a fair amount of great success",
            tough: "Profit depends heavily on great-success results",
            bad: "Too many great successes are needed for profit",
          }
        : {
            high: "Profitable even without 3★",
            recommended: "A few 3★ results should keep profit",
            average: "Needs a fair amount of 3★",
            tough: "Profit depends heavily on 3★ luck",
            bad: "Too many 3★ results are needed for profit",
          }
      : isMaterialOutput
      ? {
          high: "大成功がほぼなくても黒字",
          recommended: "大成功が少し出れば黒字",
          average: "大成功がそこそこ必要",
          tough: "大成功の結果にかなり依存",
          bad: "大成功が多くないと黒字にならない",
        }
      : {
          high: "★★★なしでも黒字",
          recommended: "★★★が少し出れば黒字",
          average: "★★★がそこそこ必要",
          tough: "★★★運にかなり依存",
          bad: "★3が多すぎないと黒字にならない",
        };

  if (p3 <= 10) {
    return {
      label: locale === "en" ? "Highly Recommended" : "超おすすめ",
      tone: "text-emerald-700 dark:text-emerald-300",
      sub: subText.high,
    };
  }

  if (p3 <= 25) {
    return {
      label: locale === "en" ? "Recommended" : "おすすめ",
      tone: "text-emerald-700 dark:text-emerald-300",
      sub: subText.recommended,
    };
  }

  if (p3 <= 40) {
    return {
      label: locale === "en" ? "Average" : "普通",
      tone: "text-amber-700 dark:text-amber-300",
      sub: subText.average,
    };
  }

  if (p3 <= 60) {
    return {
      label: locale === "en" ? "Tough" : "厳しめ",
      tone: "text-rose-700 dark:text-rose-300",
      sub: subText.tough,
    };
  }

  return {
    label: locale === "en" ? "Not Recommended" : "非推奨",
    tone: "text-rose-700 dark:text-rose-300",
    sub: subText.bad,
  };
}

export function calcMinRatesToBreakEven({
  feeRate,
  costPerItem,
  starPrice,
  outputCounts = null,
  stepPercent = 1,
  locale = "ja",
}) {
  const rate = Math.max(0, Number(feeRate) || 0);
  const net = (price, outputKey) => {
    const unitNet = Math.max(0, Number(price) || 0) * (1 - rate);
    const outputCount =
      outputCounts == null
        ? 1
        : Math.max(0, Number(outputCounts?.[outputKey]) || 0);

    return unitNet * outputCount;
  };

  const net0 = net(starPrice.star0, "star0");
  const net1 = net(starPrice.star1, "star1");
  const net2 = net(starPrice.star2, "star2");
  const net3 = net(starPrice.star3, "star3");

  const cost = Math.max(0, Number(costPerItem) || 0);

  if (cost === 0) return { ok: true, p3: 0, p2: 0, p1: 100, p0: 0 };
  if (net1 >= cost) return { ok: true, p3: 0, p2: 0, p1: 100, p0: 0 };

  if (net3 < cost) {
    return {
      ok: true,
      impossible: true,
      p3: 100,
      p2: 0,
      p1: 0,
      p0: 0,
      note:
        locale === "en"
          ? outputCounts
            ? "Even 100% great success will not make profit"
            : "Even 100% 3★ will not make profit"
          : outputCounts
          ? "大成功100%でも黒字にならない"
          : "100%★3でも黒字にならない",
    };
  }

  const p0 = 0;

  for (let p3 = 0; p3 <= 100 - p0; p3 += stepPercent) {
    for (let p2 = 0; p2 <= 100 - p0 - p3; p2 += stepPercent) {
      const p1 = 100 - p0 - p3 - p2;
      const expectedNet =
        (p0 / 100) * net0 +
        (p1 / 100) * net1 +
        (p2 / 100) * net2 +
        (p3 / 100) * net3;

      if (expectedNet >= cost) {
        return { ok: true, p3, p2, p1, p0 };
      }
    }
  }

  return {
    ok: false,
    reason: locale === "en" ? "Not found by search" : "探索で見つからなかった",
  };
}

export function buildInitialUnitCostMap(setObj, locale = "ja") {
  const initialMap = {};
  const { rows } = buildMatrix(setObj, locale);

  for (const row of rows) {
    initialMap[row.materialKey] = row.defaultUnitCost || 0;
  }

  return initialMap;
}

export function resolveCrystalByEquipLevel(level, crystalRules = []) {
  const numericLevel = Number(level || 0);
  if (!numericLevel) return null;

  const rules = Array.isArray(crystalRules) ? crystalRules : [];

  const rule = rules.find((row) => {
    const min =
      Number(row?.min_level ?? row?.minLevel ?? row?.min ?? 0) || 0;
    const max =
      Number(row?.max_level ?? row?.maxLevel ?? row?.max ?? 0) || 0;

    return numericLevel >= min && numericLevel <= max;
  });

  if (!rule) return null;

  return {
    plus0: Number(rule?.plus0 ?? rule?.values?.plus0 ?? 0) || 0,
    plus1: Number(rule?.plus1 ?? rule?.values?.plus1 ?? 0) || 0,
    plus2: Number(rule?.plus2 ?? rule?.values?.plus2 ?? 0) || 0,
    plus3: Number(rule?.plus3 ?? rule?.values?.plus3 ?? 0) || 0,
  };
}

export function getCrystalInfo(selectedSet, crystalRules = []) {
  const level =
    Number(selectedSet?.equipLevel ?? 0) ||
    Number(selectedSet?.items?.[0]?.equipLevel ?? 0);

  if (!level) return null;

  return resolveCrystalByEquipLevel(level, crystalRules);
}

export function getDisplayJobs(selectedSet) {
  const names = new Set();

  if (Array.isArray(selectedSet?.jobs)) {
    for (const job of selectedSet.jobs) {
      if (typeof job === "string" && job.trim()) {
        names.add(job.trim());
      } else if (job?.name) {
        names.add(String(job.name).trim());
      }
    }
  }

  const items = selectedSet?.items ?? [];

  for (const item of items) {
    if (Array.isArray(item?.jobs)) {
      for (const job of item.jobs) {
        if (typeof job === "string" && job.trim()) {
          names.add(job.trim());
        } else if (job?.name) {
          names.add(String(job.name).trim());
        }
      }
    }

    if (Array.isArray(item?.jobOverrides)) {
      for (const override of item.jobOverrides) {
        if (override?.mode === "deny") continue;

        const name =
          override?.name ??
          override?.gameJob?.name ??
          override?.game_job?.name ??
          "";

        if (name) {
          names.add(String(name).trim());
        }
      }
    }
  }

  return Array.from(names);
}

export function calcMaterialCost(rows, unitCostMap) {
  return rows.reduce((sum, row) => {
    const unit = clamp0(unitCostMap[row.materialKey] ?? 0);
    return sum + clamp0(row.totalQty) * unit;
  }, 0);
}

export function calcSlotTotals(rows, slots, unitCostMap) {
  const amount = {};

  for (const slot of slots) {
    amount[slot] = 0;
  }

  for (const row of rows) {
    const unit = clamp0(unitCostMap[row.materialKey] ?? 0);

    for (const slot of slots) {
      const qty = Number(row.perSlotQty[slot] || 0);
      amount[slot] += qty * unit;
    }
  }

  return { amount };
}