"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { clamp0 } from "@/lib/money";
import { fetchItemsByIds } from "@/lib/items";
import {
  fetchCraftTools,
  fetchEquipmentSelection,
  fetchEquipments,
  searchEquipments,
} from "@/lib/equipments";
import { fetchCrystalRules } from "@/lib/crystalRules";
import CraftProfitHeaderCard from "./CraftProfitHeaderCard";
import CraftProfitMaterialsCard from "./CraftProfitMaterialsCard";
import EquipmentInfoCard from "./EquipmentInfoCard";
import SalePriceCard from "./SalePriceCard";
import PageHeroTitle from "@/components/PageHeroTitle";
import ContentReportArea from "@/components/common/content-report-area/ContentReportArea";
import {
  DEFAULT_FEE_RATE,
  buildInitialUnitCostMap,
  buildMatrix,
  buildSetsFromEquipments,
  calcMaterialCost,
  calcRecommendedStarPrices,
  calcMinRatesToBreakEven,
  calcSlotTotals,
  getCrystalInfo,
  getDisplayJobs,
  isCrystalEquipment,
  getCraftProductOutputCounts,
  normalizeSlotKey,
  recommendFromP3,
} from "./craftProfitHelpers";
import styles from "./CraftProfitClient.module.css";

const TOOL_USES = 30;
const MIN_SEARCH_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;
const ALL_SLOT = "__all__";
const FAVORITES_STORAGE_KEY = "dqx-tool:craft-profit:favorites:v1";
const FAVORITES_LIMIT = 100;

function getSelectionType(selection) {
  const groupKind = String(
    selection?.groupKind ?? selection?.group_kind ?? ""
  );
  const items = Array.isArray(selection?.items) ? selection.items : [];

  return groupKind.endsWith("_set") || items.length > 1
    ? "group"
    : "item";
}

function getFavoriteKey(favorite) {
  const type = favorite?.type === "group" ? "group" : "item";
  const id = String(favorite?.id ?? "").trim();
  return id ? `${type}:${id}` : "";
}

function normalizeFavorite(value) {
  if (!value || typeof value !== "object") return null;

  const type = value.type === "group" ? "group" : "item";
  const id = String(value.id ?? "").trim();
  const name = String(value.name ?? "").trim();

  if (!id || !name) return null;

  return {
    type,
    id,
    name,
    groupKind: String(value.groupKind ?? value.group_kind ?? "").trim(),
    savedAt: Number(value.savedAt ?? 0) || 0,
  };
}

function readFavoriteEquipments() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]"
    );

    if (!Array.isArray(parsed)) return [];

    const unique = new Map();

    parsed
      .map(normalizeFavorite)
      .filter(Boolean)
      .forEach((favorite) => {
        const key = getFavoriteKey(favorite);
        if (key && !unique.has(key)) unique.set(key, favorite);
      });

    return Array.from(unique.values())
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, FAVORITES_LIMIT);
  } catch (error) {
    console.warn("Failed to read craft-profit favorites", error);
    return [];
  }
}

function writeFavoriteEquipments(favorites) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify(favorites.slice(0, FAVORITES_LIMIT))
    );
  } catch (error) {
    console.warn("Failed to save craft-profit favorites", error);
  }
}

function createFavoriteFromSelection(selection) {
  const id = String(selection?.id ?? "").trim();
  const name = String(selection?.name ?? "").trim();

  if (!id || !name) return null;

  return {
    type: getSelectionType(selection),
    id,
    name,
    groupKind: String(
      selection?.groupKind ?? selection?.group_kind ?? ""
    ).trim(),
    savedAt: Date.now(),
  };
}

const EQUIPMENT_REPORT_FIELDS = [
  { value: "basic_info", label: "装備名・装備レベル・部位" },
  { value: "stats_effects", label: "基礎数値・効果" },
  { value: "craft_info", label: "職人・必要レベル" },
  { value: "materials", label: "必要素材・個数" },
  { value: "slot_grid", label: "数値・マス配置" },
  { value: "set_effects", label: "セット効果" },
  { value: "price", label: "価格情報" },
  { value: "other", label: "その他" },
];

