/**
 * KIIKIS 2.1 Phase 6 — Stripe 集成核心 (Task 6.1, BI-001~004)
 *
 * BI-001: customer 创建/查找 (与 user 一一映射)
 * BI-002: Checkout 只创建白名单内 price 的会话
 * BI-003: success URL 只显示确认中, 不授予权益
 * BI-004: webhook 验签 (在 webhook.ts 实现)
 *
 * 不依赖 stripe npm 包, 直接用 fetch + crypto 调用 Stripe API。
 */
import {
  validateCreateCheckout,
  BillingValidationError,
  type CreateCheckoutInput,
  type CheckoutSession,
  type PriceWhitelistEntry,
  type PriceWhitelistRow,
  parsePriceWhitelist,
  type PlanTier,
} from "../../../contracts/v2/billing.ts";

/** PostgREST 风格 fetcher。 */
export type BillingFetcher = <T = unknown>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

// ============================================================
// 错误类型
// ============================================================

export class BillingServiceError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "validation_failed"
    | "stripe_error"
    | "service_unavailable"
    | "idempotent_skip";
  readonly status: number;
  readonly cause?: unknown;

  constructor(
    code: BillingServiceError["code"],
    message: string,
    status: number,
    cause?: unknown,
  ) {
    super(`${code}: ${message}`);
    this.name = "BillingServiceError";
    this.code = code;
    this.status = status;
    if (cause !== undefined) this.cause = cause;
  }
}

// ============================================================
// Stripe API 配置
// ============================================================

function getStripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY || "";
}

function getStripeWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET || "";
}

function getStripeApiBase(): string {
  return "https://api.stripe.com/v1";
}

