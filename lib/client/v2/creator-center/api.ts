/**
 * K2-T-10 创建者中心 API 适配器。
 *
 * 默认 USE_FIXTURE=true 使用内联 fixture 演示数据；后端就绪后通过
 * NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE=false 切换到真实 API。
 *
 * 注意：C-09 收益账本 API 尚未完成，目前仅 fixture 路径可用。
 * 真实 API 路径占位为 /api/v2/creator/earnings / /api/v2/creator/profile，
 * 待 C-09 完成后对接。
 *
 * 提供：
 * - 读：fetchCreatorEarnings / fetchCreatorProfile / fetchCreatorDataset
 * - 错误判断：isUnauthenticatedError / CreatorCenterApiError
 *
 * 关键约束（PRD §9.6 强制）：
 * - 所有结算状态均标注为人工（不显示为自动到账）
 * - 平台服务费比例 15%
 * - 收益净额 netAmount = grossAmount - platformFee
 */
import {
  fixtureCreatorContractVersion,
  loadFixtureCreatorDataset,
  loadFixtureCreatorEarnings,
  loadFixtureCreatorEarningsSummary,
  loadFixtureCreatorProfile,
} from "./fixtures.ts";
import {
  CONTRACT_VERSION,
  assertCreatorProfile,
  type CreatorDataset,
  type CreatorProfile,
} from "./types.ts";
import {
  assertEarningNetAmount,
  assertEarningsSummary,
  type EarningRecord,
  type EarningsSummary,
} from "../licensing/types.ts";

// ============================================================
// 开关与常量
// ============================================================

/** 是否使用 fixture 演示数据（默认开启） */
export const USE_FIXTURE =
  process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE !== "false";

/** 创建者收益 API 基础路径（C-09 完成后对接） */
const CREATOR_EARNINGS_API_BASE = "/api/v2/creator/earnings";

/** 创建者档案 API 基础路径（C-09 完成后对接） */
const CREATOR_PROFILE_API_BASE = "/api/v2/creator/profile";

/** 自定义 fetch 注入选项（测试用） */
export interface CreatorCenterFetchOptions {
  fetchImpl?: typeof fetch;
}

// ============================================================
// 错误类型
// ============================================================

/** 创建者中心 API 错误码 */
export const CREATOR_CENTER_API_ERROR_CODES = {
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  SERVICE_UNAVAILABLE: "service_unavailable",
  CREATOR_FETCH_FAILED: "creator_fetch_failed",
  CONTRACT_MISMATCH: "contract_mismatch",
} as const;

export type CreatorCenterErrorCode =
  (typeof CREATOR_CENTER_API_ERROR_CODES)[keyof typeof CREATOR_CENTER_API_ERROR_CODES];

/** 创建者中心 API 错误（带 code，UI 可据此切换提示态） */
export class CreatorCenterApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CreatorCenterApiError";
    this.code = code;
  }
}

// ============================================================
// HTTP 工具（与 licensing 适配器风格对齐）
// ============================================================

/** 构造请求 headers（带 Authorization Bearer） */
function buildHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** 安全解析 JSON 响应体 */
async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 统一解析 Codex 响应：处理 HTTP 状态码与错误体 */
async function parseCodexResponse<T>(
  response: Response,
  fallbackCode: string,
  fallbackMsg: string,
): Promise<T> {
  if (response.status === 401) {
    throw new CreatorCenterApiError(
      CREATOR_CENTER_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再访问创建者中心。",
    );
  }
  if (response.status === 403) {
    throw new CreatorCenterApiError(
      CREATOR_CENTER_API_ERROR_CODES.FORBIDDEN,
      "无访问权限。",
    );
  }
  if (response.status === 404) {
    throw new CreatorCenterApiError(
      CREATOR_CENTER_API_ERROR_CODES.NOT_FOUND,
      "未找到该资源。",
    );
  }

  const body = (await parseJsonSafely(response)) as
    | (T & { success?: boolean; contractVersion?: string; error?: string; code?: string })
    | null;

  if (!response.ok) {
    const code = body?.code || fallbackCode;
    const msg = body?.error || fallbackMsg;
    throw new CreatorCenterApiError(code, `${msg}（${response.status}）`);
  }
  if (!body || body.success === false) {
    const code = body?.code || fallbackCode;
    const msg = body?.error || fallbackMsg;
    throw new CreatorCenterApiError(code, msg);
  }
  if (body.contractVersion && body.contractVersion !== CONTRACT_VERSION) {
    throw new CreatorCenterApiError(
      CREATOR_CENTER_API_ERROR_CODES.CONTRACT_MISMATCH,
      `创建者中心契约版本不匹配：${body.contractVersion}`,
    );
  }
  return body as T;
}

