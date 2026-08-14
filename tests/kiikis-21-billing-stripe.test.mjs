/**
 * tests/kiikis-21-billing-stripe.test.mjs
 * KIIKIS 2.1 Phase 6 — Task 6.1 Stripe 订阅核心生命周期测试 (BI-001~008)
 *
 * 覆盖:
 *   BI-001: Stripe customer 与 Kiikis user 一一映射
 *   BI-002: Checkout 只创建允许列表内 price 的会话
 *   BI-003: success URL 只显示确认中, 不授予权益
 *   BI-004: webhook 使用原始 body 和 secret 验签
 *   BI-005: 按 Stripe event ID 幂等处理
 *   BI-006: 拒绝用较旧事件覆盖较新订阅状态
 *   BI-007: 同步 checkout/subscription/invoice/refund 生命周期
 *   BI-008: plan entitlement 只由服务器读取 webhook 同步状态
 *
 * 测试策略:
 *   - 契约校验 (validateUpsertSubscription / validateCreateCheckout)
 *   - 纯函数 (derivePlanTierFromStatus / getPlanFeatures / hasFeature)
 *   - 服务层 mock fetcher (BI-001 upsert + BI-005 幂等 + BI-006 拒绝旧事件)
 *   - webhook 验签 (BI-004: 真实 HMAC-SHA256 计算)
 *   - 生命周期事件处理 (BI-007: checkout/subscription/invoice/refund)
 *   - 权益服务器读取 (BI-008: 客户端无法伪造)
 *   - migration + route 文件存在
 */
import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  SUBSCRIPTION_STATUS,
  PLAN_TIERS,
  ENTITLEMENT_SOURCE,
  STRIPE_EVENT_TYPES,
  PLAN_FEATURES,
  BILLING_EVENT_PREFIX,
  validateUpsertSubscription,
  validateCreateCheckout,
  isSubscriptionStatus,
  isPlanTier,
  isStripeEventType,
  parseSubscription,
  parseSubscriptionEvent,
  parseEntitlement,
  parsePriceWhitelist,
  derivePlanTierFromStatus,
  getPlanFeatures,
  hasFeature as hasFeatureContract,
  BillingValidationError,
} from "../lib/contracts/v2/billing.ts";
import {
  findOrCreateCustomer,
  findCustomerByUserId,
  checkPriceWhitelist,
  createCheckoutSession,
  upsertSubscription,
  BillingServiceError,
} from "../lib/server/v2/billing/stripe.ts";
import {
  verifyWebhookSignature,
  recordSubscriptionEvent,
  processWebhookEvent,
} from "../lib/server/v2/billing/webhook.ts";
import {
  syncEntitlement,
  getEntitlements,
  getActivePlanTier,
  hasFeature as hasFeatureService,
  syncFromSubscription,
  listEntitlements,
} from "../lib/server/v2/billing/entitlements.ts";

// ============================================================
// Helpers — Mock fetcher
// ============================================================

function makeMockFetcher(handlers) {
  return async (path, init) => {
    for (const h of handlers) {
      if (h.match(path, init)) {
        return h.respond(path, init);
      }
    }
    throw Object.assign(new Error(`no handler for ${path}`), { status: 503 });
  };
}

