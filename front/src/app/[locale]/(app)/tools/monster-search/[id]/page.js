import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { fetchMonsterDetail } from "@/lib/monsters";
import { createBaseMetadata } from "@/lib/metadata";
import MonsterDetailClient from "@/components/tools/monsters/detail/MonsterDetailClient";
import styles from "./page.module.css";

export async function generateMetadata({ params }) {
  const { locale, id: monsterId } = await params;
  const isEn = locale === "en";

  let monster = null;

  try {
    monster = await fetchMonsterDetail(monsterId, locale);
  } catch {
    // metadataではfallbackを返す
  }

  const monsterName =
    monster?.name || (isEn ? "Monster Detail" : "モンスター詳細");

  const description = isEn
    ? `Check ${monsterName}'s drops, orbs, equipment, and appearance maps in Dragon Quest X.`
    : `${monsterName} のドロップ、宝珠、白宝箱、出現マップを確認できるページです。`;

  return createBaseMetadata({
    locale,
    title: monsterName,
    description,
    path: `/${locale}/tools/monsters/${monsterId}`,
    type: "article",
  });
}

export default async function MonsterDetailPage({ params, searchParams }) {
  const { locale, id: monsterId } = await params;
  const resolvedSearchParams = await searchParams;

  const t = await getTranslations({
    locale,
    namespace: "MonsterDetailPage",
  });

  const page = Math.max(1, Number(resolvedSearchParams?.page) || 1);
  const rawBack = resolvedSearchParams?.back;
  const normalizedBack =
    typeof rawBack === "string"
      ? decodeURIComponent(rawBack).replace(/^\/(ja|en)(?=\/|$)/, "")
      : "";

  const isFromMonsterSearch =
    normalizedBack.startsWith("/tools/monster-search");
  const isFromMonsterZukan =
    normalizedBack.startsWith("/tools/monster-zukan") ||
    resolvedSearchParams?.from === "zukan";

  const safeBackHref = normalizedBack.startsWith("/tools/")
    ? normalizedBack
    : isFromMonsterZukan
      ? `/tools/monster-zukan?page=${page}`
      : "/tools/monster-search";

  let monster = null;
  let errorText = "";

  try {
    monster = await fetchMonsterDetail(monsterId, locale);
  } catch (error) {
    console.error(error);
    errorText = t("fetchError");
  }

  if (errorText || !monster) {
    return (
      <main className={styles.page}>
        <div className={styles.centerBox}>
          <p className={styles.errorText}>{errorText || t("notFound")}</p>
          <Link href={safeBackHref} locale={locale} className={styles.backLink}>
            ← {t("backToSearch")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <MonsterDetailClient
      monster={monster}
      backHref={safeBackHref}
      backLabel={t("backToSearch")}
      sourcePage={isFromMonsterZukan ? "monster-zukan" : "monster-detail"}
      showMonsterImage={isFromMonsterSearch}
      context={{
        detail_route: true,
        from_monster_search: isFromMonsterSearch,
        from_monster_zukan: isFromMonsterZukan,
      }}
    />
  );
}
