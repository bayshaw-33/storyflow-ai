/**
 * K2-T-10 授权、订单与创建者中心 API 适配器。
 *
 * 默认 USE_FIXTURE=true 使用内联 fixture 演示数据；后端就绪后通过
 * NEXT_PUBLIC_USE_LICENSING_FIXTURE=false 切换到真实 API。
 *
 * 注意：C-09 订单/账本 API 已实现，当前默认 fixture 路径可用。
 * 真实 API 路径：/api/v2/orders / /api/v2/creators/ledger / /api/v2/reports / /api/v2/disputes。
 *
 * 提供：
 * - 订单：fetchOrders / fetchOrderById / requestRefund / cancelOrder / createOrderAndGrant
 * - 账本：fetchEarnings
 * - 举报：fetchReports / createReport
 * - 争议：fetchDisputes
 * - 错误判断：isUnauthenticatedError / LicensingApiError
 *
 * 关键约束（PRD §9.6 强制）：
 * - 订单失败不创建 Active Grant（createOrderAndGrant 在订单非 paid 时不激活 Grant）
 * - 人工结算不显示为自动到账（fixture 全部标注为人工）
 */
import {
  loadFixtureDataset,
  loadFixtureDisputes,
  loadFixtureEarnings,
  loadFixtureEarningsSummary,
  loadFixtureOrderById,
  loadFixtureOrders,
  loadFixtureReports,
} from "./fixtures.ts";
import {
  CONTRACT_VERSION,
  assertOrderFailureDoesNotActivateGrant,
  type CreateOrderInput,
  type Dispute,
  type EarningRecord,
  type EarningsSummary,
  type LicensingStatus,
  type Order,
  type Report,
} from "./types.ts";

// ============================================================
// 开关与常量
// ============================================================

/** 是否使用 fixture 演示数据（默认开启） */
export const USE_FIXTURE =
  process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE !== "false";

/** 订单 API 基础路径（C-09 已实现） */
const ORDERS_API_BASE = "/api/v2/orders";

/** 收益账本 API 基础路径（C-09 已实现，路由为 /api/v2/creators/ledger） */
const EARNINGS_API_BASE = "/api/v2/creators/ledger";

/** 举报 API 基础路径 */
const REPORTS_API_BASE = "/api/v2/reports";

/** 争议 API 基础路径 */
const DISPUTES_API_BASE = "/api/v2/disputes";

/** 自定义 fetch 注入选项（测试用） */
export interface LicensingFetchOptions {
  fetchImpl?: typeof fetch;
}

// ============================================================
// 错误类型
// ============================================================

/** 授权 API 错误码 */
export const LICENSING_API_ERROR_CODES = {
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  VALIDATION_FAILED: "validation_failed",
  SERVICE_UNAVAILABLE: "service_unavailable",
  LICENSING_FETCH_FAILED: "licensing_fetch_failed",
  ORDER_NOT_PAID: "order_not_paid",
  CONTRACT_MISMATCH: "contract_mismatch",
} as const;

export type LicensingErrorCode =
  (typeof LICENSING_API_ERROR_CODES)[keyof typeof LICENSING_API_ERROR_CODES];

/** 授权 API 错误（带 code，UI 可据此切换提示态） */
export class LicensingApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LicensingApiError";
    this.code = code;
  }
}

// ============================================================
// HTTP 工具（与 marketplace 适配器风格对齐）
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

/**
 * 统一解析 Codex 响应：处理 HTTP 状态码与 { success, error, code } 错误体，
 * 成功时返回原始 body（含 contractVersion 校验）。
 */
async function parseCodexResponse<T>(
  response: Response,
  fallbackCode: string,
  fallbackMsg: string,
): Promise<T> {
  if (response.status === 401) {
    throw new LicensingApiError(
      LICENSING_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再访问授权订单。",
    );
  }
  if (response.status === 403) {
    throw new LicensingApiError(
      LICENSING_API_ERROR_CODES.FORBIDDEN,
      "无访问权限。",
    );
  }
  if (response.status === 404) {
    throw new LicensingApiError(
      LICENSING_API_ERROR_CODES.NOT_FOUND,
      "未找到该资源。",
    );
  }

  const body = (await parseJsonSafely(response)) as
    | (T & { success?: boolean; contractVersion?: string; error?: string; code?: string })
    | null;

  if (!response.ok) {
    const code = body?.code || fallbackCode;
    const msg = body?.error || fallbackMsg;
    throw new LicensingApiError(code, `${msg}（${response.status}）`);
  }
  if (!body || body.success === false) {
    const code = body?.code || fallbackCode;
    const msg = body?.error || fallbackMsg;
    throw new LicensingApiError(code, msg);
  }
  if (body.contractVersion && body.contractVersion !== CONTRACT_VERSION) {
    throw new LicensingApiError(
      LICENSING_API_ERROR_CODES.CONTRACT_MISMATCH,
      `授权契约版本不匹配：${body.contractVersion}`,
    );
  }
  return body as T;
}

