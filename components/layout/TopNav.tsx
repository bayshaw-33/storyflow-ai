"use client";

import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { useI18n } from "@/lib/i18n/useI18n";
import { KiikisLogo } from "@/components/brand/KiikisLogo";

type TopNavProps = {
  session: Session | null;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
  onEnterRoom?: () => void;
  brandInline?: boolean;
};

export function TopNav({ session, onEnterRoom, onSignIn, onSignOut, onSignUp, brandInline = false }: TopNavProps) {
  const { locale, setLocale, t } = useI18n();

  return (
    <header className="kk-top-nav navbar">
      <Link className="kk-nav-brand" href="/">
        <KiikisLogo compact inline={brandInline} />
      </Link>

      <nav className="kk-nav-links" aria-label="Primary">
        <a href="#product">{t("nav.product")}</a>
        <Link href="/universes">{t("nav.universe")}</Link>
        <Link href="/companions">{t("nav.companions")}</Link>
        <Link href="/subscription">{t("nav.pricing")}</Link>
        <Link href="/templates">{t("nav.resources")}</Link>
      </nav>

      <div className="kk-nav-actions">
        <div className="kk-language-switch" aria-label="Interface language">
          <button
            className={locale === "en-US" ? "active" : ""}
            type="button"
            onClick={() => setLocale("en-US")}
            aria-pressed={locale === "en-US"}
          >
            EN
          </button>
          <button
            className={locale === "zh-CN" ? "active" : ""}
            type="button"
            onClick={() => setLocale("zh-CN")}
            aria-pressed={locale === "zh-CN"}
          >
            CN
          </button>
        </div>

        {session ? (
          <>
            <span className="kk-nav-email">{session.user.email}</span>
            <button className="kk-text-button" type="button" onClick={onSignOut}>
              {t("auth.signOut")}
            </button>
          </>
        ) : (
          <>
            <button className="kk-text-button" type="button" onClick={onSignUp}>
              {t("auth.signUp")}
            </button>
            <button className="kk-text-button primary" type="button" onClick={onSignIn}>
              {t("auth.signIn")}
            </button>
          </>
        )}
        <button className="kk-room-button" type="button" onClick={onEnterRoom || onSignIn}>
          {t("action.enterWritersRoom")}
        </button>
      </div>
    </header>
  );
}
