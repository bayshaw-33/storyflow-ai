/**
 * KIIKIS 2.1 Phase 6 — Webhook 处理 (Task 6.1, BI-004~008)
 *
 * BI-004: webhook 使用原始 body 和 secret 验签 (HMAC-SHA256)
 * BI-005: 按 Stripe event ID 幂等处理
 * BI-006: 拒绝用较旧事件覆盖较新订阅状态
 * BI-007: 同步 checkout/subscription/invoice/refund 生命周期
 * BI-008: 权益只由服务器读取 webhook 同步状态
 *
 * 验签: 使用 Stripe-Signature header (t=timestamp,v1=signature)
 *   signed_payload = `${timestamp}.${rawBody}`
 *   expected_sig = HMAC-SHA256(webhook_secret, signed_payload)
 */
import crypto from "node:crypto";
import {
  isStripeEventType,
  parseSubscription,
  type Subscription,
  type SubscriptionRow,
  type PlanTier,
  getPlanFeatures,
} from "../../../contracts/v2/billing.ts";
import { BillingServiceError, upsertSubscription, type BillingFetcher } from "./stripe.ts";
import { syncEntitlement } from "./entitlements.ts";

// ============================================================
// BI-004: Webhook 验签
// ============================================================

/**
 * BI-004: 验证 Stripe webhook 签名
 * - 使用原始 raw body (非 parsed JSON)
 * - 使用 Stripe webhook secret
 * - 验签失败抛错
 *
 * Stripe-Signature 格式: "t=1234567890,v1=abc123..."
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): { timestamp: number; valid: boolean } {
  if (!secret) {
    throw new BillingServiceError("service_unavailable", "webhook secret not configured", 503);
  }
  if (!rawBody) {
    throw new BillingServiceError("validation_failed", "raw body is empty", 400);
  }
  if (!signatureHeader) {
    throw new BillingServiceError("validation_failed", "Stripe-Signature header missing", 400);
  }

  // 解析 header: t=timestamp,v1=signature1,v1=signature2
  const parts = signatureHeader.split(",");
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=", 2);
    if (key === "t") {
      timestamp = Number(value);
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (timestamp === null || signatures.length === 0) {
    throw new BillingServiceError("validation_failed", "invalid Stripe-Signature format", 400);
  }

  // BI-004: 计算期望签名
  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  // BI-004: 比较签名 (防止时序攻击, 用 timingSafeEqual)
  let valid = false;
  for (const sig of signatures) {
    if (sig.length === expectedSig.length) {
      try {
        const a = Buffer.from(sig, "hex");
        const b = Buffer.from(expectedSig, "hex");
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
          valid = true;
          break;
        }
      } catch {
        // invalid hex, skip
      }
    }
  }

  if (!valid) {
    throw new BillingServiceError("validation_failed", "signature verification failed", 400);
  }

  return { timestamp, valid: true };
}

// ============================================================
// BI-005: 事件幂等记录
// ============================================================

interface EventRecordResult {
  isFirst: boolean; // true = 首次处理, false = 重复事件
}

/**
 * BI-005: 记录 Stripe event_id (幂等)
 * - 首次处理返回 isFirst=true
 * - 重复 event 返回 isFirst=false
 */
