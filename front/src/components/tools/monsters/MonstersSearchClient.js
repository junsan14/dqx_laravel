"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import { fetchMonsterDetail, searchMonsters } from "@/lib/monsters";

import MonsterDetailClient from "./detail/MonsterDetailClient";
import MonsterInfo from "./detail/MonsterInfo";
import PageHeroTitle from "@/components/PageHeroTitle";
import SearchableSelect from "@/components/common/SearchableSelect";
import DropdownSelect from "@/components/common/DropdownSelect";
import styles from "./MonstersSearchClient.module.css";

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function SkeletonLine({ widthClass, heightClass = styles.skeletonH13, rounded = false }) {
  return (
    <span
      className={cx(
        styles.skeleton,
        styles.skeletonLine,
        widthClass,
        heightClass,
        rounded && styles.skeletonRounded
      )}
      aria-hidden="true"
    />
  );
}

function MonstersSearchPageLoading() {
  return (
    <div className={styles.loadingPageWrap}>
      <section className={styles.loadingSearchCard}>
        <div className={styles.loadingSearchControls}>
          <div className={styles.loadingSearchField}>
            <SkeletonLine
              widthClass={styles.skeletonW72px}
              heightClass={styles.skeletonH12}
            />

            <div className={styles.loadingSelectControl}>
              <SkeletonLine
                widthClass={styles.skeletonW86px}
                heightClass={styles.skeletonH13}
              />
              <span className={cx(styles.skeleton, styles.loadingSelectArrow)} />
            </div>
          </div>

          <div className={styles.loadingSearchField}>
            <SkeletonLine
              widthClass={styles.skeletonW68px}
              heightClass={styles.skeletonH12}
            />

            <span className={cx(styles.skeleton, styles.loadingKeywordControl)} />
          </div>
        </div>

        <div className={styles.loadingStatusRow}>
          <SkeletonLine
            widthClass={styles.skeletonW72px}
            heightClass={styles.skeletonH12}
          />
        </div>
      </section>

      <section className={styles.loadingList}>
        {Array.from({ length: 6 }).map((_, index) => (
          <article key={index} className={styles.loadingCard}>
            <div className={styles.loadingCardInner}>
              <SkeletonLine
                widthClass={styles.skeletonW38}
                heightClass={styles.skeletonH20}
              />
              <span className={cx(styles.skeleton, styles.loadingChevron)} />
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function MonsterInfoLoading() {
  return (
    <div className={styles.infoLoadingCard}>
      <div className={styles.infoLoadingGrid}>
        <div className={styles.infoLoadingText}>
          <SkeletonLine widthClass={styles.skeletonW42} heightClass={styles.skeletonH24} />
          <div className={styles.loadingLineSpacerSmall}>
            <SkeletonLine widthClass={styles.skeletonW22} heightClass={styles.skeletonH24} />
          </div>
          <div className={styles.loadingInfoMemoFirst}>
            <SkeletonLine widthClass={styles.skeletonW100} heightClass={styles.skeletonH56} rounded />
          </div>
          <div className={styles.loadingInfoMemoSecond}>
            <SkeletonLine widthClass={styles.skeletonW92} heightClass={styles.skeletonH56} rounded />
          </div>
        </div>
        <span className={cx(styles.skeleton, styles.infoLoadingImage)} />
      </div>
    </div>
  );
}

function MonsterSearchResultCard({
  monster,
  searchType,
  formatSubText,
  isOpen = false,
  onClick,
}) {
  const subText = formatSubText?.(monster);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(styles.resultCard, isOpen && styles.resultCardOpen)}
      aria-expanded={isOpen}
    >
      <span className={styles.resultTopRow}>
        <h2 className={styles.resultTitle}>{monster.name}</h2>
        <span className={cx(styles.resultArrow, isOpen && styles.resultArrowOpen)}>
          <FiChevronRight
            className={styles.resultArrowIcon}
            aria-hidden="true"
          />
        </span>
      </span>

      {subText && searchType !== "monster" ? (
        <span className={styles.resultSubText}>{subText}</span>
      ) : null}
    </button>
  );
}

export default function MonstersSearchClient() {
  const t = useTranslations("MonsterSearchPage");
  const locale = useLocale();

  const searchOptions = useMemo(
    () => [
      { value: "monster", label: t("searchTypes.monster") },
      { value: "orb", label: t("searchTypes.orb") },
      { value: "item", label: t("searchTypes.item") },
      { value: "equipment", label: t("searchTypes.equipment") },
      { value: "accessory", label: t("searchTypes.accessory") },
    ],
    [t]
  );

  const [searchType, setSearchType] = useState("monster");
  const [keyword, setKeyword] = useState("");
  const [monsters, setMonsters] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [pendingAutoOpenId, setPendingAutoOpenId] = useState(null);

  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [infoExpandedIds, setInfoExpandedIds] = useState(() => new Set());
  const [detailCache, setDetailCache] = useState({});
  const [detailLoadingIds, setDetailLoadingIds] = useState(() => new Set());
  const [detailErrors, setDetailErrors] = useState({});

  const debounceRef = useRef(null);
  const itemRefs = useRef({});
  const autoScrollFrameRefs = useRef([]);
  const searchRequestIdRef = useRef(0);

  const currentLabel = useMemo(
    () => searchOptions.find((option) => option.value === searchType)?.label ?? t("search"),
    [searchOptions, searchType, t]
  );

  function extractNameFromMatchText(text) {
    if (!text) return null;
    const parts = String(text).split(":");
    return parts.length > 1 ? parts.slice(1).join(":").trim() : text;
  }

  function formatSuggestionName(monster) {
    if (searchType === "monster") return monster.name;

    if (searchType === "orb") {
      return (
        monster.matched_name ||
        monster.orb_name ||
        extractNameFromMatchText(monster.match_text) ||
        monster.name
      );
    }

    return (
      monster.matched_name ||
      extractNameFromMatchText(monster.match_text) ||
      monster.name
    );
  }

  function formatSuggestionKana(monster) {
    if (searchType === "monster") return monster.name_kana || "";
    return monster.matched_name_kana || monster.name_kana || "";
  }

  function buildUniqueSuggestions(list) {
    const map = new Map();

    for (const monster of list) {
      const suggestionName = formatSuggestionName(monster)?.trim();
      if (!suggestionName || map.has(suggestionName)) continue;

      const suggestionKana = formatSuggestionKana(monster)?.trim();
      map.set(suggestionName, {
        id: monster.id,
        label: suggestionName,
        searchText: [suggestionName, suggestionKana].filter(Boolean).join(" "),
      });
    }

    return Array.from(map.values()).slice(0, 8);
  }

  function formatSubText(monster) {
    if (searchType === "orb") {
      const orbName =
        monster.matched_name ||
        monster.orb_name ||
        extractNameFromMatchText(monster.match_text);
      const orbColor = monster.matched_color || monster.orb_color;

      if (orbName && orbColor) return `${orbName} ・ ${orbColor}`;
      return orbName || orbColor || null;
    }

    if (["item", "equipment", "accessory"].includes(searchType)) {
      return monster.matched_name || extractNameFromMatchText(monster.match_text);
    }

    return null;
  }

  async function runSearch({
    keyword: searchKeyword = "",
    searchType: currentSearchType = "monster",
    isInitial = false,
    exactSuggestion = null,
  } = {}) {
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;

    try {
      setLoading(true);
      const list = await searchMonsters(searchKeyword, currentSearchType, locale);

      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      const safeList = Array.isArray(list) ? list : [];
      let displayList = safeList;

      if (currentSearchType === "monster" && exactSuggestion) {
        const selectedId = Number(exactSuggestion.id);
        const selectedLabel = String(exactSuggestion.label ?? "").trim();

        const idMatches = Number.isFinite(selectedId) && selectedId > 0
          ? safeList.filter((monster) => Number(monster?.id) === selectedId)
          : [];

        displayList = idMatches.length > 0
          ? idMatches
          : safeList.filter(
              (monster) => String(monster?.name ?? "").trim() === selectedLabel
            );
      }

      const autoOpenId =
        currentSearchType === "monster" &&
        exactSuggestion &&
        displayList.length === 1
          ? Number(displayList[0]?.id) || null
          : null;

      setMonsters(displayList);
      setSuggestions(buildUniqueSuggestions(safeList));
      setSearched(true);
      setExpandedIds(new Set());
      setInfoExpandedIds(new Set());
      setPendingAutoOpenId(autoOpenId);
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      console.error(error);
      setMonsters([]);
      setSuggestions([]);
      setSearched(true);
      setExpandedIds(new Set());
      setInfoExpandedIds(new Set());
      setPendingAutoOpenId(null);
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setLoading(false);
        if (isInitial) setInitialLoading(false);
      }
    }
  }

  function restoreCardPosition(monsterId, beforeTop) {
    if (beforeTop == null) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const element = itemRefs.current[monsterId];
        if (!element) return;

        const diff = element.getBoundingClientRect().top - beforeTop;
        if (Math.abs(diff) <= 1) return;

        window.scrollBy({ top: diff, left: 0, behavior: "auto" });
      });
    });
  }

  function cancelPendingAutoScroll() {
    autoScrollFrameRefs.current.forEach((frameId) => {
      cancelAnimationFrame(frameId);
    });

    autoScrollFrameRefs.current = [];
  }

  function scrollToMonsterCard(monsterId) {
    cancelPendingAutoScroll();

    const firstFrame = requestAnimationFrame(() => {
      const secondFrame = requestAnimationFrame(() => {
        const element = itemRefs.current[monsterId];

        if (!element) {
          autoScrollFrameRefs.current = [];
          return;
        }

        const rootStyles = getComputedStyle(document.documentElement);
        const headerHeight =
          Number.parseFloat(
            rootStyles.getPropertyValue("--site-header-height")
          ) || 68;

        const startTop = window.scrollY;
        const targetTop = Math.max(
          0,
          startTop +
            element.getBoundingClientRect().top -
            headerHeight -
            12
        );
        const distance = targetTop - startTop;

        if (Math.abs(distance) < 2) {
          autoScrollFrameRefs.current = [];
          return;
        }

        const duration = Math.min(
          520,
          Math.max(320, Math.abs(distance) * 0.28)
        );
        let startedAt = null;

        const easeInOutCubic = (progress) =>
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        const animate = (timestamp) => {
          if (startedAt == null) {
            startedAt = timestamp;
          }

          const progress = Math.min((timestamp - startedAt) / duration, 1);
          const easedProgress = easeInOutCubic(progress);

          window.scrollTo({
            top: startTop + distance * easedProgress,
            left: 0,
            behavior: "auto",
          });

          if (progress < 1) {
            const animationFrame = requestAnimationFrame(animate);
            autoScrollFrameRefs.current = [animationFrame];
            return;
          }

          autoScrollFrameRefs.current = [];
        };

        const animationFrame = requestAnimationFrame(animate);
        autoScrollFrameRefs.current = [animationFrame];
      });

      autoScrollFrameRefs.current = [secondFrame];
    });

    autoScrollFrameRefs.current = [firstFrame];
  }


  async function loadDetail(monsterId, beforeTop = null) {
    if (!monsterId || detailCache[monsterId] || detailLoadingIds.has(monsterId)) return;

    try {
      setDetailLoadingIds((prev) => new Set(prev).add(monsterId));
      setDetailErrors((prev) => {
        const next = { ...prev };
        delete next[monsterId];
        return next;
      });

      const detail = await fetchMonsterDetail(monsterId, locale);
      setDetailCache((prev) => ({ ...prev, [monsterId]: detail }));
      restoreCardPosition(monsterId, beforeTop);
    } catch (error) {
      console.error(error);
      setDetailErrors((prev) => ({
        ...prev,
        [monsterId]: t("errors.detailFetchFailed"),
      }));
      restoreCardPosition(monsterId, beforeTop);
    } finally {
      setDetailLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(monsterId);
        return next;
      });
    }
  }

  function handleToggleCard(monsterId) {
    if (!monsterId) return;

    const beforeTop = itemRefs.current[monsterId]?.getBoundingClientRect().top ?? null;
    const isOpen = expandedIds.has(monsterId);

    setExpandedIds((prev) => {
      const next = new Set(prev);
      isOpen ? next.delete(monsterId) : next.add(monsterId);
      return next;
    });

    if (isOpen) {
      setInfoExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(monsterId);
        return next;
      });
    } else {
      void loadDetail(monsterId, beforeTop);
    }

    restoreCardPosition(monsterId, beforeTop);
  }

  function handleToggleInfo(monsterId) {
    if (!monsterId) return;

    const beforeTop = itemRefs.current[monsterId]?.getBoundingClientRect().top ?? null;
    setInfoExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(monsterId) ? next.delete(monsterId) : next.add(monsterId);
      return next;
    });
    restoreCardPosition(monsterId, beforeTop);
  }

  function handleKeywordChange(nextValue, option, meta) {
    const selectedFromSuggestions =
      meta?.reason === "select" && Boolean(option);

    cancelPendingAutoScroll();
    setPendingAutoOpenId(null);
    setKeyword(nextValue);

    setSelectedSuggestion(
      selectedFromSuggestions
        ? {
            id: option.id,
            label: option.label,
          }
        : null
    );
  }


  useEffect(() => {
    runSearch({ keyword: "", searchType: "monster", isInitial: true });
  }, [locale]);

  useEffect(() => {
    if (initialLoading) return undefined;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(
      () =>
        runSearch({
          keyword,
          searchType,
          exactSuggestion: selectedSuggestion,
        }),
      keyword.length >= 2 ? 180 : 0
    );

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [keyword, searchType, initialLoading, locale, selectedSuggestion]);

  useEffect(() => {
    if (loading || !pendingAutoOpenId) return;

    const targetMonster = monsters.find(
      (monster) => Number(monster?.id) === Number(pendingAutoOpenId)
    );

    if (!targetMonster?.id) {
      setPendingAutoOpenId(null);
      return;
    }

    setExpandedIds(new Set([targetMonster.id]));
    setInfoExpandedIds(new Set());
    setPendingAutoOpenId(null);

    void loadDetail(targetMonster.id);
    scrollToMonsterCard(targetMonster.id);
  }, [loading, monsters, pendingAutoOpenId]);

  useEffect(() => {
    return () => {
      cancelPendingAutoScroll();
    };
  }, []);

  if (initialLoading) {
    return (
      <main className={styles.page}>
        <PageHeroTitle kicker="DQX MONSTER DATABASE" title={t("title")} />
        <MonstersSearchPageLoading />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <PageHeroTitle kicker="DQX MONSTER DATABASE" title={t("title")} />

      <section className={styles.searchSection}>
        <div className={styles.searchCard}>
          <div className={styles.searchControls}>
            <div className={styles.searchField}>
              <span className={styles.searchLabel}>
                {t("searchTypeLabel")}
              </span>

              <DropdownSelect
                value={searchType}
                onChange={(nextValue) => {
                  cancelPendingAutoScroll();
                  setPendingAutoOpenId(null);
                  setSearchType(nextValue);
                  setKeyword("");
                  setSelectedSuggestion(null);
                  setSuggestions([]);
                }}
                options={searchOptions}
                className={styles.searchTypeSelect}
                ariaLabel={t("searchTypeLabel")}
              />
            </div>

            <div className={cx(styles.searchField, styles.keywordField)}>
              <span className={styles.searchLabel}>
                {t("keywordLabel")}
              </span>

              <SearchableSelect
                value={keyword}
                onChange={handleKeywordChange}
                options={suggestions}
                className={styles.searchInputControl}
                placeholder={t("searchPlaceholder", { target: currentLabel })}
                emptyText={loading ? t("loading") : t("suggestionsEmpty")}
                getOptionValue={(option) => option.label}
                getOptionLabel={(option) => option.label}
                getOptionSearchText={(option) =>
                  option.searchText || option.label
                }
                maxResults={8}
                allowCustomValue
                selectOnFocus
                ariaLabel={t("searchPlaceholder", { target: currentLabel })}
              />
            </div>
          </div>

          <div className={styles.statusRow}>
            <span className={styles.statusText}>
              {loading ? t("loading") : t("count", { count: monsters.length })}
            </span>
          </div>
        </div>
      </section>

      {!loading && searched && monsters.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>◌</div>
          <h2 className={styles.emptyTitle}>{t("emptyTitle")}</h2>
          <p className={styles.emptyText}>{t("emptyText")}</p>
        </div>
      ) : null}

      {monsters.length > 0 ? (
        <section className={styles.list}>
          {monsters.map((monster) => {
            const isOpen = expandedIds.has(monster.id);
            const isInfoOpen = infoExpandedIds.has(monster.id);
            const detail = detailCache[monster.id];
            const errorText = detailErrors[monster.id];
            const isDetailLoading = detailLoadingIds.has(monster.id);

            return (
              <article
                key={monster.id}
                ref={(element) => {
                  itemRefs.current[monster.id] = element;
                }}
                className={cx(styles.listItem, loading && styles.listItemLoading)}
              >
                <MonsterSearchResultCard
                  monster={monster}
                  searchType={searchType}
                  formatSubText={formatSubText}
                  isOpen={isOpen}
                  onClick={() => handleToggleCard(monster.id)}
                />

                {isOpen ? (
                  <div className={styles.detailWrap}>
                    <div className={styles.detailCard}>
                      <section className={styles.infoAccordionSection}>
                          <button
                            type="button"
                            onClick={() => handleToggleInfo(monster.id)}
                            className={styles.infoToggleButton}
                            aria-expanded={isInfoOpen}
                            aria-label={
                              isInfoOpen ? t("info.close") : t("info.open")
                            }
                          >
                          <div
                            className={cx(
                              styles.sectionHeader,
                              isInfoOpen && styles.sectionHeaderOpen
                            )}
                          >
                            <h2 className={styles.sectionTitle}>
                              {t("info.title")}
                            </h2>
                            
                          </div>
                          <FiChevronDown
                            className={cx(
                              styles.infoAccordionIcon,
                              isInfoOpen && styles.infoAccordionIconOpen
                            )}
                            aria-hidden="true"
                          />
                        </button>

                        {isInfoOpen ? (
                          <div className={styles.infoAccordionContent}>
                            {isDetailLoading && !detail ? (
                              <MonsterInfoLoading />
                            ) : errorText ? (
                              <div className={styles.infoErrorCard}>{errorText}</div>
                            ) : detail ? (
                              <MonsterInfo
                                monster={detail}
                                variant="full"
                                showSectionTitle={false}
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </section>

                      <div className={styles.summaryDetail}>
                        <MonsterDetailClient
                          monster={detail ?? monster}
                          embedded
                          showMonsterInfo={false}
                          showHabitats={Boolean(detail)}
                          showReportArea={Boolean(detail)}
                          sourcePage="monster-search"
                          context={{
                            search_type: searchType,
                            result_monster_id: Number(monster.id),
                          }}
                        />

                        {isDetailLoading && !detail ? (
                          <div className={styles.habitatLoadingCard}>
                            <span className={styles.habitatLoadingTitle}>
                              {t("habitats.title")}
                            </span>
                            <span className={styles.habitatLoadingText}>{t("loading")}</span>
                          </div>
                        ) : errorText && !detail ? (
                          <div className={styles.infoErrorCard}>{errorText}</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
