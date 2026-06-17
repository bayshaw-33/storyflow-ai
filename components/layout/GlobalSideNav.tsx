"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/useI18n";

// Single global nav, rendered once in app/layout.tsx so it appears
// identically on every page — no more duplicated/inconsistent nav blocks
// scattered across individual page headers.
export function GlobalSideNav() {
  const { t } = useI18n();

  return (
    <>
      <nav className="kk-nav-vertical" aria-label="Primary">
        <Link href="/universes">{t("nav.universe")}</Link>
        <Link href="/companions">{t("nav.companions")}</Link>
        <Link href="/subscription">{t("nav.pricing")}</Link>
      </nav>
      <div className="kk-nav-settings-corner">
        <Link href="/settings">{t("nav.settings")}</Link>
      </div>
    </>
  );
}
