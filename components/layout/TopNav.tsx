"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useI18n } from "@/lib/i18n/useI18n";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type TopNavProps = {
  session: Session | null;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
  onEnterRoom?: () => void;
};

function metadataDisplayName(session: Session | null) {
  const metadata = session?.user.user_metadata as Record<string, unknown> | undefined;
  const value = metadata?.display_name || metadata?.full_name || metadata?.name;
  return typeof value === "string" ? value.trim() : "";
}

function emailFallback(session: Session | null) {
  return session?.user.email?.split("@")[0] || "";
}

export function TopNav({ session, onEnterRoom, onSignIn, onSignOut, onSignUp }: TopNavProps) {
  const { locale, setLocale, t } = useI18n();
  const [profileName, setProfileName] = useState("");

  useEffect(() => {
    let cancelled = false;
    setProfileName("");

    async function loadProfileName() {
      if (!session?.user.id) return;
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const { data } = await supabase
        .from("storyflow_profiles")
        .select("display_name")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!cancelled && typeof data?.display_name === "string") {
        setProfileName(data.display_name.trim());
      }
    }

    void loadProfileName();
    return () => {
      cancelled = true;
    };
  }, [session?.user.id, session?.user.user_metadata]);

  const accountName = profileName || metadataDisplayName(session) || emailFallback(session);

  return (
    <header className="kk-top-nav navbar">
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
            <span className="kk-nav-email">{accountName}</span>
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