const sampleSubscriptionRow = {
  id: "sub-1",
  user_id: "user-A",
  stripe_customer_id: "cus_A",
  stripe_subscription_id: "sub_stripe_A",
  plan_id: "pro_monthly",
  price_id: "price_pro_monthly",
  status: "active",
  current_period_start: "2026-08-01T00:00:00Z",
  current_period_end: "2026-09-01T00:00:00Z",
  cancel_at_period_end: false,
  last_event_created: 1700000000,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

const sampleEntitlementRow = {
  id: "ent-1",
  user_id: "user-A",
  plan_tier: "pro",
  features: ["all_workbench", "unlimited_credits", "export", "priority_support"],
  source: "subscription",
  source_id: "sub_stripe_A",
  active: true,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

// ============================================================
// 1. 契约常量 (BI-001~008)
// ============================================================

test("BI-001: SUBSCRIPTION_STATUS 含 incomplete/active/past_due/canceled/ended", () => {
  assert.ok(SUBSCRIPTION_STATUS.includes("incomplete"));
  assert.ok(SUBSCRIPTION_STATUS.includes("active"));
  assert.ok(SUBSCRIPTION_STATUS.includes("past_due"));
  assert.ok(SUBSCRIPTION_STATUS.includes("canceled"));
  assert.ok(SUBSCRIPTION_STATUS.includes("ended"));
});

test("BI-008: PLAN_TIERS 含 free/creator/pro/enterprise", () => {
  assert.deepEqual([...PLAN_TIERS], ["free", "creator", "pro", "enterprise"]);
});

test("BI-008: ENTITLEMENT_SOURCE 含 subscription/manual", () => {
  assert.ok(ENTITLEMENT_SOURCE.includes("subscription"));
  assert.ok(ENTITLEMENT_SOURCE.includes("manual"));
});

test("BI-007: STRIPE_EVENT_TYPES 含 checkout/subscription/invoice/refund 事件", () => {
  assert.ok(STRIPE_EVENT_TYPES.includes("checkout.session.completed"));
  assert.ok(STRIPE_EVENT_TYPES.includes("customer.subscription.created"));
  assert.ok(STRIPE_EVENT_TYPES.includes("customer.subscription.updated"));
  assert.ok(STRIPE_EVENT_TYPES.includes("customer.subscription.deleted"));
  assert.ok(STRIPE_EVENT_TYPES.includes("invoice.paid"));
  assert.ok(STRIPE_EVENT_TYPES.includes("charge.refunded"));
});

test("BI-008: PLAN_FEATURES 各 tier 有对应权益", () => {
  assert.ok(PLAN_FEATURES.free.includes("basic_workbench"));
  assert.ok(PLAN_FEATURES.creator.includes("extended_credits"));
  assert.ok(PLAN_FEATURES.pro.includes("unlimited_credits"));
  assert.ok(PLAN_FEATURES.enterprise.includes("team_management"));
});

test("BI-010: BILLING_EVENT_PREFIX = 'billing.'", () => {
  assert.equal(BILLING_EVENT_PREFIX, "billing.");
});

// ============================================================
// 2. validateUpsertSubscription (BI-001: userId 服务端注入, BI-006: eventCreated)
// ============================================================

test("BI-001: validateUpsertSubscription 合法输入通过", () => {
  const input = validateUpsertSubscription({
    userId: "user-A",
    stripeCustomerId: "cus_A",
    stripeSubscriptionId: "sub_stripe_A",
    planId: "pro_monthly",
    status: "active",
    eventCreated: 1700000000,
  });
  assert.equal(input.userId, "user-A");
  assert.equal(input.stripeCustomerId, "cus_A");
  assert.equal(input.eventCreated, 1700000000);
  assert.ok(Object.isFrozen(input), "input should be frozen");
});

test("BI-001: validateUpsertSubscription 缺 userId 抛错 (server-injected)", () => {
  assert.throws(
    () =>
      validateUpsertSubscription({
        userId: "",
        stripeCustomerId: "cus_A",
      }),
    (err) => err instanceof BillingValidationError && err.code === "missing_user",
  );
});

test("BI-001: validateUpsertSubscription 缺 stripeCustomerId 抛错", () => {
  assert.throws(
    () =>
      validateUpsertSubscription({
        userId: "user-A",
        stripeCustomerId: "",
      }),
    (err) => err instanceof BillingValidationError && err.code === "missing_customer",
  );
});

test("BI-006: validateUpsertSubscription 非法 status 抛错", () => {
  assert.throws(
    () =>
      validateUpsertSubscription({
        userId: "user-A",
        stripeCustomerId: "cus_A",
        status: "invalid_status",
      }),
    (err) => err instanceof BillingValidationError && err.code === "invalid_status",
  );
});

// ============================================================
// 3. validateCreateCheckout (BI-002, BI-003)
// ============================================================

test("BI-002: validateCreateCheckout 合法输入通过", () => {
  const input = validateCreateCheckout({
    priceId: "price_pro_monthly",
    userId: "user-A",
    userEmail: "user@kiikis.com",
    successUrl: "https://kiikis.com/subscription?status=pending",
    cancelUrl: "https://kiikis.com/subscription?status=cancelled",
  });
  assert.equal(input.priceId, "price_pro_monthly");
  assert.equal(input.userId, "user-A");
});

test("BI-002: validateCreateCheckout 缺 priceId 抛错", () => {
  assert.throws(
    () =>
      validateCreateCheckout({
        priceId: "",
        userId: "user-A",
        userEmail: "user@kiikis.com",
        successUrl: "https://kiikis.com/subscription?status=pending",
        cancelUrl: "https://kiikis.com/subscription?status=cancelled",
      }),
    (err) => err instanceof BillingValidationError && err.code === "missing_price",
  );
});

test("BI-001: validateCreateCheckout 缺 userId 抛错 (server-injected)", () => {
  assert.throws(
    () =>
      validateCreateCheckout({
        priceId: "price_pro_monthly",
        userId: "",
        userEmail: "user@kiikis.com",
        successUrl: "https://kiikis.com/subscription?status=pending",
        cancelUrl: "https://kiikis.com/subscription?status=cancelled",
      }),
    (err) => err instanceof BillingValidationError && err.code === "missing_user",
  );
});

test("BI-003: validateCreateCheckout successUrl 不含 pending/confirming 抛错", () => {
  assert.throws(
    () =>
      validateCreateCheckout({
        priceId: "price_pro_monthly",
        userId: "user-A",
        userEmail: "user@kiikis.com",
        successUrl: "https://kiikis.com/subscription?status=success",
        cancelUrl: "https://kiikis.com/subscription?status=cancelled",
      }),
    (err) => err instanceof BillingValidationError && err.code === "invalid_success_url",
  );
});

test("BI-003: validateCreateCheckout successUrl 含 'confirming' 通过", () => {
  const input = validateCreateCheckout({
    priceId: "price_pro_monthly",
    userId: "user-A",
    userEmail: "user@kiikis.com",
    successUrl: "https://kiikis.com/subscription?confirming=1",
    cancelUrl: "https://kiikis.com/subscription?status=cancelled",
  });
  assert.equal(input.successUrl, "https://kiikis.com/subscription?confirming=1");
});

// ============================================================
// 4. 类型守卫
// ============================================================

test("isSubscriptionStatus 正确校验", () => {
  assert.ok(isSubscriptionStatus("active"));
  assert.ok(!isSubscriptionStatus("invalid"));
});

test("isPlanTier 正确校验", () => {
  assert.ok(isPlanTier("free"));
  assert.ok(isPlanTier("pro"));
  assert.ok(!isPlanTier("invalid"));
});

test("isStripeEventType 正确校验", () => {
  assert.ok(isStripeEventType("checkout.session.completed"));
  assert.ok(!isStripeEventType("unknown.event"));
});

// ============================================================
// 5. parse 函数 (DB row → 实体)
// ============================================================

test("parseSubscription 正确转换 row → entity", () => {
  const sub = parseSubscription(sampleSubscriptionRow);
  assert.equal(sub.id, "sub-1");
  assert.equal(sub.userId, "user-A");
  assert.equal(sub.stripeCustomerId, "cus_A");
  assert.equal(sub.planId, "pro_monthly");
  assert.equal(sub.status, "active");
  assert.equal(sub.lastEventCreated, 1700000000);
  assert.ok(Object.isFrozen(sub));
});

test("parseSubscriptionEvent 正确转换", () => {
  const event = parseSubscriptionEvent({
    id: "e-1",
    stripe_event_id: "evt_A",
    event_type: "checkout.session.completed",
    stripe_created: 1700000000,
    processed_status: "processed",
    created_at: "2026-08-01T00:00:00Z",
  });
  assert.equal(event.stripeEventId, "evt_A");
  assert.equal(event.processedStatus, "processed");
});

test("parseEntitlement 正确转换 (features 为数组)", () => {
  const ent = parseEntitlement(sampleEntitlementRow);
  assert.equal(ent.userId, "user-A");
  assert.equal(ent.planTier, "pro");
  assert.ok(Array.isArray(ent.features));
  assert.ok(ent.features.includes("unlimited_credits"));
  assert.ok(Object.isFrozen(ent));
});

test("parsePriceWhitelist 正确转换", () => {
  const entry = parsePriceWhitelist({
    id: "pw-1",
    price_id: "price_pro_monthly",
    plan_tier: "pro",
    plan_name: "Pro Monthly",
    amount_cents: 1999,
    currency: "usd",
    active: true,
  });
  assert.equal(entry.priceId, "price_pro_monthly");
  assert.equal(entry.planTier, "pro");
  assert.equal(entry.amountCents, 1999);
});

// ============================================================
// 6. derivePlanTierFromStatus / getPlanFeatures / hasFeature (BI-008)
// ============================================================

test("BI-008: derivePlanTierFromStatus active + pro planId → 'pro'", () => {
  const sub = parseSubscription(sampleSubscriptionRow);
  assert.equal(derivePlanTierFromStatus(sub), "pro");
});

test("BI-008: derivePlanTierFromStatus canceled → 'free'", () => {
  const sub = parseSubscription({ ...sampleSubscriptionRow, status: "canceled" });
  assert.equal(derivePlanTierFromStatus(sub), "free");
});

test("BI-008: derivePlanTierFromStatus active 但无 planId → 'free'", () => {
  const sub = parseSubscription({
    ...sampleSubscriptionRow,
    plan_id: null,
    status: "active",
  });
  assert.equal(derivePlanTierFromStatus(sub), "free");
});

test("BI-008: derivePlanTierFromStatus active + enterprise planId → 'enterprise'", () => {
  const sub = parseSubscription({
    ...sampleSubscriptionRow,
    plan_id: "enterprise_yearly",
    status: "active",
  });
  assert.equal(derivePlanTierFromStatus(sub), "enterprise");
});

test("BI-008: getPlanFeatures 各 tier 返回正确权益", () => {
  assert.ok(getPlanFeatures("free").includes("basic_workbench"));
  assert.ok(getPlanFeatures("creator").includes("extended_credits"));
  assert.ok(getPlanFeatures("pro").includes("priority_support"));
  assert.ok(getPlanFeatures("enterprise").includes("team_management"));
});

test("BI-008: hasFeature active + 含 feature → true", () => {
  const ents = [parseEntitlement(sampleEntitlementRow)];
  assert.ok(hasFeatureContract(ents, "unlimited_credits"));
  assert.ok(!hasFeatureContract(ents, "team_management"));
});

test("BI-008: hasFeature inactive → false", () => {
  const ents = [parseEntitlement({ ...sampleEntitlementRow, active: false })];
  assert.ok(!hasFeatureContract(ents, "unlimited_credits"));
});

// ============================================================
// 7. BI-004: webhook 验签 (真实 HMAC-SHA256)
// ============================================================

const TEST_SECRET = "whsec_test_secret_12345";
const TEST_RAW_BODY = JSON.stringify({
  id: "evt_test_1",
  type: "checkout.session.completed",
  created: 1700000000,
  data: { object: { id: "cs_test_1" } },
});

function makeSignature(body, secret, timestamp = 1700000000) {
  const signedPayload = `${timestamp}.${body}`;
  return crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
}

test("BI-004: 合法签名验签通过", () => {
  const sig = makeSignature(TEST_RAW_BODY, TEST_SECRET);
  const header = `t=1700000000,v1=${sig}`;
  const result = verifyWebhookSignature(TEST_RAW_BODY, header, TEST_SECRET);
  assert.equal(result.valid, true);
  assert.equal(result.timestamp, 1700000000);
});

test("BI-004: 篡改 body 验签失败 (400)", () => {
  const sig = makeSignature(TEST_RAW_BODY, TEST_SECRET);
  const header = `t=1700000000,v1=${sig}`;
  const tamperedBody = TEST_RAW_BODY.replace("evt_test_1", "evt_tampered");
  assert.throws(
    () => verifyWebhookSignature(tamperedBody, header, TEST_SECRET),
    (err) => err instanceof BillingServiceError && err.code === "validation_failed" && err.status === 400,
  );
});

test("BI-004: 错误 secret 验签失败", () => {
  const sig = makeSignature(TEST_RAW_BODY, "wrong_secret");
  const header = `t=1700000000,v1=${sig}`;
  assert.throws(
    () => verifyWebhookSignature(TEST_RAW_BODY, header, TEST_SECRET),
    (err) => err instanceof BillingServiceError && err.code === "validation_failed",
  );
});

test("BI-004: 空 body 抛错", () => {
  assert.throws(
    () => verifyWebhookSignature("", "t=1,v1=abc", TEST_SECRET),
    (err) => err instanceof BillingServiceError && err.code === "validation_failed",
  );
});

test("BI-004: 缺 Stripe-Signature header 抛错", () => {
  assert.throws(
    () => verifyWebhookSignature(TEST_RAW_BODY, "", TEST_SECRET),
    (err) => err instanceof BillingServiceError && err.code === "validation_failed",
  );
});

test("BI-004: 缺 secret 抛 service_unavailable", () => {
  assert.throws(
    () => verifyWebhookSignature(TEST_RAW_BODY, "t=1,v1=abc", ""),
    (err) => err instanceof BillingServiceError && err.code === "service_unavailable",
  );
});

test("BI-004: 无效 header 格式抛错", () => {
  assert.throws(
    () => verifyWebhookSignature(TEST_RAW_BODY, "invalid_header", TEST_SECRET),
    (err) => err instanceof BillingServiceError && err.code === "validation_failed",
  );
});

test("BI-004: 多 v1 签名任一匹配即通过", () => {
  const validSig = makeSignature(TEST_RAW_BODY, TEST_SECRET);
  const invalidSig = "0".repeat(64);
  const header = `t=1700000000,v1=${invalidSig},v1=${validSig}`;
  const result = verifyWebhookSignature(TEST_RAW_BODY, header, TEST_SECRET);
  assert.equal(result.valid, true);
});

// ============================================================
// 8. BI-005: recordSubscriptionEvent 幂等
// ============================================================

test("BI-005: 首次 event isFirst=true", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/record_subscription_event"),
      respond: () => true,
    },
  ]);
  const result = await recordSubscriptionEvent(fetcher, "evt_A", "checkout.session.completed", 1700000000);
  assert.equal(result.isFirst, true);
});

