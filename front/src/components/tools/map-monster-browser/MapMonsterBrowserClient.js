"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { fetchMaps, fetchMapOptions } from "@/lib/maps";
import { fetchMonsterMapSpawns } from "@/lib/monsterMapSpawns";
import { fetchMonsterDetail, searchMonsters } from "@/lib/monsters";
import PageHeroTitle from "@/components/PageHeroTitle";
import MapMonsterSearchPanel from "./MapMonsterSearchPanel";
import MapMonsterAside from "./MapMonsterAside";
import MapMonsterHabitatArea, {
  MapMonsterBrowserContentSkeleton,
} from "./MapMonsterHabitatArea";
import styles from "./MapMonsterBrowser.module.css";
import {
  DROP_SEARCH_MIN_LENGTH,
  buildDropSuggestions,
  buildMonsterSeedsFromSpawns,
  cn,
  compareSpawnsByMonsterDisplayOrder,
  getDisplayValue,
  getRelatedMonsterIds,
  isBrowsableMapType,
  mergeMonsterRows,
  normalizeText,
  sortJa,
  uniqBy,
  useIsMobile,
} from "./mapMonsterBrowserUtils";

const DROP_SEARCH_DEBOUNCE_MS = 180;

const mapOptionsRequestCache = new Map();
const mapDataRequestCache = new Map();
const monsterIndexRequestCache = new Map();

function getCachedRequest(cache, key, loader) {
  if (cache.has(key)) {
    return cache.get(key);
  }

  const request = Promise.resolve()
    .then(loader)
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, request);
  return request;
}

function fetchMapOptionsCached(locale) {
  return getCachedRequest(mapOptionsRequestCache, locale, () =>
    fetchMapOptions(locale)
  );
}

function fetchMapDataCached(locale) {
  return getCachedRequest(mapDataRequestCache, locale, () =>
    Promise.all([
      fetchMaps("", locale),
      fetchMonsterMapSpawns(undefined, locale),
    ])
  );
}

function fetchMonsterIndexCached(locale) {
  return getCachedRequest(monsterIndexRequestCache, locale, () =>
    searchMonsters("", "monster", locale)
  );
}

async function fetchMonsterDetailsInBatches(ids, locale, batchSize = 12) {
  const results = [];

  for (let index = 0; index < ids.length; index += batchSize) {
    const batch = ids.slice(index, index + batchSize);
    const rows = await Promise.all(
      batch.map(async (id) => {
        try {
          return await fetchMonsterDetail(id, locale);
        } catch (error) {
          console.error(`Failed to load monster ${id}`, error);
          return null;
        }
      })
    );

    results.push(...rows.filter(Boolean));
  }

  return results;
}