export async function recordSubscriptionEvent(
  fetcher: BillingFetcher,
  eventId: string,
  eventType: string,
  stripeCreated: number | null,
): Promise<EventRecordResult> {
  const result = await fetcher<boolean>(`/rest/v1/rpc/record_subscription_event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_stripe_event_id: eventId,
      p_event_type: eventType,
      p_stripe_created: stripeCreated,
      p_payload: {},
    }),
  }).catch((err: unknown) => {
    throw new BillingServiceError("service_unavailable", "failed to record event", 503, err);
  });

  // RPC 返回 true = 首次, false = 重复
  return { isFirst: result === true };
}

// ============================================================
// BI-007: 生命周期事件处理
// ============================================================

interface StripeEvent {
  id: string;
  type: string;
  created: number; // unix timestamp
  data: {
    object: Record<string, unknown>;
  };
}

interface StripeSubscriptionObject {
  id: string;
  customer: string;
  status: string;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  items?: {
    data?: Array<{
      price?: { id: string };
    }>;
  };
  metadata?: Record<string, string>;
}

interface StripeCheckoutObject {
  id: string;
  customer: string;
  mode: string;
  subscription?: string;
  client_reference_id?: string;
  metadata?: Record<string, string>;
}

interface StripeInvoiceObject {
  id: string;
  customer: string;
  subscription?: string;
  total?: number;
  currency?: string;
  paid?: boolean;
}

interface StripeChargeObject {
  id: string;
  customer: string;
  amount_refunded?: number;
  refunded?: boolean;
}

/**
 * BI-007: 处理单个 Stripe 事件
 * - BI-005: 幂等 (重复 event 跳过)
 * - BI-006: 拒绝旧事件覆盖
 * - BI-008: 同步权益
 *
 * 返回: 处理结果状态
 */
export async function processWebhookEvent(
  fetcher: BillingFetcher,
  event: StripeEvent,
): Promise<{ status: "processed" | "skipped" | "error"; reason?: string }> {
  // BI-005: 幂等检查
  const { isFirst } = await recordSubscriptionEvent(
    fetcher,
    event.id,
    event.type,
    event.created,
  );
  if (!isFirst) {
    return { status: "skipped", reason: "duplicate event (BI-005)" };
  }

  // BI-007: 根据事件类型处理
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(fetcher, event);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(fetcher, event);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(fetcher, event);
        break;
      case "invoice.paid":
        await handleInvoicePaid(fetcher, event);
        break;
      case "charge.refunded":
        await handleChargeRefunded(fetcher, event);
        break;
      default:
        return { status: "skipped", reason: `unhandled event type: ${event.type}` };
    }
    return { status: "processed" };
  } catch (err) {
    return {
      status: "error",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/** BI-007: checkout.session.completed — 创建订阅记录 */
async function handleCheckoutCompleted(
  fetcher: BillingFetcher,
  event: StripeEvent,
): Promise<void> {
  const obj = event.data.object as unknown as StripeCheckoutObject;
  const userId = obj.metadata?.kiikis_user_id || obj.client_reference_id;
  if (!userId) {
    throw new Error("checkout missing user_id metadata");
  }

  // BI-001: upsert 订阅记录 (status=active, webhook 确认后授予)
  await upsertSubscription(fetcher, {
    userId,
    stripeCustomerId: obj.customer,
    stripeSubscriptionId: obj.subscription ?? null,
    status: "active", // BI-003: 权益只由 webhook 授予
    eventCreated: event.created,
  });
}

/** BI-007: subscription.created/updated — 同步状态 */
async function handleSubscriptionUpdated(
  fetcher: BillingFetcher,
  event: StripeEvent,
): Promise<void> {
  const obj = event.data.object as unknown as StripeSubscriptionObject;
  const userId = obj.metadata?.kiikis_user_id;
  if (!userId) {
    // 从 customer 反查 user (需要额外查询, 简化: 跳过)
    throw new Error("subscription missing user_id metadata");
  }

  const priceId = obj.items?.data?.[0]?.price?.id ?? null;
  const planId = priceId ? priceId.replace(/_[^_]+$/, "") : null;

  // BI-006: upsert (RPC 内拒绝旧事件覆盖)
  await upsertSubscription(fetcher, {
    userId,
    stripeCustomerId: obj.customer,
    stripeSubscriptionId: obj.id,
    planId,
    priceId,
    status: obj.status,
    currentPeriodStart: obj.current_period_start
      ? new Date(obj.current_period_start * 1000).toISOString()
      : null,
    currentPeriodEnd: obj.current_period_end
      ? new Date(obj.current_period_end * 1000).toISOString()
      : null,
    cancelAtPeriodEnd: obj.cancel_at_period_end ?? false,
    eventCreated: event.created,
  });

  // BI-008: 同步权益 (从 planId 推导 tier)
  const tier = deriveTierFromPlanId(planId);
  await syncEntitlement(fetcher, {
    userId,
    planTier: tier,
    features: getPlanFeatures(tier),
    source: "subscription",
    sourceId: obj.id,
    active: obj.status === "active",
  });
}

/** BI-007: subscription.deleted — 标记取消 */
async function handleSubscriptionDeleted(
  fetcher: BillingFetcher,
  event: StripeEvent,
): Promise<void> {
  const obj = event.data.object as unknown as StripeSubscriptionObject;
  const userId = obj.metadata?.kiikis_user_id;
  if (!userId) return;

  // BI-006: upsert status=canceled
  await upsertSubscription(fetcher, {
    userId,
    stripeCustomerId: obj.customer,
    stripeSubscriptionId: obj.id,
    status: "canceled",
    cancelAtPeriodEnd: true,
    eventCreated: event.created,
  });

  // BI-008: 降级为 free 权益
  await syncEntitlement(fetcher, {
    userId,
    planTier: "free",
    features: getPlanFeatures("free"),
    source: "subscription",
    sourceId: obj.id,
    active: true,
  });
}

/** BI-007: invoice.paid — 确认支付 */
async function handleInvoicePaid(
  fetcher: BillingFetcher,
  event: StripeEvent,
): Promise<void> {
  const obj = event.data.object as unknown as StripeInvoiceObject;
  // invoice 不直接改订阅状态, 只确认 (订阅状态由 subscription 事件处理)
  // 记录到 creative_events 由 BI-010 处理
}

/** BI-007: charge.refunded — 退款 */
async function handleChargeRefunded(
  fetcher: BillingFetcher,
  event: StripeEvent,
): Promise<void> {
  const obj = event.data.object as unknown as StripeChargeObject;
  // 退款不直接改订阅状态, 由 subscription 事件处理
  // 记录到 creative_events 由 BI-010 处理
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 从 planId 或 priceId 推导 plan tier
 *
 * planId 可能是 "pro_monthly" / "price_pro_monthly" 等格式
 * (priceId 的 Stripe 默认前缀是 "price_", 计划名内嵌于 id)
 * 使用 includes 兼容两种格式。
 */
function deriveTierFromPlanId(planId: string | null): PlanTier {
  if (!planId) return "free";
  // 注意顺序: enterprise 必须在 creator/pro 之前检查, 避免子串误匹配
  if (planId.includes("enterprise")) return "enterprise";
  if (planId.includes("creator")) return "creator";
  if (planId.includes("pro")) return "pro";
  return "free";
}
