"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import ContentReportArea from "@/components/common/ContentReportArea";
import ProgressIntlLink from "@/components/common/ProgressIntlLink";
import MonsterInfo from "./MonsterInfo";
import MonsterDrops from "./MonsterDrops";
import MonsterHabitats from "./MonsterHabitats";
import styles from "./MonsterDetailClient.module.css";

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export default function MonsterDetailClient({
  monster,
  embedded = false,
  backHref = "/tools/monster-search",
  backLabel,
  sourcePage = "monster-detail",
  context = {},
  showMonsterImage = false,
  showMonsterInfo = true,
  showHabitats = true,
  showReportArea = true,
}) {
  const t = useTranslations("MonsterDetailSection");
  const monsterId = toPositiveInteger(monster?.id);

  const reportFields = useMemo(
    () => [
      { value: "basic_info", label: t("reportFields.basicInfo") },
      { value: "normal_drops", label: t("reportFields.normalDrops") },
      { value: "rare_drops", label: t("reportFields.rareDrops") },
      { value: "accessory_drops", label: t("reportFields.accessories") },
      { value: "orb_drops", label: t("reportFields.orbs") },
      { value: "equipment_drops", label: t("reportFields.equipment") },
      { value: "maps", label: t("reportFields.habitats") },
      { value: "other", label: t("reportFields.other") },
    ],
    [t]
  );

  if (!monster) {
    return <div className={styles.statusCard}>{t("notFound")}</div>;
  }

  const content = (
    <div className={embedded ? styles.embeddedContent : styles.container}>
      {!embedded ? (
        <div className={styles.topNav}>
          <ProgressIntlLink href={backHref} className={styles.backLink}>
            ← {backLabel || t("backToList")}
          </ProgressIntlLink>
        </div>
      ) : null}

      {showMonsterInfo ? (
        <MonsterInfo monster={monster} variant={embedded ? "compact" : "full"} />
      ) : null}

      <MonsterDrops
        monster={monster}
        showMonsterImage={showMonsterImage}
        normalDrops={monster.normal_drops ?? []}
        rareDrops={monster.rare_drops ?? []}
        accessoryDrops={monster.accessory_drops ?? []}
        whiteBoxDrops={monster.equipment_drops ?? []}
        equipmentDrops={monster.equipment_drops ?? []}
        orbDrops={monster.orb_drops ?? []}
      />

      {showHabitats ? <MonsterHabitats maps={monster.maps ?? []} /> : null}

      {showReportArea ? (
        <div className={styles.reportArea}>
          <ContentReportArea
            reportableType="monster"
            reportableId={monsterId}
            targetLabel={monster.name ?? t("monsterFallback")}
            fieldOptions={reportFields}
            context={{
              page: sourcePage,
              monster_id: monsterId,
              ...context,
            }}
            disabled={!monsterId}
          />
        </div>
      ) : null}
    </div>
  );

  if (embedded) return content;
  return <main className={styles.page}>{content}</main>;
}