export default function MapMonsterBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("MapMonsterBrowser");
  const noDropsText = t("search.noDrops");
  const isMobile = useIsMobile();


  const [continents, setContinents] = useState([]);
  const [maps, setMaps] = useState([]);
  const [allSpawns, setAllSpawns] = useState([]);
  const [monsterMaster, setMonsterMaster] = useState({});
  const [monsterMasterLocale, setMonsterMasterLocale] = useState(locale);
  const [resolvedMonsterIds, setResolvedMonsterIds] = useState(
    () => new Set()
  );
  const [loading, setLoading] = useState(true);
  const [loadingContinents, setLoadingContinents] = useState(true);
  const [loadingMonsterIndex, setLoadingMonsterIndex] = useState(true);
  const [loadingMonsterMaster, setLoadingMonsterMaster] = useState(false);
  const [error, setError] = useState("");

  const [selectedContinentId, setSelectedContinentId] = useState("");
  const [searchMode, setSearchMode] = useState("map");
  const [selectedMapId, setSelectedMapId] = useState("");
  const [selectedLayerId, setSelectedLayerId] = useState("all");
  const [selectedMonsterId, setSelectedMonsterId] = useState("");
  const [selectedSystemType, setSelectedSystemType] = useState("");
  const [dropKeyword, setDropKeyword] = useState("");
  const [dropSearchResults, setDropSearchResults] = useState([]);
  const [dropSuggestions, setDropSuggestions] = useState([]);
  const [dropSearchLoading, setDropSearchLoading] = useState(false);
  const [dropSearchError, setDropSearchError] = useState("");
  const [dropSearchCompletedQuery, setDropSearchCompletedQuery] = useState("");

  const dropSearchTimerRef = useRef(null);
  const dropSearchCacheRef = useRef(new Map());

  function syncUrl({
    continentId = selectedContinentId,
    mapId = selectedMapId,
    layerId = selectedLayerId,
    mode = searchMode,
    systemType = selectedSystemType,
    dropName = dropKeyword,
  } = {}) {
    const params = new URLSearchParams(searchParams?.toString() || "");

    if (continentId) params.set("continentId", String(continentId));
    else params.delete("continentId");

    if (mapId) params.set("mapId", String(mapId));
    else params.delete("mapId");

    if (layerId && layerId !== "all") params.set("layerId", String(layerId));
    else params.delete("layerId");

    if (mode === "system" || mode === "drop") {
      params.set("searchMode", mode);
    } else {
      params.delete("searchMode");
    }

    if (systemType) params.set("systemType", systemType);
    else params.delete("systemType");

    if (mode === "drop" && normalizeText(dropName)) {
      params.set("dropName", normalizeText(dropName));
    } else {
      params.delete("dropName");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  useEffect(() => {
    const nextContinentId = searchParams?.get("continentId") ?? "";
    const nextMapId = searchParams?.get("mapId") ?? "";
    const nextLayerId = searchParams?.get("layerId") ?? "all";
    const rawSearchMode = searchParams?.get("searchMode");
    const nextSearchMode =
      rawSearchMode === "system" || rawSearchMode === "drop"
        ? rawSearchMode
        : "map";
    const nextSystemType = searchParams?.get("systemType") ?? "";
    const nextDropName = searchParams?.get("dropName") ?? "";

    setSelectedContinentId((previous) =>
      previous === nextContinentId ? previous : nextContinentId
    );
    setSelectedMapId((previous) =>
      previous === nextMapId ? previous : nextMapId
    );
    setSelectedLayerId((previous) =>
      previous === nextLayerId ? previous : nextLayerId
    );
    setSearchMode((previous) =>
      previous === nextSearchMode ? previous : nextSearchMode
    );
    setSelectedSystemType((previous) =>
      previous === nextSystemType ? previous : nextSystemType
    );
    setDropKeyword((previous) =>
      previous === nextDropName ? previous : nextDropName
    );
  }, [searchParams]);

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setLoadingContinents(true);
    setLoadingMonsterIndex(true);
    setLoadingMonsterMaster(false);
    setError("");
    setMonsterMaster({});
    setResolvedMonsterIds(new Set());
    setMonsterMasterLocale(locale);

    fetchMapOptionsCached(locale)
      .then((mapOptions) => {
        if (ignore) return;

        const nextContinents = Array.isArray(mapOptions?.continents)
          ? [...mapOptions.continents]
              .filter((row) => row && row.id != null)
              .sort((a, b) => {
                const aOrder = Number(
                  a?.display_order ?? a?.display_id ?? 0
                );
                const bOrder = Number(
                  b?.display_order ?? b?.display_id ?? 0
                );
                if (aOrder !== bOrder) return aOrder - bOrder;

                return sortJa(
                  getDisplayValue(a, ["continent_name", "name"]),
                  getDisplayValue(b, ["continent_name", "name"])
                );
              })
          : [];

        setContinents(nextContinents);
      })
      .catch((optionsError) => {
        console.error(optionsError);
        if (!ignore) {
          setError(optionsError?.message || t("loadFailed"));
        }
      })
      .finally(() => {
        if (!ignore) setLoadingContinents(false);
      });

    fetchMapDataCached(locale)
      .then(([mapRows, spawnRows]) => {
        if (ignore) return;

        const nextMaps = Array.isArray(mapRows)
          ? mapRows.filter((row) => isBrowsableMapType(row?.map_type))
          : [];
        const nextSpawns = Array.isArray(spawnRows) ? spawnRows : [];

        setMaps(nextMaps);
        setAllSpawns(nextSpawns);
        setMonsterMaster((previous) =>
          mergeMonsterRows(previous, buildMonsterSeedsFromSpawns(nextSpawns))
        );
      })
      .catch((mapDataError) => {
        console.error(mapDataError);
        if (!ignore) {
          setError(mapDataError?.message || t("loadFailed"));
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    fetchMonsterIndexCached(locale)
      .then((monsterRows) => {
        if (ignore) return;

        const safeRows = Array.isArray(monsterRows) ? monsterRows : [];

        setMonsterMaster((previous) =>
          mergeMonsterRows(previous, safeRows)
        );
        setResolvedMonsterIds(
          new Set(
            safeRows
              .map((row) => Number(row?.id))
              .filter(Boolean)
          )
        );
        setMonsterMasterLocale(locale);
      })
      .catch((monsterIndexError) => {
        console.error("Failed to preload monster index", monsterIndexError);
      })
      .finally(() => {
        if (!ignore) setLoadingMonsterIndex(false);
      });

    return () => {
      ignore = true;
    };
  }, [locale, t]);

  useEffect(() => {
    let ignore = false;

    if (dropSearchTimerRef.current) {
      window.clearTimeout(dropSearchTimerRef.current);
      dropSearchTimerRef.current = null;
    }

    if (searchMode !== "drop") {
      setDropSearchLoading(false);
      setDropSearchError("");
      return undefined;
    }

    const query = normalizeText(dropKeyword);

    if (query.length < DROP_SEARCH_MIN_LENGTH) {
      setDropSearchResults([]);
      setDropSuggestions([]);
      setDropSearchLoading(false);
      setDropSearchError("");
      setDropSearchCompletedQuery("");
      return undefined;
    }

    dropSearchTimerRef.current = window.setTimeout(async () => {
      setDropSearchLoading(true);
      setDropSearchError("");

      try {
        const cacheKey = `${locale}:${query.toLocaleLowerCase()}`;
        let rows = dropSearchCacheRef.current.get(cacheKey);

        if (!rows) {
          rows = await searchMonsters(query, "item", locale);
          dropSearchCacheRef.current.set(
            cacheKey,
            Array.isArray(rows) ? rows : []
          );
        }

        if (ignore) return;

        const safeRows = Array.isArray(rows) ? rows : [];
        setDropSearchResults(safeRows);
        setDropSuggestions(buildDropSuggestions(safeRows));
        setDropSearchCompletedQuery(query);
        setMonsterMaster((previous) =>
          mergeMonsterRows(previous, safeRows)
        );
        setResolvedMonsterIds((previous) => {
          const next = new Set(previous);
          for (const row of safeRows) {
            const id = Number(row?.id);
            if (id) next.add(id);
          }
          return next;
        });
        setMonsterMasterLocale(locale);
      } catch (dropError) {
        console.error("Drop search failed", dropError);
        if (!ignore) {
          setDropSearchResults([]);
          setDropSuggestions([]);
          setDropSearchCompletedQuery(query);
          setDropSearchError(dropError?.message || noDropsText);
        }
      } finally {
        if (!ignore) setDropSearchLoading(false);
      }
    }, DROP_SEARCH_DEBOUNCE_MS);

    return () => {
      ignore = true;
      if (dropSearchTimerRef.current) {
        window.clearTimeout(dropSearchTimerRef.current);
        dropSearchTimerRef.current = null;
      }
    };
  }, [dropKeyword, locale, searchMode, noDropsText]);

  const selectedContinent = useMemo(() => {
    return (
      continents.find(
        (continent) => Number(continent.id) === Number(selectedContinentId)
      ) ?? null
    );
  }, [continents, selectedContinentId]);

  const mapsInContinent = useMemo(() => {
    const rows = selectedContinentId
      ? maps.filter(
          (row) => Number(row.continent_id) === Number(selectedContinentId)
        )
      : [];

    return [...rows].sort((a, b) =>
      sortJa(
        getDisplayValue(a, ["map_name", "name"]),
        getDisplayValue(b, ["map_name", "name"])
      )
    );
  }, [maps, selectedContinentId]);

  const mapIdsInContinent = useMemo(() => {
    return new Set(mapsInContinent.map((map) => Number(map.id)));
  }, [mapsInContinent]);

  const spawnsInContinent = useMemo(() => {
    if (!selectedContinentId || mapIdsInContinent.size === 0) return [];

    return allSpawns.filter((spawn) =>
      mapIdsInContinent.has(Number(spawn.map_id))
    );
  }, [allSpawns, mapIdsInContinent, selectedContinentId]);

  const selectedMap = useMemo(() => {
    return maps.find((row) => Number(row.id) === Number(selectedMapId)) ?? null;
  }, [maps, selectedMapId]);

  const mapLayers = useMemo(() => {
    return Array.isArray(selectedMap?.layers) ? selectedMap.layers : [];
  }, [selectedMap]);

  const spawnsForSelectedMap = useMemo(() => {
    if (!selectedMapId) return [];

    return allSpawns.filter(
      (row) => Number(row.map_id) === Number(selectedMapId)
    );
  }, [allSpawns, selectedMapId]);

  const monsterIdsToLoad = useMemo(() => {
    const source = searchMode === "system" ? spawnsInContinent : spawnsForSelectedMap;

    return Array.from(
      new Set(source.map((spawn) => Number(spawn.monster_id)).filter(Boolean))
    );
  }, [searchMode, spawnsInContinent, spawnsForSelectedMap]);

  useEffect(() => {
    let ignore = false;
    const localeChanged = monsterMasterLocale !== locale;

    if (monsterIdsToLoad.length === 0) {
      setLoadingMonsterMaster(false);

      if (localeChanged) {
        setMonsterMaster({});
        setResolvedMonsterIds(new Set());
        setMonsterMasterLocale(locale);
      }

      return undefined;
    }

    if (loadingMonsterIndex && !localeChanged) {
      setLoadingMonsterMaster(true);
      return undefined;
    }

    const resolvedIds = localeChanged ? new Set() : resolvedMonsterIds;
    const missingIds = monsterIdsToLoad.filter(
      (id) => !resolvedIds.has(Number(id))
    );

    if (missingIds.length === 0) {
      setLoadingMonsterMaster(false);
      return undefined;
    }

    async function fillMonsterDetails() {
      setLoadingMonsterMaster(true);

      try {
        const results = await fetchMonsterDetailsInBatches(missingIds, locale);
        if (ignore) return;

        setMonsterMaster((previous) =>
          mergeMonsterRows(localeChanged ? {} : previous, results)
        );
        setResolvedMonsterIds((previous) => {
          const next = localeChanged ? new Set() : new Set(previous);
          for (const id of missingIds) next.add(Number(id));
          return next;
        });
        setMonsterMasterLocale(locale);
      } finally {
        if (!ignore) setLoadingMonsterMaster(false);
      }
    }

    fillMonsterDetails();

    return () => {
      ignore = true;
    };
  }, [
    locale,
    monsterIdsToLoad,
    monsterMasterLocale,
    resolvedMonsterIds,
    loadingMonsterIndex,
  ]);

  const monsterDetailsReady = useMemo(() => {
    if (monsterMasterLocale !== locale) return false;

    return monsterIdsToLoad.every((id) =>
      resolvedMonsterIds.has(Number(id))
    );
  }, [
    locale,
    monsterIdsToLoad,
    monsterMasterLocale,
    resolvedMonsterIds,
  ]);

  const normalizedDropQuery = useMemo(
    () => normalizeText(dropKeyword),
    [dropKeyword]
  );

  const dropSearchReady =
    normalizedDropQuery.length >= DROP_SEARCH_MIN_LENGTH &&
    normalizeText(dropSearchCompletedQuery) === normalizedDropQuery &&
    !dropSearchLoading &&
    !dropSearchError;

  const dropMatchedMonsterIds = useMemo(() => {
    return new Set(
      dropSearchResults
        .map((monster) => Number(monster?.id))
        .filter(Boolean)
    );
  }, [dropSearchResults]);

  const systemTypesInContinent = useMemo(() => {
    return Array.from(
      new Set(
        spawnsInContinent
          .map((spawn) => monsterMaster[spawn.monster_id]?.system_type)
          .map(normalizeText)
          .filter(Boolean)
      )
    ).sort((a, b) => sortJa(a, b));
  }, [spawnsInContinent, monsterMaster]);

  const mapIdsForSelectedSystem = useMemo(() => {
    if (!selectedSystemType) return new Set();

    const target = normalizeText(selectedSystemType);
    const ids = new Set();

    for (const spawn of spawnsInContinent) {
      const monster = monsterMaster[spawn.monster_id];
      if (normalizeText(monster?.system_type) === target) {
        ids.add(Number(spawn.map_id));
      }
    }

    return ids;
  }, [spawnsInContinent, monsterMaster, selectedSystemType]);

  const mapIdsForSelectedDrop = useMemo(() => {
    if (!dropSearchReady || dropMatchedMonsterIds.size === 0) {
      return new Set();
    }

    const ids = new Set();

    for (const spawn of spawnsInContinent) {
      if (dropMatchedMonsterIds.has(Number(spawn.monster_id))) {
        ids.add(Number(spawn.map_id));
      }
    }

    return ids;
  }, [dropSearchReady, dropMatchedMonsterIds, spawnsInContinent]);

  const mapsForSearch = useMemo(() => {
    if (searchMode === "system") {
      if (!selectedSystemType) return [];

      return mapsInContinent.filter((map) =>
        mapIdsForSelectedSystem.has(Number(map.id))
      );
    }

    if (searchMode === "drop") {
      if (!dropSearchReady) return [];

      return mapsInContinent.filter((map) =>
        mapIdsForSelectedDrop.has(Number(map.id))
      );
    }

    return mapsInContinent;
  }, [
    searchMode,
    mapsInContinent,
    selectedSystemType,
    mapIdsForSelectedSystem,
    dropSearchReady,
    mapIdsForSelectedDrop,
  ]);

  useEffect(() => {
    if (!selectedContinentId || continents.length === 0) return;

    const exists = continents.some(
      (continent) => Number(continent.id) === Number(selectedContinentId)
    );

    if (!exists) {
      setSelectedContinentId("");
      setSelectedMapId("");
      setSelectedLayerId("all");
      setSelectedMonsterId("");
      setSelectedSystemType("");
      setDropKeyword("");
      setDropSearchResults([]);
      setDropSuggestions([]);
      syncUrl({
        continentId: "",
        mapId: "",
        layerId: "all",
        systemType: "",
        dropName: "",
      });
    }
  }, [continents, selectedContinentId]);

  useEffect(() => {
    if (!selectedMapId || loading) return;
    if (searchMode === "system" && loadingMonsterIndex) return;
    if (searchMode === "system" && !monsterDetailsReady) return;
    if (searchMode === "system" && !selectedSystemType) return;
    if (searchMode === "drop" && !dropSearchReady) return;

    const exists = mapsForSearch.some(
      (row) => Number(row.id) === Number(selectedMapId)
    );

    if (!exists) {
      setSelectedMapId("");
      setSelectedLayerId("all");
      setSelectedMonsterId("");
      syncUrl({ mapId: "", layerId: "all" });
    }
  }, [
    mapsForSearch,
    selectedMapId,
    searchMode,
    selectedSystemType,
    monsterDetailsReady,
    dropSearchReady,
    loading,
    loadingMonsterIndex,
  ]);

  useEffect(() => {
    if (loading) return;
    if (!selectedLayerId || selectedLayerId === "all") return;

    const exists = mapLayers.some(
      (layer) => Number(layer.id) === Number(selectedLayerId)
    );

    if (!exists) {
      setSelectedLayerId("all");
      setSelectedMonsterId("");
      syncUrl({ layerId: "all" });
    }
  }, [mapLayers, selectedLayerId, loading]);

  const candidateSpawns = useMemo(() => {
    if (!selectedMapId) return [];
    if (selectedLayerId === "all") return spawnsForSelectedMap;

    return spawnsForSelectedMap.filter(
      (spawn) => Number(spawn.map_layer_id) === Number(selectedLayerId)
    );
  }, [selectedMapId, spawnsForSelectedMap, selectedLayerId]);

  const monstersOnCurrentScope = useMemo(() => {
    const rows = candidateSpawns
      .map((spawn) => monsterMaster[spawn.monster_id])
      .filter(Boolean);

    return uniqBy(rows, (row) => row.id).sort((a, b) => {
      const aOrder = Number(a?.display_order ?? 999999);
      const bOrder = Number(b?.display_order ?? 999999);
      if (aOrder !== bOrder) return aOrder - bOrder;

      return sortJa(
        getDisplayValue(a, ["monster_name", "name"]),
        getDisplayValue(b, ["monster_name", "name"])
      );
    });
  }, [candidateSpawns, monsterMaster]);

  const monstersMatchingPrimarySearch = useMemo(() => {
    if (searchMode !== "drop") return monstersOnCurrentScope;
    if (!dropSearchReady) return [];

    return monstersOnCurrentScope.filter((monster) =>
      dropMatchedMonsterIds.has(Number(monster?.id))
    );
  }, [
    monstersOnCurrentScope,
    searchMode,
    dropSearchReady,
    dropMatchedMonsterIds,
  ]);

  const monstersVisibleInAside = useMemo(() => {
    if (!selectedSystemType) return monstersMatchingPrimarySearch;

    const target = normalizeText(selectedSystemType);
    return monstersMatchingPrimarySearch.filter(
      (monster) => normalizeText(monster?.system_type) === target
    );
  }, [monstersMatchingPrimarySearch, selectedSystemType]);

  const relatedSelectedMonsterIds = useMemo(() => {
    if (!selectedMonsterId) return new Set();
    return getRelatedMonsterIds(selectedMonsterId, monsterMaster);
  }, [selectedMonsterId, monsterMaster]);

  const systemTypesOnCurrentScope = useMemo(() => {
    return Array.from(
      new Set(
        monstersMatchingPrimarySearch
          .map((row) => normalizeText(row.system_type))
          .filter(Boolean)
      )
    ).sort((a, b) => sortJa(a, b));
  }, [monstersMatchingPrimarySearch]);

  const filteredSpawns = useMemo(() => {
    const rows = candidateSpawns.filter((spawn) => {
      const monster = monsterMaster[spawn.monster_id];

      if (
        searchMode === "drop" &&
        (!dropSearchReady ||
          !dropMatchedMonsterIds.has(Number(spawn.monster_id)))
      ) {
        return false;
      }

      if (
        selectedMonsterId &&
        !relatedSelectedMonsterIds.has(Number(spawn.monster_id))
      ) {
        return false;
      }

      if (
        selectedSystemType &&
        normalizeText(monster?.system_type) !== normalizeText(selectedSystemType)
      ) {
        return false;
      }

      return true;
    });

    return [...rows].sort((a, b) =>
      compareSpawnsByMonsterDisplayOrder(a, b, monsterMaster)
    );
  }, [
    candidateSpawns,
    monsterMaster,
    selectedMonsterId,
    selectedSystemType,
    relatedSelectedMonsterIds,
    searchMode,
    dropSearchReady,
    dropMatchedMonsterIds,
  ]);

  const layerSections = useMemo(() => {
    if (!selectedMap) return [];

    const layers = Array.isArray(selectedMap.layers) ? selectedMap.layers : [];

    return layers
      .map((layer) => {
        const layerSpawns = filteredSpawns.filter(
          (spawn) => Number(spawn.map_layer_id) === Number(layer.id)
        );

        return {
          layer,
          spawns: layerSpawns.map((spawn) => ({
            ...spawn,
            __key: spawn?.id
              ? `spawn-${spawn.id}`
              : `${layer.id}-${spawn.monster_id}-${normalizeText(spawn?.area)}`,
          })),
        };
      })
      .filter((section) => section.spawns.length > 0);
  }, [selectedMap, filteredSpawns]);

  useEffect(() => {
    if (!selectedMonsterId) return;

    const exists = candidateSpawns.some(
      (spawn) =>
        relatedSelectedMonsterIds.has(Number(spawn.monster_id)) ||
        Number(spawn.monster_id) === Number(selectedMonsterId)
    );

    if (!exists) setSelectedMonsterId("");
  }, [candidateSpawns, selectedMonsterId, relatedSelectedMonsterIds]);

  useEffect(() => {
    if (
      !selectedSystemType ||
      searchMode === "system" ||
      loading ||
      loadingMonsterIndex ||
      loadingMonsterMaster
    ) {
      return;
    }

    const exists = systemTypesOnCurrentScope.some(
      (systemType) =>
        normalizeText(systemType) === normalizeText(selectedSystemType)
    );

    if (!exists) {
      setSelectedSystemType("");
      syncUrl({ systemType: "" });
    }
  }, [
    systemTypesOnCurrentScope,
    selectedSystemType,
    searchMode,
    loading,
    loadingMonsterIndex,
    loadingMonsterMaster,
  ]);

  function handleContinentChange(value) {
    setSelectedContinentId(value);
    setSelectedMapId("");
    setSelectedLayerId("all");
    setSelectedMonsterId("");
    setSelectedSystemType("");
    setDropKeyword("");
    setDropSearchResults([]);
    setDropSuggestions([]);
    setDropSearchCompletedQuery("");

    syncUrl({
      continentId: value,
      mapId: "",
      layerId: "all",
      systemType: "",
      dropName: "",
    });
  }

  function handleSearchModeChange(nextMode) {
    const normalizedMode =
      nextMode === "system" || nextMode === "drop" ? nextMode : "map";

    setSearchMode(normalizedMode);
    setSelectedMapId("");
    setSelectedLayerId("all");
    setSelectedMonsterId("");
    setSelectedSystemType("");

    if (normalizedMode !== "drop") {
      setDropKeyword("");
      setDropSearchResults([]);
      setDropSuggestions([]);
      setDropSearchCompletedQuery("");
    }

    syncUrl({
      mode: normalizedMode,
      mapId: "",
      layerId: "all",
      systemType: "",
      dropName: normalizedMode === "drop" ? dropKeyword : "",
    });
  }

  function handleSearchSystemChange(systemType) {
    setSelectedSystemType(systemType);
    setSelectedMapId("");
    setSelectedLayerId("all");
    setSelectedMonsterId("");

    syncUrl({
      mapId: "",
      layerId: "all",
      mode: "system",
      systemType,
      dropName: "",
    });
  }

  function handleDropKeywordChange(nextValue, option) {
    const nextKeyword = String(nextValue ?? "");

    setDropKeyword(nextKeyword);
    setSelectedMapId("");
    setSelectedLayerId("all");
    setSelectedMonsterId("");
    setSelectedSystemType("");

    if (!normalizeText(nextKeyword)) {
      setDropSearchResults([]);
      setDropSuggestions([]);
      setDropSearchCompletedQuery("");
    }

    if (option || !normalizeText(nextKeyword)) {
      syncUrl({
        mapId: "",
        layerId: "all",
        mode: "drop",
        systemType: "",
        dropName: nextKeyword,
      });
    }
  }

  function handleMapChange(value) {
    const nextSystemType = searchMode === "system" ? selectedSystemType : "";

    setSelectedMapId(value);
    setSelectedLayerId("all");
    setSelectedMonsterId("");
    setSelectedSystemType(nextSystemType);

    syncUrl({
      mapId: value,
      layerId: "all",
      systemType: nextSystemType,
      dropName: searchMode === "drop" ? dropKeyword : "",
    });
  }

  function handleLayerChange(nextLayerId) {
    setSelectedLayerId(nextLayerId);
    setSelectedMonsterId("");
    syncUrl({ layerId: nextLayerId });
  }

  function handleMonsterToggle(monsterId) {
    if (Number(selectedMonsterId) === Number(monsterId)) {
      setSelectedMonsterId("");
      return;
    }

    setSelectedMonsterId(monsterId);

    if (searchMode !== "system") {
      setSelectedSystemType("");
      syncUrl({ systemType: "" });
    }
  }

  function handleSystemTypeToggle(systemType) {
    const isActive =
      normalizeText(selectedSystemType) === normalizeText(systemType);

    if (isActive && searchMode === "system") return;

    const nextSystemType = isActive ? "" : systemType;
    setSelectedSystemType(nextSystemType);
    setSelectedMonsterId("");
    syncUrl({ systemType: nextSystemType });
  }

  const shouldUseCarousel =
    selectedLayerId === "all" && layerSections.length > 1;

  const backHref = useMemo(() => {
    const query = searchParams?.toString?.() || "";
    return query
      ? `/tools/map-monster-browser?${query}`
      : "/tools/map-monster-browser";
  }, [searchParams]);

  const continentLabel = getDisplayValue(
    selectedMap,
    ["continent_name", "continent"],
    getDisplayValue(selectedContinent, ["continent_name", "name"], "")
  );

  const mapLabel = getDisplayValue(selectedMap, ["map_name", "name"], "");


  return (
    <main className={styles.page}>
      <PageHeroTitle kicker="DQX MAP DATABASE" title={t("title")} />

      <MapMonsterSearchPanel
        continents={continents}
        loading={loading}
        loadingContinents={loadingContinents}
        loadingMonsterIndex={loadingMonsterIndex}
        monsterDetailsReady={monsterDetailsReady}
        selectedContinentId={selectedContinentId}
        onContinentChange={handleContinentChange}
        searchMode={searchMode}
        onSearchModeChange={handleSearchModeChange}
        selectedSystemType={selectedSystemType}
        onSearchSystemChange={handleSearchSystemChange}
        systemTypesInContinent={systemTypesInContinent}
        dropKeyword={dropKeyword}
        onDropKeywordChange={handleDropKeywordChange}
        dropSuggestions={dropSuggestions}
        dropSearchLoading={dropSearchLoading}
        dropSearchError={dropSearchError}
        dropSearchReady={dropSearchReady}
        mapsForSearch={mapsForSearch}
        selectedMapId={selectedMapId}
        onMapChange={handleMapChange}
        mapLayers={mapLayers}
        selectedLayerId={selectedLayerId}
        onLayerChange={handleLayerChange}
        selectedMap={selectedMap}
      />

      {loading ? (
        <>
          <span
            className={styles.visuallyHidden}
            role="status"
            aria-live="polite"
          >
            {t("loadingContinentData")}
          </span>

          <MapMonsterBrowserContentSkeleton
            hasSelectedMap={Boolean(selectedMapId)}
          />
        </>
      ) : null}

      {error ? (
        <div className={cn("mt-6 p-4", styles.errorBox)}>{error}</div>
      ) : null}

      {!loading && !error ? (
        <div
          className={cn(
            "mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]",
            styles.pageColumnsDesktop
          )}
        >
          <MapMonsterAside
            selectedMap={selectedMap}
            continentLabel={continentLabel}
            mapLabel={mapLabel}
            filteredSpawnCount={filteredSpawns.length}
            systemTypes={systemTypesOnCurrentScope}
            selectedSystemType={selectedSystemType}
            onSystemTypeToggle={handleSystemTypeToggle}
            monsters={monstersVisibleInAside}
            selectedMonsterId={selectedMonsterId}
            relatedSelectedMonsterIds={relatedSelectedMonsterIds}
            onMonsterToggle={handleMonsterToggle}
          />

          <MapMonsterHabitatArea
            selectedMap={selectedMap}
            selectedLayerId={selectedLayerId}
            mapLayers={mapLayers}
            filteredSpawns={filteredSpawns}
            monstersById={monsterMaster}
            selectedMonsterId={selectedMonsterId}
            selectedSystemType={selectedSystemType}
            relatedSelectedMonsterIds={relatedSelectedMonsterIds}
            isMobile={isMobile}
            backHref={backHref}
            mapLabel={mapLabel}
            continentLabel={continentLabel}
            shouldUseCarousel={shouldUseCarousel}
            layerSections={layerSections}
          />
        </div>
      ) : null}
    </main>
  );
}
