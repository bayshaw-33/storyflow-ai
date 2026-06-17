"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useI18n } from "@/lib/i18n/useI18n";
import { KiikisLogo } from "@/components/brand/KiikisLogo";

type TopNavProps = {
  session: Session | null;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
  onEnterRoom?: () => void;
};

export function TopNav({ session, onEnterRoom, onSignIn, onSignOut, onSignUp }: TopNavProps) {
  const { locale, setLocale, t } = useI18n();
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    function onScroll() {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (y < 80) {
        setHidden(false);
      } else if (delta > 4) {
        setHidden(true);
      } else if (delta < -4) {
        setHidden(false);
      }
      lastY.current = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`kk-top-nav navbar${hidden ? " is-nav-hidden" : ""}`}>
      <Link className="kk-nav-brand" href="/">
        <KiikisLogo compact />
      </Link>

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
          <div className="kk-auth-buttons">
            <button className="kk-text-button" type="button" onClick={onSignUp}>
              {t("auth.signUp")}
            </button>
            <button className="kk-text-button primary" type="button" onClick={onSignIn}>
              {t("auth.signIn")}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
