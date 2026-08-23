// P0 遗留修复：next/headers 只在 Next 运行时存在，裸 node（node --test 直连
// 本模块的服务端代码路径）无法解析该子路径导出。改为调用点惰性动态导入 ——
// 仅 getViewerFromCookies 这条 SSR 回退路径需要 cookies，普通测试路径不触发。
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GeneratePayload, TaskType } from "@/lib/ai/prompts";
import type { AIUsage } from "@/lib/ai/providers";

export type AuthenticatedUser = {
  id: string;
  email: string;
  token: string;
};

export type CreditAccount = {
  user_id: string;
  monthly_limit: number;
  balance: number;
  period_start: string;
  period_end: string;
  updated_at?: string;
};

export type GenerationTaskStatus =
  | "queued"
  | "running"
  | "streaming"
  | "completed"
  | "failed"
  | "retrying"
  | "cancelled";

// PRD V1.0 验收后调整：全局月度免费额度从 100 提升至 500（2026-07-24）
// 生产环境可通过 FREE_MONTHLY_CREDITS env 覆盖；env 未设时用此默认值
const FREE_MONTHLY_CREDITS = Number(process.env.FREE_MONTHLY_CREDITS || 500);

export function hasServerSupabaseConfig() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

export function hasServiceRoleConfig() {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

export async function authenticateRequest(request: Request): Promise<AuthenticatedUser> {
  if (!hasServerSupabaseConfig()) {
    throw new Error("MISSING_SUPABASE_SERVER_CONFIG");
  }

  const token = readBearerToken(request);
  if (!token) throw new Error("MISSING_AUTH_TOKEN");

  const response = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) throw new Error("INVALID_AUTH_TOKEN");

  const user = await response.json();
  if (!user?.id) throw new Error("INVALID_AUTH_TOKEN");

  return {
    id: user.id,
    email: user.email || "",
    token,
  };
}

/**
 * 在 Server Component / Route Handler 中读取当前访问者的 Supabase 会话。
 * 通过解析 `sb-<project-ref>-auth-token` cookie 提取 access_token，
 * 再复用 authenticateRequest() 校验。未登录或校验失败时返回 null。
 *
 * 注意：该 helper 依赖 @supabase/ssr 或等价机制将 session 写入 cookie。
 * 若项目仅使用 localStorage 持久化（createClient persistSession），
 * cookie 可能不存在，此时返回 null（视为匿名访客）。
 */
export async function getViewerFromCookies(): Promise<AuthenticatedUser | null> {
  if (!hasServerSupabaseConfig()) return null;
  const token = await readAccessTokenFromCookie();
  if (!token) return null;
  try {
    const request = new Request("https://internal.kiikis.com/auth-viewer", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return await authenticateRequest(request);
  } catch {
    return null;
  }
}

/**
 * Read the viewer from the request Bearer token, with the server cookie as a
 * backwards-compatible fallback for SSR/session-cookie callers.
 */
export async function getViewerFromRequest(request: Request): Promise<AuthenticatedUser | null> {
  if (readBearerToken(request)) {
    try {
      return await authenticateRequest(request);
    } catch {
      return null;
    }
  }
  return getViewerFromCookies();
}

async function readAccessTokenFromCookie(): Promise<string> {
  // next/headers 惰性导入：见文件头注释
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const ref = getSupabaseProjectRef();
  if (!ref) return "";
  const cookieName = `sb-${ref}-auth-token`;

  // @supabase/ssr 分片 cookie：sb-<ref>-auth-token.0 / .1 / ...
  let raw = "";
  for (let i = 0; i < 4; i += 1) {
    const part = cookieStore.get(`${cookieName}.${i}`)?.value;
    if (part) raw += part;
  }
  if (!raw) {
    raw = cookieStore.get(cookieName)?.value || "";
  }
  if (!raw) return "";
  return parseSupabaseSessionValue(raw);
}

function parseSupabaseSessionValue(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.access_token === "string") return parsed.access_token;
  } catch {
    // not plain JSON, try base64
  }
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);
    if (typeof parsed?.access_token === "string") return parsed.access_token;
  } catch {
    // unable to parse
  }
  return "";
}

function getSupabaseProjectRef(): string {
  const url = getSupabaseUrl();
  const match = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\./i);
  return match?.[1] || "";
}

