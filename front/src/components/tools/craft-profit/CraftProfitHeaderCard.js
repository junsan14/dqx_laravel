"use client";

import { useLocale, useTranslations } from "next-intl";
import DropdownSelect from "@/components/common/DropdownSelect";
import SearchableSelect from "@/components/common/SearchableSelect";
import styles from "./CraftProfitHeaderCard.module.css";

export default function CraftProfitHeaderCard({
  setQuery,
  setSetQuery,
  filteredSets,
  onChangeSet,
  searchLoading,
  selectionLoading,
  searchError,
  craftType,
  selectedSet,
  toolId,
  setToolId,
  toolOptions,
  toolPrice,
  setToolPriceOverride,
}) {
  const t = useTranslations("CraftProfit");
  const locale = useLocale();

  const hasToolOptions =
    Array.isArray(toolOptions) && toolOptions.length > 1;
  const queryLength = String(setQuery ?? "").trim().length;
  const searchEmptyText = searchError
    ? searchError
    : searchLoading
    ? locale === "en"
      ? "Searching..."
      : "検索中..."
    : queryLength < 2
    ? locale === "en"
      ? "Enter at least 2 characters"
      : "2文字以上入力してください"
    : t("common.noResults");

  return (
    <section className={styles.card}>
      <div className={styles.formStack}>
        <div className={styles.top}>
          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <label className={styles.label}>
                {t("header.equipmentSet")}
              </label>

              <div className={styles.equipmentMeta}>
                <span className={styles.craftTypeName}>
                  {selectionLoading ? (
                    <span
                      className={styles.metaSkeleton}
                      aria-hidden="true"
                    />
                  ) : (
                    craftType || "—"
                  )}
                </span>

                <span className={styles.requiredLevel}>
                  {selectionLoading
                    ? locale === "en"
                      ? "Loading..."
                      : "読み込み中..."
                    : `必要LV${selectedSet?.craftLevel ?? "—"}`}
                </span>
              </div>
            </div>

            <div className={styles.fieldControl}>
              <SearchableSelect
                value={setQuery}
                onChange={(nextValue, option) => {
                  setSetQuery(nextValue);

                  if (option) {
                    onChangeSet(option.id);
                  }
                }}
                options={filteredSets}
                placeholder={t("header.searchPlaceholder")}
                emptyText={searchEmptyText}
                maxResults={30}
                allowCustomValue
                selectOnFocus
                selectSingleOnEnter
                ariaLabel={t("header.equipmentSet")}
                getOptionValue={(option) => option.name}
                getOptionLabel={(option) => option.name}
                getOptionDescription={() => ""}
                getOptionSearchText={(option) => {
                const itemNames = Array.isArray(option.items)
                  ? option.items
                      .map((item) => item?.name)
                      .filter(Boolean)
                  : [];

                const itemNameKanas = Array.isArray(option.items)
                  ? option.items
                      .map((item) => item?.nameKana)
                      .filter(Boolean)
                  : [];

                const itemEquipLevels = Array.isArray(option.items)
                  ? option.items
                      .map((item) => item?.equipLevel)
                      .filter(
                        (level) => level != null && level !== ""
                      )
                  : [];

                return [
                  option.name,
                  option.nameKana, // 追加
                  ...itemNames,
                  ...itemNameKanas, // 追加
                  option.equipLevel,
                  ...itemEquipLevels,
                ]
                  .filter(
                    (value) => value != null && value !== ""
                  )
                  .join(" ");
              }}
              />
            </div>
          </div>
        </div>

        {selectionLoading ? (
          <div className={styles.field} aria-hidden="true">
            <span className={styles.labelSkeleton} />
            <div className={styles.toolControls}>
              <span className={styles.controlSkeleton} />
              <span className={styles.controlSkeleton} />
            </div>
          </div>
        ) : hasToolOptions ? (
          <div className={styles.field}>
            <label className={styles.label}>
              {t("header.toolUsage")}
            </label>

            <div className={styles.toolControls}>
              <DropdownSelect
                value={toolId}
                onChange={(nextValue) => {
                  setToolId(nextValue);
                  setToolPriceOverride(null);
                }}
                options={toolOptions}
                getOptionValue={(option) => option.id}
                getOptionLabel={(option) => option.name}
                ariaLabel={t("header.toolUsage")}
              />

              <input
                type="number"
                inputMode="numeric"
                className={styles.priceInput}
                value={toolPrice}
                min={0}
                onChange={(event) =>
                  setToolPriceOverride(
                    Number(event.target.value)
                  )
                }
                title={t("header.toolPriceTitle")}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