test("BI-005: 重复 event isFirst=false", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/record_subscription_event"),
      respond: () => false,
    },
  ]);
  const result = await recordSubscriptionEvent(fetcher, "evt_A", "checkout.session.completed", 1700000000);
  assert.equal(result.isFirst, false);
});

// ============================================================
// 9. BI-007: processWebhookEvent 生命周期
// ============================================================

test("BI-005: processWebhookEvent 重复 event 返回 skipped", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/record_subscription_event"),
      respond: () => false, // 重复
    },
  ]);
  const result = await processWebhookEvent(fetcher, {
    id: "evt_dup",
    type: "checkout.session.completed",
    created: 1700000000,
    data: { object: {} },
  });
  assert.equal(result.status, "skipped");
  assert.ok(result.reason?.includes("BI-005"));
});

test("BI-007: checkout.session.completed → upsert subscription status=active", async () => {
  const calls = [];
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/record_subscription_event"),
      respond: () => true,
    },
    {
      match: (p) => p.includes("/rpc/upsert_subscription"),
      respond: (_p, init) => {
        const body = JSON.parse(init.body);
        calls.push({ status: body.p_status, eventCreated: body.p_event_created });
        return { ...sampleSubscriptionRow, status: body.p_status };
      },
    },
  ]);
  const result = await processWebhookEvent(fetcher, {
    id: "evt_co_1",
    type: "checkout.session.completed",
    created: 1700000001,
    data: {
      object: {
        id: "cs_1",
        customer: "cus_A",
        subscription: "sub_stripe_A",
        metadata: { kiikis_user_id: "user-A" },
      },
    },
  });
  assert.equal(result.status, "processed");
  assert.equal(calls[0].status, "active");
  assert.equal(calls[0].eventCreated, 1700000001);
});

