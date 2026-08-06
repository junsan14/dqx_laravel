"use client";

import { useLocale, useTranslations } from "next-intl";
import styles from "./SalePriceCard.module.css";

export default function SalePriceCard({
  feeRatePct,
  setFeeRatePct,
  minRates,
  recommend,
  recommendRate,
  crystalEquipmentLabel,
}) {
  const locale = useLocale();
  const t = useTranslations("CraftProfit");

  const recommendTone =
    recommend?.tone && recommend.tone.startsWith("var(")
      ? recommend.tone
      : "var(--text-main)";

  const rateItems = [
    {
      key: "p3",
      star: t("salePrice.star3"),
      value: minRates?.p3 ?? 0,
      note: t("salePrice.requiredRate"),
    },
    {
      key: "p2",
      star: t("salePrice.star2"),
      value: minRates?.p2 ?? 0,
      note: t("salePrice.requiredRate"),
    },
    {
      key: "p1",
      star: t("salePrice.star1"),
      value: minRates?.p1 ?? 0,
      note: t("salePrice.remaining"),
    },
  ];

  return (
    <section className={styles.card}>
      <div className={styles.headingRow}>
        <div className={styles.headingGroup}>
          <div className={styles.heading}>
            {locale === "en"
              ? "Craft recommendation rate"
              : "作成おすすめ率"}
          </div>

          {crystalEquipmentLabel && (
            <span className={styles.crystalEquipmentBadge}>
              {crystalEquipmentLabel}
            </span>
          )}
        </div>

        <div className={styles.feeControl}>
          <span className={styles.feeLabel}>{t("salePrice.fee")}</span>

          <div className={styles.feeInputWrap}>
            <input
              type="number"
              value={feeRatePct}
              onChange={(event) => setFeeRatePct(Number(event.target.value))}
              className={styles.feeInput}
            />
            <span className={styles.percentSign}>%</span>
          </div>
        </div>
      </div>

      <div className={styles.recommendPanel}>
        <div className={styles.recommendHeadingRow}>
          <div className={styles.recommendHelp}>
            {t("salePrice.recommendHelp")}
          </div>

          <div
            className={`${styles.recommendBadge} ${
              minRates?.impossible ? styles.recommendBadgeDanger : ""
            }`}
          >
            {recommend.label}
          </div>
        </div>

        <div className={styles.recommendRateCard}>
          <div
            className={styles.recommendRate}
            style={{ "--recommend-tone": recommendTone }}
          >
            {recommendRate}%
          </div>
        </div>

        <div className={styles.rateGrid}>
          {rateItems.map((item) => (
            <div key={item.key} className={styles.rateCard}>
              <div className={styles.rateStar}>{item.star}</div>
              <div className={styles.rateValue}>{item.value}%</div>
              <div className={styles.rateNote}>{item.note}</div>
            </div>
          ))}
        </div>

        {(recommend.sub || minRates?.note) && (
          <div
            className={`${styles.note} ${
              minRates?.impossible ? styles.noteDanger : ""
            }`}
          >
            {recommend.sub || minRates?.note}
          </div>
        )}
      </div>
    </section>
  );
}
