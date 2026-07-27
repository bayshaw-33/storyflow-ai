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
  detail?: string;
};

type ProfileError =
  | { kind: "no-supabase" }
  | { kind: "no-session" }
  | { kind: "api-error"; status: number; message: string }
  | { kind: "network-error"; message: string };

/**
 * /settings/profile
 * 本人资料编辑页：在 SettingsTabs 容器中渲染 ProfileEditor。
 * 未登录时显示登录 CTA。
 */
export default function SettingsProfilePage() {
  const { t, locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [reloadKey, setReloadKey] = useState(0);
  const [profileError, setProfileError] = useState<ProfileError | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setProfileError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setProfileError({ kind: "no-supabase" });
      setLoading(false);
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const nextSession = sessionData.session;
    setSession(nextSession || null);
    if (!nextSession?.access_token) {
      setProfileError({ kind: "no-session" });
      setLoading(false);
      return;
    }

    let accessToken = nextSession.access_token;

    try {
      let response = await fetch("/api/profile/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // 401 时尝试刷新 session 后重试（token 可能已过期）
      if (response.status === 401) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshData.session?.access_token) {
          accessToken = refreshData.session.access_token;
          setSession(refreshData.session);
          response = await fetch("/api/profile/me", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        }
      }

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
        setProfileError(null);
      } else {
        const apiMessage = flattenString(payload?.error) || `HTTP ${response.status}`;
        const detail = payload?.detail ? `\n${flattenString(payload.detail)}` : "";
        setProfileError({
          kind: "api-error",
          status: response.status,
          message: `${apiMessage}${detail}`,
        });
      }
    } catch (e) {
      setProfileError({
        kind: "network-error",
        message: e instanceof Error ? e.message : "网络错误",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();

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

function flattenString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.message === "string") return v.message;
    if (typeof v.error === "string") return v.error;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value == null ? "" : String(value);
}

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
            {profileError?.kind === "no-session" ? (
              <>
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
              </>
            ) : profileError?.kind === "no-supabase" ? (
              <p style={{ color: "var(--ink-secondary)", fontSize: 14 }}>
                {isZh ? "Supabase 未配置，无法加载资料。" : "Supabase is not configured."}
              </p>
            ) : profileError?.kind === "api-error" ? (
              <>
                <p style={{ color: "var(--ink-secondary)", fontSize: 14 }}>
                  {isZh ? "资料加载失败" : "Profile load failed"}（{profileError.status}）
                </p>
                <p style={{ color: "var(--ink-muted)", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: 480 }}>
                  {profileError.message}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void loadProfile()}
                  >
                    {isZh ? "重试" : "Retry"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setAuthMode("signin");
                      setAuthOpen(true);
                    }}
                  >
                    {isZh ? "重新登录" : "Sign in again"}
                  </button>
                </div>
              </>
            ) : profileError?.kind === "network-error" ? (
              <>
                <p style={{ color: "var(--ink-secondary)", fontSize: 14 }}>
                  {isZh ? "网络错误" : "Network error"}
                </p>
                <p style={{ color: "var(--ink-muted)", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: 480 }}>
                  {profileError.message}
                </p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void loadProfile()}
                >
                  {isZh ? "重试" : "Retry"}
                </button>
              </>
            ) : null}
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
