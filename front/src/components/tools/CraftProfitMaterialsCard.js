"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MdSwipe } from "react-icons/md";
import { clamp0, yen } from "@/lib/money";
import {
  getSlotItemName,
  getSlotOrder,
  normalizeSlotKey,
} from "./craftProfitHelpers";
import styles from "./CraftProfitMaterialsCard.module.css";

const ALL_SLOT = "__all__";
const STAR_ROWS = [
  ["star0", "☆☆☆"],
  ["star1", "★☆☆"],
  ["star2", "★★☆"],
  ["star3", "★★★"],
];

function SlotGridView({ grid }) {
  if (!grid) return null;

  const is2DArray =
    Array.isArray(grid) && grid.every((row) => Array.isArray(row));

  if (!is2DArray) return null;

  const rows = grid.length;
  const cols = Math.max(...grid.map((row) => row.length), 0);

  if (!rows || !cols) return null;

  const normalized = Array.from({ length: rows }, (_, rowIndex) =>
    Array.from(
      { length: cols },
      (_, columnIndex) => grid?.[rowIndex]?.[columnIndex] ?? null
    )
  );

  return (
    <div className={styles.slotGridViewport}>
      <div
        className={styles.slotGrid}
        style={{ "--slot-grid-columns": cols }}
      >
        {normalized.flat().map((value, index) => {
          const disabled = value == null || value === "";

          return (
            <div
              key={`${index}-${String(value ?? "empty")}`}
              className={`${styles.slotGridCell} ${
                disabled ? styles.slotGridCellDisabled : ""
              }`}
            >
              <div className={styles.slotGridValue}>
                {disabled ? "" : value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getAxisLabel(slot, slotGridMeta, slotItemMap) {
  return (
    slotGridMeta?.[slot]?.label ||
    slotGridMeta?.[slot]?.itemName ||
    slotItemMap?.[slot] ||
    slot
  );
}

function getSelectedItem(slot, selectedSet) {
  const items = Array.isArray(selectedSet?.items) ? selectedSet.items : [];

  const exactItem = items.find((item) => {
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
      String(item?.slot ?? "") === String(slot) ||
      String(item?.name ?? "") === String(slot)
    );
  });

  if (exactItem) return exactItem;

  const normalizedSlot = normalizeSlotKey(slot);

  return (
    items.find(
      (item) =>
        normalizeSlotKey(item?.slotKey ?? item?.slot ?? "other") ===
        normalizedSlot
    ) ?? null
  );
}

function getAxisSortSlot(slot, slotGridMeta, selectedSet) {
  const item = getSelectedItem(slot, selectedSet);

  return (
    slotGridMeta?.[slot]?.slotKey ??
    item?.slotKey ??
    item?.slot ??
    slot
  );
}

function sortAxisSlots(slots, locale, slotGridMeta, selectedSet) {
  const collator = new Intl.Collator(locale === "en" ? "en" : "ja", {
    numeric: true,
    sensitivity: "base",
  });

  return [...slots].sort((a, b) => {
    const aOrder = getSlotOrder(
      getAxisSortSlot(a, slotGridMeta, selectedSet)
    );
    const bOrder = getSlotOrder(
      getAxisSortSlot(b, slotGridMeta, selectedSet)
    );

    if (aOrder !== bOrder) return aOrder - bOrder;

    const aLabel =
      slotGridMeta?.[a]?.itemName ??
      slotGridMeta?.[a]?.label ??
      getSelectedItem(a, selectedSet)?.name ??
      a;
    const bLabel =
      slotGridMeta?.[b]?.itemName ??
      slotGridMeta?.[b]?.label ??
      getSelectedItem(b, selectedSet)?.name ??
      b;

    return collator.compare(String(aLabel ?? ""), String(bLabel ?? ""));
  });
}

function getAxisItemName(slot, slotGridMeta, selectedSet) {
  return (
    slotGridMeta?.[slot]?.itemName ||
    getSelectedItem(slot, selectedSet)?.name ||
    getSlotItemName(selectedSet, slot)
  );
}

function isEquipmentSet(selectedSet) {
  const items = Array.isArray(selectedSet?.items) ? selectedSet.items : [];
  const groupKind = String(
    selectedSet?.groupKind ?? selectedSet?.group_kind ?? ""
  );

  return items.length > 1 || groupKind.endsWith("_set");
}

function getEquipmentTypeName(item) {
  return String(
    item?.equipmentTypeName ??
      item?.equipment_type_name ??
      item?.equipmentType?.name ??
      item?.equipment_type?.name ??
      ""
  ).trim();
}

function getFabricTypeTagClass(fabricType) {
  const normalized = String(fabricType ?? "").trim();

  if (normalized.includes("再生")) {
    return styles.detailTagRegenerated;
  }

  if (normalized.includes("虹")) {
    return styles.detailTagRainbow;
  }

  if (normalized.includes("ピンク")) {
    return styles.detailTagPink;
  }

  return "";
}

const moneyFormatter = new Intl.NumberFormat("ja-JP", {
  maximumFractionDigits: 0,
});

function normalizeMoneyValue(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.trunc(numericValue));
}

function formatMoneyValue(value) {
  return moneyFormatter.format(normalizeMoneyValue(value));
}

function parseMoneyValue(value) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
}

function MoneyInput({ value, onChange, className, ariaLabel }) {
  const handleFocus = (event) => {
    const input = event.currentTarget;

    requestAnimationFrame(() => {
      input.select();
    });
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9,]*"
      autoComplete="off"
      className={className}
      value={formatMoneyValue(value)}
      aria-label={ariaLabel}
      onFocus={handleFocus}
      onChange={(event) => onChange(parseMoneyValue(event.target.value))}
    />
  );
}
function getTabLabel({
    slot,
    slotGridMeta,
    slotItemMap,
    selectedSet,
    locale,
  }) {
    if (slot === ALL_SLOT) {
      return locale === "en" ? "All" : "全て";
    }

    const defaultLabel = getAxisLabel(slot, slotGridMeta, slotItemMap);

    // セット装備は「頭・体上・体下」などを表示
    if (isEquipmentSet(selectedSet)) {
      return defaultLabel;
    }

    // 単体装備は「弓・片手剣・小盾」などを表示
    const selectedItem = getSelectedItem(slot, selectedSet);
    const equipmentTypeName = getEquipmentTypeName(selectedItem);

    return equipmentTypeName || defaultLabel;
  }
function SlotTabs({
  slots,
  activeSlot,
  onChange,
  slotGridMeta,
  slotItemMap,
  selectedSet,
  locale,
}) {
  const tabListRef = useRef(null);
  const tabRefs = useRef(new Map());

  useEffect(() => {
    const activeButton = tabRefs.current.get(activeSlot);
    const tabList = tabListRef.current;

    if (!activeButton || !tabList) return;

    const buttonCenter = activeButton.offsetLeft + activeButton.offsetWidth / 2;
    const targetLeft = buttonCenter - tabList.clientWidth / 2;

    tabList.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: "smooth",
    });
  }, [activeSlot]);

const safeSlots = Array.isArray(slots) ? slots : [];
const tabs = isEquipmentSet(selectedSet)
  ? [ALL_SLOT, ...safeSlots]
  : safeSlots;

  return (
    <div className={styles.tabsFullBleed}>
        <div
          ref={tabListRef}
          className={`${styles.tabsScroller} ${
            tabs.length > 6 ? styles.tabsScrollable : ""
          }`}
          role="tablist"
          aria-label={locale === "en" ? "Equipment part" : "装備部位"}
          style={{ "--tab-count": tabs.length }}
        >
        {tabs.map((slot) => {
          const isActive = slot === activeSlot;
         const label = getTabLabel({
            slot,
            slotGridMeta,
            slotItemMap,
            selectedSet,
            locale,
          });

          return (
            <button
              key={slot}
              ref={(node) => {
                if (node) tabRefs.current.set(slot, node);
                else tabRefs.current.delete(slot);
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tabButton} ${
                isActive ? styles.tabButtonActive : ""
              }`}
              onClick={() => onChange(slot)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return <h3 className={styles.sectionTitle}>{children}</h3>;
}

function SwipeHint() {
  return (
    <div className={styles.swipeHint} aria-hidden="true">
      <MdSwipe className={styles.swipeHintIcon} />
    </div>
  );
}

function BaseValuePanel({
  slot,
  slotGrids,
  slotGridMeta,
  slotItemMap,
  selectedSet,
  locale,
}) {
  const grid = slotGrids?.[slot] ?? null;
  const label = getAxisLabel(slot, slotGridMeta, slotItemMap);
  const selectedItem = getSelectedItem(slot, selectedSet);
  const itemName =
    getAxisItemName(slot, slotGridMeta, selectedSet) || label;
  const fabricType = String(
    selectedItem?.fabricType ?? selectedItem?.fabric_type ?? ""
  ).trim();

  const detailTag = fabricType;

  return (
    <div className={styles.sectionBlock}>
      <SectionTitle>
        {locale === "en" ? "Critical success target" : "大成功基準値"}
      </SectionTitle>

      <div className={styles.baseValueCard}>
        <div className={styles.baseValueHeading}>
          <div className={styles.baseValueName}>{itemName}</div>

          {detailTag ? (
            <span
              className={`${styles.detailTag} ${getFabricTypeTagClass(
                detailTag
              )}`}
            >
              {detailTag}
            </span>
          ) : null}
        </div>

        {grid ? (
          <SlotGridView grid={grid} />
        ) : (
          <div className={styles.emptyPanel}>
            {locale === "en" ? "No target values" : "基準値情報がありません"}
          </div>
        )}
      </div>
    </div>
  );
}

function buildMaterialItems({
  selectedSlot,
  rows,
  unitCostMap,
  toolEnabled,
  selectedTool,
  toolPrice,
  setToolPriceOverride,
  toolCostPerCraft,
  mobileToolRow,
  slotCount,
}) {
  const isAll = selectedSlot === ALL_SLOT;
  const result = [];

  const hasTool =
    toolEnabled && selectedTool?.id && selectedTool.id !== "none";
  const toolName = selectedTool?.name ?? mobileToolRow?.name ?? "";
  const resolvedToolPrice = Number(toolPrice ?? mobileToolRow?.toolPrice ?? 0);
  const resolvedToolCost = Number(
    toolCostPerCraft ?? mobileToolRow?.toolCostPerCraft ?? 0
  );
  const resolvedToolChange =
    setToolPriceOverride ?? mobileToolRow?.onChangeToolPrice;

  if (hasTool && toolName) {
    result.push({
      key: "__tool__",
      name: toolName,
      qty: null,
      unit: resolvedToolPrice,
      amount: resolvedToolCost * (isAll ? Math.max(1, slotCount) : 1),
      isTool: true,
      onChange: resolvedToolChange,
    });
  }

  for (const row of Array.isArray(rows) ? rows : []) {
    const qty = isAll
      ? Number(row?.totalQty || 0)
      : Number(row?.perSlotQty?.[selectedSlot] || 0);

    if (!qty) continue;

    const unit = clamp0(unitCostMap?.[row.materialKey] ?? 0);

    result.push({
      key: row.materialKey,
      name: row.materialName,
      qty,
      unit,
      amount: qty * unit,
      isTool: false,
    });
  }

  return result;
}

function MaterialsPanel({
  selectedSlot,
  rows,
  unitCostMap,
  updateUnitCost,
  toolEnabled,
  selectedTool,
  toolPrice,
  setToolPriceOverride,
  toolCostPerCraft,
  mobileToolRow,
  slotCount,
  locale,
}) {
  const t = useTranslations("CraftProfit");

  const items = useMemo(
    () =>
      buildMaterialItems({
        selectedSlot,
        rows,
        unitCostMap,
        toolEnabled,
        selectedTool,
        toolPrice,
        setToolPriceOverride,
        toolCostPerCraft,
        mobileToolRow,
        slotCount,
      }),
    [
      selectedSlot,
      rows,
      unitCostMap,
      toolEnabled,
      selectedTool,
      toolPrice,
      setToolPriceOverride,
      toolCostPerCraft,
      mobileToolRow,
      slotCount,
    ]
  );

  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + clamp0(item.amount), 0),
    [items]
  );

  return (
    <div className={styles.sectionBlock}>
      <SectionTitle>
        {locale === "en" ? "Required materials and cost" : "必要素材と原価"}
      </SectionTitle>

      <div className={styles.materialTableCard}>
        <div className={styles.materialTableScroller}>
          <table className={styles.materialTable}>
            <thead>
              <tr>
                <th className={styles.materialNameHeader}>
                  {t("materials.materialName")}
                </th>
                <th>{t("materials.required")}</th>
                <th>{t("materials.unitPrice")}</th>
                <th>{t("materials.amount")}</th>
              </tr>
            </thead>

            <tbody>
              {items.length ? (
                items.map((item) => (
                  <tr key={item.key} className={item.isTool ? styles.toolRow : ""}>
                    <td className={styles.materialNameCell}>
                      {item.name}
                    </td>
                    <td className={styles.numberCell}>
                      {item.isTool ? 1 : item.qty}
                    </td>
                    <td className={styles.inputCell}>
                      <MoneyInput
                        className={styles.moneyInput}
                        value={item.unit}
                        ariaLabel={`${item.name} ${t("materials.unitPrice")}`}
                        onChange={(value) => {
                          if (item.isTool) item.onChange?.(value);
                          else updateUnitCost(item.key, value);
                        }}
                      />
                    </td>
                    <td className={styles.amountCell}>{yen(item.amount)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className={styles.emptyTableCell}>
                    {t("materials.noMaterials")}
                  </td>
                </tr>
              )}
            </tbody>

            <tfoot>
              <tr>
                <td colSpan={3}>{t("materials.total")}</td>
                <td className={styles.totalAmount}>{yen(totalAmount)}G</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function getRecommendedPrices(selectedSlot, sortedSlots, slotPricing) {
  if (selectedSlot !== ALL_SLOT) {
    return slotPricing?.[selectedSlot]?.prices ?? null;
  }

  const hasAnyPrice = sortedSlots.some(
    (slot) => slotPricing?.[slot]?.prices
  );

  if (!hasAnyPrice) return null;

  return STAR_ROWS.reduce((result, [key]) => {
    result[key] = sortedSlots.reduce(
      (sum, slot) => sum + Number(slotPricing?.[slot]?.prices?.[key] || 0),
      0
    );
    return result;
  }, {});
}

function RecommendedPricePanel({ prices, locale }) {
  return (
    <div className={styles.sectionBlock}>
      <SectionTitle>
        {locale === "en" ? "Recommended selling prices" : "販売目安価格"}
      </SectionTitle>

      <div className={styles.priceTableCard}>
        <table className={styles.priceTable}>
          <tbody>
            {STAR_ROWS.map(([key, label]) => (
              <tr key={key}>
                <th>{label}</th>
                <td>{prices ? `${yen(prices[key])}G` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CraftProfitMaterialsCard({
  slots,
  rows,
  slotGrids,
  slotGridMeta,
  selectedSet,
  activeSlot,
  setActiveSlot,
  onSelectedTabChange,
  unitCostMap,
  updateUnitCost,
  mobileToolRow,
  toolEnabled,
  selectedTool,
  toolPrice,
  setToolPriceOverride,
  toolCostPerCraft,
  slotPricing,
}) {
  const t = useTranslations("CraftProfit");
  const locale = useLocale();

  const safeSlots = Array.isArray(slots) ? slots : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const sortedSlots = useMemo(
    () => sortAxisSlots(safeSlots, locale, slotGridMeta, selectedSet),
    [safeSlots, locale, slotGridMeta, selectedSet]
  );
  const equipmentIsSet = useMemo(
    () => isEquipmentSet(selectedSet),
    [selectedSet]
  );

  const slotItemMap = useMemo(() => {
    const map = {};
    const items = Array.isArray(selectedSet?.items) ? selectedSet.items : [];
    const slotCounts = items.reduce((result, item) => {
      const slotKey = normalizeSlotKey(item?.slotKey ?? item?.slot);
      result[slotKey] = (result[slotKey] || 0) + 1;
      return result;
    }, {});

    for (const item of items) {
      const idKeys = [
        item?.id,
        item?.itemId,
        item?.item_id,
        item?.equipmentId,
        item?.equipment_id,
      ];

      for (const idKey of idKeys) {
        if (idKey != null) map[String(idKey)] = item.name;
      }

      const slotKey = normalizeSlotKey(item?.slotKey ?? item?.slot);

      // 同じ部位が複数ある場合、部位キーでは上書きしない。
      // 個別の装備IDキーと slotGridMeta の itemName を使って表示する。
      if (slotCounts[slotKey] === 1) {
        map[slotKey] = item.name;
        if (item?.slot) map[item.slot] = item.name;
      }
    }

    return map;
  }, [selectedSet]);

  const [selectedTab, setSelectedTab] = useState("");

  const selectedSetKey = useMemo(() => {
    if (!selectedSet) return "";

    const items = Array.isArray(selectedSet.items) ? selectedSet.items : [];
    const itemKey = items
      .map((item) =>
        String(
          item?.id ??
            item?.itemId ??
            item?.item_id ??
            item?.slotKey ??
            item?.slot ??
            item?.name ??
            ""
        )
      )
      .join("|");

    return String(
      selectedSet.id ??
        selectedSet.setId ??
        selectedSet.set_id ??
        selectedSet.groupId ??
        selectedSet.group_id ??
        selectedSet.name ??
        itemKey
    );
  }, [selectedSet]);

  const previousSelectedSetKeyRef = useRef("");

  useEffect(() => {
    // 初期ロード中・装備未選択時はタブを空にする。
    if (!selectedSet || sortedSlots.length === 0) {
      previousSelectedSetKeyRef.current = "";
      setSelectedTab("");
      return;
    }

    const availableTabs = equipmentIsSet
      ? [ALL_SLOT, ...sortedSlots]
      : sortedSlots;
    const selectedSetChanged =
      previousSelectedSetKeyRef.current !== selectedSetKey;

    previousSelectedSetKeyRef.current = selectedSetKey;

    setSelectedTab((currentTab) => {
      // 装備を選び直したときは、セット装備なら「全て」を初期選択する。
      if (selectedSetChanged) {
        if (equipmentIsSet) return ALL_SLOT;

        if (activeSlot && sortedSlots.includes(activeSlot)) {
          return activeSlot;
        }

        return sortedSlots[0] ?? "";
      }

      // ユーザーが選択した有効なタブはそのまま維持する。
      if (availableTabs.includes(currentTab)) {
        return currentTab;
      }

      // 単体装備のみ、親側の有効な部位を優先する。
      if (
        !equipmentIsSet &&
        activeSlot &&
        sortedSlots.includes(activeSlot)
      ) {
        return activeSlot;
      }

      return equipmentIsSet ? ALL_SLOT : sortedSlots[0] ?? "";
    });
  }, [
    selectedSet,
    selectedSetKey,
    equipmentIsSet,
    activeSlot,
    sortedSlots,
  ]);

  // 選択中タブを親へ通知する。
  // 「全て」も通知することで、レポート対象名をセット名へ切り替える。
  useEffect(() => {
    if (!selectedTab) return;
    onSelectedTabChange?.(selectedTab);
  }, [selectedTab, onSelectedTabChange]);

  // 個別部位を表示しているときは、大成功基準値の部位を親へ同期する。
  useEffect(() => {
    if (!selectedTab || selectedTab === ALL_SLOT) return;
    if (selectedTab === activeSlot) return;

    setActiveSlot?.(selectedTab);
  }, [selectedTab, activeSlot, setActiveSlot]);

  const swipeTabs = useMemo(
    () =>
      equipmentIsSet
        ? [ALL_SLOT, ...sortedSlots]
        : sortedSlots,
    [equipmentIsSet, sortedSlots]
  );
  const swipeStartRef = useRef(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState(null);
  const [swipeAnimationKey, setSwipeAnimationKey] = useState(0);

  const changeTab = (slot, direction = null) => {
    if (!slot || slot === selectedTab) return;

    if (direction) {
      setSwipeDirection(direction);
      setSwipeAnimationKey((value) => value + 1);
    }

    setSelectedTab(slot);

    if (slot !== ALL_SLOT) {
      setActiveSlot?.(slot);
    }
  };

  const handleTabChange = (slot) => {
    const currentIndex = swipeTabs.indexOf(selectedTab);
    const nextIndex = swipeTabs.indexOf(slot);
    const direction =
      currentIndex >= 0 && nextIndex >= 0 && currentIndex !== nextIndex
        ? nextIndex > currentIndex
          ? "left"
          : "right"
        : null;

    changeTab(slot, direction);
  };

  const resetSwipeDrag = () => {
    swipeStartRef.current = null;
    setDragOffset(0);
    setIsDragging(false);
  };

  const handleTouchStart = (event) => {
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    swipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      horizontal: null,
    };
    setSwipeDirection(null);
  };

  const handleTouchMove = (event) => {
    const start = swipeStartRef.current;
    if (!start || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const diffX = touch.clientX - start.x;
    const diffY = touch.clientY - start.y;

    if (start.horizontal == null) {
      if (Math.abs(diffX) < 8 && Math.abs(diffY) < 8) return;
      start.horizontal = Math.abs(diffX) > Math.abs(diffY) * 1.1;
    }

    if (!start.horizontal) return;

    event.preventDefault();
    setIsDragging(true);
    setDragOffset(Math.max(-90, Math.min(90, diffX * 0.35)));
  };

  const handleTouchEnd = (event) => {
    const start = swipeStartRef.current;

    if (!start || !event.changedTouches.length) {
      resetSwipeDrag();
      return;
    }

    const touch = event.changedTouches[0];
    const diffX = touch.clientX - start.x;
    const diffY = touch.clientY - start.y;
    const isHorizontal =
      start.horizontal === true ||
      (Math.abs(diffX) >= 45 && Math.abs(diffX) > Math.abs(diffY) * 1.2);

    resetSwipeDrag();

    if (!isHorizontal || Math.abs(diffX) < 45) return;

    const currentIndex = swipeTabs.indexOf(selectedTab);
    if (currentIndex < 0) return;

    const direction = diffX < 0 ? "left" : "right";
    const nextIndex = Math.min(
      swipeTabs.length - 1,
      Math.max(0, currentIndex + (direction === "left" ? 1 : -1))
    );

    const nextTab = swipeTabs[nextIndex];
    changeTab(nextTab, direction);
  };

  const recommendedPrices = useMemo(
    () => getRecommendedPrices(selectedTab, sortedSlots, slotPricing),
    [selectedTab, sortedSlots, slotPricing]
  );

  const showBaseValues = selectedTab !== ALL_SLOT;

  if (!selectedSet || sortedSlots.length === 0 || !selectedTab) {
    return null;
  }

  return (
    <section className={styles.card}>
      <div className={styles.headingRow}>
        <h2 className={styles.heading}>{t("materials.title")}</h2>
        {swipeTabs.length > 1 ? <SwipeHint locale={locale} /> : null}
      </div>

      <SlotTabs
        slots={sortedSlots}
        activeSlot={selectedTab}
        onChange={handleTabChange}
        slotGridMeta={slotGridMeta}
        slotItemMap={slotItemMap}
        selectedSet={selectedSet}
        locale={locale}
      />

      

      <div className={styles.swipeViewport}>
        <div
          key={`${selectedTab}-${swipeAnimationKey}`}
          className={`${styles.swipeArea} ${
            isDragging ? styles.swipeDragging : ""
          } ${
            swipeDirection === "left" ? styles.swipeEnterFromRight : ""
          } ${
            swipeDirection === "right" ? styles.swipeEnterFromLeft : ""
          }`}
          style={{ "--swipe-drag-x": `${dragOffset}px` }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={resetSwipeDrag}
          onAnimationEnd={() => setSwipeDirection(null)}
        >
        <div
          className={`${styles.mainContentGrid} ${
            showBaseValues ? "" : styles.mainContentGridAll
          }`}
        >
          {showBaseValues ? (
            <BaseValuePanel
              slot={selectedTab}
              slotGrids={slotGrids}
              slotGridMeta={slotGridMeta}
              slotItemMap={slotItemMap}
              selectedSet={selectedSet}
              locale={locale}
            />
          ) : null}

          <MaterialsPanel
            selectedSlot={selectedTab}
            rows={safeRows}
            unitCostMap={unitCostMap}
            updateUnitCost={updateUnitCost}
            toolEnabled={toolEnabled}
            selectedTool={selectedTool}
            toolPrice={toolPrice}
            setToolPriceOverride={setToolPriceOverride}
            toolCostPerCraft={toolCostPerCraft}
            mobileToolRow={mobileToolRow}
            slotCount={sortedSlots.length}
            locale={locale}
          />
        </div>

          {selectedTab !== ALL_SLOT ? (
            <RecommendedPricePanel prices={recommendedPrices} locale={locale} />
          ) : null}
        </div>
      </div>
    </section>
  );
}
