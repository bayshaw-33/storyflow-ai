"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { AuthModal } from "@/components/layout/AuthModal";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { readWorkflowModelRouting, writeWorkflowModelRouting, type WorkflowModelRoute, type WorkflowModelRouting } from "@/lib/ai/byoClient";
import type { TeamRole } from "@/lib/actors";
import { DEFAULT_PLAN_ID, getPlanEntitlement, type PlanId } from "@/lib/billing/plans";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";

const PLAN_IDS: PlanId[] = ["free", "elite", "pro", "ultra"];

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

type Profile = {
  email: string | null;
  display_name: string | null;
  plan: string | null;
  created_at: string | null;
  updated_at: string | null;
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

const workflowRouteOptions: Array<{ id: WorkflowModelRoute; zh: string; en: string }> = [
  { id: "novel", zh: "小说创作", en: "Novel Creation" },
  { id: "script", zh: "剧本创作", en: "Script Creation" },
  { id: "storyboard", zh: "分镜创作", en: "Storyboard" },
  { id: "video", zh: "视频创作", en: "Video" },
  { id: "song", zh: "歌曲创作", en: "Song Creation" },
  { id: "viral", zh: "改编创作", en: "Adaptation" },
];

const copy = {
  "en-US": {
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
    apiKeysLocked: "Sign in to use BYO API.",
    apiScope: "Scope",
    apiScopePersonal: "Personal",
    apiScopeTeam: "Team shared",
    apiTeam: "Team",
    apiLabel: "Label",
    apiConnections: "Saved connections",
    noApiConnections: "No cloud API connections yet.",
    deleteConnection: "Disable",
    modelRouting: "Workflow model routing",
    defaultModel: "Default model",
    saveFailed: "Save failed.",
    signIn: "Sign in",
    signedOut: "Sign in to manage API keys.",
  },
  "zh-CN": {
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
    apiKeysLocked: "登录后可使用自接 API。",
    apiScope: "范围",
    apiScopePersonal: "个人",
    apiScopeTeam: "团队共享",
    apiTeam: "团队",
    apiLabel: "连接名称",
    apiConnections: "已保存连接",
    noApiConnections: "暂无云端 API 连接。",
    deleteConnection: "停用",
    modelRouting: "工作流模型路由",
    defaultModel: "默认模型",
    saveFailed: "保存失败。",
    signIn: "登录",
    signedOut: "请先登录后再管理 API Key。",
  },
};

function normalizePlan(value: string | null | undefined): PlanId {
  return PLAN_IDS.includes(value as PlanId) ? (value as PlanId) : DEFAULT_PLAN_ID;
}

/**
 * /settings/api
 * API 配置页：从旧 /settings 页面迁移的 BYO API + 工作流模型路由 + 已保存连接管理。
 */
export default function SettingsApiPage() {
  const { locale } = useI18n();
  const text = copy[locale];
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
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

    async function load() {
      setLoading(true);
      setMessage(null);
      setByoApi(readByoApiSettings());
      setWorkflowRouting(readWorkflowModelRouting());

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const nextSession = sessionData.session;
      if (cancelled) return;
      setSession(nextSession || null);

      if (!nextSession?.user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("storyflow_profiles")
        .select("email, display_name, plan, created_at, updated_at")
        .eq("user_id", nextSession.user.id)
        .maybeSingle();

      if (cancelled) return;
      if (data) setProfile(data as Profile);

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

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const planId = normalizePlan(profile?.plan);
  const plan = useMemo(() => getPlanEntitlement(planId), [planId]);
  const canUseByoApi = Boolean(session);

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

    setSaving(true);
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

      localStorage.setItem("kiikis_byo_api_config", JSON.stringify({
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
    } finally {
      setSaving(false);
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
    localStorage.removeItem("kiikis_byo_api_config");
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
        <span>{locale === "zh-CN" ? "设置" : "Settings"}</span>
        <h1>{text.apiKeys}</h1>
      </section>

      <SettingsTabs activeTab="api">
        {message ? <p className={`notice ${message.tone}`}>{message.text}</p> : null}

        {loading ? (
          <p style={{ color: "var(--ink-muted)", fontSize: 13, padding: "var(--space-6) 0" }}>
            {locale === "zh-CN" ? "加载中…" : "Loading…"}
          </p>
        ) : !session ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start", padding: "var(--space-6) 0" }}>
            <p style={{ color: "var(--ink-secondary)", fontSize: 14 }}>{text.signedOut}</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setAuthMode("signin");
                setAuthOpen(true);
              }}
            >
              {text.signIn}
            </button>
          </div>
        ) : (
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
              Atlas Cloud {locale === "zh-CN" ? "文本模型" : "text model"} <small>（{locale === "zh-CN" ? "推荐 · 不需要 API key" : "recommended · no API key needed"}）</small>
              <select
                value={byoApi.atlasModel}
                disabled={!canUseByoApi}
                onChange={(event) => setByoApi((current) => ({ ...current, atlasModel: event.target.value }))}
              >
                <option value="">{locale === "zh-CN" ? "使用默认（DeepSeek V3.1）" : "Use default (DeepSeek V3.1)"}</option>
                {ATLAS_LLM_MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
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
              <button className="primary-button" type="button" disabled={!canUseByoApi || saving} onClick={saveApiKeys}>
                {saving ? (locale === "zh-CN" ? "保存中…" : "Saving…") : text.saveApiKeys}
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
            <dl className="plan-entitlements">
              <div><dt>{locale === "zh-CN" ? "套餐" : "Plan"}</dt><dd>{plan.name}</dd></div>
            </dl>
          </article>
        )}

        <article className="settings-card">
          <span>{locale === "zh-CN" ? "语言" : "Language"}</span>
          <LanguageToggle />
        </article>
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

function readByoApiSettings(): ByoApiSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem("kiikis_byo_api_config") || "null") as Partial<ByoApiSettings> | null;
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
