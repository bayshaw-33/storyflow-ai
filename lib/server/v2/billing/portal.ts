/**
 * KIIKIS 2.1 Phase 6 — Customer Portal 与观测 (Task 6.2, BI-009~010)
 *
 * BI-009: 提供 Customer Portal 或等价取消/支付方式入口
 * BI-010: 账单状态变化写入 Creative Event、审计和观测
 *
 * 服务层职责:
 *   1. createCustomerPortalSession: 创建 Stripe Customer Portal session
 *   2. recordBillingEvent: 将账单状态变化写入 creative_events (BI-010)
 *   3. cancelSubscription: BI-009 等价方案 — 取消订阅 (cancel_at_period_end)
 *
 * 设计原则:
 *   - 账单事件使用 billing.* 前缀 (BI-010)
 *   - payload 不含 Stripe secret / 完整 token
 *   - 审计日志记录: 谁、何时、什么变化 (BI-010)
 */
import {
  BILLING_EVENT_PREFIX,
  type Subscription,
  type PlanTier,
} from "../../../contracts/v2/billing.ts";
import { appendCreativeEvent, CreativeEventsError } from "../events/index.ts";
import { BillingServiceError, type BillingFetcher } from "./stripe.ts";

// ============================================================
// BI-010: 账单事件类型 (billing.* 前缀)
// ============================================================

/** BI-010: 账单事件 event_type 列表 (所有以 billing. 开头) */
export const BILLING_EVENT_TYPES = Object.freeze({
  checkoutCreated: `${BILLING_EVENT_PREFIX}checkout.created`,
  subscriptionActivated: `${BILLING_EVENT_PREFIX}subscription.activated`,
  subscriptionUpdated: `${BILLING_EVENT_PREFIX}subscription.updated`,
  subscriptionCanceled: `${BILLING_EVENT_PREFIX}subscription.canceled`,
  subscriptionDeleted: `${BILLING_EVENT_PREFIX}subscription.deleted`,
  invoicePaid: `${BILLING_EVENT_PREFIX}invoice.paid`,
  refundIssued: `${BILLING_EVENT_PREFIX}refund.issued`,
  portalSessionCreated: `${BILLING_EVENT_PREFIX}portal.session_created`,
  entitlementSynced: `${BILLING_EVENT_PREFIX}entitlement.synced`,
  entitlementDowngraded: `${BILLING_EVENT_PREFIX}entitlement.downgraded`,
} as const);

export type BillingEventType = (typeof BILLING_EVENT_TYPES)[keyof typeof BILLING_EVENT_TYPES];

// ============================================================
// BI-009: Stripe Customer Portal session
// ============================================================

interface StripeBillingPortalSession {
  id: string;
  url: string;
  customer: string;
  return_url: string;
}

/**
 * BI-009: 创建 Stripe Customer Portal session
 *
 * 用户可通过 Portal:
 *   - 取消订阅
 *   - 更新支付方式
 *   - 查看账单历史
 *
 * 失败时抛 BillingServiceError (BI-009: Portal 不可用时调用方提供等价端点)
 */
export async function createCustomerPortalSession(
  fetcher: BillingFetcher,
  params: {
    userId: string;
    stripeCustomerId: string;
    returnUrl: string;
  },
): Promise<{ id: string; url: string; customerId: string; returnUrl: string }> {
  if (!params.userId?.trim()) {
    throw new BillingServiceError("unauthenticated", "userId is required", 401);
  }
  if (!params.stripeCustomerId?.trim()) {
    throw new BillingServiceError(
      "validation_failed",
      "stripeCustomerId is required (no active subscription found)",
      404,
    );
  }
  if (!params.returnUrl?.trim()) {
    throw new BillingServiceError("validation_failed", "returnUrl is required", 400);
  }

  const session = await stripeBillingPortalFetch<StripeBillingPortalSession>(
    "/billing_portal/sessions",
    {
      customer: params.stripeCustomerId,
      return_url: params.returnUrl,
    },
  );

  return {
    id: session.id,
    url: session.url,
    customerId: session.customer,
    returnUrl: session.return_url,
  };
}

// ============================================================
// BI-009: 等价方案 — 取消订阅 (cancel_at_period_end)
// ============================================================

interface StripeSubscriptionCancelResult {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number | null;
}