test("BI-007: customer.subscription.updated → upsert + sync entitlement", async () => {
  const calls = [];
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/record_subscription_event"),
      respond: () => true,
    },
    {
      match: (p) => p.includes("/rpc/upsert_subscription"),
      respond: (_p, init) => {
        const body = JSON.parse(init.body);
        calls.push({ rpc: "upsert_subscription", status: body.p_status });
        return { ...sampleSubscriptionRow, status: body.p_status };
      },
    },
    {
      match: (p) => p.includes("/rpc/sync_entitlement"),
      respond: (_p, init) => {
        const body = JSON.parse(init.body);
        calls.push({ rpc: "sync_entitlement", tier: body.p_plan_tier, active: body.p_active });
        return { ...sampleEntitlementRow, plan_tier: body.p_plan_tier };
      },
    },
  ]);
  const result = await processWebhookEvent(fetcher, {
    id: "evt_sub_up_1",
    type: "customer.subscription.updated",
    created: 1700000002,
    data: {
      object: {
        id: "sub_stripe_A",
        customer: "cus_A",
        status: "active",
        current_period_start: 1700000000,
        current_period_end: 1702598400,
        cancel_at_period_end: false,
        items: { data: [{ price: { id: "price_pro_monthly" } }] },
        metadata: { kiikis_user_id: "user-A" },
      },
    },
  });
  assert.equal(result.status, "processed");
  assert.ok(calls.some((c) => c.rpc === "upsert_subscription" && c.status === "active"));
  assert.ok(calls.some((c) => c.rpc === "sync_entitlement" && c.tier === "pro" && c.active === true));
});

