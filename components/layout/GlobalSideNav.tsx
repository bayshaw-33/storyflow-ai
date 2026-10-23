"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/useI18n";
import { useState } from "react";
import { WORK_TYPE_CARDS } from "@/lib/client/v2/project-start/helpers";

/**
 * 左侧全局导航。
 * Community 入口高亮条件：当前路径为 /community 或 /u/[username]（用户主页）。
 */
export function GlobalSideNav() {
  const { t, locale } = useI18n();
  const pathname = usePathname() || "";
  const isCommunityActive = pathname === "/community" || pathname.startsWith("/u/");
  const [workbenchOpen, setWorkbenchOpen] = useState(pathname === "/dashboard");
  const isZh = locale === "zh-CN";

  return (
    <>
      <nav className="kk-nav-vertical" aria-label="Primary">
        <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>{t("nav.home")}</Link>
        <div className="kk-nav-workbench">
          <div className="kk-nav-workbench-row">
            <Link href="/dashboard" onClick={() => setWorkbenchOpen(true)} aria-current={pathname === "/dashboard" ? "page" : undefined}>{t("nav.dashboard")}</Link>
            <button type="button" aria-label={isZh ? "展开或收起工作台入口" : "Toggle workbench entries"} aria-expanded={workbenchOpen} aria-controls="kk-workbench-entries" onClick={() => setWorkbenchOpen(open => !open)}>{workbenchOpen ? "⌄" : "›"}</button>
          </div>
          <ul id="kk-workbench-entries" className="kk-nav-submenu" hidden={!workbenchOpen} aria-label={isZh ? "创作模块" : "Creation modules"}>
            {WORK_TYPE_CARDS.map(card => <li key={card.id}><Link href={card.route || `/projects/new-v2?type=${card.workType}`}>{isZh ? card.titleZh : card.titleEn}</Link></li>)}
          </ul>
        </div>
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
