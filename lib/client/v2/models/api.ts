/**
 * 多模型选择 API 适配器。
 *
 * 默认 USE_FIXTURE=true 使用 fixture 演示数据；后端就绪后通过
 * NEXT_PUBLIC_USE_MODEL_FIXTURE=false 切换到真实 API。
 *
 * 提供：
 *   - fetchModelLibrary：拉取模型库 + 推荐 + 历史路由记录
 *   - fetchRecommendation：按任务类型获取智能推荐
 *   - saveRoutingRecord：保存路由记录（PRD §8.4）
 *
 * 复用 Atlas Cloud 已有模型能力，不重新实现 provider 接入。
 */
import { loadFixtureDataset } from "./fixtures";
import {
  matchRecommendation,
  filterModels,
  type RecommendationMatch,
} from "./router";
import {
  CONTRACT_VERSION,
  type ModelDescriptor,
  type ModelFilters,
  type ModelLibraryDataset,
  type ModelRecommendation,
  type RoutingRecord,
} from "./types";

/** 是否使用 fixture 演示数据（默认开启） */
export const USE_FIXTURE =
  process.env.NEXT_PUBLIC_USE_MODEL_FIXTURE !== "false";

export interface ModelLibraryResult {
  models: ModelDescriptor[];
  recommendations: ModelRecommendation[];
  routingRecords: RoutingRecord[];
  contractVersion: string;
  source: "fixture" | "api";
}

const API_BASE = "/api/v2/models";

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
 * 拉取模型库（含模型清单、推荐场景、历史路由记录）。
 * fixture 模式不依赖 accessToken；真实模式需要有效 token。
 */
export async function fetchModelLibrary(
  accessToken: string | null,
  filters?: ModelFilters,
): Promise<ModelLibraryResult> {
  if (USE_FIXTURE) {
    // 模拟网络延迟，便于观察加载态
    await new Promise((resolve) => setTimeout(resolve, 120));
    const dataset: ModelLibraryDataset = loadFixtureDataset();
    if (dataset.contractVersion !== CONTRACT_VERSION) {
      throw new Error(
        `多模型契约版本不匹配：fixture=${dataset.contractVersion}, client=${CONTRACT_VERSION}`,
      );
    }
    const models = filters ? filterModels(dataset.models, filters) : dataset.models;
    return {
      models,
      recommendations: dataset.recommendations,
      routingRecords: dataset.routingRecords,
      contractVersion: dataset.contractVersion,
      source: "fixture",
    };
  }

  const response = await fetch(API_BASE, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({ action: "list", ...(filters || {}) }),
  });
  const payload = (await parseJsonSafely(response)) as
    | {
        success?: boolean;
        models?: ModelDescriptor[];
        recommendations?: ModelRecommendation[];
        routingRecords?: RoutingRecord[];
        error?: string;
      }
    | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "加载模型库失败，请稍后再试。");
  }
  return {
    models: payload.models || [],
    recommendations: payload.recommendations || [],
    routingRecords: payload.routingRecords || [],
    contractVersion: CONTRACT_VERSION,
    source: "api",
  };
}

/**
 * 获取智能推荐（任务前）。
 * 返回推荐场景 + 对应模型描述符；无匹配时返回 null。
 */
export async function fetchRecommendation(
  taskType: string,
  taskParams: Record<string, string>,
  accessToken: string | null,
): Promise<RecommendationMatch | null> {
  const library = await fetchModelLibrary(accessToken);
  return matchRecommendation(
    library.recommendations,
    library.models,
    taskType,
    taskParams,
  );
}

/**
 * 保存路由记录（PRD §8.4）。
 * 真实模式下写入后端；fixture 模式仅模拟延迟，不持久化。
 */
export async function saveRoutingRecord(
  record: RoutingRecord,
  accessToken: string | null,
): Promise<void> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return;
  }
  const response = await fetch(API_BASE, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({ action: "save_routing", record }),
  });
  const payload = (await parseJsonSafely(response)) as { success?: boolean; error?: string } | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "保存路由记录失败，请稍后再试。");
  }
}
