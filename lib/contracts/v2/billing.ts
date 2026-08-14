/**
 * KIIKIS 2.1 Phase 6 — Stripe 订阅契约 (Task 6.1, BI-001~008)
 *
 * 纯函数契约层。
 *
 * 设计原则:
 *   BI-001: Stripe customer 与 Kiikis user 一一映射
 *   BI-002: Checkout 只创建允许列表内 price 的会话
 *   BI-003: success URL 只显示确认中, 不授予权益
 *   BI-004: webhook 使用原始 body 和 secret 验签
 *   BI-005: 按 Stripe event ID 幂等处理
 *   BI-006: 拒绝用较旧事件覆盖较新订阅状态
 *   BI-007: 同步 checkout/subscription/invoice/refund 生命周期
 *   BI-008: plan entitlement 只由服务器读取 webhook 同步状态
 */

// ============================================================
// 常量
// ============================================================

/** 订阅状态机: incomplete → active → past_due → canceled / ended */
export const SUBSCRIPTION_STATUS = [
  "incomplete",
  "active",
  "past_due",
  "canceled",
  "ended",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[number];

/** 计划层级 */
export const PLAN_TIERS = ["free", "creator", "pro", "enterprise"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

/** 权益来源 */
export const ENTITLEMENT_SOURCE = ["subscription", "manual"] as const;
export type EntitlementSource = (typeof ENTITLEMENT_SOURCE)[number];

/** webhook 事件处理状态 */
export const EVENT_PROCESSED_STATUS = ["processed", "skipped", "error"] as const;
export type EventProcessedStatus = (typeof EVENT_PROCESSED_STATUS)[number];

/** Stripe webhook 事件类型 (BI-007) */
export const STRIPE_EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "charge.refunded",
] as const;
export type StripeEventType = (typeof STRIPE_EVENT_TYPES)[number];

/** 各计划的默认权益列表 */
export const PLAN_FEATURES: Readonly<Record<PlanTier, ReadonlyArray<string>>> = Object.freeze({
  free: Object.freeze(["basic_workbench", "limited_credits"]),
  creator: Object.freeze(["basic_workbench", "extended_credits", "export"]),
  pro: Object.freeze(["all_workbench", "unlimited_credits", "export", "priority_support"]),
  enterprise: Object.freeze(["all_workbench", "unlimited_credits", "export", "priority_support", "team_management"]),
});

/** BI-010: 账单事件 event_type 前缀 */
export const BILLING_EVENT_PREFIX = "billing.";

// ============================================================
// Subscription (BI-001)
// ============================================================

export interface Subscription {
  readonly id: string;
  readonly userId: string;
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId: string | null;
  readonly planId: string | null;
  readonly priceId: string | null;
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: string | null;
  readonly currentPeriodEnd: string | null;
  readonly cancelAtPeriodEnd: boolean;
  /** BI-006: 最新事件时间戳 */
  readonly lastEventCreated: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SubscriptionRow {
  readonly id: string;
  readonly user_id: string;
  readonly stripe_customer_id: string;
  readonly stripe_subscription_id: string | null;
  readonly plan_id: string | null;
  readonly price_id: string | null;
  readonly status: SubscriptionStatus;
  readonly current_period_start: string | null;
  readonly current_period_end: string | null;
  readonly cancel_at_period_end: boolean;
  readonly last_event_created: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface UpsertSubscriptionInput {
  readonly userId: string;
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId?: string | null;
  readonly planId?: string | null;
  readonly priceId?: string | null;
  readonly status?: SubscriptionStatus;
  readonly currentPeriodStart?: string | null;
  readonly currentPeriodEnd?: string | null;
  readonly cancelAtPeriodEnd?: boolean;
  /** BI-006: Stripe event.created (unix seconds) */
  readonly eventCreated?: number;
}

// ============================================================
// SubscriptionEvent (BI-005 幂等)
// ============================================================

export interface SubscriptionEvent {
  readonly id: string;
  readonly stripeEventId: string;
  readonly eventType: string;
  readonly stripeCreated: number | null;
  readonly processedStatus: EventProcessedStatus;
  readonly createdAt: string;
}

export interface SubscriptionEventRow {
  readonly id: string;
  readonly stripe_event_id: string;
  readonly event_type: string;
  readonly stripe_created: number | null;
  readonly processed_status: EventProcessedStatus;
  readonly created_at: string;
}

// ============================================================
// Entitlement (BI-008)
// ============================================================

export interface Entitlement {
  readonly id: string;
  readonly userId: string;
  readonly planTier: PlanTier;
  readonly features: ReadonlyArray<string>;
  readonly source: EntitlementSource;
  readonly sourceId: string | null;
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EntitlementRow {
  readonly id: string;
  readonly user_id: string;
  readonly plan_tier: PlanTier;
  readonly features: string[] | ReadonlyArray<string>;
  readonly source: EntitlementSource;
  readonly source_id: string | null;
  readonly active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

// ============================================================
// PriceWhitelist (BI-002)
// ============================================================

export interface PriceWhitelistEntry {
  readonly id: string;
  readonly priceId: string;
  readonly planTier: PlanTier;
  readonly planName: string | null;
  readonly amountCents: number | null;
  readonly currency: string;
  readonly active: boolean;
}

export interface PriceWhitelistRow {
  readonly id: string;
  readonly price_id: string;
  readonly plan_tier: PlanTier;
  readonly plan_name: string | null;
  readonly amount_cents: number | null;
  readonly currency: string;
  readonly active: boolean;
}

// ============================================================
// Checkout (BI-002, BI-003)
// ============================================================

export interface CreateCheckoutInput {
  readonly priceId: string;
  readonly userId: string;
  readonly userEmail: string;
  /** BI-003: success_url 指向"确认中"页面 */
  readonly successUrl: string;
  readonly cancelUrl: string;
}

export interface CheckoutSession {
  readonly id: string;
  readonly url: string;
  readonly customerId: string;
  /** BI-003: 不含权益授予逻辑 */
  readonly mode: string;
}

// ============================================================
// 校验 (纯函数)
// ============================================================

export class BillingValidationError extends Error {
  readonly code: string;
  readonly field?: string;
  constructor(code: string, message: string, field?: string) {
    super(`${code}: ${message}`);
    this.name = "BillingValidationError";
    this.code = code;
    if (field) this.field = field;
  }
}

export function isSubscriptionStatus(v: string): v is SubscriptionStatus {
  return SUBSCRIPTION_STATUS.includes(v as SubscriptionStatus);
}

export function isPlanTier(v: string): v is PlanTier {
  return PLAN_TIERS.includes(v as PlanTier);
}

export function isStripeEventType(v: string): v is StripeEventType {
  return STRIPE_EVENT_TYPES.includes(v as StripeEventType);
}

/** BI-001: 校验 subscription upsert 输入 */
export function validateUpsertSubscription(input: UpsertSubscriptionInput): UpsertSubscriptionInput {
  if (!input.userId?.trim()) {
    throw new BillingValidationError("missing_user", "userId is required (server-injected)", "userId");
  }
  if (!input.stripeCustomerId?.trim()) {
    throw new BillingValidationError(
      "missing_customer",
      "stripeCustomerId is required",
      "stripeCustomerId",
    );
  }
  if (input.status && !isSubscriptionStatus(input.status)) {
    throw new BillingValidationError(
      "invalid_status",
      `status must be one of ${SUBSCRIPTION_STATUS.join(", ")}`,
      "status",
    );
  }
  return Object.freeze({ ...input });
}

/** BI-002: 校验 checkout 输入 */
export function validateCreateCheckout(input: CreateCheckoutInput): CreateCheckoutInput {
  if (!input.priceId?.trim()) {
    throw new BillingValidationError("missing_price", "priceId is required", "priceId");
  }
  if (!input.userId?.trim()) {
    throw new BillingValidationError("missing_user", "userId is required (server-injected)", "userId");
  }
  if (!input.userEmail?.trim()) {
    throw new BillingValidationError("missing_email", "userEmail is required", "userEmail");
  }
  if (!input.successUrl?.trim()) {
    throw new BillingValidationError("missing_success_url", "successUrl is required", "successUrl");
  }
  if (!input.cancelUrl?.trim()) {
    throw new BillingValidationError("missing_cancel_url", "cancelUrl is required", "cancelUrl");
  }
  // BI-003: success_url 必须指向"确认中"页面, 不含权益授予逻辑
  if (!input.successUrl.includes("status=pending") && !input.successUrl.includes("confirming")) {
    throw new BillingValidationError(
      "invalid_success_url",
      "successUrl must include pending/confirming status (BI-003)",
      "successUrl",
    );
  }
  return Object.freeze({ ...input });
}

// ============================================================
// DB row → 实体
// ============================================================

export function parseSubscription(row: SubscriptionRow): Subscription {
  return Object.freeze({
    id: row.id,
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    planId: row.plan_id,
    priceId: row.price_id,
    status: row.status,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    lastEventCreated: row.last_event_created,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function parseSubscriptionEvent(row: SubscriptionEventRow): SubscriptionEvent {
  return Object.freeze({
    id: row.id,
    stripeEventId: row.stripe_event_id,
    eventType: row.event_type,
    stripeCreated: row.stripe_created,
    processedStatus: row.processed_status,
    createdAt: row.created_at,
  });
}

export function parseEntitlement(row: EntitlementRow): Entitlement {
  return Object.freeze({
    id: row.id,
    userId: row.user_id,
    planTier: row.plan_tier,
    features: Object.freeze([...(row.features ?? [])]),
    source: row.source,
    sourceId: row.source_id,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function parsePriceWhitelist(row: PriceWhitelistRow): PriceWhitelistEntry {
  return Object.freeze({
    id: row.id,
    priceId: row.price_id,
    planTier: row.plan_tier,
    planName: row.plan_name,
    amountCents: row.amount_cents,
    currency: row.currency,
    active: row.active,
  });
}

// ============================================================
// 权益判定 (BI-008: 服务器读取)
// ============================================================

/** BI-008: 从订阅状态推导 plan tier */
export function derivePlanTierFromStatus(sub: Subscription): PlanTier {
  if (sub.status === "active" && sub.planId) {
    // 从 planId 推导 tier (planId 格式: creator_monthly / pro_yearly 等)
    if (sub.planId.startsWith("creator")) return "creator";
    if (sub.planId.startsWith("pro")) return "pro";
    if (sub.planId.startsWith("enterprise")) return "enterprise";
  }
  return "free";
}

/** BI-008: 获取计划的默认权益列表 */
export function getPlanFeatures(tier: PlanTier): ReadonlyArray<string> {
  return PLAN_FEATURES[tier] ?? PLAN_FEATURES.free;
}

/** BI-008: 判断用户是否有某权益 (服务器读取) */
export function hasFeature(entitlements: ReadonlyArray<Entitlement>, feature: string): boolean {
  return entitlements.some((e) => e.active && e.features.includes(feature));
}