export async function getCreditAccount(userId: string): Promise<CreditAccount | null> {
  if (!hasServiceRoleConfig()) return null;

  const existing = await serviceFetch<CreditAccount[]>(
    `/rest/v1/storyflow_credits?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  );

  const current = existing[0];
  if (current && !isPeriodExpired(current.period_end)) {
    // PRD V1.0 验收后调整（2026-07-24）：额度上调自动补齐。
    // 当全局 FREE_MONTHLY_CREDITS 上调后，旧账户的 monthly_limit 会小于新上限。
    // 此时自动把 balance 补齐到新上限（只增不减），让现有用户立即享受新额度，无需手动 SQL。
    if (Number(current.monthly_limit) < FREE_MONTHLY_CREDITS) {
      const upgraded = {
        ...current,
        monthly_limit: FREE_MONTHLY_CREDITS,
        balance: FREE_MONTHLY_CREDITS,
        updated_at: new Date().toISOString(),
      };
      await serviceFetch(`/rest/v1/storyflow_credits?user_id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          monthly_limit: FREE_MONTHLY_CREDITS,
          balance: FREE_MONTHLY_CREDITS,
          updated_at: upgraded.updated_at,
        }),
      });
      return upgraded;
    }
    return current;
  }

  const next = buildFreshCreditAccount(userId);
  await serviceFetch("/rest/v1/storyflow_credits?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(next),
  });

  return next;
}

export async function consumeCredits(userId: string, amount: number) {
  const account = await getCreditAccount(userId);
  if (!account) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
  if (account.balance < amount) throw new Error("INSUFFICIENT_CREDITS");

  const nextBalance = account.balance - amount;
  await serviceFetch(`/rest/v1/storyflow_credits?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      balance: nextBalance,
      updated_at: new Date().toISOString(),
    }),
  });

  return { ...account, balance: nextBalance };
}

export async function refundCredits(userId: string, amount: number) {
  const account = await getCreditAccount(userId);
  if (!account) return null;

  const nextBalance = Math.min(account.monthly_limit, account.balance + amount);
  await serviceFetch(`/rest/v1/storyflow_credits?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      balance: nextBalance,
      updated_at: new Date().toISOString(),
    }),
  });

  return { ...account, balance: nextBalance };
}

export function estimateCreditCost(taskType: TaskType) {
  if (taskType === "viral_video_analysis") return 2;
  if (taskType === "novel_chapter_draft" || taskType === "novel_revision") return 2;
  if (taskType === "chinese_script" || taskType === "continuation_script" || taskType === "storyboard_script") return 2;
  if (taskType === "final_delivery" || taskType === "viral_export_package" || taskType === "novel_export") return 0;
  return 1;
}

