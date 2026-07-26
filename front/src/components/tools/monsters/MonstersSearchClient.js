"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { fetchMonsterDetail, searchMonsters } from "@/lib/monsters";

import MonsterSearchCard from "./MonsterSearchCard";
import MonsterDetailHero from "@/components/tools/monsters/detail/MonsterDetailHero";
import MonsterDropSection from "@/components/tools/monsters/detail/MonsterDropSection";
import MonsterMapSection from "@/components/tools/monsters/detail/MonsterMapSection";
import PageHeroTitle from "@/components/PageHeroTitle";
import SearchableSelect from "@/components/common/SearchableSelect";

function MonstersSearchPageLoading() {
  const loadingStyles = getLoadingStyles();

  return (
    <div style={loadingStyles.pageWrap}>
      <section style={loadingStyles.searchCard}>
        <div style={loadingStyles.segmentRow}>
          <div style={{ ...loadingStyles.pill, width: 92 }} />
          <div style={{ ...loadingStyles.pill, width: 86 }} />
          <div style={{ ...loadingStyles.pill, width: 86 }} />
          <div style={{ ...loadingStyles.pill, width: 86 }} />
        </div>

        <div style={loadingStyles.searchInputWrap}>
          <div style={loadingStyles.searchIcon}>⌕</div>
          <div style={loadingStyles.searchInputSkeleton} />
        </div>

        <div style={loadingStyles.statusRow}>
          <div style={{ ...loadingStyles.line, width: 72, height: 12 }} />
        </div>
      </section>

      <section style={loadingStyles.list}>
        {Array.from({ length: 6 }).map((_, index) => (
          <article key={index} style={loadingStyles.card}>
            <div style={loadingStyles.cardInner}>
              <div style={loadingStyles.thumb} />

              <div style={loadingStyles.content}>
                <div style={{ ...loadingStyles.line, width: "38%", height: 20 }} />
                <div
                  style={{
                    ...loadingStyles.line,
                    width: "24%",
                    height: 13,
                    marginTop: 10,
                  }}
                />
                <div
                  style={{
                    ...loadingStyles.line,
                    width: "72%",
                    height: 13,
                    marginTop: 14,
                  }}
                />

                <div style={loadingStyles.metaRow}>
                  <div style={{ ...loadingStyles.badge, width: 84 }} />
                  <div style={{ ...loadingStyles.badge, width: 68 }} />
                  <div style={{ ...loadingStyles.badge, width: 94 }} />
                </div>
              </div>

              <div style={loadingStyles.chevron} />
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function MonsterDetailLoading() {
  const loadingStyles = getLoadingStyles();

  const tagWidths = ["62%", "78%", "54%", "70%"];

  return (
    <div style={loadingStyles.detailCard}>
      {/* モンスター基本情報 */}
      <section style={loadingStyles.detailOverview}>
        <div style={loadingStyles.detailDescription}>
          <div
            style={{
              ...loadingStyles.line,
              width: "94%",
              height: 13,
            }}
          />

          <div
            style={{
              ...loadingStyles.line,
              width: "72%",
              height: 13,
            }}
          />
        </div>

        <div style={loadingStyles.detailMetaRow}>
          <div
            style={{
              ...loadingStyles.detailMetaItem,
              width: 92,
            }}
          />

          <div
            style={{
              ...loadingStyles.detailMetaItem,
              width: 78,
            }}
          />
        </div>
      </section>

      {/* ドロップ */}
      <section style={loadingStyles.detailDropSection}>
        <div
          style={{
            ...loadingStyles.line,
            width: 88,
            height: 18,
          }}
        />

        <div style={loadingStyles.detailTabsRow}>
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`detail-tab-${index}`}
              style={loadingStyles.detailTab}
            />
          ))}
        </div>

        <div style={loadingStyles.detailDropPanel}>
          <div style={loadingStyles.detailTagList}>
            {tagWidths.map((width, index) => (
              <div
                key={`detail-tag-${index}`}
                style={loadingStyles.detailTagRow}
              >
                <div style={loadingStyles.detailTagBadge} />

                <div
                  style={{
                    ...loadingStyles.line,
                    width,
                    height: 12,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 出現場所 */}
      <section style={loadingStyles.detailMapSection}>
        <div
          style={{
            ...loadingStyles.line,
            width: 92,
            height: 18,
          }}
        />

        <div style={loadingStyles.detailMapTabs}>
          <div
            style={{
              ...loadingStyles.detailMapTab,
              width: 104,
            }}
          />

          <div
            style={{
              ...loadingStyles.detailMapTab,
              width: 86,
            }}
          />
        </div>

        <div style={loadingStyles.detailMapCard}>
          <div style={loadingStyles.detailMapImage} />

          <div style={loadingStyles.detailMapInfo}>
            <div
              style={{
                ...loadingStyles.line,
                width: "42%",
                height: 14,
              }}
            />

            <div
              style={{
                ...loadingStyles.line,
                width: "68%",
                height: 12,
              }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

export default function MonstersSearchClient() {
  const t = useTranslations("MonsterSearchPage");
  const locale = useLocale();

  const SEARCH_OPTIONS = useMemo(
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

  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [detailCache, setDetailCache] = useState({});
  const [detailLoadingIds, setDetailLoadingIds] = useState(() => new Set());
  const [detailErrors, setDetailErrors] = useState({});

  const debounceRef = useRef(null);
  const itemRefs = useRef({});

  const styles = useMemo(() => getStyles(), []);

  const currentLabel = useMemo(() => {
    return SEARCH_OPTIONS.find((x) => x.value === searchType)?.label ?? t("search");
  }, [SEARCH_OPTIONS, searchType, t]);

  const extractNameFromMatchText = (text) => {
    if (!text) return null;
    const parts = String(text).split(":");
    return parts.length > 1 ? parts.slice(1).join(":").trim() : text;
  };

  const formatSuggestionName = (monster) => {
    if (searchType === "monster") return monster.name;

    if (searchType === "orb") {
      return (
        monster.matched_name ||
        monster.orb_name ||
        extractNameFromMatchText(monster.match_text) ||
        monster.name
      );
    }

    if (
      searchType === "item" ||
      searchType === "equipment" ||
      searchType === "accessory"
    ) {
      return (
        monster.matched_name ||
        extractNameFromMatchText(monster.match_text) ||
        monster.name
      );
    }

    return monster.name;
  };

  const formatSuggestionKana = (monster) => {
    if (searchType === "monster") {
      return monster.name_kana || "";
    }

    return monster.matched_name_kana || monster.name_kana || "";
  };

  const buildUniqueSuggestions = (list) => {
    const map = new Map();

    for (const monster of list) {
      const suggestionName = formatSuggestionName(monster)?.trim();
      if (!suggestionName) continue;

      if (!map.has(suggestionName)) {
        const suggestionKana = formatSuggestionKana(monster)?.trim();

        map.set(suggestionName, {
          id: monster.id,
          label: suggestionName,
          searchText: [suggestionName, suggestionKana]
            .filter(Boolean)
            .join(" "),
        });
      }
    }

    return Array.from(map.values()).slice(0, 8);
  };

  const formatSubText = (monster) => {
    if (searchType === "orb") {
      const orbName =
        monster.matched_name ||
        monster.orb_name ||
        extractNameFromMatchText(monster.match_text);

      const orbColor = monster.matched_color || monster.orb_color;

      if (orbName && orbColor) return `${orbName} ・ ${orbColor}`;
      if (orbName) return orbName;
      if (orbColor) return orbColor;
      return null;
    }

    if (
      searchType === "item" ||
      searchType === "equipment" ||
      searchType === "accessory"
    ) {
      return monster.matched_name || extractNameFromMatchText(monster.match_text);
    }

    return monster.system_type || null;
  };

  const runSearch = async ({
    keyword: searchKeyword = "",
    searchType: currentSearchType = "monster",
    isInitial = false,
  } = {}) => {
    try {
      setLoading(true);

      const list = await searchMonsters(
        searchKeyword,
        currentSearchType,
        locale
      );

      setMonsters(list);
      setSuggestions(buildUniqueSuggestions(list));
      setSearched(true);
      setExpandedIds(new Set());
    } catch (error) {
      console.error(error);
      setMonsters([]);
      setSuggestions([]);
      setSearched(true);
      setExpandedIds(new Set());
    } finally {
      setLoading(false);
      if (isInitial) setInitialLoading(false);
    }
  };

  function restoreCardPosition(monsterId, beforeTop) {
    if (beforeTop == null) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = itemRefs.current[monsterId];
        if (!el) return;

        const afterTop = el.getBoundingClientRect().top;
        const diff = afterTop - beforeTop;

        if (Math.abs(diff) <= 1) return;

        window.scrollBy({
          top: diff,
          left: 0,
          behavior: "auto",
        });
      });
    });
  }

  async function openDetail(monsterId) {
    if (!monsterId) return;
    if (expandedIds.has(monsterId)) return;

    const clickedEl = itemRefs.current[monsterId];
    const beforeTop = clickedEl?.getBoundingClientRect().top ?? null;

    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(monsterId);
      return next;
    });

    restoreCardPosition(monsterId, beforeTop);

    if (detailCache[monsterId]) return;

    try {
      setDetailLoadingIds((prev) => {
        const next = new Set(prev);
        next.add(monsterId);
        return next;
      });

      setDetailErrors((prev) => {
        const next = { ...prev };
        delete next[monsterId];
        return next;
      });

      const detail = await fetchMonsterDetail(monsterId, locale);

      setDetailCache((prev) => ({
        ...prev,
        [monsterId]: detail,
      }));

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

  async function handleToggleDetail(monsterId) {
    if (!monsterId) return;

    const clickedEl = itemRefs.current[monsterId];
    const beforeTop = clickedEl?.getBoundingClientRect().top ?? null;

    const isCurrentlyOpen = expandedIds.has(monsterId);

    setExpandedIds((prev) => {
      const next = new Set(prev);

      if (next.has(monsterId)) {
        next.delete(monsterId);
      } else {
        next.add(monsterId);
      }

      return next;
    });

    restoreCardPosition(monsterId, beforeTop);

    if (isCurrentlyOpen || detailCache[monsterId]) return;

    try {
      setDetailLoadingIds((prev) => {
        const next = new Set(prev);
        next.add(monsterId);
        return next;
      });

      setDetailErrors((prev) => {
        const next = { ...prev };
        delete next[monsterId];
        return next;
      });

      const detail = await fetchMonsterDetail(monsterId, locale);

      setDetailCache((prev) => ({
        ...prev,
        [monsterId]: detail,
      }));

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

  useEffect(() => {
    runSearch({
      keyword: "",
      searchType: "monster",
      isInitial: true,
    });
  }, [locale]);

  useEffect(() => {
    if (initialLoading) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      runSearch({ keyword, searchType });
    }, keyword.length >= 2 ? 180 : 0);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [keyword, searchType, initialLoading, locale]);

  useEffect(() => {
    if (loading) return;
    if (!searched) return;
    if (!keyword.trim()) return;
    if (monsters.length !== 1) return;

    const onlyMonster = monsters[0];
    if (!onlyMonster?.id) return;

    openDetail(onlyMonster.id);
  }, [loading, searched, keyword, monsters]);


  if (initialLoading) {
    return (
      <main>
        <PageHeroTitle
          kicker="DQX MONSTER DATABASE"
          title={t("title")}
        />
        <MonstersSearchPageLoading />

        <style>{`
          @keyframes monsterSearchShimmer {
            0% {
              background-position: 200% 0;
            }
            100% {
              background-position: -200% 0;
            }
          }
        `}</style>
      </main>
    );
  }

  return (
    <main>
      <PageHeroTitle
        kicker="DQX MONSTER DATABASE"
        title={t("title")}
      />

      <section style={styles.searchSection}>
        <div style={styles.searchCard}>
          <div style={styles.segment}>
            {SEARCH_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setSearchType(option.value);
                  setKeyword("");
                  setSuggestions([]);
                }}
                style={{
                  ...styles.segmentButton,
                  ...(searchType === option.value ? styles.segmentButtonActive : {}),
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <SearchableSelect
            value={keyword}
            onChange={(nextValue) => setKeyword(nextValue)}
            options={suggestions}
            placeholder={t("searchPlaceholder", { target: currentLabel })}
            emptyText={loading ? t("loading") : "候補がありません"}
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

          <div style={styles.statusRow}>
            <span style={styles.statusText}>
              {loading ? t("loading") : t("count", { count: monsters.length })}
            </span>
          </div>
        </div>
      </section>

      {!loading && searched && monsters.length === 0 && (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>◌</div>
          <h2 style={styles.emptyTitle}>{t("emptyTitle")}</h2>
          <p style={styles.emptyText}>{t("emptyText")}</p>
        </div>
      )}

      {monsters.length > 0 && (
        <section style={styles.list}>
          {monsters.map((monster) => {
            const isOpen = expandedIds.has(monster.id);
            const detail = detailCache[monster.id];
            const errorText = detailErrors[monster.id];
            const isDetailLoading = detailLoadingIds.has(monster.id);

            return (
              <article
                key={monster.id}
                ref={(el) => {
                  itemRefs.current[monster.id] = el;
                }}
                style={{
                  ...styles.listItem,
                  ...(isOpen ? styles.listItemOpen : {}),
                  ...(loading ? styles.listItemLoading : {}),
                }}
              >
                <MonsterSearchCard
                  monster={monster}
                  searchType={searchType}
                  formatSubText={formatSubText}
                  isOpen={isOpen}
                  onClick={() => handleToggleDetail(monster.id)}
                />

                {isOpen && (
                  <div style={styles.detailWrap}>
                    {isDetailLoading && !detail ? (
                      <MonsterDetailLoading />
                    ) : errorText ? (
                      <div style={styles.errorCard}>{errorText}</div>
                    ) : detail ? (
                      <div style={styles.detailCard}>
                        <MonsterDetailHero monster={detail} />
                        <MonsterDropSection
                          monster={detail}
                          normalDrops={detail.normal_drops ?? []}
                          rareDrops={detail.rare_drops ?? []}
                          accessoryDrops={detail.accessory_drops ?? []}
                          orbDrops={detail.orb_drops ?? []}
                          whiteBoxDrops={detail.equipment_drops ?? []}
                          equipmentDrops={detail.equipment_drops ?? []}
                        />

                        <MonsterMapSection maps={detail.maps ?? []} />
                      </div>
                    ) : null}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      <style>{`
        @keyframes monsterSearchShimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        @media (max-width: 920px) {
          .monster-detail-two-column {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </main>
  );
}

function getShimmer() {
  return {
    background:
      "linear-gradient(90deg, color-mix(in srgb, var(--soft-border) 88%, transparent) 0%, color-mix(in srgb, var(--soft-bg) 100%, white 0%) 50%, color-mix(in srgb, var(--soft-border) 88%, transparent) 100%)",
    backgroundSize: "200% 100%",
    animation: "monsterSearchShimmer 1.4s ease-in-out infinite",
  };
}

function getLoadingStyles() {
  const shimmer = getShimmer();

  return {
    pageWrap: {
      width: "100%",
    },
    searchCard: {
      position: "relative",
      border: "1px solid var(--panel-border)",
      background: "color-mix(in srgb, var(--panel-bg) 82%, transparent)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      borderRadius: "24px",
      padding: "18px",
      width: "100%",
      boxSizing: "border-box",
      marginBottom: "28px",
    },
    segmentRow: {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      marginBottom: "14px",
    },
    pill: {
      height: "40px",
      borderRadius: "999px",
      ...shimmer,
    },
    searchInputWrap: {
      position: "relative",
    },
    searchIcon: {
      position: "absolute",
      left: "16px",
      top: "50%",
      transform: "translateY(-50%)",
      color: "var(--text-muted)",
      fontSize: "18px",
      zIndex: 2,
    },
    searchInputSkeleton: {
      width: "100%",
      height: "58px",
      borderRadius: "18px",
      ...shimmer,
    },
    statusRow: {
      marginTop: "12px",
      display: "flex",
      justifyContent: "flex-end",
    },
    list: {
      display: "grid",
      gap: "16px",
      width: "100%",
    },
    card: {
      borderRadius: "24px",
      background: "var(--card-bg)",
      border: "1px solid var(--card-border)",
      overflow: "hidden",
    },
    cardInner: {
      display: "grid",
      gridTemplateColumns: "72px minmax(0,1fr) 24px",
      gap: "16px",
      alignItems: "center",
      padding: "18px",
    },
    thumb: {
      width: "72px",
      height: "72px",
      borderRadius: "20px",
      ...shimmer,
    },
    content: {
      minWidth: 0,
    },
    line: {
      borderRadius: "999px",
      ...shimmer,
    },
    metaRow: {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      marginTop: "16px",
    },
    badge: {
      height: "28px",
      borderRadius: "999px",
      ...shimmer,
    },
    chevron: {
      width: "18px",
      height: "18px",
      borderRadius: "999px",
      ...shimmer,
      justifySelf: "end",
    },
    detailCard: {
  borderRadius: "0 0 24px 24px",
  padding: "18px",
  background: "var(--panel-bg)",
  border: "1px solid var(--selected-border)",
  borderTop: "1px solid var(--selected-border)",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  overflowX: "hidden",
  boxSizing: "border-box",
},

detailOverview: {
  width: "100%",
  minWidth: 0,
},

detailDescription: {
  display: "grid",
  gap: "10px",
  width: "100%",
  minWidth: 0,
},

detailMetaRow: {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "10px",
  marginTop: "14px",
},

detailMetaItem: {
  height: "34px",
  borderRadius: "14px",
  border: "1px solid var(--soft-border)",
  ...shimmer,
},

detailDropSection: {
  display: "grid",
  gap: "12px",
  width: "100%",
  minWidth: 0,
  marginTop: "18px",
},

detailTabsRow: {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "6px",
  width: "100%",
  minWidth: 0,
},

detailTab: {
  width: "100%",
  height: "34px",
  borderRadius: "5px",
  border: "1px solid var(--panel-border)",
  boxSizing: "border-box",
  ...shimmer,
},

detailDropPanel: {
  width: "100%",
  minWidth: 0,
  minHeight: "142px",
  padding: "10px 8px",
  border: "1px solid var(--card-border)",
  borderRadius: "5px",
  background: "var(--card-bg)",
  boxSizing: "border-box",
},

detailTagList: {
  display: "grid",
  gap: "8px",
  width: "100%",
  minWidth: 0,
},

detailTagRow: {
  display: "flex",
  alignItems: "center",
  gap: "7px",
  width: "100%",
  minWidth: 0,
  padding: "3px 0",
  boxSizing: "border-box",
},

detailTagBadge: {
  width: "36px",
  minWidth: "36px",
  height: "18px",
  borderRadius: "999px",
  ...shimmer,
},

detailMapSection: {
  display: "grid",
  gap: "12px",
  width: "100%",
  minWidth: 0,
  marginTop: "18px",
},

detailMapTabs: {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  width: "100%",
  minWidth: 0,
  overflow: "hidden",
  paddingBottom: "4px",
},

detailMapTab: {
  flexShrink: 0,
  height: "32px",
  borderRadius: "999px",
  border: "1px solid var(--panel-border)",
  ...shimmer,
},

detailMapCard: {
  width: "100%",
  minWidth: 0,
  overflow: "hidden",
  borderRadius: "18px",
  border: "1px solid var(--card-border)",
  background: "var(--card-bg)",
  boxSizing: "border-box",
},

detailMapImage: {
  width: "100%",
  aspectRatio: "16 / 10",
  borderRadius: "0",
  ...shimmer,
},

detailMapInfo: {
  display: "grid",
  gap: "9px",
  padding: "12px",
},
    detailHero: {
      display: "grid",
      gridTemplateColumns: "88px minmax(0,1fr)",
      gap: "16px",
      alignItems: "center",
    },
    detailHeroThumb: {
      width: "88px",
      height: "88px",
      borderRadius: "24px",
      ...shimmer,
    },
    detailSplitGrid: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, 0.9fr)",
      gap: "18px",
      marginTop: "22px",
      alignItems: "start",
    },
    detailPanel: {
      minWidth: 0,
      display: "grid",
      gap: "12px",
    },
    detailSection: {
      marginTop: "22px",
    },
    detailList: {
      display: "grid",
      gap: "10px",
      marginTop: "12px",
    },
    mapGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0,1fr))",
      gap: "12px",
      marginTop: "12px",
    },
    mapBox: {
      height: "96px",
      borderRadius: "18px",
      ...shimmer,
    },
  };
}

function getStyles() {
  return {
    searchSection: {
      maxWidth: "1100px",
      margin: "0 auto 28px",
      width: "100%",
      minWidth: 0,
      boxSizing: "border-box",
      position: "relative",
      zIndex: 10,
    },
    searchCard: {
      position: "relative",
      border: "1px solid var(--panel-border)",
      background: "color-mix(in srgb, var(--panel-bg) 82%, transparent)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      borderRadius: "24px",
      padding: "18px",
      width: "100%",
      maxWidth: "100%",
      minWidth: 0,
      boxSizing: "border-box",
      overflow: "visible",
      zIndex: 60,
    },
    segment: {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      marginBottom: "14px",
      minWidth: 0,
    },
    segmentButton: {
      border: "1px solid var(--soft-border)",
      background: "var(--panel-bg)",
      color: "var(--text-sub)",
      borderRadius: "999px",
      padding: "10px 14px",
      fontSize: "14px",
      fontWeight: 700,
      cursor: "pointer",
      maxWidth: "100%",
      boxSizing: "border-box",
      transition: "all 0.18s ease",
    },
    segmentButtonActive: {
      background: "var(--primary-bg)",
      color: "var(--primary-text)",
      border: "1px solid var(--primary-border)",
    },
    statusRow: {
      marginTop: "12px",
      display: "flex",
      justifyContent: "flex-end",
      minWidth: 0,
    },
    statusText: {
      fontSize: "13px",
      color: "var(--text-muted)",
      fontWeight: 700,
    },
    empty: {
      maxWidth: "1100px",
      margin: "24px auto 0",
      borderRadius: "24px",
      padding: "38px 18px",
      textAlign: "center",
      background: "var(--panel-bg)",
      border: "1px solid var(--soft-border)",
      width: "100%",
      minWidth: 0,
      boxSizing: "border-box",
    },
    emptyIcon: {
      fontSize: "28px",
      color: "var(--text-muted)",
      marginBottom: "8px",
    },
    emptyTitle: {
      margin: "0 0 8px",
      fontSize: "22px",
      fontWeight: 900,
      color: "var(--text-title)",
    },
    emptyText: {
      margin: 0,
      color: "var(--text-muted)",
    },
    list: {
      margin: "0 auto",
      display: "grid",
      gap: "16px",
      width: "100%",
      maxWidth: "1100px",
      minWidth: 0,
      boxSizing: "border-box",
    },
    listItem: {
      display: "grid",
      gap: 0,
      minWidth: 0,
      width: "100%",
      maxWidth: "100%",
      overflowX: "hidden",
      boxSizing: "border-box",
      transition: "opacity 0.18s ease",
    },
    listItemOpen: {
      gap: 0,
    },
    listItemLoading: {
      opacity: 0.7,
    },
    detailWrap: {
      display: "grid",
      gap: 0,
      marginTop: 0,
      minWidth: 0,
      width: "100%",
      maxWidth: "100%",
      overflowX: "hidden",
      boxSizing: "border-box",
    },
    detailCard: {
      borderRadius: "0 0 24px 24px",
      padding: "18px",
      background: "var(--panel-bg)",
      border: "1px solid var(--selected-border)",
      borderTop: "1px solid var(--selected-border)",
      width: "100%",
      maxWidth: "100%",
      minWidth: 0,
      overflowX: "hidden",
      boxSizing: "border-box",
    },
    errorCard: {
      borderRadius: "0 0 20px 20px",
      padding: "20px",
      background: "var(--danger-bg)",
      border: "1px solid var(--danger-border)",
      borderTop: "1px solid var(--danger-border)",
      color: "var(--danger-text)",
      fontSize: "14px",
      fontWeight: 700,
      width: "100%",
      maxWidth: "100%",
      minWidth: 0,
      overflowX: "hidden",
      boxSizing: "border-box",
    },
  };
}
