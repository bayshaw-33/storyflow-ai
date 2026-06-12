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

const FREE_MONTHLY_CREDITS = Number(process.env.FREE_MONTHLY_CREDITS || 100);

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

export async function getCreditAccount(userId: string): Promise<CreditAccount | null> {
  if (!hasServiceRoleConfig()) return null;

  const existing = await serviceFetch<CreditAccount[]>(
    `/rest/v1/storyflow_credits?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  );

  const current = existing[0];
  if (current && !isPeriodExpired(current.period_end)) return current;

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
  if (taskType === "chinese_script" || taskType === "continuation_script" || taskType === "storyboard_script") return 2;
  if (taskType === "final_delivery") return 0;
  return 1;
}

export async function createGenerationTask(params: {
  userId: string;
  payload: GeneratePayload;
  status?: GenerationTaskStatus;
}) {
  if (!hasServiceRoleConfig()) return null;

  const task = {
    id: crypto.randomUUID(),
    user_id: params.userId,
    project_id: params.payload.projectId || null,
    project_ref: params.payload.projectTitle || null,
    step_key: params.payload.taskType,
    phase_key: resolvePhaseKey(params.payload.taskType),
    status: params.status || "running",
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

  const completedAt = new Date().toISOString();

  if (params.taskId) {
    await serviceFetch(`/rest/v1/storyflow_generation_tasks?id=eq.${encodeURIComponent(params.taskId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "completed",
        provider: params.provider,
        model: params.model,
        output_snapshot: params.output,
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

export function resolvePhaseKey(taskType: TaskType) {
  if (taskType === "market_analysis" || taskType === "brief" || taskType === "script_import") return "development";
  if (taskType === "characters" || taskType === "structure_model" || taskType === "beat_cards" || taskType === "series_outline") return "story_bible";
  if (taskType === "chinese_script" || taskType === "continuation_script" || taskType === "translation" || taskType === "localization") return "script_production";
  if (taskType === "quality_evaluation" || taskType === "final_script" || taskType === "format_check") return "evaluation_revision";
  return "delivery";
}

async function serviceFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
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
    throw new Error(`SUPABASE_SERVICE_ERROR:${response.status}:${text.slice(0, 240)}`);
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
