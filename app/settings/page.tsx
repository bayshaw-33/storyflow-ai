"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { AuthModal } from "@/components/layout/AuthModal";
import { readWorkflowModelRouting, writeWorkflowModelRouting, type WorkflowModelRoute, type WorkflowModelRouting } from "@/lib/ai/byoClient";
import type { TeamRole } from "@/lib/actors";
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
  provider: "auto" | "deepseek" | "minimax" | "custom";
  deepseekApiKey: string;
  deepseekModel: string;
  minimaxApiKey: string;
  minimaxModel: string;
  minimaxBaseUrl: string;
  customProviderName: string;
  customApiKey: string;
  customModel: string;
  customBaseUrl: string;
  /** 用户在 settings 页面选择的 Atlas Cloud LLM 模型名（独立于 provider 选择，作为 Atlas 路由的 modelOverride） */
  atlasModel: string;
};

type ApiConnectionSummary = {
  id: string;
  team_id?: string | null;
  scope: "personal" | "team";
  provider: string;
  model?: string | null;
  base_url?: string | null;
  label: string;
  status: "active" | "disabled";
  key_hint: string;
  updated_at: string;
};

type TeamOption = {
  id: string;
  name: string;
  role?: TeamRole;
};

const EMPTY_BYO_API: ByoApiSettings = {
  provider: "auto",
  deepseekApiKey: "",
  deepseekModel: "",
  minimaxApiKey: "",
  minimaxModel: "",
  minimaxBaseUrl: "",
  customProviderName: "",
  customApiKey: "",
  customModel: "",
  customBaseUrl: "",
  atlasModel: "",
};

/** Atlas Cloud 支持的 LLM 模型列表（用户从下拉选择）。
 * 这些是 Atlas Cloud 平台公开支持的主流模型，用户可自由切换。
 * 不需要 API key（用服务端 ATLASCLOUD_API_KEY）。 */
