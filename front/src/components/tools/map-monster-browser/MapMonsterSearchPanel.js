"use client";

import { useTranslations } from "next-intl";
import SearchableSelect from "@/components/common/form/SearchableSelect";
import DropdownSelect from "@/components/common/form/DropdownSelect";
import styles from "./MapMonsterBrowser.module.css";
import {
  DROP_SEARCH_MIN_LENGTH,
  cn,
  getDisplayValue,
  normalizeText,
  sortJa,
} from "./mapMonsterBrowserUtils";

export default function MapMonsterSearchPanel({
  continents = [],
  loading = false,
  loadingContinents = false,
  loadingMonsterIndex = false,
  monsterDetailsReady = false,
  selectedContinentId = "",
  onContinentChange,
  searchMode = "map",
  onSearchModeChange,
  selectedSystemType = "",
  onSearchSystemChange,
  systemTypesInContinent = [],
  dropKeyword = "",
  onDropKeywordChange,
  dropSuggestions = [],
  dropSearchLoading = false,
  dropSearchError = "",
  dropSearchReady = false,
  mapsForSearch = [],
  selectedMapId = "",
  onMapChange,
  mapLayers = [],
  selectedLayerId = "all",
  onLayerChange,
  selectedMap = null,
}) {
  const t = useTranslations("MapMonsterBrowser");
  const normalizedDropQuery = normalizeText(dropKeyword);

  const mapSearchDisabled =
    loading ||
    !selectedContinentId ||
    (searchMode === "system" &&
      (!selectedSystemType || !monsterDetailsReady)) ||
    (searchMode === "drop" && !dropSearchReady);

  const mapPlaceholder = !selectedContinentId
    ? t("selectContinentFirst")
    : loading
      ? t("loadingContinentData")
      : searchMode === "system" &&
          (loadingMonsterIndex || !monsterDetailsReady)
        ? t("search.loadingSystems")
        : searchMode === "system" && !selectedSystemType
          ? t("search.selectSystemFirst")
          : searchMode === "drop" &&
              normalizedDropQuery.length < DROP_SEARCH_MIN_LENGTH
            ? t("search.selectDropFirst")
            : searchMode === "drop" && dropSearchLoading
              ? t("search.loadingDrops")
              : t("mapPlaceholder");

  const dropEmptyText = dropSearchError
    ? dropSearchError
    : dropSearchLoading
      ? t("search.loadingDrops")
      : normalizedDropQuery.length < DROP_SEARCH_MIN_LENGTH
        ? t("search.dropMinLength")
        : t("search.noDrops");

  return (
    <>
      <div className={styles.filterPanel}>
        <div className={styles.filterField}>
          <span className={styles.labelText}>{t("continent")}</span>

          <SearchableSelect
            disabled={loadingContinents}
            value={selectedContinentId}
            onChange={onContinentChange}
            options={continents}
            selectOnFocus
            placeholder={
              loadingContinents
                ? t("loadingContinentData")
                : t("continentPlaceholder")
            }
            emptyText={t("noCandidates")}
            ariaLabel={t("continent")}
            getOptionValue={(option) => option?.id}
            getOptionLabel={(option) =>
              getDisplayValue(option, ["continent_name", "name"], "")
            }
            getOptionSearchText={(option) =>
              [
                getDisplayValue(option, [
                  "continent_name",
                  "name",
                  "name_ja",
                ]),
                normalizeText(
                  option?.continent_name_kana ?? option?.name_kana
                ),
                normalizeText(
                  option?.continent_name_en ?? option?.name_en
                ),
              ]
                .filter(Boolean)
                .join(" ")
            }
            sortOptions={(a, b) => {
              const aOrder = Number(a?.display_order ?? 0);
              const bOrder = Number(b?.display_order ?? 0);

              if (aOrder !== bOrder) return aOrder - bOrder;

              return sortJa(
                getDisplayValue(a, ["continent_name", "name"]),
                getDisplayValue(b, ["continent_name", "name"])
              );
            }}
          />
        </div>

        <div className={styles.filterField}>
          <span className={styles.labelText}>{t("search.method")}</span>

          <DropdownSelect
            value={searchMode}
            onChange={onSearchModeChange}
            ariaLabel={t("search.method")}
            options={[
              { value: "map", label: t("search.byMap") },
              { value: "system", label: t("search.bySystem") },
              { value: "drop", label: t("search.byDrop") },
            ]}
          />
        </div>

        {searchMode === "system" ? (
          <div className={styles.filterField}>
            <span className={styles.labelText}>
              {t("search.systemSearch")}
            </span>

            <DropdownSelect
              value={selectedSystemType}
              onChange={onSearchSystemChange}
              disabled={
                !selectedContinentId ||
                loading ||
                loadingMonsterIndex ||
                !monsterDetailsReady
              }
              ariaLabel={t("search.systemSearch")}
              options={[
                {
                  value: "",
                  label: !selectedContinentId
                    ? t("search.selectSystem")
                    : loading || loadingMonsterIndex || !monsterDetailsReady
                      ? t("search.loadingSystems")
                      : systemTypesInContinent.length === 0
                        ? t("search.noSystems")
                        : t("search.selectSystem"),
                },
                ...systemTypesInContinent.map((systemType) => ({
                  value: systemType,
                  label: systemType,
                })),
              ]}
            />
          </div>
        ) : null}

        {searchMode === "drop" ? (
          <div className={styles.filterField}>
            <span className={styles.labelText}>
              {t("search.dropSearch")}
            </span>

            <SearchableSelect
              value={dropKeyword}
              onChange={onDropKeywordChange}
              options={dropSuggestions}
              disabled={!selectedContinentId}
              placeholder={
                selectedContinentId
                  ? t("search.selectDrop")
                  : t("selectContinentFirst")
              }
              emptyText={dropEmptyText}
              maxResults={12}
              allowCustomValue
              selectOnFocus
              selectSingleOnEnter
              ariaLabel={t("search.dropSearch")}
              getOptionValue={(option) => option?.label ?? ""}
              getOptionLabel={(option) => option?.label ?? ""}
              getOptionSearchText={(option) =>
                option?.searchText || option?.label || ""
              }
            />
          </div>
        ) : null}

        <div
          className={cn(
            styles.filterField,
            styles.mapField,
            searchMode === "map" && styles.mapFieldWide
          )}
        >
          <span className={styles.labelText}>
            {searchMode === "system" || searchMode === "drop"
              ? t("search.filteredMapSearch")
              : t("mapSearch")}
          </span>

          <SearchableSelect
            disabled={mapSearchDisabled}
            value={selectedMapId}
            onChange={onMapChange}
            options={mapsForSearch}
            placeholder={mapPlaceholder}
            selectOnFocus
            emptyText={t("noCandidates")}
            ariaLabel={
              searchMode === "system" || searchMode === "drop"
                ? t("search.filteredMapSearch")
                : t("mapSearch")
            }
            getOptionValue={(option) => option?.id}
            getOptionLabel={(option) =>
              getDisplayValue(option, ["map_name", "name"], "")
            }
            getOptionSearchText={(option) =>
              [
                getDisplayValue(option, ["map_name", "name", "name_ja"], ""),
                normalizeText(option?.map_name_kana ?? option?.name_kana),
                normalizeText(option?.map_name_en ?? option?.name_en),
              ]
                .filter(Boolean)
                .join(" ")
            }
            sortOptions={(a, b) =>
              sortJa(
                getDisplayValue(a, ["map_name", "name"]),
                getDisplayValue(b, ["map_name", "name"])
              )
            }
          />

          {searchMode === "system" &&
          selectedSystemType &&
          monsterDetailsReady ? (
            <div className={styles.searchInfo}>
              {t("search.matchedMaps", { count: mapsForSearch.length })}
            </div>
          ) : null}

          {searchMode === "drop" && dropSearchReady ? (
            <div className={styles.searchInfo}>
              {t("search.matchedMaps", { count: mapsForSearch.length })}
            </div>
          ) : null}
        </div>

        <div className={styles.filterField}>
          <span className={styles.labelText}>{t("displayLayer")}</span>

          <DropdownSelect
            value={selectedLayerId}
            onChange={onLayerChange}
            disabled={!selectedMap}
            ariaLabel={t("displayLayer")}
            options={[
              { value: "all", label: t("all") },
              ...mapLayers.map((layer) => ({
                value: String(layer.id),
                label:
                  getDisplayValue(layer, ["map_layer_name", "layer_name"]) ||
                  t("floorLabel", { floor: layer.floor_no ?? "" }),
              })),
            ]}
          />
        </div>
      </div>

      {searchMode === "system" && selectedSystemType ? (
        <div className={styles.searchInfo}>
          {t("search.selectedSystem", {
            systemType: selectedSystemType,
          })}
        </div>
      ) : null}

      {searchMode === "drop" && dropSearchReady ? (
        <div className={styles.searchInfo}>
          {t("search.selectedDrop", {
            dropName: normalizedDropQuery,
          })}
        </div>
      ) : null}
    </>
  );
}
