/**
 * 販売目安価格の設定・計算をまとめたファイル。
 *
 * 通常商材、素材、結晶装備、職人道具の価格調整は、
 * 原則としてこの PRICE_ADJUSTMENT_CONFIG だけを変更する。
 */
export const PRICE_ADJUSTMENT_CONFIG = Object.freeze({
  defaultFeeRate: 5,
  // 販売目安価格は桁数に応じて、残す上位桁数を切り替える。
  // 5桁以下は上2桁、6桁以上は上3桁を残し、下位桁を切り上げる。
  priceRounding: Object.freeze({
    fiveDigitsOrLessSignificantDigits: 2,
    sixDigitsOrMoreSignificantDigits: 3,
  }),

  // 通常商材の★0〜★2価格。★3は大成功率と手数料から逆算する。
  standard: Object.freeze({
    star0PriceRate: 0.7,
    star1PriceRate: 0.85,
    star2PriceRate: 1,
  }),

  // 素材タイプの品質別完成個数。
  materialOutputCounts: Object.freeze({
    star0: 1,
    star1: 2,
    star2: 3,
    star3: 10,
  }),

  // 大成功価格の計算で、手数料控除後の倍率が0以下にならないための下限。
  greatSuccess: Object.freeze({
    minimumNetSaleRate: 0.01,
  }),

  // 結晶関連の価格調整。
  crystal: Object.freeze({
    unitPrice: 3200,

    // 結晶装備の購入者側に残す利益率。
    // 0.2なら「結晶価値 ÷ 1.2」を販売目安にする。
    buyerProfitRate: 0.2,

    // 高原価の武器・防具・盾で、★0〜★2を結晶価値から値引く金額。
    itemDiscount: 10000,
  }),

  // 道具鍛冶で作る職人道具の価格調整。
  craftTool: Object.freeze({
    // ★3価格がこの範囲で上がるほど、★2上限を下げる。
    star3LowPrice: 250000,
    star3HighPrice: 700000,

    // ★3が安い場合と高い場合の★2上限。
    star2LowPriceCap: 160000,
    star2HighPriceCap: 140000,

    // 1より大きいほど、安い価格帯では緩やかに、高額帯で強く下げる。
    star2CurvePower: 1.15,

    // ★1・★0は、補正後の★2価格を基準に計算する。
    star1RateFromStar2: 0.45,
    star0RateFromStar2: 0.2,
  }),
});

// 既存コードからのimportを維持するための互換export。
export const DEFAULT_FEE_RATE = PRICE_ADJUSTMENT_CONFIG.defaultFeeRate;
export const MATERIAL_OUTPUT_COUNTS =
  PRICE_ADJUSTMENT_CONFIG.materialOutputCounts;
export const CRAFT_TOOL_PRICE_CONFIG = PRICE_ADJUSTMENT_CONFIG.craftTool;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function readCraftProductType(value) {
  return value?.craftProductType ?? value?.craft_product_type ?? value ?? null;
}

function normalizePricingSlotKey(slot) {
  const text = normalizeText(slot);

  if (!text) return "other";

  if (
    text === "武器" ||
    text.includes("武器") ||
    text === "weapon"
  ) {
    return "weapon";
  }

  if (
    text === "盾" ||
    text.includes("盾") ||
    text === "shield"
  ) {
    return "shield";
  }

  return "other";
}

/**
 * 金額の桁数に応じて上位桁を残し、下位桁を切り上げる。
 *
 * 5桁以下は上2桁、6桁以上は上3桁を残す。
 * 25,000G    → 25,000G
 * 25,200G    → 26,000G
 * 252,000G   → 252,000G
 * 252,345G   → 253,000G
 * 2,523,456G → 2,530,000G
 */