// ============================================================
// 错误判断（UI 依赖）
// ============================================================

/** 是否为未登录错误（UI 据此切换到登录提示态） */
export function isUnauthenticatedError(err: unknown): boolean {
  if (err instanceof CreatorCenterApiError) {
    return err.code === CREATOR_CENTER_API_ERROR_CODES.UNAUTHENTICATED;
  }
  if (err instanceof Error) {
    return err.message.includes("未登录") || err.message.includes("unauthenticated");
  }
  return false;
}

// ============================================================
// 读操作
// ============================================================

/**
 * 拉取创建者收益账本。
 *
 * fixture 模式不依赖 accessToken；真实模式需要有效 token。
 *
 * 真实模式：GET /api/v2/creator/earnings
 * Codex 返回 { success, contractVersion, items: [EarningRecord], summary: EarningsSummary }
 *
 * PRD §9.6 强制：所有结算状态标注为人工（manualSettlement=true）。
 */
export async function fetchCreatorEarnings(
  accessToken: string | null,
  options: CreatorCenterFetchOptions = {},
): Promise<{
  earnings: EarningRecord[];
  summary: EarningsSummary;
  source: "fixture" | "api";
}> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      earnings: loadFixtureCreatorEarnings(),
      summary: loadFixtureCreatorEarningsSummary(),
      source: "fixture",
    };
  }

  if (!accessToken) {
    throw new CreatorCenterApiError(
      CREATOR_CENTER_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再访问收益账本。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(CREATOR_EARNINGS_API_BASE, {
    method: "GET",
    headers: buildHeaders(accessToken),
    credentials: "same-origin",
  });
  const payload = await parseCodexResponse<{
    items: EarningRecord[];
    summary: EarningsSummary;
  }>(
    response,
    CREATOR_CENTER_API_ERROR_CODES.CREATOR_FETCH_FAILED,
    "加载收益账本失败。",
  );
  // PRD §9.6：运行时校验每条收益净额
  for (const e of payload.items || []) {
    assertEarningNetAmount(e);
  }
  if (payload.summary) {
    assertEarningsSummary(payload.summary);
  }
  return {
    earnings: payload.items || [],
    summary: payload.summary,
    source: "api",
  };
}

/**
 * 拉取创建者档案。
 *
 * 真实模式：GET /api/v2/creator/profile
 * Codex 返回 { success, contractVersion, profile: CreatorProfile }
 */
export async function fetchCreatorProfile(
  accessToken: string | null,
  options: CreatorCenterFetchOptions = {},
): Promise<{ profile: CreatorProfile; source: "fixture" | "api" }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { profile: loadFixtureCreatorProfile(), source: "fixture" };
  }

  if (!accessToken) {
    throw new CreatorCenterApiError(
      CREATOR_CENTER_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再访问创建者档案。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(CREATOR_PROFILE_API_BASE, {
    method: "GET",
    headers: buildHeaders(accessToken),
    credentials: "same-origin",
  });
  const payload = await parseCodexResponse<{ profile: CreatorProfile }>(
    response,
    CREATOR_CENTER_API_ERROR_CODES.CREATOR_FETCH_FAILED,
    "加载创建者档案失败。",
  );
  assertCreatorProfile(payload.profile);
  return { profile: payload.profile, source: "api" };
}

/**
 * 一次性加载完整创建者数据集（档案 + 收益 + 汇总）。
 *
 * fixture 模式直接返回；真实模式并行加载。
 */
export async function fetchCreatorDataset(
  accessToken: string | null,
  options: CreatorCenterFetchOptions = {},
): Promise<{
  profile: CreatorProfile;
  earnings: EarningRecord[];
  earningsSummary: EarningsSummary;
  source: "fixture" | "api";
}> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const dataset = loadFixtureCreatorDataset();
    return {
      profile: dataset.profile,
      earnings: dataset.earnings,
      earningsSummary: dataset.earningsSummary,
      source: "fixture",
    };
  }

  if (!accessToken) {
    throw new CreatorCenterApiError(
      CREATOR_CENTER_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再访问创建者中心。",
    );
  }
  const [earningsResult, profileResult] = await Promise.all([
    fetchCreatorEarnings(accessToken, options),
    fetchCreatorProfile(accessToken, options),
  ]);
  return {
    profile: profileResult.profile,
    earnings: earningsResult.earnings,
    earningsSummary: earningsResult.summary,
    source: "api",
  };
}

/** 暴露契约版本供外部校验 */
export { CONTRACT_VERSION, fixtureCreatorContractVersion };
