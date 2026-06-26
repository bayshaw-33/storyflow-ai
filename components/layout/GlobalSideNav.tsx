"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/useI18n";

export function GlobalSideNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const hideOnWorkspace =
    pathname.startsWith("/projects") ||
    pathname.startsWith("/novel-workbench") ||
    pathname.startsWith("/song-workbench") ||
    pathname.startsWith("/viral-workbench");

  if (hideOnWorkspace) return null;

  return (
    <>
      <nav className="kk-nav-vertical" aria-label="Primary">
        <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>{t("nav.home")}</Link>
        <Link href="/dashboard" aria-current={pathname === "/dashboard" ? "page" : undefined}>{t("nav.dashboard")}</Link>
        <Link href="/universes" aria-current={pathname === "/universes" ? "page" : undefined}>{t("nav.universe")}</Link>
        <Link href="/companions" aria-current={pathname === "/companions" ? "page" : undefined}>{t("nav.companions")}</Link>
        <Link href="/subscription" aria-current={pathname === "/subscription" ? "page" : undefined}>{t("nav.pricing")}</Link>
      </nav>
      <div className="kk-nav-settings-corner">
        <Link href="/settings" aria-current={pathname === "/settings" ? "page" : undefined}>{t("nav.settings")}</Link>
      </div>
    </>
  );
}
