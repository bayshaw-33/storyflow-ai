/**
 * KIIKIS 2.1 Phase 3 — KK runtime API 客户端 (Task 3.2)
 *
 * K21-KK-002: production/staging 默认禁用 fixture。
 * - development: USE_FIXTURE 默认 true (向后兼容)
 * - production/staging: 默认 false，缺服务端配置时显示明确不可用
 *
 * 新增接口 (Phase 3)：
 *   - fetchKkRuntime: 启动数据 (profile/entitlements/cursor/taskProjection/pendingConfirmations/actions)
 *   - fetchKkEvents: 增量事件流 (K21-KK-003/004)
 *   - updateKkProfile: 更新 profile (K21-KK-020)
 *   - equipKkItem: 装备 (K21-KK-022)
 *   - listEquipment: 装备历史 + 净持有
 *   - listMemory / addMemory / deleteMemory: 陪伴上下文 + 导出/删除 (K21-KK-010/014)
 */
import {
  fixtureContractVersion,
  loadFixtureMessages,
  loadFixtureSettings,
  loadFixtureStats,
} from "./fixtures.ts";
import { computeStats } from "./filtering.ts";
import { fetchJobs } from "../jobs/api.ts";
import { projectUnifiedJobsToKkMessages } from "./task-projection.ts";
import {
  CONTRACT_VERSION,
  type KkMessage,
  type KkSettings,
  type KkStats,
  type KkRuntimeResponse,
  type KkEventEntry,
} from "./types.ts";

/** 是否使用 fixture 演示数据（fail-closed：生产环境恒 false，Phase 6 Task 6.2） */
import { isFixtureEnabled } from "../runtime-mode.ts";

export const USE_FIXTURE = isFixtureEnabled("NEXT_PUBLIC_USE_KK_FIXTURE", process.env);

export interface KkResult {
  messages: KkMessage[];
  settings: KkSettings;
  stats: KkStats;
  contractVersion: string;
  source: "fixture" | "api";
}

const API_BASE = "/api/v2/kk";

function buildHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

// ============================================================
// Phase 3 新增 — KK runtime API
// ============================================================

export class KkRuntimeClientError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "KkRuntimeClientError";
    this.code = code;
    this.status = status;
  }
}

/** Load live jobs through the Task Center adapter and project their canonical KK actions. */
export async function fetchKkJobMessages(
  accessToken: string | null,
  options: { locale?: "zh-CN" | "en-US"; now?: Date } = {},
): Promise<KkMessage[]> {
  const result = await fetchJobs(accessToken);
  return projectUnifiedJobsToKkMessages(result.jobs, options);
}

/**
 * 获取 KK runtime 启动数据 (K21-KK-001..007, 020..024)。
 * production/staging 缺服务端配置时抛 KkRuntimeClientError(code=service_unavailable)，
 * 不静默切 fixture (K21-KK-002)。
 */
export async function fetchKkRuntime(accessToken: string | null): Promise<KkRuntimeResponse> {
  const response = await fetch(API_BASE, {
    headers: buildHeaders(accessToken),
  });
  if (response.status === 503) {
    throw new KkRuntimeClientError(
      "service_unavailable",
      "KK service not configured in production-like environment (K21-KK-002).",
      503,
    );
  }
  if (response.status === 401) {
    throw new KkRuntimeClientError("unauthenticated", "Authentication required.", 401);
  }
  if (!response.ok) {
    throw new KkRuntimeClientError(
      "service_unavailable",
      `KK runtime fetch failed: ${response.status}`,
      response.status,
    );
  }
  const payload = await response.json();
  if (!payload?.success) {
    throw new KkRuntimeClientError(
      "service_unavailable",
      payload?.error || "KK runtime fetch failed.",
      response.status,
    );
  }
  return {
    contractVersion: payload.contractVersion,
    profile: payload.profile,
    entitlements: payload.entitlements ?? [],
    serverCursor: payload.serverCursor ?? 0,
    taskProjection: payload.taskProjection ?? { queued: 0, running: 0, ingesting: 0, completed: 0, failed: 0 },
    pendingConfirmations: payload.pendingConfirmations ?? [],
    allowedActions: payload.allowedActions ?? [],
    featureFlags: payload.featureFlags ?? {},
    source: "api",
  };
}

/**
 * 获取增量事件流 (K21-KK-003/004)。
 * Realtime 断线后通过此接口补拉。
 */
export async function fetchKkEvents(
  accessToken: string | null,
  options: { afterSequence: number; limit?: number } = { afterSequence: 0 },
): Promise<{ events: KkEventEntry[]; nextCursor: number }> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const url = `${API_BASE}/events?afterSequence=${options.afterSequence}&limit=${limit}`;
  const response = await fetch(url, { headers: buildHeaders(accessToken) });
  if (!response.ok) {
    throw new KkRuntimeClientError(
      "service_unavailable",
      `KK events fetch failed: ${response.status}`,
      response.status,
    );
  }
  const payload = await response.json();
  if (!payload?.success) {
    throw new KkRuntimeClientError(
      "service_unavailable",
      payload?.error || "KK events fetch failed.",
      response.status,
    );
  }
  return {
    events: payload.events ?? [],
    nextCursor: payload.nextCursor ?? options.afterSequence,
  };
}

/**
 * 更新 KK profile (K21-KK-020)。
 * growth_* 字段不可直接更新。
 */
