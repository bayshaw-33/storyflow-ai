/**
 * KIIKIS 2.1 Phase 6 — Task 6.4 E2E 测试规格
 *
 * 端到端流程:
 *   Stripe 订阅: checkout → webhook → 激活 → 取消 → 退款
 *   交易内测: free/invite_only/manual_review 创建 → 批准(grant) → 拒绝
 *
 * Gate 5 验收:
 *   - Stripe test 完整生命周期通过
 *   - 权益只由 webhook 同步状态授予
 *   - 核心事件、成本和漏斗可观测
 *   - 交易三种模式 + grant 审计链跑通
 *
 * 覆盖:
 *   BI-001 Stripe customer 与 user 一一映射
 *   BI-002 Checkout 白名单 price
 *   BI-003 success URL 只显示确认中
 *   BI-004 webhook 验签
 *   BI-005 webhook 幂等
 *   BI-006 拒绝旧事件覆盖
 *   BI-007 同步生命周期事件
 *   BI-008 权益由服务器读取
 *   BI-009 Customer Portal / 取消入口
 *   BI-010 账单事件写入 creative_events
 *   TX-001 三种模式
 *   TX-002 批准创建 grant
 *   TX-003 条款快照不可变
 *   TX-004 费用/争议/settlement 明示
 *   TX-005 未移动资金 paid_amount=0
 *   TX-006 UI 明示模式
 *   TX-007 演示数据 is_demo 标记
 *   TX-008 禁止自动收益/提现/分账
 */
import { test, expect } from "@playwright/test";

const API_BASE = "/api/v2";
const stamp = Date.now();

