/**
 * KK 反馈层 API 适配器。
 *
 * 默认 USE_FIXTURE=true 使用内联 fixture 演示数据；后端就绪后通过
 * NEXT_PUBLIC_USE_KK_FIXTURE=false 切换到真实 API。
 *
 * 提供 fetchKkMessages / fetchKkSettings / updateKkSettings 三个接口。
 * KK 是只读反馈层：不提供"代为确认结果"或"修改 Canon"的接口。
 */
import {
  fixtureContractVersion,
  loadFixtureMessages,
  loadFixtureSettings,
  loadFixtureStats,
} from "./fixtures.ts";
import { computeStats } from "./filtering.ts";
import {
  CONTRACT_VERSION,
  type KkMessage,
  type KkSettings,
  type KkStats,
} from "./types.ts";

/** 是否使用 fixture 演示数据（默认开启） */
export const USE_FIXTURE =
  process.env.NEXT_PUBLIC_USE_KK_FIXTURE !== "false";

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
