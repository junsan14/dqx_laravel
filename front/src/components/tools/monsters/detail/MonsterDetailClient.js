"use client";

import ContentReportArea from "@/components/common/ContentReportArea";
import ProgressIntlLink from "@/components/common/ProgressIntlLink";
import MonsterInfo from "./MonsterInfo";
import MonsterDrops from "./MonsterDrops";
import MonsterHabitats from "./MonsterHabitats";
import styles from "./MonsterDetailClient.module.css";

const MONSTER_REPORT_FIELDS = [
  { value: "basic_info", label: "基本情報・説明" },
  { value: "normal_drops", label: "通常ドロップ" },
  { value: "rare_drops", label: "レアドロップ" },
  { value: "accessory_drops", label: "アクセサリ" },
  { value: "orb_drops", label: "宝珠" },
  { value: "equipment_drops", label: "白宝箱・装備" },
  { value: "maps", label: "出現場所・マップ" },
  { value: "other", label: "その他" },
];

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export default function MonsterDetailClient({
  monster,
  embedded = false,
  backHref = "/tools/monster-search",
  backLabel = "一覧へ戻る",
  sourcePage = "monster-detail",
  context = {},
  showMonsterImage = false,
}) {
  const monsterId = toPositiveInteger(monster?.id);

  if (!monster) {
    return (
      <div className={styles.statusCard}>
        モンスター情報が見つかりませんでした。
      </div>
    );
  }

  const content = (
    <div className={embedded ? styles.embeddedContent : styles.container}>
      {!embedded ? (
        <div className={styles.topNav}>
          <ProgressIntlLink href={backHref} className={styles.backLink}>
            ← {backLabel}
          </ProgressIntlLink>
        </div>
      ) : null}

      <MonsterInfo
        monster={monster}
        variant={embedded ? "compact" : "full"}
      />

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

      <MonsterHabitats
        maps={monster.maps ?? []}
        {...(!embedded ? { title: "生息地" } : {})}
      />

      <div className={styles.reportArea}>
        <ContentReportArea
          reportableType="monster"
          reportableId={monsterId}
          targetLabel={monster.name ?? "モンスター"}
          fieldOptions={MONSTER_REPORT_FIELDS}
          context={{
            page: sourcePage,
            monster_id: monsterId,
            ...context,
          }}
          disabled={!monsterId}
        />
      </div>
    </div>
  );

  if (embedded) return content;

  return <main className={styles.page}>{content}</main>;
}
