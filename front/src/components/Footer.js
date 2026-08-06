"use client";

import NextLink from "next/link";
import { Link as I18nLink } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

import { useAuth } from "@/hooks/auth";

import styles from "./Footer.module.css";

function FooterNavLink({
  href,
  localized = true,
  className,
  children,
  ...props
}) {
  if (localized) {
    return (
      <I18nLink href={href} className={className} {...props}>
        {children}
      </I18nLink>
    );
  }

  return (
    <NextLink href={href} className={className} {...props}>
      {children}
    </NextLink>
  );
}

export default function Footer() {
  const t = useTranslations("Footer");
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();

  const toolLinks = [
    {
      href: "/tools/craft-profit",
      label: t("links.craftProfit"),
      localized: true,
    },
    {
      href: "/tools/monster-search",
      label: t("links.monsterSearch"),
      localized: true,
    },
    {
      href: "/tools/monster-zukan",
      label: t("links.monsterZukan"),
      localized: true,
    },
    {
      href: "/tools/map-monster-browser",
      label: t("links.mapMonsterBrowser"),
      localized: true,
    },
    {
      href: "/tools/kishoju",
      label: t("links.kishoju"),
      localized: true,
    },
  ];

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.titleRow}>
          <FooterNavLink
            href="/"
            localized
            className={styles.brand}
            aria-label="アストルティアの孫の手"
          >
            アストルティアの孫の手
          </FooterNavLink>
        </div>

        <nav className={styles.nav} aria-label={t("sections.tools")}>
          {toolLinks.map((link) => (
            <FooterNavLink
              key={link.href}
              href={link.href}
              localized={link.localized}
              className={styles.link}
            >
              {link.label}
            </FooterNavLink>
          ))}

          <FooterNavLink href="/about" localized className={styles.link}>
            {t("links.about")}
          </FooterNavLink>
        </nav>

        <div className={styles.mobileAboutWrap}>
          <FooterNavLink
            href="/about"
            localized
            className={styles.mobileAboutLink}
          >
            {t("links.about")}
          </FooterNavLink>
        </div>

        <div className={styles.bottomRow}>
          <div className={styles.legalText}>
            <span>© {currentYear} アストルティアの孫の手</span>
            <span>{t("unofficialFanSite")}</span>
            <span>{t("copyrightNotice")}</span>
            <span className={styles.rights}>
              © ARMOR PROJECT/BIRD STUDIO/SQUARE ENIX All Rights Reserved.
            </span>
          </div>

          <div className={styles.account} aria-label={t("sections.admin")}>
            {!user ? (
              <FooterNavLink
                href="/login"
                localized={false}
                className={styles.adminLink}
              >
                admin
              </FooterNavLink>
            ) : (
              <NextLink href="/admin" className={styles.adminLink}>
                admin
              </NextLink>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