const ATLAS_LLM_MODEL_OPTIONS = [
  { value: "deepseek-ai/DeepSeek-V3.1", label: "DeepSeek V3.1（推荐·经济快速）" },
  { value: "deepseek-ai/deepseek-v4-pro", label: "DeepSeek V4 Pro（高质量）" },
  { value: "qwen/qwen3.6-plus", label: "通义千问 Qwen 3.6 Plus" },
  { value: "qwen/qwen3.5-flash", label: "通义千问 Qwen 3.5 Flash（极速）" },
  { value: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
  { value: "anthropic/claude-haiku-4.5-20251001", label: "Claude Haiku 4.5（快速）" },
  { value: "xai/grok-4.5", label: "Grok 4.5" },
  { value: "bytedance/doubao-seed-1.6-251015", label: "豆包 Seed 1.6" },
];

const copy = {
  "en-US": {
    kicker: "Settings",
    title: "Manage your profile.",
    subtitle: "Account identity, current plan, registration date, and creation credits.",
    signedOut: "Sign in to manage your profile.",
    signIn: "Sign in",
    guestPreview: "Preview as guest",
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
    apiKeysHint: "Add OpenAI-compatible models, then assign a default model to each workflow.",
    apiProvider: "Provider routing",
    apiProviderAuto: "Auto",
    apiProviderDeepSeek: "DeepSeek",
    apiProviderMiniMax: "MiniMax",
    apiProviderCustom: "Custom / OpenAI-compatible",
    deepseekKey: "DeepSeek API Key",
    deepseekModel: "DeepSeek model",
    minimaxKey: "MiniMax API Key",
    minimaxModel: "MiniMax model",
    minimaxBaseUrl: "MiniMax base URL",
    customProviderName: "Custom provider name",
    customKey: "Custom API Key",
    customModel: "Custom model",
    customBaseUrl: "Custom base URL",
    optional: "Optional",
    saveApiKeys: "Save API keys",
    clearApiKeys: "Clear keys",
    apiKeysSaved: "API connection saved.",
    apiKeysCleared: "API keys cleared.",
    apiKeysLocked: "Upgrade to Pro or Ultra to use BYO API.",
    apiScope: "Scope",
    apiScopePersonal: "Personal",
    apiScopeTeam: "Team shared",
    apiTeam: "Team",
    apiLabel: "Label",
    apiKey: "API Key",
    apiConnections: "Saved connections",
    noApiConnections: "No cloud API connections yet.",
    deleteConnection: "Disable",
    modelRouting: "Workflow model routing",
    defaultModel: "Default model",
  },
  "zh-CN": {
    kicker: "设置",
    title: "管理你的个人资料。",
    subtitle: "账号身份、当前套餐、注册时间与创作积分。",
    signedOut: "请先登录后再管理个人资料。",
    signIn: "登录",
    guestPreview: "访客预览",
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
    apiKeysHint: "添加 OpenAI 兼容模型后，可为每个工作流指定默认模型。",
    apiProvider: "供应商路由",
    apiProviderAuto: "自动",
    apiProviderDeepSeek: "DeepSeek",
    apiProviderMiniMax: "MiniMax",
    apiProviderCustom: "自定义 / OpenAI-compatible",
    deepseekKey: "DeepSeek API Key",
    deepseekModel: "DeepSeek 模型",
    minimaxKey: "MiniMax API Key",
    minimaxModel: "MiniMax 模型",
    minimaxBaseUrl: "MiniMax Base URL",
    customProviderName: "自定义供应商名称",
    customKey: "自定义 API Key",
    customModel: "自定义模型",
    customBaseUrl: "自定义 Base URL",
    optional: "可选",
    saveApiKeys: "保存 API Key",
    clearApiKeys: "清除 Key",
    apiKeysSaved: "API 连接已保存。",
    apiKeysCleared: "API Key 已清除。",
    apiKeysLocked: "升级到 Pro 或 Ultra 后可使用自接 API。",
    apiScope: "范围",
    apiScopePersonal: "个人",
    apiScopeTeam: "团队共享",
    apiTeam: "团队",
    apiLabel: "连接名称",
    apiKey: "API Key",
    apiConnections: "已保存连接",
    noApiConnections: "暂无云端 API 连接。",
    deleteConnection: "停用",
    modelRouting: "工作流模型路由",
    defaultModel: "默认模型",
  },
};

const workflowRouteOptions: Array<{ id: WorkflowModelRoute; zh: string; en: string }> = [
  { id: "novel", zh: "小说创作", en: "Novel Creation" },
  { id: "script", zh: "剧本创作", en: "Script Creation" },
  { id: "storyboard", zh: "分镜创作", en: "Storyboard" },
  { id: "video", zh: "视频创作", en: "Video" },
  { id: "song", zh: "歌曲创作", en: "Song Creation" },
  { id: "viral", zh: "改编创作", en: "Adaptation" },
];

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
  const [apiScope, setApiScope] = useState<"personal" | "team">("personal");
  const [apiTeamId, setApiTeamId] = useState("");
  const [apiLabel, setApiLabel] = useState("");
  const [apiConnections, setApiConnections] = useState<ApiConnectionSummary[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [workflowRouting, setWorkflowRouting] = useState<WorkflowModelRouting>({});

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setMessage(null);
      setProjectCount(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").length);
      setByoApi(readByoApiSettings());
      setWorkflowRouting(readWorkflowModelRouting());

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

      try {
        const [connectionsResponse, teamsResponse] = await Promise.all([
          fetch("/api/api-connections", { headers: { Authorization: `Bearer ${nextSession.access_token}` } }),
          fetch("/api/teams", { headers: { Authorization: `Bearer ${nextSession.access_token}` } }),
        ]);
        const connectionsPayload = await connectionsResponse.json().catch(() => null);
        const teamsPayload = await teamsResponse.json().catch(() => null);
        if (!cancelled) {
          setApiConnections(Array.isArray(connectionsPayload?.connections) ? connectionsPayload.connections : []);
          setTeams(Array.isArray(teamsPayload?.teams) ? teamsPayload.teams : []);
        }
      } catch {
        if (!cancelled) {
          setApiConnections([]);
          setTeams([]);
        }
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
  const canUseByoApi = Boolean(session);
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

  async function saveApiKeys() {
    if (!canUseByoApi || !session) {
      setMessage({ tone: "error", text: text.apiKeysLocked });
      return;
    }

    const provider = byoApi.provider === "minimax" ? "minimax" : byoApi.provider === "custom" ? "custom" : "deepseek";
    const providerName = provider === "custom" ? sanitizeProviderName(byoApi.customProviderName) : provider;
    const apiKey = provider === "deepseek"
      ? byoApi.deepseekApiKey.trim()
      : provider === "minimax"
        ? byoApi.minimaxApiKey.trim()
        : byoApi.customApiKey.trim();
    if (!apiKey) {
      setMessage({ tone: "error", text: provider === "deepseek" ? text.deepseekKey : provider === "minimax" ? text.minimaxKey : text.customKey });
      return;
    }
    if (provider === "custom" && (!byoApi.customBaseUrl.trim() || !byoApi.customModel.trim())) {
      setMessage({ tone: "error", text: `${text.customBaseUrl} / ${text.customModel}` });
      return;
    }

    try {
      const response = await fetch("/api/api-connections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          scope: apiScope,
          team_id: apiScope === "team" ? apiTeamId : null,
          provider: providerName,
          api_key: apiKey,
          model: provider === "deepseek" ? byoApi.deepseekModel.trim() : provider === "minimax" ? byoApi.minimaxModel.trim() : byoApi.customModel.trim(),
          base_url: provider === "minimax" ? byoApi.minimaxBaseUrl.trim() : provider === "custom" ? byoApi.customBaseUrl.trim() : "",
          label: apiLabel.trim(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "save failed");

      localStorage.setItem(BYO_API_STORAGE_KEY, JSON.stringify({
        provider: byoApi.provider,
        deepseekApiKey: byoApi.deepseekApiKey.trim(),
        deepseekModel: byoApi.deepseekModel.trim(),
        minimaxApiKey: byoApi.minimaxApiKey.trim(),
        minimaxModel: byoApi.minimaxModel.trim(),
        minimaxBaseUrl: byoApi.minimaxBaseUrl.trim(),
        customProviderName: byoApi.customProviderName.trim(),
        customApiKey: byoApi.customApiKey.trim(),
        customModel: byoApi.customModel.trim(),
        customBaseUrl: byoApi.customBaseUrl.trim(),
        atlasModel: byoApi.atlasModel.trim(),
      }));
      setApiConnections((current) => [payload.connection, ...current.filter((item) => item.id !== payload.connection.id)]);
      setApiLabel("");
      setWorkflowRouting((current) => {
        const next = { ...current };
        if (!next.novel) next.novel = payload.connection.id;
        writeWorkflowModelRouting(next);
        return next;
      });
      setMessage({ tone: "success", text: text.apiKeysSaved });
    } catch {
      setMessage({ tone: "error", text: text.saveFailed });
    }
  }

  function updateWorkflowRoute(workflow: WorkflowModelRoute, connectionId: string) {
    setWorkflowRouting((current) => {
      const next = { ...current, [workflow]: connectionId };
      if (!connectionId) delete next[workflow];
      writeWorkflowModelRouting(next);
      return next;
    });
  }

  function clearApiKeys() {
    localStorage.removeItem(BYO_API_STORAGE_KEY);
    setByoApi(EMPTY_BYO_API);
    setMessage({ tone: "success", text: text.apiKeysCleared });
  }

  async function disableApiConnection(id: string) {
    if (!session) return;
    try {
      const response = await fetch("/api/api-connections", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error("disable failed");
      setApiConnections((current) => current.filter((item) => item.id !== id));
      setMessage({ tone: "success", text: text.apiKeysCleared });
    } catch {
      setMessage({ tone: "error", text: text.saveFailed });
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
            {session ? (
              <button className="primary-button" type="submit" disabled={loading || saving}>
                {saving ? text.saving : text.save}
              </button>
            ) : (
              <>
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
                <Link className="secondary-button" href="/dashboard?guest=1">{text.guestPreview}</Link>
              </>
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
            {text.apiScope}
            <select
              value={apiScope}
              disabled={!canUseByoApi}
              onChange={(event) => setApiScope(event.target.value === "team" ? "team" : "personal")}
            >
              <option value="personal">{text.apiScopePersonal}</option>
              <option value="team">{text.apiScopeTeam}</option>
            </select>
          </label>
          {apiScope === "team" ? (
            <label>
              {text.apiTeam}
              <select
                value={apiTeamId}
                disabled={!canUseByoApi}
                onChange={(event) => setApiTeamId(event.target.value)}
              >
                <option value="">{text.apiTeam}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} {team.role ? `(${team.role})` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            {text.apiLabel} <small>{text.optional}</small>
            <input
              value={apiLabel}
              disabled={!canUseByoApi}
              placeholder={byoApi.provider === "minimax" ? "Studio MiniMax" : "Studio DeepSeek"}
              onChange={(event) => setApiLabel(event.target.value)}
            />
          </label>
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
              <option value="custom">{text.apiProviderCustom}</option>
            </select>
          </label>
          {byoApi.provider === "custom" ? (
            <>
              <label>
                {text.customProviderName}
                <input
                  value={byoApi.customProviderName}
                  disabled={!canUseByoApi}
                  placeholder="openai / qwen / anthropic-proxy"
                  onChange={(event) => setByoApi((current) => ({ ...current, customProviderName: event.target.value }))}
                />
              </label>
              <label>
                {text.customKey}
                <input
                  type="password"
                  value={byoApi.customApiKey}
                  disabled={!canUseByoApi}
                  placeholder="sk-..."
                  onChange={(event) => setByoApi((current) => ({ ...current, customApiKey: event.target.value }))}
                />
              </label>
              <label>
                {text.customModel}
                <input
                  value={byoApi.customModel}
                  disabled={!canUseByoApi}
                  placeholder="gpt-4.1 / qwen-max / claude-sonnet"
                  onChange={(event) => setByoApi((current) => ({ ...current, customModel: event.target.value }))}
                />
              </label>
              <label>
                {text.customBaseUrl}
                <input
                  type="url"
                  value={byoApi.customBaseUrl}
                  disabled={!canUseByoApi}
                  placeholder="https://api.example.com/v1"
                  onChange={(event) => setByoApi((current) => ({ ...current, customBaseUrl: event.target.value }))}
                />
              </label>
            </>
          ) : null}
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
              placeholder="deepseek-v4-pro"
              onChange={(event) => setByoApi((current) => ({ ...current, deepseekModel: event.target.value }))}
            />
          </label>
          <label>
            Atlas Cloud 文本模型 <small>（推荐 · 不需要 API key）</small>
            <select
              value={byoApi.atlasModel}
              disabled={!canUseByoApi}
              onChange={(event) => setByoApi((current) => ({ ...current, atlasModel: event.target.value }))}
            >
              <option value="">使用默认（DeepSeek V3.1）</option>
              {ATLAS_LLM_MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <small style={{ display: "block", marginTop: 4, color: "var(--muted, #888)", fontSize: 11 }}>
              所有文本 LLM 任务（剧本分析、翻译、本土化等）默认走 Atlas Cloud。这里选择模型可覆盖默认配置。
            </small>
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
          <div className="api-connection-list">
            <strong>{text.apiConnections}</strong>
            {apiConnections.length === 0 ? <p className="field-note">{text.noApiConnections}</p> : null}
            {apiConnections.map((connection) => (
              <article key={connection.id}>
                <div>
                  <span>{connection.scope === "team" ? text.apiScopeTeam : text.apiScopePersonal}</span>
                  <strong>{connection.label || connection.provider}</strong>
                  <small>{connection.provider} · {connection.model || text.optional} · {connection.key_hint}</small>
                </div>
                <button className="secondary-button" type="button" onClick={() => disableApiConnection(connection.id)}>
                  {text.deleteConnection}
                </button>
              </article>
            ))}
          </div>
          <div className="api-routing-list">
            <strong>{text.modelRouting}</strong>
            {workflowRouteOptions.map((workflow) => (
              <label key={workflow.id}>
                {locale === "zh-CN" ? workflow.zh : workflow.en}
                <select value={workflowRouting[workflow.id] || ""} onChange={(event) => updateWorkflowRoute(workflow.id, event.target.value)}>
                  <option value="">{text.defaultModel}</option>
                  {apiConnections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.label || connection.provider} · {connection.model || connection.provider}
                    </option>
                  ))}
                </select>
              </label>
            ))}
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
      provider: parsed.provider === "deepseek" || parsed.provider === "minimax" || parsed.provider === "custom" ? parsed.provider : "auto",
      deepseekApiKey: parsed.deepseekApiKey || "",
      deepseekModel: parsed.deepseekModel || "",
      minimaxApiKey: parsed.minimaxApiKey || "",
      minimaxModel: parsed.minimaxModel || "",
      minimaxBaseUrl: parsed.minimaxBaseUrl || "",
      customProviderName: parsed.customProviderName || "",
      customApiKey: parsed.customApiKey || "",
      customModel: parsed.customModel || "",
      customBaseUrl: parsed.customBaseUrl || "",
      atlasModel: parsed.atlasModel || "",
    };
  } catch {
    return EMPTY_BYO_API;
  }
}

function sanitizeProviderName(value: string) {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "custom";
}
