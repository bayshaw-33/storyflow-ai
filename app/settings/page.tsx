"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { DEFAULT_PLAN_ID, getPlanEntitlement, type PlanId } from "@/lib/billing/plans";
import { STORAGE_KEY } from "@/lib/projects";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";

const PLAN_STORAGE_KEY = "kiikis_plan_id";
const PLAN_IDS: PlanId[] = ["free", "elite", "pro", "ultra"];

type Profile = {
  email: string | null;
  display_name: string | null;
  plan: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Credits = {
  balance: number;
  monthlyLimit: number;
  periodStart: string;
  periodEnd: string;
};

const copy = {
  "en-US": {
    kicker: "Settings",
    title: "Manage your profile.",
    subtitle: "Account identity, current plan, registration date, and creation credits.",
    signedOut: "Sign in to manage your profile.",
    localProjects: "local projects",
    profile: "Profile",
    avatar: "Avatar",
    avatarUrl: "Avatar link",
    avatarUrlPlaceholder: "https://example.com/avatar.jpg",
    avatarHint: "Upload an image, or paste a public image link.",
    avatarUpload: "Upload image",
    avatarUploading: "Uploading",
    avatarUploadFailed: "Avatar upload failed. Check the avatars storage bucket.",
    avatarTypeError: "Please upload an image file.",
    displayName: "Display name",
    displayNamePlaceholder: "Name shown in your workspace",
    email: "Email",
    plan: "Current plan",
    registered: "Registered",
    updated: "Updated",
    credits: "Credits",
    creditsUnavailable: "Credits are not available yet.",
    language: "Language",
    save: "Save profile",
    saving: "Saving",
    saved: "Profile saved.",
    saveFailed: "Could not save your profile.",
    loadFailed: "Could not load your profile.",
    noProfile: "No profile row was found for this account.",
    upgrade: "Change plan",
    notConnected: "Not connected",
  },
  "zh-CN": {
    kicker: "设置",
    title: "管理你的个人资料。",
    subtitle: "账号身份、当前套餐、注册时间与创作积分。",
    signedOut: "请先登录后再管理个人资料。",
    localProjects: "个本地项目",
    profile: "个人资料",
    avatar: "头像",
    avatarUrl: "头像链接",
    avatarUrlPlaceholder: "https://example.com/avatar.jpg",
    avatarHint: "上传图片，或粘贴公开图片链接。",
    avatarUpload: "上传头像",
    avatarUploading: "上传中",
    avatarUploadFailed: "头像上传失败，请检查 avatars 存储桶。",
    avatarTypeError: "请上传图片文件。",
    displayName: "显示名称",
    displayNamePlaceholder: "工作区中显示的名称",
    email: "邮箱",
    plan: "当前套餐",
    registered: "注册时间",
    updated: "更新时间",
    credits: "积分",
    creditsUnavailable: "暂时无法读取积分。",
    language: "语言",
    save: "保存资料",
    saving: "保存中",
    saved: "个人资料已保存。",
    saveFailed: "个人资料保存失败。",
    loadFailed: "个人资料读取失败。",
    noProfile: "当前账号未找到个人资料记录。",
    upgrade: "更换套餐",
    notConnected: "未连接",
  },
};

function normalizePlan(value: string | null | undefined): PlanId {
  return PLAN_IDS.includes(value as PlanId) ? (value as PlanId) : DEFAULT_PLAN_ID;
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}

function getAvatarUrl(session: Session | null) {
  const value = session?.user.user_metadata?.avatar_url;
  return typeof value === "string" ? value : "";
}

function getAvatarInitial(displayName: string, email: string) {
  const source = displayName.trim() || email.trim();
  return source ? source.slice(0, 1).toUpperCase() : "K";
}

export default function SettingsPage() {
  const { locale } = useI18n();
  const text = copy[locale];
  const [projectCount, setProjectCount] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [credits, setCredits] = useState<Credits | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setMessage(null);
      setProjectCount(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").length);

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setLoading(false);
        setMessage({ tone: "error", text: text.loadFailed });
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const nextSession = sessionData.session;
      if (cancelled) return;
      setSession(nextSession || null);
      setAvatarUrl(getAvatarUrl(nextSession || null));

      if (!nextSession?.user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("storyflow_profiles")
        .select("email, display_name, plan, created_at, updated_at")
        .eq("user_id", nextSession.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setMessage({ tone: "error", text: text.loadFailed });
      } else if (!data) {
        setMessage({ tone: "error", text: text.noProfile });
      } else {
        const nextProfile = data as Profile;
        setProfile(nextProfile);
        setDisplayName(nextProfile.display_name || "");
        localStorage.setItem(PLAN_STORAGE_KEY, normalizePlan(nextProfile.plan).toString());
      }

      try {
        const response = await fetch("/api/account/credits", {
          headers: { Authorization: `Bearer ${nextSession.access_token}` },
        });
        const payload = await response.json();
        if (!cancelled && response.ok && payload?.success) setCredits(payload.credits);
      } catch {
        if (!cancelled) setCredits(null);
      }

      if (!cancelled) setLoading(false);
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [text.loadFailed, text.noProfile]);

  const planId = normalizePlan(profile?.plan);
  const plan = useMemo(() => getPlanEntitlement(planId), [planId]);
  const email = profile?.email || session?.user.email || "-";
  const registeredAt = formatDate(profile?.created_at, locale);
  const updatedAt = formatDate(profile?.updated_at, locale);
  const trimmedAvatarUrl = avatarUrl.trim();
  const avatarInitial = getAvatarInitial(displayName, email);

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage({ tone: "error", text: text.avatarTypeError });
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !session?.user) {
      setMessage({ tone: "error", text: text.saveFailed });
      return;
    }

    setAvatarUploading(true);
    setMessage(null);

    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${session.user.id}/${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      if (!data.publicUrl) throw new Error("missing-public-url");

      setAvatarUrl(data.publicUrl);
      const nextName = displayName.trim();
      const { data: authData, error: authError } = await supabase.auth.updateUser({
        data: {
          avatar_url: data.publicUrl,
          display_name: nextName || null,
          full_name: nextName || null,
        },
      });
      if (authError) throw authError;
      if (authData.user) {
        setSession((current) => (current ? { ...current, user: authData.user } : current));
      }
      setMessage({ tone: "success", text: text.saved });
    } catch {
      setMessage({ tone: "error", text: text.avatarUploadFailed });
    } finally {
      setAvatarUploading(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase || !session?.user) throw new Error("missing-session");

      const { data, error } = await supabase
        .from("storyflow_profiles")
        .update({
          display_name: displayName.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", session.user.id)
        .select("email, display_name, plan, created_at, updated_at")
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("missing-profile");

      const { data: authData, error: authError } = await supabase.auth.updateUser({
        data: {
          avatar_url: trimmedAvatarUrl || null,
          display_name: displayName.trim() || null,
          full_name: displayName.trim() || null,
        },
      });
      if (authError) throw authError;

      setProfile(data as Profile);
      if (authData.user) {
        setSession((current) => (current ? { ...current, user: authData.user } : current));
      }
      setMessage({ tone: "success", text: text.saved });
    } catch {
      setMessage({ tone: "error", text: text.saveFailed });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="cosmic-page settings-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
      </header>

      <section className="cosmic-title-band">
        <span>{text.kicker}</span>
        <h1>{text.title}</h1>
        <p>{displayName.trim() || session?.user.email || text.signedOut} / {projectCount} {text.localProjects}</p>
      </section>

      {message ? <p className={`notice ${message.tone}`}>{message.text}</p> : null}

      <section className="settings-grid">
        <form className="settings-card profile-settings-card" onSubmit={saveProfile}>
          <span>{text.profile}</span>

          <div className="avatar-editor">
            <div
              className="avatar-preview"
              style={trimmedAvatarUrl ? { backgroundImage: `url("${trimmedAvatarUrl}")` } : undefined}
              aria-label={text.avatar}
            >
              {trimmedAvatarUrl ? null : avatarInitial}
            </div>
            <div className="avatar-controls">
              <label className="avatar-upload-button secondary-button">
                {avatarUploading ? text.avatarUploading : text.avatarUpload}
                <input
                  type="file"
                  accept="image/*"
                  disabled={loading || avatarUploading || !session}
                  onChange={uploadAvatar}
                />
              </label>
              <label>
                {text.avatarUrl}
                <input
                  type="url"
                  value={avatarUrl}
                  placeholder={text.avatarUrlPlaceholder}
                  disabled={loading || avatarUploading || !session}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                />
                <small className="field-note">{text.avatarHint}</small>
              </label>
            </div>
          </div>

          <label>
            {text.displayName}
            <input
              type="text"
              value={displayName}
              placeholder={text.displayNamePlaceholder}
              disabled={loading || !session}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>

          <dl className="plan-entitlements">
            <div><dt>{text.email}</dt><dd>{email}</dd></div>
            <div><dt>{text.plan}</dt><dd>{plan.name}</dd></div>
            <div><dt>{text.registered}</dt><dd>{registeredAt}</dd></div>
            <div><dt>{text.updated}</dt><dd>{updatedAt}</dd></div>
          </dl>

          <div className="settings-control-row">
            <button className="primary-button" type="submit" disabled={loading || saving || !session}>
              {saving ? text.saving : text.save}
            </button>
            <Link className="secondary-button" href="/subscription">{text.upgrade}</Link>
          </div>
        </form>

        <article className="settings-card">
          <span>{text.credits}</span>
          <dl className="plan-entitlements">
            <div>
              <dt>{text.credits}</dt>
              <dd>{credits ? `${credits.balance} / ${credits.monthlyLimit}` : text.creditsUnavailable}</dd>
            </div>
            <div><dt>{text.plan}</dt><dd>{plan.positioning}</dd></div>
            <div><dt>{text.registered}</dt><dd>{registeredAt}</dd></div>
          </dl>
        </article>

        <article className="settings-card">
          <span>{text.language}</span>
          <LanguageToggle />
        </article>
      </section>
    </main>
  );
}