export async function updateKkProfile(
  accessToken: string | null,
  patch: {
    displayName?: string;
    profileDisplay?: boolean;
    communityDisplay?: boolean;
    recentProjectId?: string;
    recentUniverseId?: string;
  },
): Promise<KkRuntimeResponse["profile"]> {
  const response = await fetch(API_BASE + "/profile", {
    method: "PATCH",
    headers: buildHeaders(accessToken),
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new KkRuntimeClientError(
      "service_unavailable",
      payload?.error || `KK profile update failed: ${response.status}`,
      response.status,
    );
  }
  const payload = await response.json();
  return payload.profile;
}

/**
 * 装备 item (K21-KK-022)。
 * 服务端校验 ledger 净持有。
 */
export async function equipKkItem(
  accessToken: string | null,
  itemId: string,
  itemVersion: string,
): Promise<void> {
  const response = await fetch(API_BASE + "/equipment", {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({ itemId, itemVersion }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new KkRuntimeClientError(
      "equip_denied",
      payload?.error || `Equip failed: ${response.status}`,
      response.status,
    );
  }
}

/**
 * 获取装备历史 + 净持有 (K21-KK-022)。
 */
export async function listEquipment(
  accessToken: string | null,
  options: { limit?: number } = {},
): Promise<{ entitlements: unknown[]; equipmentHistory: unknown[] }> {
  const limit = options.limit ?? 50;
  const response = await fetch(`${API_BASE}/equipment?limit=${limit}`, {
    headers: buildHeaders(accessToken),
  });
  if (!response.ok) {
    throw new KkRuntimeClientError(
      "service_unavailable",
      `Equipment fetch failed: ${response.status}`,
      response.status,
    );
  }
  const payload = await response.json();
  return {
    entitlements: payload.entitlements ?? [],
    equipmentHistory: payload.equipmentHistory ?? [],
  };
}

/**
 * 列出陪伴上下文记忆 (K21-KK-010)。
 */
export async function listMemory(
  accessToken: string | null,
  options: { factType?: string; limit?: number } = {},
): Promise<unknown[]> {
  const params = new URLSearchParams();
  if (options.factType) params.set("factType", options.factType);
  if (options.limit) params.set("limit", String(options.limit));
  const url = `${API_BASE}/memory${params.toString() ? "?" + params.toString() : ""}`;
  const response = await fetch(url, { headers: buildHeaders(accessToken) });
  if (!response.ok) {
    throw new KkRuntimeClientError(
      "service_unavailable",
      `Memory fetch failed: ${response.status}`,
      response.status,
    );
  }
  const payload = await response.json();
  return payload.facts ?? [];
}

/**
 * 添加陪伴上下文记忆 (K21-KK-010)。
 */
export async function addMemory(
  accessToken: string | null,
  fact: {
    factType: string;
    factKey: string;
    factValue: Record<string, unknown>;
    isSensitive?: boolean;
  },
): Promise<unknown> {
  const response = await fetch(API_BASE + "/memory", {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify(fact),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new KkRuntimeClientError(
      "service_unavailable",
      payload?.error || `Memory add failed: ${response.status}`,
      response.status,
    );
  }
  const payload = await response.json();
  return payload.fact;
}

/**
 * 删除陪伴上下文记忆 (K21-KK-014)。
 */
export async function deleteMemory(
  accessToken: string | null,
  id: string,
): Promise<void> {
  const response = await fetch(`${API_BASE}/memory?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: buildHeaders(accessToken),
  });
  if (!response.ok) {
    throw new KkRuntimeClientError(
      "service_unavailable",
      `Memory delete failed: ${response.status}`,
      response.status,
    );
  }
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * 拉取 KK 消息与设置。
 * fixture 模式不依赖 accessToken；真实模式需要有效 token。
 */
export async function fetchKkMessages(accessToken: string | null): Promise<KkResult> {
  if (USE_FIXTURE) {
    // 模拟网络延迟，便于观察加载态
    await new Promise((resolve) => setTimeout(resolve, 100));
    const messages = loadFixtureMessages();
    const settings = loadFixtureSettings();
    const version = fixtureContractVersion();
    if (version !== CONTRACT_VERSION) {
      throw new Error(`KK 契约版本不匹配：fixture=${version}, client=${CONTRACT_VERSION}`);
    }
    return {
      messages,
      settings,
      stats: computeStats(messages),
      contractVersion: version,
      source: "fixture",
    };
  }

  const response = await fetch(API_BASE, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({ action: "list" }),
  });
  const payload = (await parseJsonSafely(response)) as
    | { success?: boolean; messages?: unknown[]; settings?: unknown; error?: string }
    | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "加载 KK 消息失败，请稍后再试。");
  }
  const messages = (payload.messages || []) as KkMessage[];
  const settings = (payload.settings || { frequency: "key_only", doNotDisturb: false }) as KkSettings;
  return {
    messages,
    settings,
    stats: computeStats(messages),
    contractVersion: CONTRACT_VERSION,
    source: "api",
  };
}

/**
 * 更新 KK 设置（频率 / 勿扰 / 静音）。
 * 注意：KK 不提供"代为确认结果"或"修改 Canon"的写接口。
 */
export async function updateKkSettings(
  settings: KkSettings,
  accessToken: string | null,
): Promise<KkSettings> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { ...settings };
  }
  const response = await fetch(API_BASE, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({ action: "update_settings", settings }),
  });
  const payload = (await parseJsonSafely(response)) as
    | { success?: boolean; settings?: unknown; error?: string }
    | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "更新 KK 设置失败，请稍后再试。");
  }
  return (payload.settings || settings) as KkSettings;
}
