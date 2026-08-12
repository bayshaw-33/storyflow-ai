/**
 * K2-T-09 市场 API 适配器。
 *
 * 默认 USE_FIXTURE=true 使用内联 fixture 演示数据；后端就绪后通过
 * NEXT_PUBLIC_USE_MARKETPLACE_FIXTURE=false 切换到真实 API。
 *
 * 提供 fetchMarketplace / fetchAssetById / fetchUsageGrants 三个接口。
 * 调用入口（创建项目级副本）不修改原资产，由 usage.ts 的纯函数处理。
 */
import {
  fixtureContractVersion,
  loadFixtureAssetById,
  loadFixtureDataset,
} from "./fixtures.ts";
import {
  CONTRACT_VERSION,
  type MarketplaceAsset,
  type MarketplaceDataset,
  type UsageGrant,
} from "./types.ts";

/** 是否使用 fixture 演示数据（默认开启） */
export const USE_FIXTURE =
  process.env.NEXT_PUBLIC_USE_MARKETPLACE_FIXTURE !== "false";

export interface MarketplaceResult {
  dataset: MarketplaceDataset;
  contractVersion: string;
  source: "fixture" | "api";
}

const API_BASE = "/api/v2/marketplace";

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

/** 是否为未登录错误 */
export function isUnauthenticatedError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes("未登录") || err.message.includes("unauthenticated");
  }
  return false;
}

/**
 * 拉取市场完整数据集（资产列表 + 授权模板 + 创建者 + 统计）。
 * fixture 模式不依赖 accessToken；真实模式需要有效 token。
 */
export async function fetchMarketplace(accessToken: string | null): Promise<MarketplaceResult> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const dataset = loadFixtureDataset();
    const version = fixtureContractVersion();
    if (version !== CONTRACT_VERSION) {
      throw new Error(`市场契约版本不匹配：fixture=${version}, client=${CONTRACT_VERSION}`);
    }
    return { dataset, contractVersion: version, source: "fixture" };
  }

  const response = await fetch(API_BASE, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({ action: "list" }),
  });
  const payload = (await parseJsonSafely(response)) as
    | { success?: boolean; dataset?: unknown; error?: string; code?: string }
    | null;
  if (!response.ok || !payload?.success) {
    if (payload?.code === "unauthenticated") {
      throw new Error("未登录，请先登录后再访问市场。");
    }
    throw new Error(payload?.error || "加载市场数据失败，请稍后再试。");
  }
  const dataset = payload.dataset as MarketplaceDataset;
  return { dataset, contractVersion: CONTRACT_VERSION, source: "api" };
}

/** 按 ID 拉取单个资产详情 */
export async function fetchAssetById(
  id: string,
  accessToken: string | null,
): Promise<{ asset: MarketplaceAsset; source: "fixture" | "api" }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    const asset = loadFixtureAssetById(id);
    if (!asset) {
      throw new Error("未找到该资产。");
    }
    return { asset, source: "fixture" };
  }

  const response = await fetch(`${API_BASE}?id=${encodeURIComponent(id)}`, {
    method: "GET",
    headers: buildHeaders(accessToken),
  });
  const payload = (await parseJsonSafely(response)) as
    | { success?: boolean; asset?: unknown; error?: string; code?: string }
    | null;
  if (!response.ok || !payload?.success) {
    if (payload?.code === "unauthenticated") {
      throw new Error("未登录，请先登录后再访问市场。");
    }
    if (payload?.code === "not_found") {
      throw new Error("未找到该资产。");
    }
    throw new Error(payload?.error || "加载资产详情失败。");
  }
  return { asset: payload.asset as MarketplaceAsset, source: "api" };
}

/** 拉取当前用户的使用授权记录 */
export async function fetchUsageGrants(
  accessToken: string | null,
): Promise<{ grants: UsageGrant[]; source: "fixture" | "api" }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 60));
    const dataset = loadFixtureDataset();
    return { grants: dataset.usageGrants, source: "fixture" };
  }

  const response = await fetch(`${API_BASE}/grants`, {
    method: "GET",
    headers: buildHeaders(accessToken),
  });
  const payload = (await parseJsonSafely(response)) as
    | { success?: boolean; grants?: unknown[]; error?: string; code?: string }
    | null;
  if (!response.ok || !payload?.success) {
    if (payload?.code === "unauthenticated") {
      throw new Error("未登录，请先登录后再访问市场。");
    }
    throw new Error(payload?.error || "加载使用授权记录失败。");
  }
  return { grants: (payload.grants || []) as UsageGrant[], source: "api" };
}