export async function createGenerationTask(params: {
  userId: string;
  payload: GeneratePayload;
  status?: GenerationTaskStatus;
}) {
  if (!hasServiceRoleConfig()) return null;
  const target = params.payload as GeneratePayload & { targetEntityType?: string; targetEntityId?: string };

  const task = {
    id: crypto.randomUUID(),
    user_id: params.userId,
    project_id: params.payload.projectId || null,
    project_ref: params.payload.projectTitle || null,
    step_key: params.payload.taskType,
    phase_key: resolvePhaseKey(params.payload.taskType),
    status: params.status || "running",
    target_entity_type: target.targetEntityType || null,
    target_entity_id: target.targetEntityId || null,
    input_snapshot: params.payload,
    started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  await serviceFetch("/rest/v1/storyflow_generation_tasks", {
    method: "POST",
    body: JSON.stringify(task),
  });

  return task.id;
}

export async function completeGenerationTask(params: {
  taskId: string | null;
  userId: string;
  payload: GeneratePayload;
  output: string;
  provider: string;
  model: string;
  usage: AIUsage | null;
  latencyMs: number;
  costEstimate: number;
}) {
  if (!hasServiceRoleConfig()) return;
  const target = params.payload as GeneratePayload & { targetEntityType?: string; targetEntityId?: string };

  const completedAt = new Date().toISOString();

  if (params.taskId) {
    await serviceFetch(`/rest/v1/storyflow_generation_tasks?id=eq.${encodeURIComponent(params.taskId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "completed",
        provider: params.provider,
        model: params.model,
        output_snapshot: params.output,
        target_entity_type: target.targetEntityType || null,
        target_entity_id: target.targetEntityId || null,
        token_usage: params.usage,
        cost_estimate: params.costEstimate,
        latency_ms: params.latencyMs,
        completed_at: completedAt,
      }),
    });
  }

  await serviceFetch("/rest/v1/storyflow_generations", {
    method: "POST",
    body: JSON.stringify({
      id: crypto.randomUUID(),
      task_id: params.taskId,
      user_id: params.userId,
      project_id: params.payload.projectId || null,
      step_key: params.payload.taskType,
      phase_key: resolvePhaseKey(params.payload.taskType),
      provider: params.provider,
      model: params.model,
      input_snapshot: params.payload,
      output_snapshot: params.output,
      target_entity_type: target.targetEntityType || null,
      target_entity_id: target.targetEntityId || null,
      token_usage: params.usage,
      cost_estimate: params.costEstimate,
      latency_ms: params.latencyMs,
      created_at: completedAt,
    }),
  });
}

export async function failGenerationTask(params: {
  taskId: string | null;
  errorMessage: string;
  latencyMs: number;
}) {
  if (!hasServiceRoleConfig() || !params.taskId) return;

  await serviceFetch(`/rest/v1/storyflow_generation_tasks?id=eq.${encodeURIComponent(params.taskId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "failed",
      error_message: params.errorMessage,
      latency_ms: params.latencyMs,
      completed_at: new Date().toISOString(),
    }),
  });
}

export async function listGenerationTasks(params: { userId: string; projectId?: string | null; limit?: number }) {
  if (!hasServiceRoleConfig()) return [];
  const filters = [
    `user_id=eq.${encodeURIComponent(params.userId)}`,
    params.projectId ? `project_id=eq.${encodeURIComponent(params.projectId)}` : "",
    "select=id,step_key,phase_key,status,provider,model,output_snapshot,error_message,latency_ms,target_entity_type,target_entity_id,applied_at,created_at,completed_at",
    "order=created_at.desc",
    `limit=${params.limit || 20}`,
  ].filter(Boolean).join("&");

  return serviceFetch(`/rest/v1/storyflow_generation_tasks?${filters}`);
}

export async function cancelGenerationTask(params: { userId: string; taskId: string }) {
  if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
  const existing = await serviceFetch<Array<{ id: string; user_id: string; status: GenerationTaskStatus }>>(
    `/rest/v1/storyflow_generation_tasks?id=eq.${encodeURIComponent(params.taskId)}&user_id=eq.${encodeURIComponent(params.userId)}&select=id,user_id,status&limit=1`,
  );
  const task = existing[0];
  if (!task) throw new Error("TASK_NOT_FOUND");
  if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") return task;

  await serviceFetch(`/rest/v1/storyflow_generation_tasks?id=eq.${encodeURIComponent(params.taskId)}&user_id=eq.${encodeURIComponent(params.userId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "cancelled",
      completed_at: new Date().toISOString(),
    }),
  });

  return { ...task, status: "cancelled" as GenerationTaskStatus };
}

export function resolvePhaseKey(taskType: TaskType) {
  if (taskType === "song_workbench" || taskType === "song_development_chat" || taskType === "viral_video_analysis" || taskType === "viral_structure_remake" || taskType === "viral_export_package") return "development";
  if (taskType === "novel_development_chat" || taskType === "novel_brief") return "development";
  if (taskType === "novel_bible" || taskType === "novel_characters" || taskType === "novel_volume_outline") return "story_bible";
  if (taskType === "novel_chapter_outline" || taskType === "novel_chapter_draft" || taskType === "novel_revision") return "script_production";
  if (taskType === "novel_export") return "delivery";
  if (taskType === "market_analysis" || taskType === "brief" || taskType === "script_import") return "development";
  if (taskType === "characters" || taskType === "structure_model" || taskType === "beat_cards" || taskType === "series_outline") return "story_bible";
  if (taskType === "chinese_script" || taskType === "continuation_script" || taskType === "translation" || taskType === "localization") return "script_production";
  if (taskType === "quality_evaluation" || taskType === "final_script" || taskType === "format_check") return "evaluation_revision";
  return "delivery";
}

export async function serviceFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    ...init,
    headers: {
      apikey: getSupabaseServiceRoleKey(),
      Authorization: `Bearer ${getSupabaseServiceRoleKey()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    // P0-01：附带 .status（如 profile 406 判定），message 契约保持不变
    // （classifyServiceError 仍按 SUPABASE_SERVICE_ERROR:<status>: 前缀解析）。
    const error = new Error(`SUPABASE_SERVICE_ERROR:${response.status}:${text.slice(0, 240)}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  if (response.status === 204) return null as T;
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (null as T);
}

function readBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function buildFreshCreditAccount(userId: string): CreditAccount {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    user_id: userId,
    monthly_limit: FREE_MONTHLY_CREDITS,
    balance: FREE_MONTHLY_CREDITS,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function isPeriodExpired(periodEnd: string) {
  return new Date(periodEnd).getTime() <= Date.now();
}

function getSupabaseUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
}

function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
}

function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}


let _serverSupabaseClient: SupabaseClient | null = null;

/**
 * 服务端 Supabase client（使用 service role key，绕过 RLS）。
 * 用于需要 service-role 权限的查询/写入（如公开主页聚合、头像上传等）。
 * 返回 null 表示缺少 SUPABASE_SERVICE_ROLE_KEY 配置。
 */
export function getSupabaseServerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  if (!_serverSupabaseClient) {
    _serverSupabaseClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _serverSupabaseClient;
}