test("BI-007: customer.subscription.deleted → status=canceled + tier=free", async () => {
  const calls = [];
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/record_subscription_event"),
      respond: () => true,
    },
    {
      match: (p) => p.includes("/rpc/upsert_subscription"),
      respond: (_p, init) => {
        const body = JSON.parse(init.body);
        calls.push({ rpc: "upsert", status: body.p_status });
        return { ...sampleSubscriptionRow, status: body.p_status };
      },
    },
    {
      match: (p) => p.includes("/rpc/sync_entitlement"),
      respond: (_p, init) => {
        const body = JSON.parse(init.body);
        calls.push({ rpc: "sync_entitlement", tier: body.p_plan_tier });
        return { ...sampleEntitlementRow, plan_tier: body.p_plan_tier };
      },
    },
  ]);
  const result = await processWebhookEvent(fetcher, {
    id: "evt_sub_del_1",
    type: "customer.subscription.deleted",
    created: 1700000003,
    data: {
      object: {
        id: "sub_stripe_A",
        customer: "cus_A",
        status: "canceled",
        metadata: { kiikis_user_id: "user-A" },
      },
    },
  });
  assert.equal(result.status, "processed");
  assert.ok(calls.some((c) => c.rpc === "upsert" && c.status === "canceled"));
  assert.ok(calls.some((c) => c.rpc === "sync_entitlement" && c.tier === "free"));
});

test("BI-007: invoice.paid → processed (不直接改订阅状态)", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/record_subscription_event"),
      respond: () => true,
    },
  ]);
  const result = await processWebhookEvent(fetcher, {
    id: "evt_inv_1",
    type: "invoice.paid",
    created: 1700000004,
    data: { object: { id: "in_1", customer: "cus_A" } },
  });
  assert.equal(result.status, "processed");
});

test("BI-007: charge.refunded → processed (不直接改订阅状态)", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/record_subscription_event"),
      respond: () => true,
    },
  ]);
  const result = await processWebhookEvent(fetcher, {
    id: "evt_chg_1",
    type: "charge.refunded",
    created: 1700000005,
    data: { object: { id: "ch_1", customer: "cus_A" } },
  });
  assert.equal(result.status, "processed");
});

test("BI-007: 未处理事件类型 → skipped", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/record_subscription_event"),
      respond: () => true,
    },
  ]);
  const result = await processWebhookEvent(fetcher, {
    id: "evt_unknown",
    type: "unknown.event.type",
    created: 1700000006,
    data: { object: {} },
  });
  assert.equal(result.status, "skipped");
  assert.ok(result.reason?.includes("unhandled"));
});

test("BI-007: checkout missing user_id metadata → error", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/record_subscription_event"),
      respond: () => true,
    },
  ]);
  const result = await processWebhookEvent(fetcher, {
    id: "evt_co_no_user",
    type: "checkout.session.completed",
    created: 1700000007,
    data: {
      object: {
        id: "cs_1",
        customer: "cus_A",
        metadata: {},
      },
    },
  });
  assert.equal(result.status, "error");
  assert.ok(result.reason?.includes("user_id"));
});