function extractEquipmentRows(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

function extractMaterialIds(rows) {
  return Array.from(
    new Set(
      (Array.isArray(rows) ? rows : []).flatMap((row) => {
        let materials = [];

        try {
          const value =
            row?.materialsJson ??
            row?.materials_json ??
            row?.materials ??
            [];

          if (Array.isArray(value)) {
            materials = value;
          } else if (typeof value === "string" && value.trim()) {
            materials = JSON.parse(value);
          }
        } catch (error) {
          console.error("materials parse error", row, error);
          materials = [];
        }

        return materials
          .map((material) =>
            Number(
              material?.item_id ??
                material?.itemId ??
                material?.material_id ??
                material?.id ??
                0
            )
          )
          .filter((id) => Number.isInteger(id) && id > 0);
      })
    )
  );
}

function localizeEquipmentRows(rows, locale) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const englishName = String(
      row?.itemNameEn ?? row?.item_name_en ?? ""
    ).trim();
    const japaneseName = row?.itemName ?? row?.item_name ?? row?.name ?? "";

    const englishGroupName = String(
      row?.groupNameEn ?? row?.group_name_en ?? ""
    ).trim();
    const japaneseGroupName = row?.groupName ?? row?.group_name ?? "";

    const localizedName = locale === "en" ? englishName : japaneseName;
    const localizedGroupName =
      locale === "en" ? englishGroupName : japaneseGroupName;

    return {
      ...row,
      itemName: localizedName,
      item_name: localizedName,
      name: localizedName,
      groupName: localizedGroupName,
      group_name: localizedGroupName,
    };
  });
}

function katakanaToHiragana(value) {
  return String(value).replace(/[\u30a1-\u30f6]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0x60)
  );
}

function normalizeSearchText(value) {
  return katakanaToHiragana(String(value ?? ""))
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}


function getSelectedSetItemForSlot(selectedSet, slot) {
  const items = Array.isArray(selectedSet?.items) ? selectedSet.items : [];
  if (!items.length) return selectedSet ?? null;

  const exact = items.find((item) => {
    const ids = [
      item?.id,
      item?.itemId,
      item?.item_id,
      item?.equipmentId,
      item?.equipment_id,
    ];

    return (
      ids.some((value) => value != null && String(value) === String(slot)) ||
      String(item?.slotKey ?? "") === String(slot) ||
      String(item?.slot ?? "") === String(slot)
    );
  });

  if (exact) return exact;

  const normalizedSlot = normalizeSlotKey(slot);
  return (
    items.find(
      (item) =>
        normalizeSlotKey(item?.slotKey ?? item?.slot ?? "other") ===
        normalizedSlot
    ) ??
    items[0] ??
    null
  );
}

