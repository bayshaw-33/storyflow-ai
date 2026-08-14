/**
 * tests/kiikis-21-billing-portal.test.mjs
 * KIIKIS 2.1 Phase 6 — Task 6.2 Customer Portal 与观测测试 (BI-009~010)
 *
 * 覆盖:
 *   BI-009: 提供 Customer Portal 或等价取消/支付方式入口
 *   BI-010: 账单状态变化写入 Creative Event、审计和观测
 *
 * 测试策略:
 *   - BILLING_EVENT_TYPES 都以 billing. 开头 (BI-010)
 *   - createCustomerPortalSession (mock fetcher)
 *   - cancelSubscriptionAtPeriodEnd 验证 (缺 ID 抛错)
 *   - recordBillingEvent 事件类型 + payload 安全检查
 *   - 便捷函数 (recordSubscriptionActivated / recordSubscriptionCanceled 等)
 *   - migration / route 文件存在
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  BILLING_EVENT_TYPES,
  createCustomerPortalSession,
  cancelSubscriptionAtPeriodEnd,
  recordBillingEvent,
  recordSubscriptionActivated,
  recordSubscriptionCanceled,
  recordEntitlementDowngraded,
  recordRefundIssued,
  recordPortalSessionCreated,
} from "../lib/server/v2/billing/portal.ts";
import { BillingServiceError } from "../lib/server/v2/billing/stripe.ts";
import { BILLING_EVENT_PREFIX } from "../lib/contracts/v2/billing.ts";

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

// createCustomerPortalSession 不使用 fetcher 参数 (内部调用全局 fetch)
// 传入 no-op fetcher 占位
const noopFetcher = async () => {
  throw new Error("noopFetcher should not be called");
};

// 测试用 Stripe secret key (portal.ts 内部调用 Stripe API 前会检查此 env)
const TEST_STRIPE_SECRET_KEY = "sk_test_unit_test_key";
const prevStripeKey = process.env.STRIPE_SECRET_KEY;
process.env.STRIPE_SECRET_KEY = TEST_STRIPE_SECRET_KEY;

// ============================================================
// 1. BI-010: BILLING_EVENT_TYPES 都以 billing. 开头
// ============================================================

test("BI-010: 所有 BILLING_EVENT_TYPES 以 'billing.' 开头", () => {
  for (const [, eventType] of Object.entries(BILLING_EVENT_TYPES)) {
    assert.ok(
      eventType.startsWith(BILLING_EVENT_PREFIX),
      `eventType ${eventType} must start with "${BILLING_EVENT_PREFIX}"`,
    );
  }
});

test("BI-010: BILLING_EVENT_TYPES 包含订阅/退款/Portal 等事件", () => {
  assert.equal(BILLING_EVENT_TYPES.subscriptionActivated, "billing.subscription.activated");
  assert.equal(BILLING_EVENT_TYPES.subscriptionCanceled, "billing.subscription.canceled");
  assert.equal(BILLING_EVENT_TYPES.refundIssued, "billing.refund.issued");
  assert.equal(BILLING_EVENT_TYPES.portalSessionCreated, "billing.portal.session_created");
  assert.equal(BILLING_EVENT_TYPES.entitlementDowngraded, "billing.entitlement.downgraded");
});

// ============================================================
// 2. BI-009: createCustomerPortalSession
// ============================================================

test("BI-009: createCustomerPortalSession 合法输入返回 session (mock Stripe API)", async () => {
  // 注意: createCustomerPortalSession 内部调用全局 fetch 到 Stripe API
  // 此测试 mock 全局 fetch
  const originalFetch = globalThis.fetch;
  let calledUrl = "";
  let calledBody = "";
  globalThis.fetch = async (url, init) => {
    calledUrl = url;
    calledBody = init?.body || "";
    return new Response(
      JSON.stringify({
        id: "bps_test_1",
        url: "https://billing.stripe.com/p/session/test_1",
        customer: "cus_A",
        return_url: "https://kiikis.com/settings/subscription",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const session = await createCustomerPortalSession(noopFetcher, {
      userId: "user-A",
      stripeCustomerId: "cus_A",
      returnUrl: "https://kiikis.com/settings/subscription",
    });
    assert.equal(session.id, "bps_test_1");
    assert.equal(session.url, "https://billing.stripe.com/p/session/test_1");
    assert.equal(session.customerId, "cus_A");
    assert.ok(calledUrl.includes("/billing_portal/sessions"));
    assert.ok(calledBody.includes("customer=cus_A"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("BI-009: createCustomerPortalSession 缺 userId 抛 unauthenticated", async () => {
  await assert.rejects(
    () =>
      createCustomerPortalSession(noopFetcher, {
        userId: "",
        stripeCustomerId: "cus_A",
        returnUrl: "https://kiikis.com",
      }),
    (err) => err instanceof BillingServiceError && err.code === "unauthenticated",
  );
});

test("BI-009: createCustomerPortalSession 缺 stripeCustomerId 抛 not_found", async () => {
  await assert.rejects(
    () =>
      createCustomerPortalSession(noopFetcher, {
        userId: "user-A",
        stripeCustomerId: "",
        returnUrl: "https://kiikis.com",
      }),
    (err) => err instanceof BillingServiceError && err.status === 404,
  );
});

test("BI-009: createCustomerPortalSession 缺 returnUrl 抛 validation_failed", async () => {
  await assert.rejects(
    () =>
      createCustomerPortalSession(noopFetcher, {
        userId: "user-A",
        stripeCustomerId: "cus_A",
        returnUrl: "",
      }),
    (err) => err instanceof BillingServiceError && err.code === "validation_failed",
  );
});

test("BI-009: createCustomerPortalSession Stripe API 失败抛 stripe_error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: "No such customer" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  try {
    await assert.rejects(
      () =>
        createCustomerPortalSession(noopFetcher, {
          userId: "user-A",
          stripeCustomerId: "cus_invalid",
          returnUrl: "https://kiikis.com",
        }),
      (err) => err instanceof BillingServiceError && err.code === "stripe_error",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ============================================================
// 3. BI-009: cancelSubscriptionAtPeriodEnd (验证层)
// ============================================================

test("BI-009: cancelSubscriptionAtPeriodEnd 缺 stripeSubscriptionId 抛 validation_failed", async () => {
  await assert.rejects(
    () => cancelSubscriptionAtPeriodEnd(""),
    (err) => err instanceof BillingServiceError && err.code === "validation_failed",
  );
});

test("BI-009: cancelSubscriptionAtPeriodEnd 调用 Stripe API (mock)", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = "";
  let calledBody = "";
  globalThis.fetch = async (url, init) => {
    calledUrl = url;
    calledBody = init?.body || "";
    return new Response(
      JSON.stringify({
        id: "sub_stripe_A",
        status: "active",
        cancel_at_period_end: true,
        current_period_end: 1702598400,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const result = await cancelSubscriptionAtPeriodEnd("sub_stripe_A");
    assert.equal(result.stripeSubscriptionId, "sub_stripe_A");
    assert.equal(result.cancelAtPeriodEnd, true);
    assert.equal(result.currentPeriodEnd, "2023-12-15T00:00:00.000Z");
    assert.ok(calledUrl.includes("/subscriptions/sub_stripe_A"));
    assert.ok(calledBody.includes("cancel_at_period_end=true"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ============================================================
// 4. BI-010: recordBillingEvent
// ============================================================

test("BI-010: recordBillingEvent 合法输入写入 creative_events", async () => {
  let calledBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/append_creative_event"),
      respond: (_p, init) => {
        calledBody = JSON.parse(init.body);
        return {
          id: "evt-1",
          sequence: 100,
          event_type: calledBody.p_event_type,
          schema_version: calledBody.p_schema_version,
          actor_type: "user",
          actor_id: calledBody.p_actor_id,
          owner_id: calledBody.p_owner_id,
          resource_type: calledBody.p_resource_type,
          resource_id: calledBody.p_resource_id,
          resource_version: null,
          task_id: null,
          idempotency_key: calledBody.p_idempotency_key,
          visibility: calledBody.p_visibility,
          payload: calledBody.p_payload,
          occurred_at: calledBody.p_occurred_at,
          created_at: calledBody.p_occurred_at,
        };
      },
    },
  ]);
  await recordBillingEvent(fetcher, {
    userId: "user-A",
    eventType: BILLING_EVENT_TYPES.subscriptionActivated,
    resourceType: "subscription",
    resourceId: "sub_stripe_A",
    payload: { plan_id: "pro_monthly", amount_cents: 1999 },
  });
  assert.equal(calledBody.p_event_type, "billing.subscription.activated");
  assert.equal(calledBody.p_owner_id, "user-A");
  assert.equal(calledBody.p_resource_type, "subscription");
  assert.ok(calledBody.p_idempotency_key.startsWith("billing:user-A:"));
});

test("BI-010: recordBillingEvent 非 billing.* 前缀抛错", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      recordBillingEvent(fetcher, {
        userId: "user-A",
        eventType: "invalid.event",
        resourceType: "subscription",
        resourceId: "sub_A",
        payload: {},
      }),
    (err) => err instanceof BillingServiceError && err.code === "validation_failed",
  );
});

test("BI-010: recordBillingEvent 缺 userId 抛 unauthenticated", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      recordBillingEvent(fetcher, {
        userId: "",
        eventType: BILLING_EVENT_TYPES.subscriptionActivated,
        resourceType: "subscription",
        resourceId: "sub_A",
        payload: {},
      }),
    (err) => err instanceof BillingServiceError && err.code === "unauthenticated",
  );
});

// ============================================================
// 5. BI-010: payload 安全检查 (拒绝 secret/token)
// ============================================================

test("BI-010: recordBillingEvent payload 含 'secret' 抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      recordBillingEvent(fetcher, {
        userId: "user-A",
        eventType: BILLING_EVENT_TYPES.subscriptionActivated,
        resourceType: "subscription",
        resourceId: "sub_A",
        payload: { secret: "sk_test_xxx" },
      }),
    (err) => err instanceof BillingServiceError && err.code === "validation_failed",
  );
});

test("BI-010: recordBillingEvent payload 含 'token' 抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      recordBillingEvent(fetcher, {
        userId: "user-A",
        eventType: BILLING_EVENT_TYPES.subscriptionActivated,
        resourceType: "subscription",
        resourceId: "sub_A",
        payload: { accessToken: "tok_xxx" },
      }),
    (err) => err instanceof BillingServiceError && err.code === "validation_failed",
  );
});

test("BI-010: recordBillingEvent payload 含 'stripeSecretKey' 抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      recordBillingEvent(fetcher, {
        userId: "user-A",
        eventType: BILLING_EVENT_TYPES.subscriptionActivated,
        resourceType: "subscription",
        resourceId: "sub_A",
        payload: { stripeSecretKey: "sk_live_xxx" },
      }),
    (err) => err instanceof BillingServiceError && err.code === "validation_failed",
  );
});

test("BI-010: recordBillingEvent payload 嵌套含敏感键抛错", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      recordBillingEvent(fetcher, {
        userId: "user-A",
        eventType: BILLING_EVENT_TYPES.subscriptionActivated,
        resourceType: "subscription",
        resourceId: "sub_A",
        payload: { nested: { password: "p@ss" } },
      }),
    (err) => err instanceof BillingServiceError && err.code === "validation_failed",
  );
});

test("BI-010: recordBillingEvent payload 数组中含敏感键抛错", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      recordBillingEvent(fetcher, {
        userId: "user-A",
        eventType: BILLING_EVENT_TYPES.subscriptionActivated,
        resourceType: "subscription",
        resourceId: "sub_A",
        payload: { items: [{ apiKey: "k1" }] },
      }),
    (err) => err instanceof BillingServiceError && err.code === "validation_failed",
  );
});

// ============================================================
// 6. BI-010: 便捷函数
// ============================================================

test("BI-010: recordSubscriptionActivated 写入 billing.subscription.activated", async () => {
  let calledBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/append_creative_event"),
      respond: (_p, init) => {
        calledBody = JSON.parse(init.body);
        return {
          id: "evt-1",
          sequence: 1,
          event_type: calledBody.p_event_type,
          schema_version: 1,
          actor_type: "user",
          actor_id: calledBody.p_actor_id,
          owner_id: calledBody.p_owner_id,
          resource_type: calledBody.p_resource_type,
          resource_id: calledBody.p_resource_id,
          resource_version: null,
          task_id: null,
          idempotency_key: calledBody.p_idempotency_key,
          visibility: calledBody.p_visibility,
          payload: calledBody.p_payload,
          occurred_at: calledBody.p_occurred_at,
          created_at: calledBody.p_occurred_at,
        };
      },
    },
  ]);
  await recordSubscriptionActivated(fetcher, {
    userId: "user-A",
    subscriptionId: "sub_stripe_A",
    planId: "pro_monthly",
    priceId: "price_pro_monthly",
    amountCents: 1999,
  });
  assert.equal(calledBody.p_event_type, "billing.subscription.activated");
  assert.equal(calledBody.p_payload.plan_id, "pro_monthly");
  assert.equal(calledBody.p_payload.amount_cents, 1999);
  assert.equal(calledBody.p_payload.price_id, "price_pro_monthly");
});

test("BI-010: recordSubscriptionCanceled 写入 billing.subscription.canceled", async () => {
  let calledBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/append_creative_event"),
      respond: (_p, init) => {
        calledBody = JSON.parse(init.body);
        return {
          id: "evt-1",
          sequence: 1,
          event_type: calledBody.p_event_type,
          schema_version: 1,
          actor_type: "user",
          actor_id: calledBody.p_actor_id,
          owner_id: calledBody.p_owner_id,
          resource_type: calledBody.p_resource_type,
          resource_id: calledBody.p_resource_id,
          resource_version: null,
          task_id: null,
          idempotency_key: calledBody.p_idempotency_key,
          visibility: calledBody.p_visibility,
          payload: calledBody.p_payload,
          occurred_at: calledBody.p_occurred_at,
          created_at: calledBody.p_occurred_at,
        };
      },
    },
  ]);
  await recordSubscriptionCanceled(fetcher, {
    userId: "user-A",
    subscriptionId: "sub_stripe_A",
    cancelAtPeriodEnd: true,
    currentPeriodEnd: "2026-09-01T00:00:00Z",
  });
  assert.equal(calledBody.p_event_type, "billing.subscription.canceled");
  assert.equal(calledBody.p_payload.cancel_at_period_end, true);
  assert.equal(calledBody.p_payload.current_period_end, "2026-09-01T00:00:00Z");
});

test("BI-010: recordEntitlementDowngraded 写入 billing.entitlement.downgraded", async () => {
  let calledBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/append_creative_event"),
      respond: (_p, init) => {
        calledBody = JSON.parse(init.body);
        return {
          id: "evt-1",
          sequence: 1,
          event_type: calledBody.p_event_type,
          schema_version: 1,
          actor_type: "user",
          actor_id: calledBody.p_actor_id,
          owner_id: calledBody.p_owner_id,
          resource_type: calledBody.p_resource_type,
          resource_id: calledBody.p_resource_id,
          resource_version: null,
          task_id: null,
          idempotency_key: calledBody.p_idempotency_key,
          visibility: calledBody.p_visibility,
          payload: calledBody.p_payload,
          occurred_at: calledBody.p_occurred_at,
          created_at: calledBody.p_occurred_at,
        };
      },
    },
  ]);
  await recordEntitlementDowngraded(fetcher, {
    userId: "user-A",
    entitlementId: "ent-1",
    fromTier: "pro",
    toTier: "free",
  });
  assert.equal(calledBody.p_event_type, "billing.entitlement.downgraded");
  assert.equal(calledBody.p_payload.from_tier, "pro");
  assert.equal(calledBody.p_payload.to_tier, "free");
});

test("BI-010: recordRefundIssued 写入 billing.refund.issued", async () => {
  let calledBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/append_creative_event"),
      respond: (_p, init) => {
        calledBody = JSON.parse(init.body);
        return {
          id: "evt-1",
          sequence: 1,
          event_type: calledBody.p_event_type,
          schema_version: 1,
          actor_type: "user",
          actor_id: calledBody.p_actor_id,
          owner_id: calledBody.p_owner_id,
          resource_type: calledBody.p_resource_type,
          resource_id: calledBody.p_resource_id,
          resource_version: null,
          task_id: null,
          idempotency_key: calledBody.p_idempotency_key,
          visibility: calledBody.p_visibility,
          payload: calledBody.p_payload,
          occurred_at: calledBody.p_occurred_at,
          created_at: calledBody.p_occurred_at,
        };
      },
    },
  ]);
  await recordRefundIssued(fetcher, {
    userId: "user-A",
    chargeId: "ch_1",
    amountRefundedCents: 1999,
  });
  assert.equal(calledBody.p_event_type, "billing.refund.issued");
  assert.equal(calledBody.p_payload.amount_refunded_cents, 1999);
  assert.equal(calledBody.p_payload.currency, "usd");
});

test("BI-010: recordPortalSessionCreated 写入 billing.portal.session_created", async () => {
  let calledBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/append_creative_event"),
      respond: (_p, init) => {
        calledBody = JSON.parse(init.body);
        return {
          id: "evt-1",
          sequence: 1,
          event_type: calledBody.p_event_type,
          schema_version: 1,
          actor_type: "user",
          actor_id: calledBody.p_actor_id,
          owner_id: calledBody.p_owner_id,
          resource_type: calledBody.p_resource_type,
          resource_id: calledBody.p_resource_id,
          resource_version: null,
          task_id: null,
          idempotency_key: calledBody.p_idempotency_key,
          visibility: calledBody.p_visibility,
          payload: calledBody.p_payload,
          occurred_at: calledBody.p_occurred_at,
          created_at: calledBody.p_occurred_at,
        };
      },
    },
  ]);
  await recordPortalSessionCreated(fetcher, {
    userId: "user-A",
    portalSessionId: "bps_1",
    customerId: "cus_A",
  });
  assert.equal(calledBody.p_event_type, "billing.portal.session_created");
  assert.equal(calledBody.p_payload.customer_id, "cus_A");
});

test("BI-010: 便捷函数自动生成确定性 idempotency_key", async () => {
  let calledBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/append_creative_event"),
      respond: (_p, init) => {
        calledBody = JSON.parse(init.body);
        return {
          id: "evt-1",
          sequence: 1,
          event_type: calledBody.p_event_type,
          schema_version: 1,
          actor_type: "user",
          actor_id: calledBody.p_actor_id,
          owner_id: calledBody.p_owner_id,
          resource_type: calledBody.p_resource_type,
          resource_id: calledBody.p_resource_id,
          resource_version: null,
          task_id: null,
          idempotency_key: calledBody.p_idempotency_key,
          visibility: calledBody.p_visibility,
          payload: calledBody.p_payload,
          occurred_at: calledBody.p_occurred_at,
          created_at: calledBody.p_occurred_at,
        };
      },
    },
  ]);
  await recordSubscriptionActivated(fetcher, {
    userId: "user-A",
    subscriptionId: "sub_stripe_A",
    planId: "pro_monthly",
    priceId: "price_pro_monthly",
  });
  // 幂等 key 格式: billing:<userId>:<eventType>:<resourceId>
  assert.match(calledBody.p_idempotency_key, /^billing:user-A:billing\.subscription\.activated:sub_stripe_A$/);
});

// ============================================================
// 7. 服务层 / 路由文件存在 (BI-009~010)
// ============================================================

test("BI-009~010: portal.ts 服务文件存在", () => {
  const filePath = path.join(process.cwd(), "lib/server/v2/billing/portal.ts");
  assert.ok(fs.existsSync(filePath));
});

test("BI-009: portal route 文件存在", () => {
  const routePath = path.join(
    process.cwd(),
    "app/api/v2/billing/portal/route.ts",
  );
  assert.ok(fs.existsSync(routePath));
});

test("BI-009: cancel route 文件存在 (等价方案)", () => {
  const routePath = path.join(
    process.cwd(),
    "app/api/v2/billing/cancel/route.ts",
  );
  assert.ok(fs.existsSync(routePath));
});

test("BI-009: portal route 调用 createCustomerPortalSession", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "app/api/v2/billing/portal/route.ts"),
    "utf8",
  );
  assert.ok(content.includes("createCustomerPortalSession"));
  assert.ok(content.includes("stripeCustomerId"));
});

test("BI-009: cancel route 调用 cancelSubscriptionAtPeriodEnd", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "app/api/v2/billing/cancel/route.ts"),
    "utf8",
  );
  assert.ok(content.includes("cancelSubscriptionAtPeriodEnd"));
  assert.ok(content.includes("cancel_at_period_end") || content.includes("cancelAtPeriodEnd"));
});

test("BI-010: portal.ts 包含 BILLING_EVENT_TYPES 与 billing. 前缀", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "lib/server/v2/billing/portal.ts"),
    "utf8",
  );
  assert.ok(content.includes("BILLING_EVENT_TYPES"));
  // 事件名通过 BILLING_EVENT_PREFIX 模板拼接 (BI-010: billing. 前缀)
  assert.ok(content.includes("BILLING_EVENT_PREFIX"));
  assert.ok(content.includes("subscription.activated"));
  assert.ok(content.includes("refund.issued"));
  assert.ok(content.includes("portal.session_created"));
});

test("BI-010: portal.ts 包含 payload 安全检查", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "lib/server/v2/billing/portal.ts"),
    "utf8",
  );
  assert.ok(content.includes("assertPayloadSafe"));
  assert.ok(content.includes("SENSITIVE_BILLING_KEYS"));
  assert.ok(content.includes("stripeSecretKey") || content.includes("webhookSecret"));
});

test("BI-010: portal.ts 调用 appendCreativeEvent (Phase 1 RPC)", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "lib/server/v2/billing/portal.ts"),
    "utf8",
  );
  assert.ok(content.includes("appendCreativeEvent"));
});