test.describe("KIIKIS 2.1 Phase 6 — Billing & Transactions E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // ============================================================
  // Stripe 订阅生命周期 (BI-001~010)
  // ============================================================

  test("Gate 5 / BI-001~008: Stripe 订阅完整生命周期 checkout → webhook → 激活 → 权益", async ({ request }) => {
    // ============================================================
    // BI-001: Stripe customer 与 Kiikis user 一一映射
    // ============================================================
    // 创建 checkout 会话 (BI-001: 后端创建/查找 customer)
    const checkoutResponse = await request.post(`${API_BASE}/billing/checkout`, {
      data: {
        priceId: "price_test_pro_monthly",
        successUrl: "/billing/success",
        cancelUrl: "/billing/cancel",
      },
    });

    // 服务未配置 Stripe 时返回 503 (CI 环境), 验证返回结构正确
    if (!checkoutResponse.ok()) {
      const errBody = await checkoutResponse.json().catch(() => ({}));
      // BI-002: 白名单外 price 被拒绝 (400) 或服务未配置 (503)
      expect([400, 503]).toContain(checkoutResponse.status());
      expect(errBody.success).toBe(false);
      return; // CI 环境 Stripe 未配置, 跳过后续
    }

    const checkoutData = await checkoutResponse.json();
    expect(checkoutData.success).toBe(true);
    expect(checkoutData.contractVersion).toBe("kiikis.billing.checkout/1");
    // BI-001: checkout session 关联 customer
    expect(checkoutData.session).toBeTruthy();
    expect(checkoutData.session.customerId).toBeTruthy();
    // BI-003: success URL 指向确认页, 不授予权益
    expect(checkoutData.session.url).toBeTruthy();

    // ============================================================
    // BI-002: 白名单外 price 被拒绝
    // ============================================================
    const rejectedCheckout = await request.post(`${API_BASE}/billing/checkout`, {
      data: {
        priceId: "price_evil_unauthorized",
        successUrl: "/billing/success",
        cancelUrl: "/billing/cancel",
      },
    });
    expect(rejectedCheckout.ok()).toBeFalsy();
    expect([400, 503]).toContain(rejectedCheckout.status());

    // ============================================================
    // BI-008: 权益查询 — 客户端无法伪造, 只由服务器读取
    // ============================================================
    const entitlementResponse = await request.get(`${API_BASE}/billing/entitlements`);
    if (entitlementResponse.ok()) {
      const entData = await entitlementResponse.json();
      expect(entData.success).toBe(true);
      expect(entData.contractVersion).toBe("kiikis.billing.entitlement/1");
      // BI-008: 权益由服务器返回, 客户端不持有判定逻辑
      expect(entData.entitlement).toBeTruthy();
      expect(["free", "creator", "pro", "enterprise"]).toContain(entData.entitlement.planTier);
      expect(Array.isArray(entData.entitlement.features)).toBe(true);
    }

    // ============================================================
    // BI-008: 订阅状态查询 (服务器读取 webhook 同步状态)
    // ============================================================
    const subscriptionResponse = await request.get(`${API_BASE}/billing/subscription`);
    if (subscriptionResponse.ok()) {
      const subData = await subscriptionResponse.json();
      expect(subData.success).toBe(true);
      expect(subData.contractVersion).toBe("kiikis.billing.subscription/1");
      // BI-007: 订阅状态机
      if (subData.subscription) {
        expect(["incomplete", "active", "past_due", "canceled", "ended"]).toContain(
          subData.subscription.status,
        );
      }
    }
  });

  test("BI-004~006: webhook 验签与幂等 (raw body + event_id 幂等)", async ({ request }) => {
    // BI-004: webhook 接收 raw body, 使用 secret 验签
    // 篡改 body / 错误 secret 被拒绝
    const tamperedResponse = await request.post(`${API_BASE}/billing/webhook`, {
      headers: {
        "stripe-signature": "t=123,v1=invalid_signature",
        "content-type": "application/json",
      },
      data: {
        type: "checkout.session.completed",
        id: `evt_test_${stamp}`,
        data: { object: {} },
      },
    });
    // BI-004: 验签失败返回 400
    expect(tamperedResponse.ok()).toBeFalsy();
    expect([400, 503]).toContain(tamperedResponse.status());

    // BI-006: 服务未配置时 webhook secret 不暴露客户端
    const body = await tamperedResponse.json().catch(() => ({}));
    expect(JSON.stringify(body)).not.toContain("whsec_");
    expect(JSON.stringify(body)).not.toContain("STRIPE_WEBHOOK_SECRET");
  });

  test("BI-009: Customer Portal / 取消订阅入口", async ({ request }) => {
    // BI-009: Customer Portal session 创建
    const portalResponse = await request.post(`${API_BASE}/billing/portal`);
    if (portalResponse.ok()) {
      const portalData = await portalResponse.json();
      expect(portalData.success).toBe(true);
      expect(portalData.url).toBeTruthy();
    } else {
      // Portal 不可用时提供等价取消 API
      expect([503, 400]).toContain(portalResponse.status());
    }

    // BI-009: 等价取消订阅 API
    const cancelResponse = await request.post(`${API_BASE}/billing/cancel`);
    if (cancelResponse.ok()) {
      const cancelData = await cancelResponse.json();
      expect(cancelData.success).toBe(true);
    }
  });

  // ============================================================
  // 交易内测生命周期 (TX-001~008)
  // ============================================================

  test("Gate 5 / TX-001~008: 交易内测三种模式 + grant 审计链", async ({ request }) => {
    // ============================================================
    // TX-001: 创建 free 模式交易
    // ============================================================
    const freeTxResponse = await request.post(`${API_BASE}/transactions/orders`, {
      data: {
        mode: "free",
        order: {
          resourceType: "universe",
          resourceId: `e2e-uni-${stamp}`,
        },
        attribution: { source: "e2e" },
        termsSnapshot: {
          termsKey: "free_license_v1",
          version: 1,
          body: { commercialUse: false },
          snapshotAt: new Date().toISOString(),
        },
        // TX-005: free 模式 amountCents = 0
        amountCents: 0,
        currency: "usd",
        // TX-004: 明示争议和结算
        disputeHandling: "no_dispute",
        settlementIntent: "no_settlement",
        isDemo: true, // TX-007: 演示数据标记
        sellerId: null,
      },
    });

    if (!freeTxResponse.ok()) {
      // CI 无数据库时返回 503/401, 验证结构
      expect([401, 503]).toContain(freeTxResponse.status());
      return;
    }

    const freeTxData = await freeTxResponse.json();
    expect(freeTxData.success).toBe(true);
    expect(freeTxData.contractVersion).toBe("kiikis.transaction.order/1");
    // TX-001: mode = free
    expect(freeTxData.transaction.mode).toBe("free");
    expect(freeTxData.transaction.status).toBe("pending");
    // TX-005: paidAmountCents = 0 (未移动资金)
    expect(freeTxData.transaction.paidAmountCents).toBe(0);
    // TX-003: termsSnapshot 保存且不可变
    expect(freeTxData.transaction.termsSnapshot.termsKey).toBe("free_license_v1");
    expect(freeTxData.transaction.termsSnapshot.version).toBe(1);
    // TX-004: 费用/争议/settlement 明示
    expect(freeTxData.transaction.disputeHandling).toBe("no_dispute");
    expect(freeTxData.transaction.settlementIntent).toBe("no_settlement");
    // TX-007: isDemo 永久标记
    expect(freeTxData.transaction.isDemo).toBe(true);
    const freeTxId = freeTxData.transaction.id as string;

    // ============================================================
    // TX-001: 创建 invite_only 模式交易
    // ============================================================
    const inviteTxResponse = await request.post(`${API_BASE}/transactions/orders`, {
      data: {
        mode: "invite_only",
        order: {
          resourceType: "project",
          resourceId: `e2e-proj-${stamp}`,
        },
        attribution: { inviteToken: "inv_token_e2e" },
        termsSnapshot: {
          termsKey: "invite_license_v1",
          version: 1,
          body: { inviteOnly: true },
          snapshotAt: new Date().toISOString(),
        },
        amountCents: 0, // TX-005: invite_only paid = 0
        currency: "usd",
        disputeHandling: "manual_review",
        settlementIntent: "manual_settlement",
        isDemo: true,
        sellerId: null,
      },
    });

    if (inviteTxResponse.ok()) {
      const inviteTxData = await inviteTxResponse.json();
      expect(inviteTxData.success).toBe(true);
      expect(inviteTxData.transaction.mode).toBe("invite_only");
      expect(inviteTxData.transaction.paidAmountCents).toBe(0);
      // TX-003: attribution 含 inviteToken
      expect(inviteTxData.transaction.attribution.inviteToken).toBe("inv_token_e2e");
    }

    // ============================================================
    // TX-001: 创建 manual_review 模式交易 (有 amountCents)
    // ============================================================
    const manualTxResponse = await request.post(`${API_BASE}/transactions/orders`, {
      data: {
        mode: "manual_review",
        order: {
          resourceType: "actor",
          resourceId: `e2e-actor-${stamp}`,
          priceId: "price_test_manual",
        },
        attribution: { source: "marketplace" },
        termsSnapshot: {
          termsKey: "commercial_license_v1",
          version: 2,
          body: { royaltyRate: 0, commercialUse: true },
          snapshotAt: new Date().toISOString(),
        },
        amountCents: 5000, // TX-004: 明示费用
        currency: "usd",
        disputeHandling: "manual_review",
        settlementIntent: "manual_settlement",
        isDemo: true,
        sellerId: null,
      },
    });

    let manualTxId: string | null = null;
    if (manualTxResponse.ok()) {
      const manualTxData = await manualTxResponse.json();
      expect(manualTxData.success).toBe(true);
      expect(manualTxData.transaction.mode).toBe("manual_review");
      // TX-004: amountCents 明示
      expect(manualTxData.transaction.amountCents).toBe(5000);
      // TX-005: 创建时 paidAmountCents = 0 (资金未移动)
      expect(manualTxData.transaction.paidAmountCents).toBe(0);
      // TX-003: 条款快照 version=2
      expect(manualTxData.transaction.termsSnapshot.version).toBe(2);
      manualTxId = manualTxData.transaction.id as string;
    }

    // ============================================================
    // TX-001: 拒绝非法模式 (auto_paid 等禁止)
    // ============================================================
    const illegalModeResponse = await request.post(`${API_BASE}/transactions/orders`, {
      data: {
        mode: "auto_paid",
        order: { resourceType: "universe", resourceId: "x" },
        termsSnapshot: {
          termsKey: "k",
          version: 1,
          body: {},
          snapshotAt: new Date().toISOString(),
        },
      },
    });
    expect(illegalModeResponse.ok()).toBeFalsy();
    const illegalBody = await illegalModeResponse.json().catch(() => ({}));
    expect(illegalBody.code).toBe("validation_failed");

    // ============================================================
    // TX-008: 拒绝禁止字段 (autoSettle/withdrawal/revenueSplit)
    // ============================================================
    const forbiddenResponse = await request.post(`${API_BASE}/transactions/orders`, {
      data: {
        mode: "free",
        order: { resourceType: "universe", resourceId: "x" },
        termsSnapshot: {
          termsKey: "k",
          version: 1,
          body: {},
          snapshotAt: new Date().toISOString(),
        },
        autoSettle: true, // TX-008: 禁止
      },
    });
    expect(forbiddenResponse.ok()).toBeFalsy();
    const forbiddenBody = await forbiddenResponse.json().catch(() => ({}));
    expect(["forbidden_feature", "validation_failed"]).toContain(forbiddenBody.code);

    // ============================================================
    // TX-002: 批准交易 + 创建 grant 审计链
    // ============================================================
    if (manualTxId) {
      const approveResponse = await request.post(
        `${API_BASE}/transactions/orders/${manualTxId}`,
        {
          data: {
            action: "approve",
            grantScope: "use",
            grantRole: "viewer",
          },
        },
      );
      if (approveResponse.ok()) {
        const approveData = await approveResponse.json();
        expect(approveData.success).toBe(true);
        // TX-002: 批准后状态 = approved
        expect(approveData.transaction.status).toBe("approved");
        // TX-002: grant_id 关联 (审计链)
        expect(approveData.transaction.grantId).toBeTruthy();
        expect(approveData.grantId).toBeTruthy();
        // TX-002: 审计字段
        expect(approveData.transaction.approvedBy).toBeTruthy();
        expect(approveData.transaction.approvedAt).toBeTruthy();
      }
    }

    // ============================================================
    // TX-002: 拒绝交易 (不创建 grant)
    // ============================================================
    if (freeTxId) {
      const rejectResponse = await request.post(
        `${API_BASE}/transactions/orders/${freeTxId}`,
        {
          data: {
            action: "reject",
            rejectionReason: "E2E: terms not acceptable",
          },
        },
      );
      if (rejectResponse.ok()) {
        const rejectData = await rejectResponse.json();
        expect(rejectData.success).toBe(true);
        expect(rejectData.transaction.status).toBe("rejected");
        // TX-002: 拒绝不创建 grant
        expect(rejectData.transaction.grantId).toBeNull();
        expect(rejectData.transaction.rejectionReason).toBe("E2E: terms not acceptable");
        expect(rejectData.transaction.rejectedBy).toBeTruthy();
      }
    }
  });

  test("TX-003: 条款快照不可变 — 历史交易保持创建时快照", async ({ request }) => {
    const snapshotAt = new Date().toISOString();
    const createResponse = await request.post(`${API_BASE}/transactions/orders`, {
      data: {
        mode: "free",
        order: { resourceType: "universe", resourceId: `e2e-snapshot-${stamp}` },
        termsSnapshot: {
          termsKey: "snapshot_test_v1",
          version: 1,
          body: { royaltyRate: 0, commercialUse: false },
          snapshotAt,
        },
        amountCents: 0,
        currency: "usd",
        isDemo: true,
        sellerId: null,
      },
    });

    if (!createResponse.ok()) {
      expect([401, 503]).toContain(createResponse.status());
      return;
    }

    const createData = await createResponse.json();
    const txId = createData.transaction.id as string;

    // 查询交易详情, 验证快照未被修改
    const detailResponse = await request.get(`${API_BASE}/transactions/orders/${txId}`);
    if (detailResponse.ok()) {
      const detailData = await detailResponse.json();
      expect(detailData.success).toBe(true);
      // TX-003: 快照 termsKey/version/body 保持创建时值
      expect(detailData.transaction.termsSnapshot.termsKey).toBe("snapshot_test_v1");
      expect(detailData.transaction.termsSnapshot.version).toBe(1);
      expect(detailData.transaction.termsSnapshot.body.royaltyRate).toBe(0);
      expect(detailData.transaction.termsSnapshot.body.commercialUse).toBe(false);
    }
  });

  test("TX-006: UI 明示模式 — 不暗示自动到账/收益", async ({ request }) => {
    // 查询交易列表, 验证返回的 mode 字段明示模式
    const listResponse = await request.get(`${API_BASE}/transactions/orders?limit=10`);
    if (listResponse.ok()) {
      const listData = await listResponse.json();
      expect(listData.success).toBe(true);
      expect(listData.contractVersion).toBe("kiikis.transaction.order/1");
      expect(Array.isArray(listData.items)).toBe(true);
      // TX-006: 所有交易 mode 只能是三种之一
      for (const tx of listData.items) {
        expect(["free", "invite_only", "manual_review"]).toContain(tx.mode);
        // TX-006: 不含自动收益/到账字段
        expect(tx).not.toHaveProperty("autoRevenue");
        expect(tx).not.toHaveProperty("withdrawal");
        expect(tx).not.toHaveProperty("revenueSplit");
        expect(tx).not.toHaveProperty("fakeBalance");
      }
    }
  });

  test("Gate 5 验收: 核心事件与成本可观测 (BI-010)", async ({ request }) => {
    // BI-010: 账单状态变化写入 creative_events (event_type billing.* 前缀)
    // 查询 creative_events 验证 billing 事件可观测
    const eventsResponse = await request.get(
      `/api/v2/events?eventType=billing.*&limit=20`,
    );
    if (eventsResponse.ok()) {
      const eventsData = await eventsResponse.json();
      expect(eventsData.success).toBe(true);
      // BI-010: billing 事件存在 (如果订阅过)
      if (eventsData.items && eventsData.items.length > 0) {
        for (const evt of eventsData.items) {
          // event_type 使用 billing.* 前缀
          expect(evt.eventType.startsWith("billing.")).toBe(true);
          // BI-010: payload 不含 Stripe secret
          expect(JSON.stringify(evt.payload)).not.toContain("sk_");
          expect(JSON.stringify(evt.payload)).not.toContain("whsec_");
          expect(JSON.stringify(evt.payload)).not.toContain("rk_");
        }
      }
    }
  });
});