// ============================================================
// 错误判断（UI 依赖）
// ============================================================

/** 是否为未登录错误（UI 据此切换到登录提示态） */
export function isUnauthenticatedError(err: unknown): boolean {
  if (err instanceof LicensingApiError) {
    return err.code === LICENSING_API_ERROR_CODES.UNAUTHENTICATED;
  }
  if (err instanceof Error) {
    return err.message.includes("未登录") || err.message.includes("unauthenticated");
  }
  return false;
}

// ============================================================
// 订单读操作
// ============================================================

/**
 * 拉取订单列表。
 *
 * fixture 模式不依赖 accessToken；真实模式需要有效 token。
 *
 * 真实模式：GET /api/v2/orders
 * Codex 返回 { success, contractVersion, items: [Order] }。
 */
export async function fetchOrders(
  accessToken: string | null,
  options: LicensingFetchOptions = {},
): Promise<{ orders: Order[]; source: "fixture" | "api" }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    const orders = loadFixtureOrders();
    return { orders, source: "fixture" };
  }

  if (!accessToken) {
    throw new LicensingApiError(
      LICENSING_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再访问订单。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(ORDERS_API_BASE, {
    method: "GET",
    headers: buildHeaders(accessToken),
    credentials: "same-origin",
  });
  const payload = await parseCodexResponse<{ items: Order[] }>(
    response,
    LICENSING_API_ERROR_CODES.LICENSING_FETCH_FAILED,
    "加载订单失败。",
  );
  const orders = (payload.items || []).map((o) => ({ ...o, evidence: { ...o.evidence } }));
  // PRD §9.6：订单失败不创建 Active Grant（运行时不变式校验）
  for (const order of orders) {
    assertOrderFailureDoesNotActivateGrant(order);
  }
  return { orders, source: "api" };
}

/**
 * 按 ID 拉取单个订单详情。
 *
 * 真实模式：GET /api/v2/orders/[orderId]
 */
export async function fetchOrderById(
  accessToken: string | null,
  orderId: string,
  options: LicensingFetchOptions = {},
): Promise<{ order: Order; source: "fixture" | "api" }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 60));
    const order = loadFixtureOrderById(orderId);
    if (!order) {
      throw new LicensingApiError(
        LICENSING_API_ERROR_CODES.NOT_FOUND,
        "未找到该订单。",
      );
    }
    return { order, source: "fixture" };
  }

  if (!accessToken) {
    throw new LicensingApiError(
      LICENSING_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再访问订单。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(
    `${ORDERS_API_BASE}/${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      headers: buildHeaders(accessToken),
      credentials: "same-origin",
    },
  );
  const payload = await parseCodexResponse<{ order: Order }>(
    response,
    LICENSING_API_ERROR_CODES.LICENSING_FETCH_FAILED,
    "加载订单详情失败。",
  );
  const order = { ...payload.order, evidence: { ...payload.order.evidence } };
  assertOrderFailureDoesNotActivateGrant(order);
  return { order, source: "api" };
}

// ============================================================
// 订单写操作
// ============================================================

/**
 * 申请退款。
 *
 * 真实模式：POST /api/v2/orders/[orderId]/refund
 * body: { reason? }
 * 返回：{ success, contractVersion, order: Order }
 *
 * PRD §9.6：退款后 Grant 状态变 cancelled（不保持 active）。
 */
export async function requestRefund(
  accessToken: string | null,
  orderId: string,
  reason?: string,
  options: LicensingFetchOptions = {},
): Promise<{ order: Order; source: "fixture" | "api" }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const order = loadFixtureOrderById(orderId);
    if (!order) {
      throw new LicensingApiError(
        LICENSING_API_ERROR_CODES.NOT_FOUND,
        "未找到该订单。",
      );
    }
    if (order.status !== "paid") {
      throw new LicensingApiError(
        LICENSING_API_ERROR_CODES.ORDER_NOT_PAID,
        "仅已支付订单可申请退款。",
      );
    }
    // 退款：order 状态变 refunded，grant 状态变 cancelled
    const refunded: Order = {
      ...order,
      evidence: { ...order.evidence },
      status: "refunded",
      refundedAt: new Date().toISOString(),
      grantStatus: "cancelled",
    };
    return { order: refunded, source: "fixture" };
  }

  if (!accessToken) {
    throw new LicensingApiError(
      LICENSING_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再操作订单。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const body: Record<string, unknown> = {};
  if (reason) body.reason = reason;
  const response = await fetchImpl(
    `${ORDERS_API_BASE}/${encodeURIComponent(orderId)}/refund`,
    {
      method: "POST",
      headers: buildHeaders(accessToken),
      credentials: "same-origin",
      body: JSON.stringify(body),
    },
  );
  const payload = await parseCodexResponse<{ order: Order }>(
    response,
    LICENSING_API_ERROR_CODES.LICENSING_FETCH_FAILED,
    "申请退款失败。",
  );
  const order = { ...payload.order, evidence: { ...payload.order.evidence } };
  assertOrderFailureDoesNotActivateGrant(order);
  return { order, source: "api" };
}

/**
 * 取消订单。
 *
 * 真实模式：POST /api/v2/orders/[orderId]/cancel
 * 返回：{ success, contractVersion, order: Order }
 *
 * PRD §9.6：取消后 Grant 状态变 cancelled（不激活）。
 */
export async function cancelOrder(
  accessToken: string | null,
  orderId: string,
  options: LicensingFetchOptions = {},
): Promise<{ order: Order; source: "fixture" | "api" }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const order = loadFixtureOrderById(orderId);
    if (!order) {
      throw new LicensingApiError(
        LICENSING_API_ERROR_CODES.NOT_FOUND,
        "未找到该订单。",
      );
    }
    if (order.status !== "pending") {
      throw new LicensingApiError(
        LICENSING_API_ERROR_CODES.CONFLICT,
        "仅待支付订单可取消。",
      );
    }
    // 取消：order 状态变 cancelled，grant 状态变 cancelled
    const cancelled: Order = {
      ...order,
      evidence: { ...order.evidence },
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      grantStatus: "cancelled",
    };
    return { order: cancelled, source: "fixture" };
  }

  if (!accessToken) {
    throw new LicensingApiError(
      LICENSING_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再操作订单。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(
    `${ORDERS_API_BASE}/${encodeURIComponent(orderId)}/cancel`,
    {
      method: "POST",
      headers: buildHeaders(accessToken),
      credentials: "same-origin",
    },
  );
  const payload = await parseCodexResponse<{ order: Order }>(
    response,
    LICENSING_API_ERROR_CODES.LICENSING_FETCH_FAILED,
    "取消订单失败。",
  );
  const order = { ...payload.order, evidence: { ...payload.order.evidence } };
  assertOrderFailureDoesNotActivateGrant(order);
  return { order, source: "api" };
}

// ============================================================
// 账本读操作
// ============================================================

/**
 * 拉取创建者收益账本。
 *
 * 真实模式：GET /api/v2/creators/ledger
 * Codex 返回 { success, contractVersion, items: [EarningRecord], summary: EarningsSummary }
 *
 * PRD §9.6 强制：所有结算状态标注为人工（manualSettlement=true）。
 */
export async function fetchEarnings(
  accessToken: string | null,
  options: LicensingFetchOptions = {},
): Promise<{
  earnings: EarningRecord[];
  summary: EarningsSummary;
  source: "fixture" | "api";
}> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return {
      earnings: loadFixtureEarnings(),
      summary: loadFixtureEarningsSummary(),
      source: "fixture",
    };
  }

  if (!accessToken) {
    throw new LicensingApiError(
      LICENSING_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再访问收益账本。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(EARNINGS_API_BASE, {
    method: "GET",
    headers: buildHeaders(accessToken),
    credentials: "same-origin",
  });
  const payload = await parseCodexResponse<{
    items: EarningRecord[];
    summary: EarningsSummary;
  }>(
    response,
    LICENSING_API_ERROR_CODES.LICENSING_FETCH_FAILED,
    "加载收益账本失败。",
  );
  return {
    earnings: payload.items || [],
    summary: payload.summary,
    source: "api",
  };
}

// ============================================================
// 举报读写操作
// ============================================================

/**
 * 拉取举报列表。
 *
 * 真实模式：GET /api/v2/reports
 */
export async function fetchReports(
  accessToken: string | null,
  options: LicensingFetchOptions = {},
): Promise<{ reports: Report[]; source: "fixture" | "api" }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return { reports: loadFixtureReports(), source: "fixture" };
  }

  if (!accessToken) {
    throw new LicensingApiError(
      LICENSING_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再访问举报。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(REPORTS_API_BASE, {
    method: "GET",
    headers: buildHeaders(accessToken),
    credentials: "same-origin",
  });
  const payload = await parseCodexResponse<{ items: Report[] }>(
    response,
    LICENSING_API_ERROR_CODES.LICENSING_FETCH_FAILED,
    "加载举报失败。",
  );
  return { reports: payload.items || [], source: "api" };
}

/**
 * 创建举报。
 *
 * 真实模式：POST /api/v2/reports
 * body: { type, assetId, description, evidenceCount? }
 * 返回：{ success, contractVersion, report: Report }（201 状态码）
 */
export async function createReport(
  accessToken: string | null,
  input: {
    type: Report["type"];
    assetId: string;
    description: string;
    evidenceCount?: number;
  },
  options: LicensingFetchOptions = {},
): Promise<{ report: Report; source: "fixture" | "api" }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const report: Report = {
      id: `rpt-fixture-${Date.now()}`,
      type: input.type,
      assetId: input.assetId,
      assetName: "已提交举报",
      reporterId: "self",
      description: input.description,
      evidenceCount: input.evidenceCount || 0,
      status: "pending",
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      adminNote: null,
    };
    return { report, source: "fixture" };
  }

  if (!accessToken) {
    throw new LicensingApiError(
      LICENSING_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再提交举报。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(REPORTS_API_BASE, {
    method: "POST",
    headers: buildHeaders(accessToken),
    credentials: "same-origin",
    body: JSON.stringify(input),
  });
  const payload = await parseCodexResponse<{ report: Report }>(
    response,
    LICENSING_API_ERROR_CODES.LICENSING_FETCH_FAILED,
    "创建举报失败。",
  );
  return { report: payload.report, source: "api" };
}

// ============================================================
// 争议读操作
// ============================================================

/**
 * 拉取争议列表。
 *
 * 真实模式：GET /api/v2/disputes
 */
export async function fetchDisputes(
  accessToken: string | null,
  options: LicensingFetchOptions = {},
): Promise<{ disputes: Dispute[]; source: "fixture" | "api" }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return { disputes: loadFixtureDisputes(), source: "fixture" };
  }

  if (!accessToken) {
    throw new LicensingApiError(
      LICENSING_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再访问争议。",
    );
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(DISPUTES_API_BASE, {
    method: "GET",
    headers: buildHeaders(accessToken),
    credentials: "same-origin",
  });
  const payload = await parseCodexResponse<{ items: Dispute[] }>(
    response,
    LICENSING_API_ERROR_CODES.LICENSING_FETCH_FAILED,
    "加载争议失败。",
  );
  // 深拷贝 adminActions 数组
  return {
    disputes: (payload.items || []).map((d) => ({
      ...d,
      adminActions: d.adminActions.map((a) => ({ ...a })),
    })),
    source: "api",
  };
}

// ============================================================
// 完整 fixture 数据集（用于组件初始化时一次性加载）
// ============================================================

/** 一次性加载完整 fixture 数据集 */
export async function fetchLicensingDataset(
  accessToken: string | null,
  options: LicensingFetchOptions = {},
): Promise<{
  orders: Order[];
  earnings: EarningRecord[];
  earningsSummary: EarningsSummary;
  reports: Report[];
  disputes: Dispute[];
  source: "fixture" | "api";
}> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const dataset = loadFixtureDataset();
    return {
      orders: dataset.orders,
      earnings: dataset.earnings,
      earningsSummary: dataset.earningsSummary,
      reports: dataset.reports,
      disputes: dataset.disputes,
      source: "fixture",
    };
  }

  // 真实模式：并行加载
  if (!accessToken) {
    throw new LicensingApiError(
      LICENSING_API_ERROR_CODES.UNAUTHENTICATED,
      "未登录，请先登录后再访问授权订单中心。",
    );
  }
  const [orders, earnings, reports, disputes] = await Promise.all([
    fetchOrders(accessToken, options),
    fetchEarnings(accessToken, options),
    fetchReports(accessToken, options),
    fetchDisputes(accessToken, options),
  ]);
  return {
    orders: orders.orders,
    earnings: earnings.earnings,
    earningsSummary: earnings.summary,
    reports: reports.reports,
    disputes: disputes.disputes,
    source: "api",
  };
}

/** 暴露状态类型供组件复用 */
export type { LicensingStatus };
