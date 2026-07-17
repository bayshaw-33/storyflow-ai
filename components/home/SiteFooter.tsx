"use client";

import { useI18n } from "@/lib/i18n/useI18n";
import { LanguageToggle } from "@/components/LanguageToggle";

/**
 * T01 §4 页脚 — 版权 + 邮箱 + 语言切换，清死链。
 * 邮箱 hello@kiikis.com（mailto:）。语言切换复用 LanguageToggle 组件。
 * 不放置任何外部社交链接（避免死链）。版权年份自动更新。
 */
export function SiteFooter() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <span className="site-footer-brand-name">KIIKIS</span>
          <span className="site-footer-tagline">{t("brand.tagline")}</span>
        </div>

        <div className="site-footer-links">
          <a className="site-footer-link" href="mailto:hello@kiikis.com">
            hello@kiikis.com
          </a>
        </div>

        <div className="site-footer-actions">
          <LanguageToggle />
        </div>
      </div>

      <div className="site-footer-bottom">
        <span>© {year} KIIKIS. {t("brand.description")}</span>
      </div>
    </footer>
  );
}