/**
 * BI-009: 取消订阅 (Portal 不可用时的等价方案)
 *
 * 调用 Stripe API 将订阅标记为 cancel_at_period_end=true
 * (不立即取消, 在当前周期结束时取消)
 *
 * 注意: 也会触发 customer.subscription.updated webhook, 由 webhook 同步状态
 */
export async function cancelSubscriptionAtPeriodEnd(
  stripeSubscriptionId: string,
): Promise<{
  stripeSubscriptionId: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}> {
  if (!stripeSubscriptionId?.trim()) {
    throw new BillingServiceError(
      "validation_failed",
      "stripeSubscriptionId is required",
      400,
    );
  }

  const result = await stripeFetchSubscriptionCancel(
    `/subscriptions/${encodeURIComponent(stripeSubscriptionId)}`,
    { cancel_at_period_end: "true" },
  );

  return {
    stripeSubscriptionId: result.id,
    cancelAtPeriodEnd: result.cancel_at_period_end,
    currentPeriodEnd: result.current_period_end
      ? new Date(result.current_period_end * 1000).toISOString()
      : null,
  };
}

// ============================================================
// BI-010: 账单状态变化写入 creative_events
// ============================================================

export interface RecordBillingEventInput {
  readonly userId: string;
  readonly eventType: BillingEventType;
  readonly resourceType: "subscription" | "entitlement" | "invoice" | "refund" | "checkout" | "portal";
  readonly resourceId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly visibility?: "private" | "collaborators" | "public";
  readonly idempotencyKey?: string;
}

/**
 * BI-010: 将账单状态变化写入 creative_events
 *
 * 规则:
 *   - event_type 使用 billing.* 前缀
 *   - payload 包含 plan_id/status/amount 等, 不含 Stripe secret
 *   - 审计日志记录: 谁 (actor_id=userId)、何时 (occurredAt)、什么变化 (payload)
 *   - idempotencyKey 缺失时由服务端生成确定性 key
 */
export async function recordBillingEvent(
  fetcher: BillingFetcher,
  input: RecordBillingEventInput,
): Promise<void> {
  if (!input.userId?.trim()) {
    throw new BillingServiceError("unauthenticated", "userId is required", 401);
  }
  if (!input.eventType?.startsWith(BILLING_EVENT_PREFIX)) {
    throw new BillingServiceError(
      "validation_failed",
      `eventType must start with "${BILLING_EVENT_PREFIX}" (BI-010)`,
      400,
    );
  }

  // BI-010: payload 安全检查 — 拒绝 secret/token 字段
  assertPayloadSafe(input.payload, "payload");

  const idempotencyKey =
    input.idempotencyKey ||
    `billing:${input.userId}:${input.eventType}:${input.resourceId}`;

  const now = new Date().toISOString();

  try {
    await appendCreativeEvent({
      fetcher,
      userId: input.userId,
      input: {
        sequence: 1, // 占位, DB 端生成真实 sequence
        eventType: input.eventType,
        schemaVersion: 1,
        actorType: "user",
        actorId: input.userId,
        ownerId: input.userId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        idempotencyKey,
        visibility: input.visibility ?? "private",
        payload: input.payload as Record<string, unknown>,
        occurredAt: now,
      },
    });
  } catch (err) {
    if (err instanceof CreativeEventsError) {
      throw new BillingServiceError(
        "service_unavailable",
        `failed to record billing event: ${err.message}`,
        503,
        err,
      );
    }
    throw err;
  }
}

// ============================================================
// BI-010: 常用账单事件便捷函数
// ============================================================

/** BI-010: 记录订阅激活事件 */
export async function recordSubscriptionActivated(
  fetcher: BillingFetcher,
  params: {
    userId: string;
    subscriptionId: string;
    planId: string | null;
    priceId: string | null;
    amountCents?: number | null;
  },
): Promise<void> {
  await recordBillingEvent(fetcher, {
    userId: params.userId,
    eventType: BILLING_EVENT_TYPES.subscriptionActivated,
    resourceType: "subscription",
    resourceId: params.subscriptionId,
    payload: {
      plan_id: params.planId,
      price_id: params.priceId,
      amount_cents: params.amountCents ?? null,
      currency: "usd",
    },
  });
}

