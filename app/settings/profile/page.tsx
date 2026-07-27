"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { AuthModal } from "@/components/layout/AuthModal";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { ProfileEditor } from "@/components/settings/ProfileEditor";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";
import type { Profile } from "@/components/profile/types";

type AuthMode = "signin" | "signup";

type ProfileResponse = {
  success: boolean;
  profile?: Profile & { email?: string | null; plan?: string | null };
  error?: string;
};

/**
 * /settings/profile
 * 本人资料编辑页：在 SettingsTabs 容器中渲染 ProfileEditor。
 * 未登录时显示登录 CTA。
 */
export default function SettingsProfilePage() {
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [reloadKey, setReloadKey] = useState(0);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const nextSession = sessionData.session;
    setSession(nextSession || null);
    if (!nextSession?.access_token) {
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/profile/me", {
        headers: { Authorization: `Bearer ${nextSession.access_token}` },
      });
      const payload = (await response.json().catch(() => null)) as ProfileResponse | null;
      if (response.ok && payload?.success && payload.profile) {
        const p = payload.profile;
        setProfile({
          user_id: p.user_id,
          username: p.username ?? null,
          display_name: p.display_name ?? null,
          bio: p.bio ?? null,
          avatar_url: p.avatar_url ?? null,
          avatar_asset_id: p.avatar_asset_id ?? null,
          creative_tags: p.creative_tags ?? [],
          social_links: p.social_links ?? {},
          location: p.location ?? null,
          language_preference: p.language_preference ?? "en-US",
          pronouns: p.pronouns ?? null,
          profile_visibility: p.profile_visibility ?? "public",
          plan: p.plan ?? null,
          username_changed_at: p.username_changed_at ?? null,
          username_set_at: p.username_set_at ?? null,
        });
      }
    } catch {
      // ignore — profile stays null
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();

    // 监听 auth 状态变化（与 dashboard/login 一致），避免已登录用户在 session
    // 异步恢复完成前被误判为未登录，导致要求重新登录却始终登录不上。
    const supabase = getSupabaseBrowserClient();
    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession || null);
        if (nextSession?.access_token) {
          void loadProfile();
        }
      }) ?? {};

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [loadProfile, reloadKey]);

  return (
    <main className="cosmic-page settings-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
      </header>

      <section className="cosmic-title-band">
        <span>{t("settings.kicker")}</span>
        <h1>{t("settings.title")}</h1>
      </section>

      <SettingsTabs activeTab="profile">
        {loading ? (
          <p style={{ color: "var(--ink-muted)", fontSize: 13, padding: "var(--space-6) 0" }}>
            {t("common.loading")}…
          </p>
        ) : session && profile ? (
          <ProfileEditor
            profile={profile}
            onSaved={() => void loadProfile()}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start", padding: "var(--space-6) 0" }}>
            <p style={{ color: "var(--ink-secondary)", fontSize: 14 }}>{t("settings.signedOut")}</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setAuthMode("signin");
                setAuthOpen(true);
              }}
            >
              {t("settings.signIn")}
            </button>
          </div>
        )}
      </SettingsTabs>

      <AuthModal
        open={authOpen}
        mode={authMode}
        onClose={() => {
          setAuthOpen(false);
          setReloadKey((value) => value + 1);
        }}
      />
    </main>
  );
}