export function roundMarketPrice(
  value,
  config = PRICE_ADJUSTMENT_CONFIG
) {
  const safeValue = Math.max(0, Number(value) || 0);
  if (safeValue === 0) return 0;

  const integerDigits = Math.floor(Math.log10(safeValue)) + 1;
  const configuredSignificantDigits =
    integerDigits <= 5
      ? config.priceRounding?.fiveDigitsOrLessSignificantDigits
      : config.priceRounding?.sixDigitsOrMoreSignificantDigits;

  const significantDigits = Math.min(
    integerDigits,
    Math.max(1, Math.trunc(Number(configuredSignificantDigits) || 1))
  );
  const roundedDigitCount = Math.max(0, integerDigits - significantDigits);
  const roundUnit = 10 ** roundedDigitCount;

  return Math.ceil(safeValue / roundUnit) * roundUnit;
}

function roundUnitPrice(
  value,
  config = PRICE_ADJUSTMENT_CONFIG
) {
  // 素材タイプの1個あたり販売目安も、他の販売価格と同じ単位で切り上げる。
  return roundMarketPrice(value, config);
}

export function isMaterialCraftProductType(value) {
  if (!value) return false;

  const craftProductType = readCraftProductType(value);
  const kind = normalizeText(
    craftProductType?.kind ??
      value?.craftProductTypeKind ??
      value?.craft_product_type_kind
  );
  const key = normalizeText(
    craftProductType?.key ??
      value?.craftProductTypeKey ??
      value?.craft_product_type_key
  );
  const name = normalizeText(
    craftProductType?.name ??
      value?.craftProductTypeName ??
      value?.craft_product_type_name
  );
  const displayName = normalizeText(
    craftProductType?.displayName ??
      craftProductType?.display_name ??
      value?.craftProductTypeDisplayName ??
      value?.craft_product_type_display_name
  );

  return (
    ["material", "materials", "ingredient", "raw_material", "素材"].includes(
      kind
    ) ||
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

/**
 * 結晶価格を使う武器・防具・盾かどうかを判定する。
 */
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

  const craftProductType = readCraftProductType(value);
  const kind = normalizeText(
    craftProductType?.kind ??
      value?.craftProductTypeKind ??
      value?.craft_product_type_kind
  );
  const key = normalizeText(
    craftProductType?.key ??
      value?.craftProductTypeKey ??
      value?.craft_product_type_key
  );
  const groupKind = normalizeText(
    value?.groupKind ?? value?.group_kind
  );
  const slotKey = normalizePricingSlotKey(
    value?.slotKey ?? value?.slot
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
  feeRate = 0,
  config = PRICE_ADJUSTMENT_CONFIG
) {
  const rate = normalizeGreatSuccessRate(greatSuccessRate);
  if (rate == null) return null;

  const successProbability = rate / 100;
  const minimumNetSaleRate = Math.max(
    0.0001,
    Number(config.greatSuccess?.minimumNetSaleRate) || 0.01
  );
  const netSaleRate = Math.max(
    minimumNetSaleRate,
    1 - Math.max(0, Number(feeRate) || 0)
  );

  // 大成功品の期待手取りだけで原価を回収する販売倍率。
  return 1 / (successProbability * netSaleRate);
}

export function buildCrystalValues(
  crystalByEquipLevel,
  config = PRICE_ADJUSTMENT_CONFIG
) {
  if (!crystalByEquipLevel) return null;

  const crystalUnitPrice = Math.max(
    0,
    Number(config.crystal?.unitPrice) || 0
  );

  return {
    star0:
      Math.max(0, Number(crystalByEquipLevel.plus0) || 0) *
      crystalUnitPrice,
    star1:
      Math.max(0, Number(crystalByEquipLevel.plus1) || 0) *
      crystalUnitPrice,
    star2:
      Math.max(0, Number(crystalByEquipLevel.plus2) || 0) *
      crystalUnitPrice,
    star3:
      Math.max(0, Number(crystalByEquipLevel.plus3) || 0) *
      crystalUnitPrice,
  };
}

export function isCrystalEquipment({
  costPerItem,
  crystalByEquipLevel,
  craftProductType = null,
  config = PRICE_ADJUSTMENT_CONFIG,
}) {
  if (!isCrystalEligibleCraftProductType(craftProductType)) {
    return false;
  }

  const crystalValues = buildCrystalValues(crystalByEquipLevel, config);
  if (!crystalValues) return false;

  const cost = Math.max(0, Number(costPerItem) || 0);

  // 原価が★3で取れる結晶価値以下なら結晶装備。
  return cost <= crystalValues.star3;
}

/**
 * 道具鍛冶で作る職人道具かどうかを判定する。
 */
export function isCraftToolProductType(value) {
  if (!value) return false;

  const items = Array.isArray(value?.items)
    ? value.items.filter(Boolean)
    : [];

  if (items.length > 0) {
    return items.every(isCraftToolProductType);
  }

  const craftProductType = readCraftProductType(value);
  const kind = normalizeText(
    craftProductType?.kind ??
      value?.craftProductTypeKind ??
      value?.craft_product_type_kind
  );
  const key = normalizeText(
    craftProductType?.key ??
      value?.craftProductTypeKey ??
      value?.craft_product_type_key
  );
  const name = normalizeText(
    craftProductType?.name ??
      value?.craftProductTypeName ??
      value?.craft_product_type_name
  );
  const displayName = normalizeText(
    craftProductType?.displayName ??
      craftProductType?.display_name ??
      value?.craftProductTypeDisplayName ??
      value?.craft_product_type_display_name
  );
  const groupKind = normalizeText(
    value?.groupKind ?? value?.group_kind
  );
  const combinedName = `${name} ${displayName}`;

  return (
    ["tool", "craft_tool", "craft-tool", "crafttool"].includes(kind) ||
    groupKind === "craft_tool_set" ||
    key.startsWith("tool_") ||
    combinedName.includes("職人道具") ||
    combinedName.includes("さいほう針") ||
    combinedName.includes("木工刀") ||
    combinedName.includes("錬金ランプ") ||
    combinedName.includes("錬金ツボ") ||
    combinedName.includes("フライパン") ||
    combinedName.includes("鍛冶ハンマー")
  );
}

export function calcCraftToolStar2Cap(
  star3Price,
  config = PRICE_ADJUSTMENT_CONFIG
) {
  const toolConfig = config.craftTool ?? CRAFT_TOOL_PRICE_CONFIG;
  const lowPrice = Math.max(0, Number(toolConfig.star3LowPrice) || 0);
  const highPrice = Math.max(
    lowPrice + 1,
    Number(toolConfig.star3HighPrice) || lowPrice + 1
  );
  const lowCap = Math.max(0, Number(toolConfig.star2LowPriceCap) || 0);
  const highCap = Math.max(0, Number(toolConfig.star2HighPriceCap) || 0);
  const curvePower = Math.max(
    0.01,
    Number(toolConfig.star2CurvePower) || 1
  );
  const linearProgress = clamp(
    (Math.max(0, Number(star3Price) || 0) - lowPrice) /
      (highPrice - lowPrice),
    0,
    1
  );
  const curvedProgress = Math.pow(linearProgress, curvePower);

  return lowCap + (highCap - lowCap) * curvedProgress;
}

export function calcCraftToolRecommendedPrices({
  cost,
  star3Price,
  config = PRICE_ADJUSTMENT_CONFIG,
}) {
  const safeCost = Math.max(0, Number(cost) || 0);
  const safeStar3Price = Math.max(0, Number(star3Price) || 0);
  const toolConfig = config.craftTool ?? CRAFT_TOOL_PRICE_CONFIG;
  const star2Cap = calcCraftToolStar2Cap(safeStar3Price, config);
  const star2 = roundMarketPrice(
    Math.min(safeCost, star2Cap),
    config
  );
  const star1 = roundMarketPrice(
    star2 * Math.max(0, Number(toolConfig.star1RateFromStar2) || 0),
    config
  );
  const star0 = roundMarketPrice(
    star2 * Math.max(0, Number(toolConfig.star0RateFromStar2) || 0),
    config
  );

  return {
    star0,
    star1,
    star2,
    star3: roundMarketPrice(safeStar3Price, config),
  };
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

/**
 * 全商品の販売目安価格を計算する入口。
 * 価格に関する調整は PRICE_ADJUSTMENT_CONFIG に集約している。
 */
export function calcRecommendedStarPrices({
  costPerItem,
  crystalByEquipLevel,
  craftProductType = null,
  outputCounts = null,
  greatSuccessRate,
  feeRate = 0,
  config = PRICE_ADJUSTMENT_CONFIG,
}) {
  const cost = Math.max(0, Number(costPerItem) || 0);
  const crystalEligible =
    isCrystalEligibleCraftProductType(craftProductType);
  const crystalValues = crystalEligible
    ? buildCrystalValues(crystalByEquipLevel, config)
    : null;
  const greatSuccessPriceRate = calcGreatSuccessPriceRate(
    greatSuccessRate,
    feeRate,
    config
  );

  // 素材タイプだけ、品質によって完成個数が変わる。
  if (outputCounts) {
    if (greatSuccessPriceRate == null) return null;

    const greatSuccessCount = Math.max(
      1,
      Number(outputCounts.star3) || 1
    );
    const unitPrice = roundUnitPrice(
      (cost * greatSuccessPriceRate) / greatSuccessCount,
      config
    );

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
    config,
  });

  // 結晶装備は、購入者側の利益を残した結晶価値を販売目安にする。
  if (crystalEquipment) {
    const buyerPriceRate =
      1 + Math.max(0, Number(config.crystal?.buyerProfitRate) || 0);

    return {
      star0: roundMarketPrice(crystalValues.star0 / buyerPriceRate, config),
      star1: roundMarketPrice(crystalValues.star1 / buyerPriceRate, config),
      star2: roundMarketPrice(crystalValues.star2 / buyerPriceRate, config),
      star3: roundMarketPrice(crystalValues.star3 / buyerPriceRate, config),
    };
  }

  // 通常商材は大成功率がなければ販売目安を決められない。
  if (greatSuccessPriceRate == null) return null;

  const star3Price = cost * greatSuccessPriceRate;

  // 職人道具だけ、★3価格が高くなるほど★2以下を強く値下げする。
  if (isCraftToolProductType(craftProductType)) {
    return calcCraftToolRecommendedPrices({
      cost,
      star3Price,
      config,
    });
  }

  // 結晶対象ではない通常商材。
  if (!crystalValues) {
    return {
      star0: roundMarketPrice(
        cost * Math.max(0, Number(config.standard?.star0PriceRate) || 0),
        config
      ),
      star1: roundMarketPrice(
        cost * Math.max(0, Number(config.standard?.star1PriceRate) || 0),
        config
      ),
      star2: roundMarketPrice(
        cost * Math.max(0, Number(config.standard?.star2PriceRate) || 0),
        config
      ),
      star3: roundMarketPrice(star3Price, config),
    };
  }

  // 結晶対象の武器・防具・盾だが、結晶装備価格に当てはまらない場合。
  const crystalItemDiscount = Math.max(
    0,
    Number(config.crystal?.itemDiscount) || 0
  );

  return {
    star0: roundMarketPrice(
      crystalValues.star0 - crystalItemDiscount,
      config
    ),
    star1: roundMarketPrice(
      crystalValues.star1 - crystalItemDiscount,
      config
    ),
    star2: roundMarketPrice(
      crystalValues.star2 - crystalItemDiscount,
      config
    ),
    star3: roundMarketPrice(star3Price, config),
  };
}