// ============================================================
// 10. BI-001: stripe.ts 服务层 (mock fetcher)
// ============================================================

test("BI-001: upsertSubscription 调用 RPC upsert_subscription", async () => {
  let calledBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/upsert_subscription"),
      respond: (_p, init) => {
        calledBody = JSON.parse(init.body);
        return sampleSubscriptionRow;
      },
    },
  ]);
  const row = await upsertSubscription(fetcher, {
    userId: "user-A",
    stripeCustomerId: "cus_A",
    stripeSubscriptionId: "sub_stripe_A",
    status: "active",
    eventCreated: 1700000000,
  });
  assert.equal(row.user_id, "user-A");
  assert.equal(calledBody.p_user_id, "user-A");
  assert.equal(calledBody.p_status, "active");
  assert.equal(calledBody.p_event_created, 1700000000);
});

test("BI-001: upsertSubscription 失败抛 service_unavailable", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/upsert_subscription"),
      respond: () => {
        throw new Error("db down");
      },
    },
  ]);
  await assert.rejects(
    () => upsertSubscription(fetcher, { userId: "user-A", stripeCustomerId: "cus_A" }),
    (err) => err instanceof BillingServiceError && err.code === "service_unavailable",
  );
});

test("BI-002: checkPriceWhitelist 返回白名单 entry", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/storyflow_price_whitelist"),
      respond: () => [
        {
          id: "pw-1",
          price_id: "price_pro_monthly",
          plan_tier: "pro",
          plan_name: "Pro Monthly",
          amount_cents: 1999,
          currency: "usd",
          active: true,
        },
      ],
    },
  ]);
  const entry = await checkPriceWhitelist(fetcher, "price_pro_monthly");
  assert.ok(entry);
  assert.equal(entry.planTier, "pro");
  assert.equal(entry.amountCents, 1999);
});

test("BI-002: checkPriceWhitelist 不在白名单返回 null", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/storyflow_price_whitelist"),
      respond: () => [],
    },
  ]);
  const entry = await checkPriceWhitelist(fetcher, "price_unknown");
  assert.equal(entry, null);
});

test("BI-002: checkPriceWhitelist 空 priceId 返回 null", async () => {
  const fetcher = makeMockFetcher([]);
  const entry = await checkPriceWhitelist(fetcher, "");
  assert.equal(entry, null);
});

test("BI-001: findCustomerByUserId 空 userId 返回 null", async () => {
  const fetcher = makeMockFetcher([]);
  const customer = await findCustomerByUserId(fetcher, "");
  assert.equal(customer, null);
});

// ============================================================
// 11. BI-008: entitlements.ts 服务层 (mock fetcher)
// ============================================================

test("BI-008: syncEntitlement 调用 RPC sync_entitlement", async () => {
  let calledBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/sync_entitlement"),
      respond: (_p, init) => {
        calledBody = JSON.parse(init.body);
        return sampleEntitlementRow;
      },
    },
  ]);
  const ent = await syncEntitlement(fetcher, {
    userId: "user-A",
    planTier: "pro",
    features: ["unlimited_credits", "export"],
    source: "subscription",
    sourceId: "sub_stripe_A",
    active: true,
  });
  assert.equal(ent.planTier, "pro");
  assert.equal(calledBody.p_user_id, "user-A");
  assert.equal(calledBody.p_plan_tier, "pro");
  assert.equal(calledBody.p_active, true);
  assert.equal(calledBody.p_source, "subscription");
});

test("BI-008: syncEntitlement 缺 userId 抛 unauthenticated", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => syncEntitlement(fetcher, { userId: "", planTier: "pro", features: [], source: "subscription", sourceId: null, active: true }),
    (err) => err instanceof BillingServiceError && err.code === "unauthenticated",
  );
});

test("BI-008: syncEntitlement 缺 planTier 抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => syncEntitlement(fetcher, { userId: "user-A", planTier: "", features: [], source: "subscription", sourceId: null, active: true }),
    (err) => err instanceof BillingServiceError && err.code === "validation_failed",
  );
});

test("BI-008: getEntitlements 有权益返回列表", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/storyflow_entitlements"),
      respond: () => [sampleEntitlementRow],
    },
  ]);
  const ents = await getEntitlements(fetcher, "user-A");
  assert.equal(ents.length, 1);
  assert.equal(ents[0].planTier, "pro");
  assert.ok(ents[0].features.includes("unlimited_credits"));
});

test("BI-008: getEntitlements 无权益返回默认 free tier", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/storyflow_entitlements"),
      respond: () => [],
    },
  ]);
  const ents = await getEntitlements(fetcher, "user-A");
  assert.equal(ents.length, 1);
  assert.equal(ents[0].planTier, "free");
  assert.ok(ents[0].active);
  assert.ok(ents[0].features.includes("basic_workbench"));
});

test("BI-008: getEntitlements 缺 userId 抛 unauthenticated", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => getEntitlements(fetcher, ""),
    (err) => err instanceof BillingServiceError && err.code === "unauthenticated",
  );
});