/** BI-010: 记录订阅取消事件 */
export async function recordSubscriptionCanceled(
  fetcher: BillingFetcher,
  params: {
    userId: string;
    subscriptionId: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  },
): Promise<void> {
  await recordBillingEvent(fetcher, {
    userId: params.userId,
    eventType: BILLING_EVENT_TYPES.subscriptionCanceled,
    resourceType: "subscription",
    resourceId: params.subscriptionId,
    payload: {
      cancel_at_period_end: params.cancelAtPeriodEnd,
      current_period_end: params.currentPeriodEnd,
    },
  });
}

/** BI-010: 记录权益降级事件 (如 active → canceled 降级为 free) */
export async function recordEntitlementDowngraded(
  fetcher: BillingFetcher,
  params: {
    userId: string;
    entitlementId: string;
    fromTier: PlanTier;
    toTier: PlanTier;
  },
): Promise<void> {
  await recordBillingEvent(fetcher, {
    userId: params.userId,
    eventType: BILLING_EVENT_TYPES.entitlementDowngraded,
    resourceType: "entitlement",
    resourceId: params.entitlementId,
    payload: {
      from_tier: params.fromTier,
      to_tier: params.toTier,
    },
  });
}

/** BI-010: 记录退款事件 */
export async function recordRefundIssued(
  fetcher: BillingFetcher,
  params: {
    userId: string;
    chargeId: string;
    amountRefundedCents: number;
    currency?: string;
  },
): Promise<void> {
  await recordBillingEvent(fetcher, {
    userId: params.userId,
    eventType: BILLING_EVENT_TYPES.refundIssued,
    resourceType: "refund",
    resourceId: params.chargeId,
    payload: {
      amount_refunded_cents: params.amountRefundedCents,
      currency: params.currency ?? "usd",
    },
  });
}

/** BI-010: 记录 Portal session 创建事件 */
export async function recordPortalSessionCreated(
  fetcher: BillingFetcher,
  params: {
    userId: string;
    portalSessionId: string;
    customerId: string;
  },
): Promise<void> {
  await recordBillingEvent(fetcher, {
    userId: params.userId,
    eventType: BILLING_EVENT_TYPES.portalSessionCreated,
    resourceType: "portal",
    resourceId: params.portalSessionId,
    payload: {
      customer_id: params.customerId,
    },
  });
}

// ============================================================
// BI-010: payload 安全检查 (拒绝 secret/token)
// ============================================================

const SENSITIVE_BILLING_KEYS = new Set([
  "apiKey",
  "api_key",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "serviceRoleKey",
  "service_role_key",
  "secret",
  "token",
  "password",
  "privateKey",
  "private_key",
  "stripeSecretKey",
  "stripe_secret_key",
  "webhookSecret",
  "webhook_secret",
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

const SENSITIVE_BILLING_KEYS_NORMALIZED = new Set(
  [...SENSITIVE_BILLING_KEYS].map((k) => normalizeKey(k)),
);

function assertPayloadSafe(payload: unknown, path = "payload"): void {
  if (payload === null || typeof payload !== "object") return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertPayloadSafe(item, `${path}[${i}]`));
    return;
  }
  const obj = payload as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_BILLING_KEYS_NORMALIZED.has(normalizeKey(key))) {
      throw new BillingServiceError(
        "validation_failed",
        `sensitive key "${key}" is not allowed in billing event payload at ${path} (BI-010)`,
        400,
      );
    }
    assertPayloadSafe(obj[key], `${path}.${key}`);
  }
}

// ============================================================
// Stripe API 调用 (Portal + Cancel)
// ============================================================

function getStripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY || "";
}

async function stripeBillingPortalFetch<T = unknown>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const key = getStripeSecretKey();
  if (!key) {
    throw new BillingServiceError("service_unavailable", "Stripe not configured", 503);
  }
  const body = new URLSearchParams(params).toString();
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let errMsg = `Stripe Portal API error ${response.status}`;
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

async function stripeFetchSubscriptionCancel<T = unknown>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const key = getStripeSecretKey();
  if (!key) {
    throw new BillingServiceError("service_unavailable", "Stripe not configured", 503);
  }
  const body = new URLSearchParams(params).toString();
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let errMsg = `Stripe Cancel API error ${response.status}`;
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
