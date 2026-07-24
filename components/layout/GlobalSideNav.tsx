"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/useI18n";

/**
 * 左侧全局导航。
 * Community 入口高亮条件：当前路径为 /community 或 /u/[username]（用户主页）。
 */
export function GlobalSideNav() {
  const { t } = useI18n();
  const pathname = usePathname() || "";
  const isCommunityActive = pathname === "/community" || pathname.startsWith("/u/");

  return (
    <>
      <nav className="kk-nav-vertical" aria-label="Primary">
        <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>{t("nav.home")}</Link>
        <Link href="/dashboard" aria-current={pathname === "/dashboard" ? "page" : undefined}>{t("nav.dashboard")}</Link>
        <Link href="/universes" aria-current={pathname === "/universes" ? "page" : undefined}>{t("nav.universe")}</Link>
        <Link href="/actors" aria-current={pathname === "/actors" ? "page" : undefined}>{t("nav.actors")}</Link>
        <Link
          href="/community"
          aria-current={isCommunityActive ? "page" : undefined}
        >
          {t("nav.community")}
        </Link>
        <Link href="/subscription" aria-current={pathname === "/subscription" ? "page" : undefined}>{t("nav.pricing")}</Link>
      </nav>
      <div className="kk-nav-settings-corner">
        <Link
          href="/settings"
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
        >
          {t("nav.settings")}
        </Link>
      </div>
    </>
  );
}