test("BI-008: getActivePlanTier 返回最高 tier", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/storyflow_entitlements"),
      respond: () => [
        { ...sampleEntitlementRow, plan_tier: "free" },
        { ...sampleEntitlementRow, plan_tier: "pro" },
        { ...sampleEntitlementRow, plan_tier: "creator" },
      ],
    },
  ]);
  const tier = await getActivePlanTier(fetcher, "user-A");
  assert.equal(tier, "pro");
});

test("BI-008: getActivePlanTier 无权益返回 free", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/storyflow_entitlements"),
      respond: () => [],
    },
  ]);
  const tier = await getActivePlanTier(fetcher, "user-A");
  assert.equal(tier, "free");
});

test("BI-008: hasFeature 拥有 → true", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/storyflow_entitlements"),
      respond: () => [sampleEntitlementRow],
    },
  ]);
  const has = await hasFeatureService(fetcher, "user-A", "unlimited_credits");
  assert.equal(has, true);
});

test("BI-008: hasFeature 不拥有 → false", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/storyflow_entitlements"),
      respond: () => [sampleEntitlementRow],
    },
  ]);
  const has = await hasFeatureService(fetcher, "user-A", "team_management");
  assert.equal(has, false);
});

test("BI-008: syncFromSubscription active pro → sync pro entitlement", async () => {
  let calledBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/sync_entitlement"),
      respond: (_p, init) => {
        calledBody = JSON.parse(init.body);
        return sampleEntitlementRow;
      },
    },
  ]);
  const sub = parseSubscription(sampleSubscriptionRow);
  await syncFromSubscription(fetcher, sub);
  assert.equal(calledBody.p_plan_tier, "pro");
  assert.equal(calledBody.p_active, true);
});

test("BI-008: syncFromSubscription canceled → sync free entitlement", async () => {
  let calledBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/sync_entitlement"),
      respond: (_p, init) => {
        calledBody = JSON.parse(init.body);
        return { ...sampleEntitlementRow, plan_tier: "free" };
      },
    },
  ]);
  const sub = parseSubscription({ ...sampleSubscriptionRow, status: "canceled" });
  await syncFromSubscription(fetcher, sub);
  assert.equal(calledBody.p_plan_tier, "free");
  assert.equal(calledBody.p_active, false);
});

test("BI-008: listEntitlements 缺 userId 抛 unauthenticated", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => listEntitlements(fetcher, ""),
    (err) => err instanceof BillingServiceError && err.code === "unauthenticated",
  );
});

// ============================================================
// 12. Migration 文件存在 (BI-001~008 数据库结构)
// ============================================================

test("BI-001~008: migration 文件存在", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20260827060000_kiikis_21_billing.sql",
  );
  assert.ok(fs.existsSync(migrationPath), `migration file missing: ${migrationPath}`);
});

test("BI-001: migration 包含 storyflow_subscriptions 表 + user_id UNIQUE", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827060000_kiikis_21_billing.sql"),
    "utf8",
  );
  assert.ok(sql.includes("CREATE TABLE") && sql.includes("storyflow_subscriptions"));
  assert.ok(sql.includes("subscriptions_user_unique unique (user_id)"));
  assert.ok(sql.includes("subscriptions_customer_unique unique (stripe_customer_id)"));
});

test("BI-005: migration 包含 storyflow_subscription_events + stripe_event_id UNIQUE", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827060000_kiikis_21_billing.sql"),
    "utf8",
  );
  assert.ok(sql.includes("storyflow_subscription_events"));
  assert.ok(sql.includes("stripe_event_id text not null unique"));
});

test("BI-006: migration 包含 last_event_created + 拒绝旧事件逻辑", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827060000_kiikis_21_billing.sql"),
    "utf8",
  );
  assert.ok(sql.includes("last_event_created bigint"));
  assert.ok(sql.includes("v_sub.last_event_created > p_event_created"));
});

test("BI-008: migration 包含 storyflow_entitlements 表 + RLS (用户只读)", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827060000_kiikis_21_billing.sql"),
    "utf8",
  );
  assert.ok(sql.includes("storyflow_entitlements"));
  assert.ok(sql.includes("entitlements_owner_select"));
  // 客户端不可 INSERT/UPDATE/DELETE (无对应 policy)
  assert.ok(!sql.includes("entitlements_owner_insert"));
  assert.ok(!sql.includes("entitlements_owner_update"));
});

test("BI-002: migration 包含 storyflow_price_whitelist 表", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827060000_kiikis_21_billing.sql"),
    "utf8",
  );
  assert.ok(sql.includes("storyflow_price_whitelist"));
  assert.ok(sql.includes("price_id text not null unique"));
});

test("BI-006: migration 包含 upsert_subscription RPC", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827060000_kiikis_21_billing.sql"),
    "utf8",
  );
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.upsert_subscription"));
  assert.ok(sql.includes("SECURITY DEFINER"));
});

