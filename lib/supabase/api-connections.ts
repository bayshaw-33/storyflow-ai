import type { ByoApiConfig, ByoApiProvider } from "@/lib/ai/prompts";
import type { TeamMember, TeamRole } from "@/lib/actors";
import { hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

export type ApiConnectionScope = "personal" | "team";
export type ApiConnectionStatus = "active" | "disabled";

export type ApiConnection = {
  id: string;
  user_id: string;
  team_id?: string | null;
  scope: ApiConnectionScope;
  provider: Exclude<ByoApiProvider, "auto"> | string;
  api_key?: string;
  model?: string | null;
  base_url?: string | null;
  label: string;
  status: ApiConnectionStatus;
  created_at: string;
  updated_at: string;
};

export type ApiConnectionInput = {
  id?: string;
  scope?: ApiConnectionScope;
  team_id?: string | null;
  provider?: Exclude<ByoApiProvider, "auto"> | string;
  api_key?: string;
  model?: string | null;
  base_url?: string | null;
  label?: string;
  status?: ApiConnectionStatus;
};

export type ApiConnectionSummary = Omit<ApiConnection, "api_key"> & {
  has_key: boolean;
  key_hint: string;
};

const TEAM_WRITE_ROLES = new Set<TeamRole>(["owner", "admin", "editor"]);

export async function listApiConnectionsForUser(userId: string): Promise<ApiConnectionSummary[]> {
  ensureServiceRole();
  const teamIds = await listTeamIdsForUser(userId);
  const filters = [`user_id.eq.${encodeURIComponent(userId)}`];
  if (teamIds.length) filters.push(`team_id.in.(${teamIds.map(encodeURIComponent).join(",")})`);

  const rows = await serviceFetch<ApiConnection[]>(
    `/rest/v1/storyflow_api_connections?or=(${filters.join(",")})&status=neq.disabled&select=*&order=updated_at.desc`,
  ).catch((error) => {
    if (isApiConnectionSchemaUnavailable(error)) return [] as ApiConnection[];
    throw error;
  });

  return rows.map(toSummary);
}

export async function upsertApiConnectionForUser(userId: string, input: ApiConnectionInput): Promise<ApiConnectionSummary> {
  ensureServiceRole();
  const provider = normalizeProvider(input.provider);
  if (!provider) {
    throw new Error("API_PROVIDER_REQUIRED");
  }

  const scope: ApiConnectionScope = input.scope === "team" ? "team" : "personal";
  const teamId = scope === "team" ? input.team_id || null : null;
  if (scope === "team") {
    if (!teamId) throw new Error("TEAM_REQUIRED");
    await assertTeamRole(userId, teamId, TEAM_WRITE_ROLES);
  }

  const now = new Date().toISOString();
  const existing = input.id ? await getApiConnectionForUser(userId, input.id) : null;
  if (existing && existing.scope === "team" && existing.team_id) {
    await assertTeamRole(userId, existing.team_id, TEAM_WRITE_ROLES);
  }

  const apiKey = input.api_key?.trim();
  if (!existing && !apiKey) throw new Error("API_KEY_REQUIRED");

  const row: ApiConnection = {
    id: existing?.id || crypto.randomUUID(),
    user_id: existing?.user_id || userId,
    team_id: teamId,
    scope,
    provider,
    api_key: apiKey || existing?.api_key || "",
    model: input.model?.trim() || null,
    base_url: input.base_url?.trim() || null,
    label: input.label?.trim() || defaultLabel(provider, scope),
    status: input.status || "active",
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  await serviceFetch("/rest/v1/storyflow_api_connections?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(row),
  });

  return toSummary(row);
}

export async function disableApiConnectionForUser(userId: string, id: string) {
  ensureServiceRole();
  const existing = await getApiConnectionForUser(userId, id);
  if (!existing) throw new Error("API_CONNECTION_NOT_FOUND");
  if (existing.scope === "team" && existing.team_id) await assertTeamRole(userId, existing.team_id, TEAM_WRITE_ROLES);

  await serviceFetch(`/rest/v1/storyflow_api_connections?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "disabled", updated_at: new Date().toISOString() }),
  });

  return { id, status: "disabled" as ApiConnectionStatus };
}

export async function resolveSavedApiConfig(userId: string, providerPreference: ByoApiProvider = "auto"): Promise<ByoApiConfig | null> {
  ensureServiceRole();
  const teamIds = await listTeamIdsForUser(userId);
  const filters = [`user_id.eq.${encodeURIComponent(userId)}`];
  if (teamIds.length) filters.push(`team_id.in.(${teamIds.map(encodeURIComponent).join(",")})`);

  const rows = await serviceFetch<ApiConnection[]>(
    `/rest/v1/storyflow_api_connections?or=(${filters.join(",")})&status=eq.active&select=*&order=updated_at.desc`,
  ).catch((error) => {
    if (isApiConnectionSchemaUnavailable(error)) return [] as ApiConnection[];
    throw error;
  });

  if (!rows.length) return null;
  const providerRows = providerPreference === "custom"
    ? rows.filter((row) => row.provider !== "deepseek" && row.provider !== "minimax")
    : providerPreference === "deepseek" || providerPreference === "minimax"
      ? rows.filter((row) => row.provider === providerPreference)
      : rows;
  const row = providerRows.find((item) => item.scope === "team") || providerRows[0] || rows[0];
  if (!row?.api_key) return null;

  if (row.provider === "deepseek") {
    return {
      provider: "deepseek",
      connectionId: row.id,
      deepseekApiKey: row.api_key,
      deepseekModel: row.model || undefined,
    };
  }

  if (row.provider === "minimax") {
    return {
      provider: "minimax",
      connectionId: row.id,
      minimaxApiKey: row.api_key,
      minimaxModel: row.model || undefined,
      minimaxBaseUrl: row.base_url || undefined,
    };
  }

  return {
    provider: "custom",
    connectionId: row.id,
    customProviderName: row.provider,
    customApiKey: row.api_key,
    customModel: row.model || undefined,
    customBaseUrl: row.base_url || undefined,
  };
}

export async function resolveSavedApiConfigById(userId: string, connectionId: string): Promise<ByoApiConfig | null> {
  ensureServiceRole();
  const row = await getApiConnectionForUser(userId, connectionId);
  if (!row || row.status !== "active" || !row.api_key) return null;

  if (row.provider === "deepseek") {
    return {
      provider: "deepseek",
      connectionId: row.id,
      deepseekApiKey: row.api_key,
      deepseekModel: row.model || undefined,
    };
  }

  if (row.provider === "minimax") {
    return {
      provider: "minimax",
      connectionId: row.id,
      minimaxApiKey: row.api_key,
      minimaxModel: row.model || undefined,
      minimaxBaseUrl: row.base_url || undefined,
    };
  }

  return {
    provider: "custom",
    connectionId: row.id,
    customProviderName: row.provider,
    customApiKey: row.api_key,
    customModel: row.model || undefined,
    customBaseUrl: row.base_url || undefined,
  };
}

async function getApiConnectionForUser(userId: string, id: string) {
  const rows = await serviceFetch<ApiConnection[]>(
    `/rest/v1/storyflow_api_connections?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );
  const row = rows[0];
  if (!row) return null;
  if (row.user_id === userId) return row;
  if (row.scope === "team" && row.team_id) {
    await assertTeamRole(userId, row.team_id, new Set<TeamRole>(["owner", "admin", "editor", "viewer"]));
    return row;
  }
  throw new Error("API_CONNECTION_FORBIDDEN");
}

async function listTeamIdsForUser(userId: string) {
  const rows = await serviceFetch<TeamMember[]>(
    `/rest/v1/storyflow_team_members?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=team_id`,
  ).catch((error) => {
    if (isTeamSchemaUnavailable(error)) return [] as TeamMember[];
    throw error;
  });
  return rows.map((row) => row.team_id).filter(Boolean);
}

async function assertTeamRole(userId: string, teamId: string, allowed: Set<TeamRole>) {
  const rows = await serviceFetch<TeamMember[]>(
    `/rest/v1/storyflow_team_members?team_id=eq.${encodeURIComponent(teamId)}&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=*&limit=1`,
  );
  const member = rows[0];
  if (!member || !allowed.has(member.role)) throw new Error("TEAM_FORBIDDEN");
  return member;
}

function toSummary(row: ApiConnection): ApiConnectionSummary {
  return {
    id: row.id,
    user_id: row.user_id,
    team_id: row.team_id || null,
    scope: row.scope,
    provider: row.provider,
    model: row.model || null,
    base_url: row.base_url || null,
    label: row.label,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    has_key: Boolean(row.api_key),
    key_hint: maskKey(row.api_key || ""),
  };
}

function defaultLabel(provider: ApiConnection["provider"], scope: ApiConnectionScope) {
  const providerName = provider === "deepseek" ? "DeepSeek" : provider === "minimax" ? "MiniMax" : provider;
  return `${scope === "team" ? "Team" : "Personal"} ${providerName}`;
}

function normalizeProvider(value: unknown) {
  const provider = String(value || "").trim().toLowerCase();
  if (!provider || provider === "auto") return "";
  return provider.replace(/[^a-z0-9._-]/g, "-").slice(0, 48);
}

function maskKey(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function isApiConnectionSchemaUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("storyflow_api_connections") || message.includes("PGRST205") || message.includes("42P01");
}

function isTeamSchemaUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("storyflow_team_members") || message.includes("PGRST205") || message.includes("42P01");
}

function ensureServiceRole() {
  if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
}
