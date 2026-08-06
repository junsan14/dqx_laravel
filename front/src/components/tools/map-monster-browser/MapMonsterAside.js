"use client";

import { useTranslations } from "next-intl";
import styles from "./MapMonsterBrowser.module.css";
import {
  cn,
  getDisplayValue,
  normalizeText,
} from "./mapMonsterBrowserUtils";

function MonsterChip({
  active = false,
  onClick,
  children,
  variant = "default",
  emphasized = false,
  className = "",
}) {
  const stateClass =
    variant === "subtle"
      ? active
        ? styles.chipSubtleActive
        : emphasized
          ? styles.chipSubtleEmphasized
          : styles.chipSubtleIdle
      : active
        ? styles.chipDefaultActive
        : emphasized
          ? styles.chipDefaultEmphasized
          : styles.chipDefaultIdle;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        styles.chip,
        active && styles.chipActive,
        stateClass,
        className
      )}
    >
      {children}
    </button>
  );
}

export default function MapMonsterAside({
  selectedMap = null,
  continentLabel = "",
  mapLabel = "",
  filteredSpawnCount = 0,
  systemTypes = [],
  selectedSystemType = "",
  onSystemTypeToggle,
  monsters = [],
  selectedMonsterId = "",
  relatedSelectedMonsterIds = new Set(),
  onMonsterToggle,
}) {
  const t = useTranslations("MapMonsterBrowser");

  return (
    <aside className={cn("rounded-2xl p-4", styles.asideCard)}>
      {selectedMap ? (
        <>
          <div className={cn("text-sm", styles.continentText)}>
            {continentLabel}
          </div>

          <h2 className={cn("mt-1 text-xl font-bold", styles.mapTitle)}>
            {mapLabel}
          </h2>

          <div className={cn("mt-2 text-sm", styles.countText)}>
            {t("countShown", { count: filteredSpawnCount })}
          </div>

          <div className="mt-6">
            <div
              className={cn(
                "mb-2 text-sm font-semibold",
                styles.sectionTitle
              )}
            >
              {t("systemType")}
            </div>

            <div className="flex flex-wrap gap-2">
              {systemTypes.length === 0 ? (
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm",
                    styles.emptyDashed
                  )}
                >
                  {t("noSystemType")}
                </div>
              ) : (
                systemTypes.map((systemType) => (
                  <MonsterChip
                    key={systemType}
                    active={
                      normalizeText(systemType) ===
                      normalizeText(selectedSystemType)
                    }
                    onClick={() => onSystemTypeToggle?.(systemType)}
                  >
                    {systemType}
                  </MonsterChip>
                ))
              )}
            </div>
          </div>

          <div className="mt-6">
            <div
              className={cn(
                "mb-2 text-sm font-semibold",
                styles.sectionTitle
              )}
            >
              {t("monster")}
            </div>

            <div className={styles.monsterGrid}>
              {monsters.length === 0 ? (
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 text-sm",
                    styles.emptyDashed,
                    styles.monsterGridEmpty
                  )}
                >
                  {t("noMonster")}
                </div>
              ) : (
                monsters.map((monster) => {
                  const emphasized =
                    selectedMonsterId &&
                    relatedSelectedMonsterIds.has(Number(monster.id));

                  const monsterLabel = getDisplayValue(
                    monster,
                    ["monster_name", "name"],
                    t("unknownMonster")
                  );

                  return (
                    <MonsterChip
                      key={monster.id}
                      active={
                        Number(selectedMonsterId) === Number(monster.id)
                      }
                      emphasized={Boolean(emphasized)}
                      onClick={() => onMonsterToggle?.(monster.id)}
                      className={styles.monsterGridChip}
                    >
                      <span className={styles.monsterGridChipContent}>
                        <span className={styles.monsterGridChipName}>
                          {monsterLabel}
                        </span>

                        {monster.is_reincarnated ? (
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                              styles.reincarnationMiniBadge,
                              styles.monsterGridReincarnationBadge
                            )}
                          >
                            {t("reincarnated")}
                          </span>
                        ) : null}
                      </span>
                    </MonsterChip>
                  );
                })
              )}
            </div>
          </div>
        </>
      ) : (
        <div
          className={cn(
            "rounded-2xl px-4 py-5 text-sm",
            styles.emptyDashed
          )}
        >
          {t("emptyGuide")}
        </div>
      )}
    </aside>
  );
}