/** Stripe API 调用 (表单编码, 非 JSON) */
async function stripeFetch<T = unknown>(
  path: string,
  params: Record<string, string>,
  method: "POST" | "GET" = "POST",
): Promise<T> {
  const key = getStripeSecretKey();
  if (!key) {
    throw new BillingServiceError("service_unavailable", "Stripe not configured", 503);
  }

  const body = new URLSearchParams(params).toString();
  const url = method === "GET" ? `${path}?${body}` : path;

  const response = await fetch(`${getStripeApiBase()}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" ? body : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let errMsg = `Stripe API error ${response.status}`;
    try {
      const errJson = JSON.parse(text);
      errMsg = errJson?.error?.message || errMsg;
    } catch {
      errMsg = text || errMsg;
    }
    throw new BillingServiceError("stripe_error", errMsg, response.status, text);
  }

  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

// ============================================================
// BI-001: Stripe customer 创建/查找
// ============================================================

interface StripeCustomer {
  id: string;
  email: string;
  metadata: Record<string, string>;
}

/**
 * BI-001: 查找或创建 Stripe customer (与 user 一一映射)
 * - 先查 metadata.kiikis_user_id = userId
 * - 不存在则创建, 写入 metadata.kiikis_user_id
 * - 重复调用不创建多个 customer
 */
export async function findOrCreateCustomer(
  fetcher: BillingFetcher,
  userId: string,
  userEmail: string,
): Promise<StripeCustomer> {
  if (!userId?.trim()) {
    throw new BillingServiceError("unauthenticated", "userId is required", 401);
  }
  if (!userEmail?.trim()) {
    throw new BillingServiceError("validation_failed", "userEmail is required", 400);
  }

  // BI-001: 先查已有 customer (metadata.kiikis_user_id)
  const searchResult = await stripeFetch<{ data: StripeCustomer[] }>(
    "/customers",
    {
      query: `metadata["kiikis_user_id"]:"${userId}"`,
      limit: "1",
    },
    "GET",
  ).catch((err: unknown) => {
    // 搜索失败不阻塞, 继续创建
    if (err instanceof BillingServiceError && err.code === "stripe_error") {
      return { data: [] };
    }
    throw err;
  });

  if (searchResult.data && searchResult.data.length > 0) {
    return searchResult.data[0];
  }

  // BI-001: 不存在则创建
  const customer = await stripeFetch<StripeCustomer>("/customers", {
    email: userEmail,
    "metadata[kiikis_user_id]": userId,
  });

  return customer;
}

/**
 * BI-001: 通过 userId 查找已有 customer (不创建)
 */
export async function findCustomerByUserId(
  fetcher: BillingFetcher,
  userId: string,
): Promise<StripeCustomer | null> {
  if (!userId?.trim()) return null;

  const searchResult = await stripeFetch<{ data: StripeCustomer[] }>(
    "/customers",
    {
      query: `metadata["kiikis_user_id"]:"${userId}"`,
      limit: "1",
    },
    "GET",
  ).catch(() => ({ data: [] as StripeCustomer[] }));

  return searchResult.data?.[0] ?? null;
}

// ============================================================
// BI-002: Price 白名单查询
// ============================================================

/**
 * BI-002: 检查 price_id 是否在白名单内
 * - 查询 storyflow_price_whitelist 表
 * - 返回对应的 plan_tier
 */
export async function checkPriceWhitelist(
  fetcher: BillingFetcher,
  priceId: string,
): Promise<PriceWhitelistEntry | null> {
  if (!priceId?.trim()) return null;

  const rows = await fetcher<PriceWhitelistRow[]>(
    `/rest/v1/storyflow_price_whitelist?price_id=eq.${encodeURIComponent(priceId)}&active=eq.true&limit=1`,
    { headers: { Accept: "application/json" } },
  ).catch(() => [] as PriceWhitelistRow[]);

  if (!rows || rows.length === 0) return null;
  return parsePriceWhitelist(rows[0]);
}

// ============================================================
// BI-002/003: Checkout session 创建
// ============================================================

interface StripeCheckoutSession {
  id: string;
  url: string;
  customer: string;
  mode: string;
  payment_status: string;
}

/**
 * BI-002/003: 创建 Checkout session
 * - BI-002: 校验 price_id 在白名单内
 * - BI-003: success_url 指向"确认中"页面, 不授予权益
 */
export async function createCheckoutSession(
  fetcher: BillingFetcher,
  input: CreateCheckoutInput,
): Promise<CheckoutSession> {
  let validated: CreateCheckoutInput;
  try {
    validated = validateCreateCheckout(input);
  } catch (err) {
    if (err instanceof BillingValidationError) {
      throw new BillingServiceError("validation_failed", err.message, 400);
    }
    throw err;
  }

  // BI-002: 校验 price_id 在白名单内
  const whitelistEntry = await checkPriceWhitelist(fetcher, validated.priceId);
  if (!whitelistEntry) {
    throw new BillingServiceError(
      "validation_failed",
      `price_id ${validated.priceId} is not in the whitelist (BI-002)`,
      403,
    );
  }

  // BI-001: 查找或创建 customer
  const customer = await findOrCreateCustomer(fetcher, validated.userId, validated.userEmail);

  // BI-003: success_url 不授予权益, 只显示"确认中"
  const session = await stripeFetch<StripeCheckoutSession>("/checkout/sessions", {
    customer: customer.id,
    mode: "subscription",
    "line_items[0][price]": validated.priceId,
    "line_items[0][quantity]": "1",
    success_url: validated.successUrl,
    cancel_url: validated.cancelUrl,
    // BI-003: 不在 success_url 授予权益, webhook 确认后才授予
    "metadata[kiikis_user_id]": validated.userId,
    "metadata[plan_tier]": whitelistEntry.planTier,
  });

  return {
    id: session.id,
    url: session.url,
    customerId: customer.id,
    mode: session.mode,
  };
}

// ============================================================
// BI-001: 订阅记录 upsert (写入 DB)
// ============================================================

interface SubscriptionRowDb {
  readonly id: string;
  readonly user_id: string;
  readonly stripe_customer_id: string;
  readonly stripe_subscription_id: string | null;
  readonly plan_id: string | null;
  readonly price_id: string | null;
  readonly status: string;
  readonly current_period_start: string | null;
  readonly current_period_end: string | null;
  readonly cancel_at_period_end: boolean;
  readonly last_event_created: number;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * BI-001: upsert 订阅记录到 DB
 * - BI-006: 通过 RPC 的 last_event_created 拒绝旧事件覆盖
 */
export async function upsertSubscription(
  fetcher: BillingFetcher,
  input: {
    userId: string;
    stripeCustomerId: string;
    stripeSubscriptionId?: string | null;
    planId?: string | null;
    priceId?: string | null;
    status?: string;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    eventCreated?: number;
  },
): Promise<SubscriptionRowDb> {
  const row = await fetcher<SubscriptionRowDb>(`/rest/v1/rpc/upsert_subscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_user_id: input.userId,
      p_stripe_customer_id: input.stripeCustomerId,
      p_stripe_subscription_id: input.stripeSubscriptionId ?? null,
      p_plan_id: input.planId ?? null,
      p_price_id: input.priceId ?? null,
      p_status: input.status ?? "incomplete",
      p_current_period_start: input.currentPeriodStart ?? null,
      p_current_period_end: input.currentPeriodEnd ?? null,
      p_cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
      p_event_created: input.eventCreated ?? 0,
    }),
  }).catch((err: unknown) => {
    throw new BillingServiceError("service_unavailable", "failed to upsert subscription", 503, err);
  });

  return row;
}

// ============================================================
// 导出 webhook secret (供 webhook.ts 使用)
// ============================================================

export { getStripeWebhookSecret };
