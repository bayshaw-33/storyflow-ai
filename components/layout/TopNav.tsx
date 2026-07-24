"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useI18n } from "@/lib/i18n/useI18n";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { UserMenu } from "@/components/layout/UserMenu";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type TopNavProps = {
  session: Session | null;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
  onEnterRoom?: () => void;
};

type TopNavProfile = {
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

function metadataDisplayName(session: Session | null) {
  const metadata = session?.user.user_metadata as Record<string, unknown> | undefined;
  const value = metadata?.display_name || metadata?.full_name || metadata?.name;
  return typeof value === "string" ? value.trim() : "";
}

function emailFallback(session: Session | null) {
  return session?.user.email?.split("@")[0] || "";
}

/**
 * TopNav：登录后用 UserMenu（头像 + 账号名 + 下拉：我的主页 / 账号设置 / 退出登录）。
 * Profile 通过 supabase browser client 拉取 username / display_name / avatar。
 */
export function TopNav({ session, onSignIn, onSignOut, onSignUp }: TopNavProps) {
  const { locale, setLocale } = useI18n();
  const [profile, setProfile] = useState<TopNavProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);

    async function loadProfile() {
      if (!session?.user.id) return;
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const { data } = await supabase
        .from("storyflow_profiles")
        .select("username, display_name, avatar_asset_id, avatar_asset:avatar_asset_id(storage_path)")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (cancelled || !data) return;
      const storagePath = (data.avatar_asset as { storage_path?: string } | null)?.storage_path;
      const avatarUrl = storagePath ? buildAvatarUrl(storagePath) : null;
      setProfile({
        username: (data.username as string | null) ?? null,
        display_name: (data.display_name as string | null) ?? null,
        avatar_url: avatarUrl,
      });
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [session?.user.id, session?.user.user_metadata]);

  // 兜底显示名（在 profile 加载完成前）
  const fallbackName = profile?.display_name?.trim() || metadataDisplayName(session) || emailFallback(session);

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
          <UserMenu
            session={session}
            profile={profile ? { ...profile, display_name: fallbackName } : { display_name: fallbackName }}
            onSignOut={onSignOut}
          />
        ) : (
          <div className="kk-auth-buttons">
            <button className="kk-text-button" type="button" onClick={onSignUp}>
              {locale === "zh-CN" ? "注册" : "Sign up"}
            </button>
            <button className="kk-text-button primary" type="button" onClick={onSignIn}>
              {locale === "zh-CN" ? "登录" : "Sign in"}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function buildAvatarUrl(storagePath: string): string | null {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/avatars/${storagePath}`;
}
