import MonsterZukanClient from "@/components/tools/monster-zukan/MonsterZukanClient";
import { fetchMonsterZukanPage } from "@/lib/monsters";

export default async function MonsterZukanServer({
  params,
  page = 1,
  sort = "no",
}) {
  const locale = params?.locale ?? "ja";
  const safePage = Math.max(1, Number(page) || 1);
  const safeSort = sort === "kana" ? "kana" : "no";

  const monsterPage = await fetchMonsterZukanPage(
    safePage,
    16,
    safeSort,
    locale
  );

  return (
    <MonsterZukanClient
      monsters={monsterPage.data}
      currentPage={monsterPage.current_page}
      lastPage={monsterPage.last_page}
      total={monsterPage.total}
      perPage={monsterPage.per_page}
      sort={safeSort}
    />
  );
}