test("BI-005: migration 包含 record_subscription_event RPC", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827060000_kiikis_21_billing.sql"),
    "utf8",
  );
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.record_subscription_event"));
  assert.ok(sql.includes("stripe_event_id = p_stripe_event_id"));
});

test("BI-008: migration 包含 sync_entitlement + get_user_entitlements RPC", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827060000_kiikis_21_billing.sql"),
    "utf8",
  );
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.sync_entitlement"));
  assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.get_user_entitlements"));
});

// ============================================================
// 13. API 路由文件存在 (BI-001~008)
// ============================================================

test("BI-001~008: checkout route 文件存在", () => {
  const routePath = path.join(
    process.cwd(),
    "app/api/v2/billing/checkout/route.ts",
  );
  assert.ok(fs.existsSync(routePath), `checkout route missing: ${routePath}`);
});

test("BI-004~008: webhook route 文件存在", () => {
  const routePath = path.join(
    process.cwd(),
    "app/api/v2/billing/webhook/route.ts",
  );
  assert.ok(fs.existsSync(routePath), `webhook route missing: ${routePath}`);
});

test("BI-008: subscription route 文件存在", () => {
  const routePath = path.join(
    process.cwd(),
    "app/api/v2/billing/subscription/route.ts",
  );
  assert.ok(fs.existsSync(routePath), `subscription route missing: ${routePath}`);
});

test("BI-008: entitlements route 文件存在", () => {
  const routePath = path.join(
    process.cwd(),
    "app/api/v2/billing/entitlements/route.ts",
  );
  assert.ok(fs.existsSync(routePath), `entitlements route missing: ${routePath}`);
});

test("BI-004: webhook route 读取 raw body (非 JSON 解析)", () => {
  const routePath = path.join(
    process.cwd(),
    "app/api/v2/billing/webhook/route.ts",
  );
  const content = fs.readFileSync(routePath, "utf8");
  // BI-004: 必须使用 request.text() 获取原始 body, 而非 request.json()
  assert.ok(content.includes("await request.text()"));
  assert.ok(!content.includes("await request.json()"));
  assert.ok(content.includes("Stripe-Signature"));
  assert.ok(content.includes("verifyWebhookSignature"));
});

test("BI-003: checkout route 默认 successUrl 含 status=pending", () => {
  const routePath = path.join(
    process.cwd(),
    "app/api/v2/billing/checkout/route.ts",
  );
  const content = fs.readFileSync(routePath, "utf8");
  assert.ok(content.includes("status=pending"));
});

test("BI-008: entitlements route 通过服务器读取 (不信任客户端)", () => {
  const routePath = path.join(
    process.cwd(),
    "app/api/v2/billing/entitlements/route.ts",
  );
  const content = fs.readFileSync(routePath, "utf8");
  assert.ok(content.includes("authenticateRequest"));
  assert.ok(content.includes("getEntitlements") || content.includes("hasFeatureService") || content.includes("getActivePlanTier"));
});

// ============================================================
// 14. 服务层文件存在
// ============================================================

test("BI-001~004: stripe.ts 服务文件存在", () => {
  const filePath = path.join(process.cwd(), "lib/server/v2/billing/stripe.ts");
  assert.ok(fs.existsSync(filePath));
});

test("BI-004~007: webhook.ts 服务文件存在", () => {
  const filePath = path.join(process.cwd(), "lib/server/v2/billing/webhook.ts");
  assert.ok(fs.existsSync(filePath));
});

test("BI-008: entitlements.ts 服务文件存在", () => {
  const filePath = path.join(process.cwd(), "lib/server/v2/billing/entitlements.ts");
  assert.ok(fs.existsSync(filePath));
});

test("BI-001~008: billing.ts 契约文件存在", () => {
  const filePath = path.join(process.cwd(), "lib/contracts/v2/billing.ts");
  assert.ok(fs.existsSync(filePath));
});

// ============================================================
// 15. BI-008: 客户端无法伪造权益 (RLS 保护)
// ============================================================

test("BI-008: migration 中 entitlements 表无 INSERT/UPDATE/DELETE policy 给客户端", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827060000_kiikis_21_billing.sql"),
    "utf8",
  );
  // 客户端只能 SELECT 自己的权益, 无法伪造
  assert.ok(sql.includes("FOR SELECT TO authenticated"));
  // 不应有 INSERT/UPDATE/DELETE policy 给 authenticated (只通过 SECURITY DEFINER RPC)
  assert.ok(!sql.includes("entitlements_owner_insert"));
  assert.ok(!sql.includes("entitlements_owner_update"));
  assert.ok(!sql.includes("entitlements_owner_delete"));
});

test("BI-008: migration 中 subscriptions 表无 INSERT/UPDATE policy 给客户端", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827060000_kiikis_21_billing.sql"),
    "utf8",
  );
  // 客户端只能 SELECT 自己的订阅, 无法伪造状态
  assert.ok(sql.includes("subscriptions_owner_select"));
  assert.ok(!sql.includes("subscriptions_owner_insert"));
  assert.ok(!sql.includes("subscriptions_owner_update"));
});
