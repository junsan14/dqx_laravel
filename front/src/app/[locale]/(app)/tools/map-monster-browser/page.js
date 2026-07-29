import MapMonsterBrowserClient from "@/components/tools/map-monster-browser/MapMonsterBrowserClient";
//import MapMonsterBrowserSkeleton from "@/components/ui/MapMonsterBrowserSkeleton";
import { createBaseMetadata } from "@/lib/metadata";
//import { Suspense } from "react";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const isEn = locale === "en";

  const title = isEn ? "Map Monster Search" : "マップ別モンスター検索";

  const description = isEn
    ? "Search monsters that appear on each continent and map in Dragon Quest X."
    : "大陸・マップ・モンスター系統から、対象マップに出現するモンスターを探せるページ。";

  return createBaseMetadata({
    locale,
    title,
    description,
    path: `/${locale}/tools/map-monster-browser`,
    image: "/ogp/map-monster-browser.webp?v=20260718",
  });
}

export default function MapMonsterBrowserPage() {
  return (
   
      <MapMonsterBrowserClient />

  );
}