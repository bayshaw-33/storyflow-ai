"use client";

import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { BRAND_NAME } from "@/lib/brand";
import { useI18n } from "@/lib/i18n/useI18n";

type TopNavProps = {
  session: Session | null;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
};

export function TopNav({ session, onSignIn, onSignOut, onSignUp }: TopNavProps) {
  const { locale, setLocale } = useI18n();

  return (
    <header className="kk-top-nav">
      <Link className="kk-nav-brand" href="/">
        {BRAND_NAME}
      </Link>

      <nav className="kk-nav-links" aria-label="Primary">
        <a href="#projects">Projects</a>
        <a href="#workflows">Workflows</a>
        <Link href="/universes">Universe</Link>
        <Link href="/settings">Settings</Link>
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
              Sign out
            </button>
          </>
        ) : (
          <>
            <button className="kk-text-button" type="button" onClick={onSignUp}>
              Sign up
            </button>
            <button className="kk-text-button primary" type="button" onClick={onSignIn}>
              Sign in
            </button>
          </>
        )}
      </div>
    </header>
  );
}