function SkeletonLine({ width = "100%", height = "0.875rem" }) {
  return (
    <span
      className={styles.skeletonLine}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

function EquipmentInfoSkeleton() {
  return (
    <section
      className={`${styles.skeletonCard} ${styles.skeletonInfoCard}`}
      aria-hidden="true"
    >
      <div className={styles.skeletonHeadingRow}>
        <SkeletonLine width="7.5rem" height="1.15rem" />
        <SkeletonLine width="5.5rem" />
      </div>

      <div className={styles.skeletonTagRow}>
        <SkeletonLine width="4.5rem" height="1.75rem" />
        <SkeletonLine width="5.75rem" height="1.75rem" />
        <SkeletonLine width="4rem" height="1.75rem" />
      </div>

      <div className={styles.skeletonInfoLines}>
        <SkeletonLine width="82%" />
        <SkeletonLine width="64%" />
      </div>
    </section>
  );
}

function EquipmentDetailsSkeleton() {
  return (
    <>
      <section className={styles.skeletonCard} aria-hidden="true">
        <div className={styles.skeletonHeadingRow}>
          <SkeletonLine width="9rem" height="1.15rem" />
          <SkeletonLine width="6rem" />
        </div>

        <div className={styles.skeletonTabRow}>
          <SkeletonLine width="5rem" height="2.25rem" />
          <SkeletonLine width="5rem" height="2.25rem" />
          <SkeletonLine width="5rem" height="2.25rem" />
          <SkeletonLine width="5rem" height="2.25rem" />
        </div>

        <div className={styles.skeletonMaterialGrid}>
          <div className={styles.skeletonPanel}>
            <SkeletonLine width="55%" />
            <SkeletonLine height="2.75rem" />
            <SkeletonLine width="80%" />
            <SkeletonLine height="2.75rem" />
          </div>

          <div className={styles.skeletonPanel}>
            <SkeletonLine width="45%" />
            <SkeletonLine />
            <SkeletonLine width="92%" />
            <SkeletonLine width="86%" />
            <SkeletonLine width="70%" />
          </div>
        </div>
      </section>

      <section className={styles.skeletonCard} aria-hidden="true">
        <div className={styles.skeletonHeadingRow}>
          <SkeletonLine width="9rem" height="1.15rem" />
          <SkeletonLine width="5rem" height="2.25rem" />
        </div>

        <div className={styles.skeletonRecommendPanel}>
          <div className={styles.skeletonRecommendHeader}>
            <SkeletonLine width="12rem" />
            <SkeletonLine width="7rem" height="1.75rem" />
          </div>

          <SkeletonLine
            width="100%"
            height="5.25rem"
          />

          <div className={styles.skeletonPriceGrid}>
            <div className={styles.skeletonPanel}>
              <SkeletonLine width="55%" />
              <SkeletonLine width="78%" height="1.5rem" />
            </div>
            <div className={styles.skeletonPanel}>
              <SkeletonLine width="50%" />
              <SkeletonLine width="70%" height="1.5rem" />
            </div>
            <div className={styles.skeletonPanel}>
              <SkeletonLine width="60%" />
              <SkeletonLine width="74%" height="1.5rem" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function CraftProfitInitialSkeleton() {
  return (
    <>
      <div className={styles.topGrid} aria-hidden="true">
        <section
          className={`${styles.skeletonCard} ${styles.skeletonSearchCard}`}
        >
          <div className={styles.skeletonFieldHeader}>
            <SkeletonLine width="5.5rem" />

            <div className={styles.skeletonEquipmentMeta}>
              <SkeletonLine width="4.5rem" height="1.5rem" />
              <SkeletonLine width="5.25rem" height="1.5rem" />
            </div>
          </div>

          <div className={styles.skeletonInputWrap}>
            <SkeletonLine width="100%" height="2.75rem" />
          </div>
        </section>

        <div className={styles.infoColumn}>
          <EquipmentInfoSkeleton />
        </div>
      </div>

      <EquipmentDetailsSkeleton />
    </>
  );
}

export default function CraftProfitClient() {
  const locale = useLocale();
  const selectionRequestRef = useRef(0);
  const selectingNameRef = useRef("");

  const [sets, setSets] = useState([]);
  const [selectedSet, setSelectedSet] = useState(null);
  const [favoriteEquipments, setFavoriteEquipments] = useState([]);
  // buildSetsFromEquipments() の変換前データ。
  // content_reports.reportable_id には equipments.id が必要なので保持する。
  const [selectedEquipmentRows, setSelectedEquipmentRows] = useState([]);
  const [craftTools, setCraftTools] = useState([]);
  const [crystalRules, setCrystalRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [setQuery, setSetQuery] = useState("");
  const [openSetList, setOpenSetList] = useState(false);

  const [feeRatePct, setFeeRatePct] = useState(DEFAULT_FEE_RATE);

  const [toolId, setToolId] = useState("none");
  const [toolPriceOverride, setToolPriceOverride] = useState(null);
  const [unitCostMap, setUnitCostMap] = useState({});
  const [activeSlot, setActiveSlot] = useState("その他");
  const [reportSelectedSlot, setReportSelectedSlot] = useState("");

  useEffect(() => {
    setFavoriteEquipments(readFavoriteEquipments());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setLoadError("");
        setSets([]);
        setSelectedSet(null);
        setSelectedEquipmentRows([]);
        setSetQuery("");
        setCraftTools([]);
        selectionRequestRef.current += 1;
        selectingNameRef.current = "";

        const crystalRulesResponse = await fetchCrystalRules();

        if (cancelled) return;

        setCrystalRules(
          Array.isArray(crystalRulesResponse) ? crystalRulesResponse : []
        );
      } catch (error) {
        if (cancelled) return;
        console.error("CraftProfit load error:", error);
        setLoadError("初期データの取得に失敗した");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    const query = setQuery.trim();
    const normalizedQuery = normalizeSearchText(query);
    const normalizedSelectedName = normalizeSearchText(selectedSet?.name);
    const normalizedSelectingName = normalizeSearchText(
      selectingNameRef.current
    );

    if (
      normalizedQuery.length < MIN_SEARCH_LENGTH ||
      (normalizedSelectedName && normalizedQuery === normalizedSelectedName) ||
      (normalizedSelectingName && normalizedQuery === normalizedSelectingName)
    ) {
      setSets([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }

    let cancelled = false;

    const timer = window.setTimeout(async () => {
      try {
        setSearchLoading(true);
        setSearchError("");

        const response = await searchEquipments(query);
        const equipmentRows = localizeEquipmentRows(
          extractEquipmentRows(response),
          locale
        );
        const nextSets = buildSetsFromEquipments(
          equipmentRows,
          new Map(),
          locale
        );

        if (cancelled) return;
        setSets(Array.isArray(nextSets) ? nextSets : []);
      } catch (error) {
        if (cancelled) return;
        console.error("Equipment search error:", error);
        setSets([]);
        setSearchError(
          locale === "en"
            ? "Failed to search equipment"
            : "装備の検索に失敗しました"
        );
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [setQuery, locale, selectedSet?.id, selectedSet?.name]);

  useEffect(() => {
    if (selectedSet?.name) {
      setSetQuery(selectedSet.name);
      setUnitCostMap(buildInitialUnitCostMap(selectedSet, locale));
    } else {
      setUnitCostMap({});
    }
  }, [selectedSet, locale]);

  const filteredSets = useMemo(() => {
    const groupedMatches = [];
    const singleMatches = [];

    for (const set of sets) {
      const isGrouped =
        String(set?.groupKind ?? "").endsWith("_set") ||
        (Array.isArray(set?.items) && set.items.length > 1);

      if (isGrouped) {
        groupedMatches.push(set);
      } else {
        singleMatches.push(set);
      }
    }

    return [...groupedMatches, ...singleMatches];
  }, [sets]);

  const craftType = selectedSet?.craftType;
  const greatSuccessRate = useMemo(
    () =>
      selectedSet?.greatSuccessRate ??
      selectedSet?.items?.find((item) => item?.greatSuccessRate != null)
        ?.greatSuccessRate ??
      null,
    [selectedSet]
  );
  const selectedOutputCounts = useMemo(
    () => getCraftProductOutputCounts(selectedSet),
    [selectedSet]
  );
  const isMaterialProduct = !!selectedOutputCounts;
  const feeRate = useMemo(() => clamp0(feeRatePct) / 100, [feeRatePct]);

  useEffect(() => {
    if (!craftType || craftTools.length) return;

    let cancelled = false;

    async function loadCraftTools() {
      try {
        const response = await fetchCraftTools();
        const toolRows = localizeEquipmentRows(
          extractEquipmentRows(response).filter(
            (row) =>
              String(row?.groupKind ?? row?.group_kind ?? "") ===
              "craft_tool_set"
          ),
          locale
        );

        if (!cancelled) {
          setCraftTools(Array.isArray(toolRows) ? toolRows : []);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Craft tool load error:", error);
        }
      }
    }

    loadCraftTools();

    return () => {
      cancelled = true;
    };
  }, [craftType, craftTools.length, locale]);

  const toolOptions = useMemo(() => {
    const base = [
      {
        id: "none",
        name: locale === "en" ? "None" : "選択なし",
        defaultPrice: 0,
      },
    ];

    if (!craftType) return base;

    const matchersByCraftType = {
      武器鍛冶: ["道具ハンマー", "ハンマー"],
      防具鍛冶: ["道具ハンマー", "ハンマー"],
      道具鍛冶: ["道具ハンマー", "ハンマー"],
      木工: ["道具木工刀", "木工刀"],
      裁縫: ["道具さいほう針", "さいほう針"],
      調理: ["道具フライパン", "フライパン"],
      ランプ錬金: ["道具錬金ランプ", "錬金ランプ"],
      ツボ錬金: ["道具錬金ツボ", "錬金ツボ"],
    };

    const keywords = matchersByCraftType[String(craftType)] ?? [];

    const rows = craftTools.filter((row) => {
      const craftProductType =
        row?.craftProductType ?? row?.craft_product_type ?? null;
      const craftProductText = [
        row?.craftProductTypeDisplayName,
        row?.craft_product_type_display_name,
        craftProductType?.displayName,
        craftProductType?.display_name,
        row?.craftProductTypeName,
        row?.craft_product_type_name,
        craftProductType?.name,
        craftProductType?.key,
      ]
        .filter(Boolean)
        .join(" ");
      const itemName = String(
        row?.itemName ?? row?.item_name ?? row?.name ?? ""
      );

      return keywords.some(
        (keyword) =>
          craftProductText.includes(keyword) || itemName.includes(keyword)
      );
    });

    const mapped = rows
      .map((row) => ({
        id: String(row?.itemId ?? row?.item_id ?? row?.id),
        name: row?.itemName ?? row?.item_name ?? row?.name ?? "名称未設定",
        defaultPrice: Number(
          row?.defaultPrice ??
            row?.default_price ??
            row?.price ??
            row?.buy_price ??
            0
        ),
        craftLevel: Number(row?.craftLevel ?? row?.craft_level ?? 0) || 0,
      }))
      .sort((a, b) => {
        if (a.craftLevel !== b.craftLevel) {
          return a.craftLevel - b.craftLevel;
        }
        return a.name.localeCompare(b.name, locale);
      });

    return [...base, ...mapped];
  }, [craftTools, craftType, locale]);

  useEffect(() => {
    setToolId("none");
    setToolPriceOverride(null);
  }, [craftType]);

  const selectedTool = useMemo(
    () => toolOptions.find((tool) => tool.id === toolId) ?? toolOptions[0],
    [toolOptions, toolId]
  );

  const toolPrice = useMemo(
    () =>
      toolPriceOverride == null
        ? selectedTool?.defaultPrice ?? 0
        : Number(toolPriceOverride),
    [selectedTool, toolPriceOverride]
  );

  const toolCostPerCraft = useMemo(
    () => clamp0(toolPrice) / TOOL_USES,
    [toolPrice]
  );

  const toolEnabled = useMemo(
    () => toolOptions.length > 1 && selectedTool?.id !== "none",
    [toolOptions, selectedTool]
  );

  const mobileToolRow = useMemo(() => {
    if (toolOptions.length <= 1) return null;
    if (!selectedTool || selectedTool.id === "none") return null;

    return {
      name:
        locale === "en"
          ? `[Tool] ${selectedTool.name}`
          : `【道具】${selectedTool.name}`,
      toolPrice,
      toolCostPerCraft,
      onChangeToolPrice: (value) => setToolPriceOverride(value),
    };
  }, [toolOptions, selectedTool, toolPrice, toolCostPerCraft, locale]);

  const matrix = useMemo(
    () => buildMatrix(selectedSet, locale),
    [selectedSet, locale]
  );

  const slots = Array.isArray(matrix?.slots) ? matrix.slots : [];
  const rows = Array.isArray(matrix?.rows) ? matrix.rows : [];
  const slotGrids = matrix?.slotGrids ?? {};
  const slotGridMeta = matrix?.slotGridMeta ?? {};

  useEffect(() => {
    if (slots.length && !slots.includes(activeSlot)) {
      setActiveSlot(slots[0]);
    }
  }, [slots, activeSlot]);

  const loadEquipmentSelection = async (selection) => {
    if (!selection?.id) return;

    const requestId = selectionRequestRef.current + 1;
    selectionRequestRef.current = requestId;
    selectingNameRef.current = selection.name ?? "";

    setSetQuery(selection.name ?? "");
    setSets([]);
    setSelectedEquipmentRows([]);
    setSelectionLoading(true);
    setSearchError("");

    try {
      const selectionType =
        selection.type === "group" || selection.type === "item"
          ? selection.type
          : getSelectionType(selection);

      let response = await fetchEquipmentSelection(
        selectionType === "group"
          ? { groupId: selection.id }
          : { itemId: selection.id }
      );

      let equipmentRows = localizeEquipmentRows(
        extractEquipmentRows(response),
        locale
      );

      // 古いデータで group_id / item_id が空の場合の保険。
      if (!equipmentRows.length && selection.name) {
        response = await fetchEquipments({
          q: selection.name,
          limit: 100,
        });
        equipmentRows = localizeEquipmentRows(
          extractEquipmentRows(response),
          locale
        );
      }

      if (!equipmentRows.length) {
        throw new Error("Equipment detail was not found");
      }

      const materialIds = extractMaterialIds(equipmentRows);
      const items = materialIds.length
        ? await fetchItemsByIds(materialIds, locale)
        : [];

      const itemMap = new Map(
        (Array.isArray(items) ? items : []).map((item) => [
          Number(item.id),
          item,
        ])
      );

      const detailSets = buildSetsFromEquipments(
        equipmentRows,
        itemMap,
        locale
      );
      const resolvedSet =
        detailSets.find(
          (set) => String(set.id) === String(selection.id)
        ) ||
        detailSets.find((set) => set.name === selection.name) ||
        detailSets[0] ||
        null;

      if (!resolvedSet) {
        throw new Error("Equipment detail could not be built");
      }

      if (selectionRequestRef.current !== requestId) return;
      setSelectedEquipmentRows(equipmentRows);
      setSelectedSet(resolvedSet);
    } catch (error) {
      if (selectionRequestRef.current !== requestId) return;
      console.error("Equipment detail load error:", error);
      setSearchError(
        locale === "en"
          ? "Failed to load equipment details"
          : "装備詳細の取得に失敗しました"
      );
    } finally {
      if (selectionRequestRef.current === requestId) {
        selectingNameRef.current = "";
        setSelectionLoading(false);
      }
    }
  };

  const onChangeSet = async (nextId) => {
    const nextSet =
      sets.find((set) => String(set.id) === String(nextId)) || null;

    if (!nextSet) {
      setSetQuery("");
      return;
    }

    await loadEquipmentSelection(nextSet);
  };

  const selectedFavorite = useMemo(
    () => createFavoriteFromSelection(selectedSet),
    [selectedSet]
  );

  const selectedFavoriteKey = useMemo(
    () => getFavoriteKey(selectedFavorite),
    [selectedFavorite]
  );

  const isSelectedFavorite = useMemo(
    () =>
      !!selectedFavoriteKey &&
      favoriteEquipments.some(
        (favorite) => getFavoriteKey(favorite) === selectedFavoriteKey
      ),
    [favoriteEquipments, selectedFavoriteKey]
  );

  const toggleSelectedFavorite = () => {
    if (!selectedFavorite) return;

    setFavoriteEquipments((previous) => {
      const currentKey = getFavoriteKey(selectedFavorite);
      const exists = previous.some(
        (favorite) => getFavoriteKey(favorite) === currentKey
      );
      const next = exists
        ? previous.filter(
            (favorite) => getFavoriteKey(favorite) !== currentKey
          )
        : [selectedFavorite, ...previous].slice(0, FAVORITES_LIMIT);

      writeFavoriteEquipments(next);
      return next;
    });
  };

  const selectFavoriteEquipment = async (favoriteKey) => {
    const favorite = favoriteEquipments.find(
      (item) => getFavoriteKey(item) === String(favoriteKey)
    );

    if (!favorite) return;
    await loadEquipmentSelection(favorite);
  };

  const updateUnitCost = (materialKey, value) => {
    setUnitCostMap((previous) => ({
      ...previous,
      [materialKey]: Number(value),
    }));
  };

  const materialCost = useMemo(
    () => calcMaterialCost(rows, unitCostMap),
    [rows, unitCostMap]
  );

  const slotTotals = useMemo(
    () => calcSlotTotals(rows, slots, unitCostMap),
    [rows, slots, unitCostMap]
  );

  const slotTotalsWithTool = useMemo(() => {
    const amount = { ...(slotTotals?.amount ?? {}) };

    if (toolEnabled) {
      for (const slot of slots) {
        amount[slot] = (amount[slot] || 0) + toolCostPerCraft;
      }
    }

    const total = slots.reduce(
      (sum, slot) => sum + (amount[slot] || 0),
      0
    );

    return {
      qty: slotTotals?.qty ?? {},
      amount,
      total,
    };
  }, [slotTotals, toolEnabled, toolCostPerCraft, slots]);

  const partCount = useMemo(
    () => Math.max(1, slots.length || 0),
    [slots]
  );

  const avgMaterialCostPerPart = useMemo(
    () => materialCost / partCount,
    [materialCost, partCount]
  );

  const costPerItem = useMemo(
    () =>
      avgMaterialCostPerPart + (toolEnabled ? toolCostPerCraft : 0),
    [avgMaterialCostPerPart, toolEnabled, toolCostPerCraft]
  );

  const crystalByEquipLevel = useMemo(
    () => getCrystalInfo(selectedSet, crystalRules),
    [selectedSet, crystalRules]
  );

  const slotPricing = useMemo(() => {
    const result = {};

    for (const slot of slots) {
      const slotCost = clamp0(slotTotalsWithTool?.amount?.[slot] ?? 0);
      const slotItem = getSelectedSetItemForSlot(selectedSet, slot);
      const outputCounts = getCraftProductOutputCounts(slotItem);
      const prices = calcRecommendedStarPrices({
        costPerItem: slotCost,
        crystalByEquipLevel,
        craftProductType: slotItem,
        outputCounts,
        greatSuccessRate,
        feeRate,
      });

      result[slot] = {
        cost: slotCost,
        prices,
        outputCounts,
        isCrystalEquipment: isCrystalEquipment({
          costPerItem: slotCost,
          crystalByEquipLevel,
          craftProductType: slotItem,
        }),
      };
    }

    return result;
  }, [
    slots,
    slotTotalsWithTool,
    crystalByEquipLevel,
    selectedSet,
    greatSuccessRate,
    feeRate,
  ]);

  const recommendedStarPrices = useMemo(
    () =>
      calcRecommendedStarPrices({
        costPerItem,
        crystalByEquipLevel,
        craftProductType: selectedSet,
        outputCounts: selectedOutputCounts,
        greatSuccessRate,
        feeRate,
      }),
    [
      costPerItem,
      crystalByEquipLevel,
      selectedOutputCounts,
      greatSuccessRate,
      feeRate,
    ]
  );

  const crystalEquipmentLabel = useMemo(() => {
    if (!slots.length) return "";

    const crystalCount = slots.filter(
      (slot) => slotPricing?.[slot]?.isCrystalEquipment
    ).length;

    if (!crystalCount) return "";

    if (crystalCount === slots.length) {
      return locale === "en" ? "Crystal gear" : "結晶装備";
    }

    return locale === "en"
      ? "Some crystal gear"
      : "一部 結晶装備";
  }, [slots, slotPricing, locale]);

  const minRates = useMemo(() => {
    if (!recommendedStarPrices) {
      return {
        ok: false,
        impossible: false,
        note:
          locale === "en"
            ? "Set the great-success rate for this craft type"
            : "この職人種別の大成功率を設定してください",
      };
    }

    return calcMinRatesToBreakEven({
      feeRate,
      costPerItem,
      starPrice: recommendedStarPrices,
      outputCounts: selectedOutputCounts,
      stepPercent: 1,
      locale,
    });
  }, [
    feeRate,
    costPerItem,
    recommendedStarPrices,
    selectedOutputCounts,
    locale,
  ]);

  const recommend = useMemo(() => {
    if (minRates?.impossible) {
      return {
        label:
          locale === "en"
            ? "★☆☆☆☆ (Not recommended)"
            : "★☆☆☆☆（非推奨）",
        tone: "var(--danger-text)",
        sub:
          locale === "en"
            ? isMaterialProduct
              ? "Even 100% great success won't make profit"
              : "Even 100% 3★ won't make profit"
            : isMaterialProduct
            ? "大成功100%でも黒字にならない"
            : "100%★3でも黒字にならない",
      };
    }

    const resultMode = isMaterialProduct ? "materialOutput" : "star";

    return minRates?.ok
      ? recommendFromP3(minRates.p3, locale, resultMode)
      : recommendFromP3(null, locale, resultMode);
  }, [minRates, locale, isMaterialProduct]);

  const recommendRate = useMemo(() => {
    if (!minRates?.ok) return 0;
    return Math.max(0, 100 - (Number(minRates.p3) || 0));
  }, [minRates]);

  const displayJobs = useMemo(
    () => getDisplayJobs(selectedSet),
    [selectedSet]
  );

  const equipmentReportTarget = useMemo(() => {
    if (!selectedSet || selectedEquipmentRows.length === 0) return null;

    const cleanText = (value) => String(value ?? "").trim();
    const getCraftProductDisplayName = (row) => {
      const craftProductType =
        row?.craftProductType ?? row?.craft_product_type ?? null;

      return cleanText(
        row?.craftProductTypeDisplayName ??
          row?.craft_product_type_display_name ??
          craftProductType?.displayName ??
          craftProductType?.display_name ??
          row?.craftProductTypeName ??
          row?.craft_product_type_name ??
          craftProductType?.name
      );
    };
    const isAllSelected = reportSelectedSlot === ALL_SLOT;
    const reportSlot = isAllSelected ? activeSlot : reportSelectedSlot || activeSlot;
    const currentSlotKey = normalizeSlotKey(reportSlot);

    // 大成功基準値で選択中の部位と、APIの装備行を同じ正規化ルールで照合する。
    // 「腕」「ウデ」「arms」のように表記が違っても同じ部位として扱う。
    const activeRow =
      selectedEquipmentRows.find((row) =>
        [
          getCraftProductDisplayName(row),
          row?.part,
          row?.equipmentSlot,
          row?.equipment_slot,
          row?.slot_name,
        ]
          .filter((value) => cleanText(value))
          .some((value) => normalizeSlotKey(value) === currentSlotKey)
      ) || selectedEquipmentRows[0];

    const reportableId = Number(activeRow?.id);

    if (!Number.isSafeInteger(reportableId) || reportableId <= 0) {
      console.warn("Equipment report target id was not found", {
        activeSlot: reportSlot,
        reportSelectedSlot,
        activeRow,
        selectedEquipmentRows,
      });
      return null;
    }

    const itemName = cleanText(
      activeRow?.itemName ??
        activeRow?.item_name ??
        activeRow?.name ??
        selectedSet?.name ??
        ""
    );

    const rowSlot = cleanText(
      getCraftProductDisplayName(activeRow) ||
        activeRow?.part ||
        activeRow?.equipmentSlot ||
        activeRow?.equipment_slot
    );

    // 画面のタブ表示名を優先するため、
    // 「アンテイクグローブ（腕）」のように現在選択中の部位が表示される。
    const activeSlotLabel = cleanText(
      slotGridMeta?.[reportSlot]?.label ??
        slotGridMeta?.[reportSlot]?.itemName ??
        reportSlot ??
        rowSlot
    );

    const displaySlot =
      activeSlotLabel && activeSlotLabel !== "その他"
        ? activeSlotLabel
        : rowSlot && rowSlot !== "その他"
          ? rowSlot
          : "";

    const setName = cleanText(
      selectedSet?.name ??
        activeRow?.groupName ??
        activeRow?.group_name ??
        itemName
    );

    return {
      id: reportableId,
      label: isAllSelected
        ? setName
        : displaySlot && itemName
          ? `${itemName}（${displaySlot}）`
          : itemName,
      context: {
        page: "craft-profit",
        equipment_id: reportableId,
        item_id: activeRow?.itemId ?? activeRow?.item_id ?? null,
        group_id:
          activeRow?.groupId ??
          activeRow?.group_id ??
          selectedSet?.groupId ??
          selectedSet?.group_id ??
          selectedSet?.id ??
          null,
        group_name:
          activeRow?.groupName ??
          activeRow?.group_name ??
          selectedSet?.name ??
          null,
        active_slot: isAllSelected ? null : displaySlot || null,
        report_scope: isAllSelected ? "all" : "part",
        raw_slot: rowSlot || null,
        craft_type: selectedSet?.craftType ?? null,
      },
    };
  }, [
    selectedSet,
    selectedEquipmentRows,
    activeSlot,
    reportSelectedSlot,
    slotGridMeta,
  ]);

  return (
    <main className={styles.page}>
      <PageHeroTitle
        kicker="DQX CRAFT TOOL"
        title={locale === "en" ? "Craft Tool" : "職人ツール"}
      />

      {loading ? (
        <div className={styles.content}>
          <CraftProfitInitialSkeleton />
        </div>
      ) : loadError ? (
        <div className={styles.errorMessage}>{loadError}</div>
      ) : (
        <div className={styles.content} aria-busy={selectionLoading}>
          {selectionLoading ? (
            <span className={styles.visuallyHidden} role="status" aria-live="polite">
              {locale === "en"
                ? "Loading equipment details"
                : "装備情報を読み込んでいます"}
            </span>
          ) : null}

          <div className={styles.topGrid}>
            <CraftProfitHeaderCard
              setQuery={setQuery}
              setSetQuery={setSetQuery}
              openSetList={openSetList}
              setOpenSetList={setOpenSetList}
              filteredSets={filteredSets}
              onChangeSet={onChangeSet}
              searchLoading={searchLoading}
              selectionLoading={selectionLoading}
              searchError={searchError}
              craftType={craftType}
              selectedSet={selectedSet}
              favoriteEquipments={favoriteEquipments}
              selectedFavoriteKey={
                isSelectedFavorite ? selectedFavoriteKey : ""
              }
              isSelectedFavorite={isSelectedFavorite}
              onToggleFavorite={toggleSelectedFavorite}
              onSelectFavorite={selectFavoriteEquipment}
              toolId={toolId}
              setToolId={setToolId}
              toolOptions={toolOptions}
              toolPrice={toolPrice}
              setToolPriceOverride={setToolPriceOverride}
            />

            <div className={styles.infoColumn}>
              {selectionLoading ? (
                <EquipmentInfoSkeleton />
              ) : (
                <EquipmentInfoCard
                  selectedSet={selectedSet}
                  displayJobs={displayJobs}
                  crystalByEquipLevel={crystalByEquipLevel}
                />
              )}
            </div>
          </div>

          {selectionLoading ? (
            <EquipmentDetailsSkeleton />
          ) : (
            <>
              <CraftProfitMaterialsCard
                slots={slots}
                rows={rows}
                slotGrids={slotGrids}
                slotGridMeta={slotGridMeta}
                selectedSet={selectedSet}
                activeSlot={activeSlot}
                setActiveSlot={setActiveSlot}
                onSelectedTabChange={setReportSelectedSlot}
                unitCostMap={unitCostMap}
                updateUnitCost={updateUnitCost}
                mobileToolRow={mobileToolRow}
                toolEnabled={toolEnabled}
                selectedTool={selectedTool}
                toolPrice={toolPrice}
                setToolPriceOverride={setToolPriceOverride}
                toolCostPerCraft={toolCostPerCraft}
                slotTotalsWithTool={slotTotalsWithTool}
                avgMaterialCostPerPart={avgMaterialCostPerPart}
                costPerItem={costPerItem}
                slotPricing={slotPricing}
              />

              <SalePriceCard
                feeRatePct={feeRatePct}
                setFeeRatePct={setFeeRatePct}
                minRates={minRates}
                recommend={recommend}
                recommendRate={recommendRate}
                crystalEquipmentLabel={crystalEquipmentLabel}
                outputCounts={selectedOutputCounts}
              />

              {equipmentReportTarget ? (
                <ContentReportArea
                  reportableType="equipment"
                  reportableId={equipmentReportTarget.id}
                  targetLabel={equipmentReportTarget.label}
                  fieldOptions={EQUIPMENT_REPORT_FIELDS}
                  context={equipmentReportTarget.context}
                  description={
                    locale === "en"
                      ? "Report an incorrect equipment name, level, material, effect, crafting value, or price."
                      : "装備名・レベル・素材・効果・職人数値・価格などの間違いを送ってください。"
                  }
                />
              ) : null}
            </>
          )}
        </div>
      )}
    </main>
  );
}
