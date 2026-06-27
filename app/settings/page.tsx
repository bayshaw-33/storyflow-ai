"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { AuthModal } from "@/components/layout/AuthModal";
import { DEFAULT_PLAN_ID, getPlanEntitlement, type PlanId } from "@/lib/billing/plans";
import { STORAGE_KEY } from "@/lib/projects";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";

const PLAN_STORAGE_KEY = "kiikis_plan_id";
const BYO_API_STORAGE_KEY = "kiikis_byo_api_config";
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

type AuthMode = "signin" | "signup";
type ByoApiSettings = {
  provider: "auto" | "deepseek" | "minimax";
  deepseekApiKey: string;
  deepseekModel: string;
  minimaxApiKey: string;
  minimaxModel: string;
  minimaxBaseUrl: string;
};

const EMPTY_BYO_API: ByoApiSettings = {
  provider: "auto",
  deepseekApiKey: "",
  deepseekModel: "",
  minimaxApiKey: "",
  minimaxModel: "",
  minimaxBaseUrl: "",
};

const copy = {
  "en-US": {
    kicker: "Settings",
    title: "Manage your profile.",
    subtitle: "Account identity, current plan, registration date, and creation credits.",
    signedOut: "Sign in to manage your profile.",
    signIn: "Sign in",
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
    apiKeys: "API Keys",
    apiKeysHint: "For Pro and Ultra. Keys are stored on this device and sent only with AI generation requests.",
    apiProvider: "Provider routing",
    apiProviderAuto: "Auto",
    apiProviderDeepSeek: "DeepSeek",
    apiProviderMiniMax: "MiniMax",
    deepseekKey: "DeepSeek API Key",
    deepseekModel: "DeepSeek model",
    minimaxKey: "MiniMax API Key",
    minimaxModel: "MiniMax model",
    minimaxBaseUrl: "MiniMax base URL",
    optional: "Optional",
    saveApiKeys: "Save API keys",
    clearApiKeys: "Clear keys",
    apiKeysSaved: "API keys saved on this device.",
    apiKeysCleared: "API keys cleared.",
    apiKeysLocked: "Upgrade to Pro or Ultra to use BYO API.",
  },
  "zh-CN": {
    kicker: "设置",
    title: "管理你的个人资料。",
    subtitle: "账号身份、当前套餐、注册时间与创作积分。",
    signedOut: "请先登录后再管理个人资料。",
    signIn: "登录",
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
    apiKeys: "API Keys",
    apiKeysHint: "Pro 和 Ultra 可用。Key 只保存在当前设备，并仅在 AI 生成请求中发送。",
    apiProvider: "供应商路由",
    apiProviderAuto: "自动",
    apiProviderDeepSeek: "DeepSeek",
    apiProviderMiniMax: "MiniMax",
    deepseekKey: "DeepSeek API Key",
    deepseekModel: "DeepSeek 模型",
    minimaxKey: "MiniMax API Key",
    minimaxModel: "MiniMax 模型",
    minimaxBaseUrl: "MiniMax Base URL",
    optional: "可选",
    saveApiKeys: "保存 API Key",
    clearApiKeys: "清除 Key",
    apiKeysSaved: "API Key 已保存在当前设备。",
    apiKeysCleared: "API Key 已清除。",
    apiKeysLocked: "升级到 Pro 或 Ultra 后可使用自接 API。",
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
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [reloadKey, setReloadKey] = useState(0);
  const [byoApi, setByoApi] = useState<ByoApiSettings>(EMPTY_BYO_API);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setMessage(null);
      setProjectCount(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").length);
      setByoApi(readByoApiSettings());

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
  }, [reloadKey, text.loadFailed, text.noProfile]);

  const planId = normalizePlan(profile?.plan);
  const plan = useMemo(() => getPlanEntitlement(planId), [planId]);
  const canUseByoApi = Boolean(session && plan.features.byoApi);
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

  function saveApiKeys() {
    if (!canUseByoApi) {
      setMessage({ tone: "error", text: text.apiKeysLocked });
      return;
    }

    localStorage.setItem(BYO_API_STORAGE_KEY, JSON.stringify({
      provider: byoApi.provider,
      deepseekApiKey: byoApi.deepseekApiKey.trim(),
      deepseekModel: byoApi.deepseekModel.trim(),
      minimaxApiKey: byoApi.minimaxApiKey.trim(),
      minimaxModel: byoApi.minimaxModel.trim(),
      minimaxBaseUrl: byoApi.minimaxBaseUrl.trim(),
    }));
    setMessage({ tone: "success", text: text.apiKeysSaved });
  }

  function clearApiKeys() {
    localStorage.removeItem(BYO_API_STORAGE_KEY);
    setByoApi(EMPTY_BYO_API);
    setMessage({ tone: "success", text: text.apiKeysCleared });
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
            {session ? (
              <button className="primary-button" type="submit" disabled={loading || saving}>
                {saving ? text.saving : text.save}
              </button>
            ) : (
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setAuthMode("signin");
                  setAuthOpen(true);
                }}
              >
                {text.signIn}
              </button>
            )}
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

        <article className="settings-card api-settings-card">
          <span>{text.apiKeys}</span>
          <p className="field-note">{canUseByoApi ? text.apiKeysHint : text.apiKeysLocked}</p>
          <label>
            {text.apiProvider}
            <select
              value={byoApi.provider}
              disabled={!canUseByoApi}
              onChange={(event) => setByoApi((current) => ({ ...current, provider: event.target.value as ByoApiSettings["provider"] }))}
            >
              <option value="auto">{text.apiProviderAuto}</option>
              <option value="deepseek">{text.apiProviderDeepSeek}</option>
              <option value="minimax">{text.apiProviderMiniMax}</option>
            </select>
          </label>
          <label>
            {text.deepseekKey}
            <input
              type="password"
              value={byoApi.deepseekApiKey}
              disabled={!canUseByoApi}
              placeholder="sk-..."
              onChange={(event) => setByoApi((current) => ({ ...current, deepseekApiKey: event.target.value }))}
            />
          </label>
          <label>
            {text.deepseekModel} <small>{text.optional}</small>
            <input
              value={byoApi.deepseekModel}
              disabled={!canUseByoApi}
              placeholder="deepseek-v4-flash"
              onChange={(event) => setByoApi((current) => ({ ...current, deepseekModel: event.target.value }))}
            />
          </label>
          <label>
            {text.minimaxKey}
            <input
              type="password"
              value={byoApi.minimaxApiKey}
              disabled={!canUseByoApi}
              placeholder="MiniMax API key"
              onChange={(event) => setByoApi((current) => ({ ...current, minimaxApiKey: event.target.value }))}
            />
          </label>
          <label>
            {text.minimaxModel} <small>{text.optional}</small>
            <input
              value={byoApi.minimaxModel}
              disabled={!canUseByoApi}
              placeholder="MiniMax-M3"
              onChange={(event) => setByoApi((current) => ({ ...current, minimaxModel: event.target.value }))}
            />
          </label>
          <label>
            {text.minimaxBaseUrl} <small>{text.optional}</small>
            <input
              type="url"
              value={byoApi.minimaxBaseUrl}
              disabled={!canUseByoApi}
              placeholder="https://api.minimax.io/v1/chat/completions"
              onChange={(event) => setByoApi((current) => ({ ...current, minimaxBaseUrl: event.target.value }))}
            />
          </label>
          <div className="settings-control-row">
            <button className="primary-button" type="button" disabled={!canUseByoApi} onClick={saveApiKeys}>
              {text.saveApiKeys}
            </button>
            <button className="secondary-button" type="button" onClick={clearApiKeys}>
              {text.clearApiKeys}
            </button>
          </div>
        </article>

        <article className="settings-card">
          <span>{text.language}</span>
          <LanguageToggle />
        </article>
      </section>
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

function readByoApiSettings(): ByoApiSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(BYO_API_STORAGE_KEY) || "null") as Partial<ByoApiSettings> | null;
    if (!parsed) return EMPTY_BYO_API;
    return {
      provider: parsed.provider === "deepseek" || parsed.provider === "minimax" ? parsed.provider : "auto",
      deepseekApiKey: parsed.deepseekApiKey || "",
      deepseekModel: parsed.deepseekModel || "",
      minimaxApiKey: parsed.minimaxApiKey || "",
      minimaxModel: parsed.minimaxModel || "",
      minimaxBaseUrl: parsed.minimaxBaseUrl || "",
    };
  } catch {
    return EMPTY_BYO_API;
  }
}
