/**
 * tests/kiikis-21-transactions.test.mjs
 * KIIKIS 2.1 Phase 6 — Task 6.3 交易内测测试 (TX-001~008)
 *
 * 覆盖:
 *   TX-001: 只开放 free/invite_only/manual_review 三种模式
 *   TX-002: 每个批准结果创建真实、可审计 grant
 *   TX-003: 保存 order、attribution 和创建时条款快照 (不可变)
 *   TX-004: 明示费用、争议和 settlement intent
 *   TX-005: 未移动资金时 paid_amount = 0
 *   TX-006: UI 明示模式 (显示文案)
 *   TX-007: staging/prod 默认关闭 fixture, 演示数据 is_demo = true
 *   TX-008: 禁止自动收益/提现/分账
 *
 * 测试策略:
 *   - 契约校验 (validateCreateTransaction / validateTermsSnapshot)
 *   - 纯函数 (isUnfunded / getModeDisplayLabel / freezeTermsSnapshot)
 *   - 服务层 mock fetcher (createTransaction / approveTransaction / rejectTransaction)
 *   - TX-002 批准关联 grant_id 审计链
 *   - TX-008 禁止字段拦截
 *   - migration + route 文件存在
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  TRANSACTION_MODES,
  TRANSACTION_STATUS,
  DISPUTE_HANDLING,
  SETTLEMENT_INTENTS,
  DEMO_MARKERS,
  FORBIDDEN_FEATURES,
  validateCreateTransaction,
  validateTermsSnapshot,
  freezeTermsSnapshot,
  isTransactionMode,
  isTransactionStatus,
  isDisputeHandling,
  isSettlementIntent,
  parseTransaction,
  isUnfunded,
  getModeDisplayLabel,
  getModeDisplayLabelZh,
  getSettlementIntentLabel,
  TransactionValidationError,
} from "../lib/contracts/v2/transactions.ts";
import {
  createTransaction,
  approveTransaction,
  rejectTransaction,
  getTransaction,
  listTransactionsByBuyer,
  listPendingTransactions,
  TransactionServiceError,
} from "../lib/server/v2/transactions/orders.ts";

// ============================================================
// Helpers — Mock fetcher
// ============================================================

function makeMockFetcher(handlers) {
  return async (fetchPath, init) => {
    for (const h of handlers) {
      if (h.match(fetchPath, init)) {
        return h.respond(fetchPath, init);
      }
    }
    throw Object.assign(new Error(`no handler for ${fetchPath}`), { status: 503 });
  };
}

const sampleTermsSnapshot = {
  termsKey: "creator_license_v1",
  version: 1,
  body: { royaltyRate: 0, commercialUse: false, attribution: "required" },
  snapshotAt: "2026-08-14T00:00:00Z",
};

const sampleOrder = {
  resourceType: "universe",
  resourceId: "uni-123",
  priceId: null,
  planTier: null,
  quantity: 1,
};

const sampleTransactionRow = {
  id: "tx-1",
  mode: "free",
  status: "pending",
  order_info: sampleOrder,
  attribution: { source: "web" },
  terms_snapshot: sampleTermsSnapshot,
  amount_cents: 0,
  currency: "usd",
  paid_amount_cents: 0,
  dispute_handling: "manual_review",
  settlement_intent: "manual_settlement",
  is_demo: false,
  grant_id: null,
  buyer_id: "user-A",
  seller_id: "user-B",
  approved_at: null,
  approved_by: null,
  rejected_at: null,
  rejected_by: null,
  rejection_reason: null,
  created_at: "2026-08-14T00:00:00Z",
  updated_at: "2026-08-14T00:00:00Z",
};

const ROOT = path.resolve(import.meta.dirname, "..");

// ============================================================
// 1. 契约常量 (TX-001, TX-004, TX-008)
// ============================================================

test("TX-001: TRANSACTION_MODES 只含 free/invite_only/manual_review", () => {
  assert.deepEqual([...TRANSACTION_MODES], ["free", "invite_only", "manual_review"]);
  // 不含自动付费/自动分账模式
  assert.ok(!TRANSACTION_MODES.includes("auto_paid"));
  assert.ok(!TRANSACTION_MODES.includes("auto_split"));
  assert.ok(!TRANSACTION_MODES.includes("auto_settlement"));
});

test("TX-004: DISPUTE_HANDLING 含 manual_review/no_dispute", () => {
  assert.deepEqual([...DISPUTE_HANDLING], ["manual_review", "no_dispute"]);
});

test("TX-004/TX-008: SETTLEMENT_INTENTS 不含 auto_settlement", () => {
  assert.deepEqual([...SETTLEMENT_INTENTS], ["manual_settlement", "no_settlement"]);
  assert.ok(!SETTLEMENT_INTENTS.includes("auto_settlement"));
});

test("TX-007: DEMO_MARKERS 永久标记 isDemo", () => {
  assert.equal(DEMO_MARKERS.isDemo, true);
  assert.equal(DEMO_MARKERS.demoLabel, "DEMO");
});

test("TX-008: FORBIDDEN_FEATURES 列出禁止的功能", () => {
  assert.ok(FORBIDDEN_FEATURES.includes("auto_revenue_calculation"));
  assert.ok(FORBIDDEN_FEATURES.includes("withdrawal"));
  assert.ok(FORBIDDEN_FEATURES.includes("auto_revenue_split"));
  assert.ok(FORBIDDEN_FEATURES.includes("fake_balance_display"));
});

test("TX-001: isTransactionMode 类型守卫", () => {
  assert.equal(isTransactionMode("free"), true);
  assert.equal(isTransactionMode("invite_only"), true);
  assert.equal(isTransactionMode("manual_review"), true);
  assert.equal(isTransactionMode("auto_paid"), false);
  assert.equal(isTransactionMode(""), false);
});

test("isTransactionStatus 类型守卫", () => {
  assert.equal(isTransactionStatus("pending"), true);
  assert.equal(isTransactionStatus("approved"), true);
  assert.equal(isTransactionStatus("rejected"), true);
  assert.equal(isTransactionStatus("canceled"), true);
  assert.equal(isTransactionStatus("refunded"), false);
});

// ============================================================
// 2. TX-003: 条款快照校验与不可变性
// ============================================================

test("TX-003: validateTermsSnapshot 校验完整性", () => {
  const valid = validateTermsSnapshot(sampleTermsSnapshot);
  assert.equal(valid.termsKey, "creator_license_v1");
  assert.equal(valid.version, 1);
  assert.ok(Object.isFrozen(valid));
  assert.ok(Object.isFrozen(valid.body));
});

test("TX-003: validateTermsSnapshot 拒绝缺失 termsKey", () => {
  assert.throws(
    () => validateTermsSnapshot({ ...sampleTermsSnapshot, termsKey: "" }),
    (err) => err instanceof TransactionValidationError && err.code === "missing_terms_key",
  );
});

test("TX-003: validateTermsSnapshot 拒绝非正整数 version", () => {
  assert.throws(
    () => validateTermsSnapshot({ ...sampleTermsSnapshot, version: 0 }),
    (err) => err instanceof TransactionValidationError && err.code === "invalid_version",
  );
  assert.throws(
    () => validateTermsSnapshot({ ...sampleTermsSnapshot, version: -1 }),
    (err) => err instanceof TransactionValidationError && err.code === "invalid_version",
  );
});

test("TX-003: validateTermsSnapshot 拒绝非法 snapshotAt", () => {
  assert.throws(
    () => validateTermsSnapshot({ ...sampleTermsSnapshot, snapshotAt: "not-a-date" }),
    (err) => err instanceof TransactionValidationError && err.code === "invalid_snapshot_at",
  );
});

test("TX-003: freezeTermsSnapshot 冻结 body", () => {
  const frozen = freezeTermsSnapshot(sampleTermsSnapshot);
  assert.ok(Object.isFrozen(frozen));
  assert.ok(Object.isFrozen(frozen.body));
  assert.throws(() => {
    frozen.body.royaltyRate = 999;
  });
});

// ============================================================
// 3. validateCreateTransaction (TX-001, TX-003, TX-004, TX-005, TX-008)
// ============================================================

function makeValidInput(overrides = {}) {
  return {
    mode: "free",
    order: { ...sampleOrder },
    attribution: { source: "web" },
    termsSnapshot: { ...sampleTermsSnapshot },
    amountCents: 0,
    currency: "usd",
    disputeHandling: "manual_review",
    settlementIntent: "manual_settlement",
    isDemo: false,
    buyerId: "user-A",
    sellerId: "user-B",
    idempotencyKey: "tx:test:1",
    ...overrides,
  };
}

test("TX-001: validateCreateTransaction 接受三种合法模式", () => {
  for (const mode of TRANSACTION_MODES) {
    const overrides = mode === "free" ? {} : { buyerId: "user-A" };
    const input = makeValidInput({ mode, ...overrides });
    const validated = validateCreateTransaction(input);
    assert.equal(validated.mode, mode);
    assert.ok(Object.isFrozen(validated));
    assert.ok(Object.isFrozen(validated.order));
    assert.ok(Object.isFrozen(validated.termsSnapshot));
  }
});

test("TX-001: validateCreateTransaction 拒绝非法 mode", () => {
  assert.throws(
    () => validateCreateTransaction(makeValidInput({ mode: "auto_paid" })),
    (err) => err instanceof TransactionValidationError && err.code === "invalid_mode",
  );
});

test("TX-008: validateCreateTransaction 拒绝 autoSettle", () => {
  assert.throws(
    () => validateCreateTransaction(makeValidInput({ autoSettle: true })),
    (err) => err instanceof TransactionValidationError && err.code === "forbidden_auto_settle",
  );
});

test("TX-003: validateCreateTransaction 拒绝缺失 order.resourceType", () => {
  assert.throws(
    () => validateCreateTransaction(makeValidInput({ order: { resourceId: "x" } })),
    (err) => err instanceof TransactionValidationError && err.code === "missing_order_resource_type",
  );
});

test("TX-003: validateCreateTransaction 拒绝缺失 order.resourceId", () => {
  assert.throws(
    () => validateCreateTransaction(makeValidInput({ order: { resourceType: "universe" } })),
    (err) => err instanceof TransactionValidationError && err.code === "missing_order_resource_id",
  );
});

test("TX-005: free 模式拒绝 amountCents > 0", () => {
  assert.throws(
    () => validateCreateTransaction(makeValidInput({ mode: "free", amountCents: 100 })),
    (err) => err instanceof TransactionValidationError && err.code === "invalid_amount_for_mode",
  );
});

test("TX-005: invite_only 模式拒绝 amountCents > 0", () => {
  assert.throws(
    () =>
      validateCreateTransaction(
        makeValidInput({ mode: "invite_only", amountCents: 500 }),
      ),
    (err) => err instanceof TransactionValidationError && err.code === "invalid_amount_for_mode",
  );
});

test("TX-005: manual_review 模式允许 amountCents > 0 (资金未移动前 paid=0)", () => {
  const validated = validateCreateTransaction(
    makeValidInput({ mode: "manual_review", amountCents: 1000 }),
  );
  assert.equal(validated.amountCents, 1000);
});

test("TX-005: validateCreateTransaction 拒绝负 amountCents", () => {
  assert.throws(
    () => validateCreateTransaction(makeValidInput({ amountCents: -1 })),
    (err) => err instanceof TransactionValidationError && err.code === "invalid_amount",
  );
});

test("TX-001: invite_only/manual_review 模式必须有 buyerId", () => {
  assert.throws(
    () =>
      validateCreateTransaction(
        makeValidInput({ mode: "invite_only", buyerId: null }),
      ),
    (err) => err instanceof TransactionValidationError && err.code === "missing_buyer",
  );
  assert.throws(
    () =>
      validateCreateTransaction(
        makeValidInput({ mode: "manual_review", buyerId: null }),
      ),
    (err) => err instanceof TransactionValidationError && err.code === "missing_buyer",
  );
});

test("TX-001: free 模式允许无 buyerId (匿名)", () => {
  const validated = validateCreateTransaction(
    makeValidInput({ mode: "free", buyerId: null }),
  );
  assert.equal(validated.buyerId, null);
});

test("validateCreateTransaction 拒绝缺失 idempotencyKey", () => {
  assert.throws(
    () => validateCreateTransaction(makeValidInput({ idempotencyKey: "" })),
    (err) => err instanceof TransactionValidationError && err.code === "missing_idempotency_key",
  );
});

// ============================================================
// 4. parseTransaction (TX-003, TX-005)
// ============================================================

test("parseTransaction 正确映射 DB row → 实体 (snake → camelCase)", () => {
  const tx = parseTransaction(sampleTransactionRow);
  assert.equal(tx.id, "tx-1");
  assert.equal(tx.mode, "free");
  assert.equal(tx.status, "pending");
  assert.equal(tx.orderInfo.resourceType, "universe");
  assert.equal(tx.attribution.source, "web");
  assert.equal(tx.termsSnapshot.termsKey, "creator_license_v1");
  assert.equal(tx.amountCents, 0);
  assert.equal(tx.currency, "usd");
  assert.equal(tx.paidAmountCents, 0);
  assert.equal(tx.disputeHandling, "manual_review");
  assert.equal(tx.settlementIntent, "manual_settlement");
  assert.equal(tx.isDemo, false);
  assert.equal(tx.grantId, null);
  assert.equal(tx.buyerId, "user-A");
  assert.equal(tx.sellerId, "user-B");
  assert.ok(Object.isFrozen(tx));
  assert.ok(Object.isFrozen(tx.termsSnapshot));
  assert.ok(Object.isFrozen(tx.termsSnapshot.body));
});

test("TX-003: parseTransaction 冻结 termsSnapshot.body 防止篡改", () => {
  const tx = parseTransaction(sampleTransactionRow);
  assert.throws(() => {
    tx.termsSnapshot.body.royaltyRate = 999;
  });
});

// ============================================================
// 5. TX-005: isUnfunded 模式与 paid_amount 关系
// ============================================================

test("TX-005: isUnfunded — free 模式永远 unfunded", () => {
  const tx = parseTransaction({ ...sampleTransactionRow, mode: "free", paid_amount_cents: 0 });
  assert.equal(isUnfunded(tx), true);
});

test("TX-005: isUnfunded — invite_only 模式永远 unfunded", () => {
  const tx = parseTransaction({
    ...sampleTransactionRow,
    mode: "invite_only",
    paid_amount_cents: 0,
  });
  assert.equal(isUnfunded(tx), true);
});

test("TX-005: isUnfunded — manual_review paid_amount=0 视为未移动资金", () => {
  const tx = parseTransaction({
    ...sampleTransactionRow,
    mode: "manual_review",
    paid_amount_cents: 0,
  });
  assert.equal(isUnfunded(tx), true);
});

test("TX-005: isUnfunded — manual_review paid_amount>0 视为已移动资金", () => {
  const tx = parseTransaction({
    ...sampleTransactionRow,
    mode: "manual_review",
    paid_amount_cents: 500,
  });
  assert.equal(isUnfunded(tx), false);
});

// ============================================================
// 6. TX-006: UI 显示文案
// ============================================================

test("TX-006: getModeDisplayLabel 英文文案", () => {
  assert.equal(getModeDisplayLabel("free"), "Free");
  assert.equal(getModeDisplayLabel("invite_only"), "Invite Only");
  assert.equal(getModeDisplayLabel("manual_review"), "Manual Review");
});

test("TX-006: getModeDisplayLabelZh 中文文案", () => {
  assert.equal(getModeDisplayLabelZh("free"), "免费");
  assert.equal(getModeDisplayLabelZh("invite_only"), "邀请制");
  assert.equal(getModeDisplayLabelZh("manual_review"), "人工审核");
});

test("TX-006: 文案不暗示自动到账/自动收益", () => {
  const allLabels = [
    ...TRANSACTION_MODES.map(getModeDisplayLabel),
    ...TRANSACTION_MODES.map(getModeDisplayLabelZh),
  ];
  for (const label of allLabels) {
    assert.ok(!/auto|automatic|收益|到账|提现/i.test(label), `label "${label}" should not imply auto/revenue`);
  }
});

test("TX-004: getSettlementIntentLabel 文案", () => {
  assert.equal(getSettlementIntentLabel("manual_settlement"), "Manual Settlement");
  assert.equal(getSettlementIntentLabel("no_settlement"), "No Settlement");
  assert.ok(!SETTLEMENT_INTENTS.includes("auto_settlement"));
});

// ============================================================
// 7. 服务层 — createTransaction (mock fetcher)
// ============================================================

test("TX-001/TX-003/TX-005: createTransaction 调用 RPC 并返回冻结实体", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_transaction"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return Promise.resolve({ ...sampleTransactionRow });
      },
    },
  ]);

  const tx = await createTransaction(fetcher, makeValidInput({ mode: "free" }));

  assert.equal(tx.id, "tx-1");
  assert.equal(tx.mode, "free");
  assert.equal(tx.paidAmountCents, 0);
  assert.ok(Object.isFrozen(tx));
  // 校验 RPC 入参
  assert.equal(receivedBody.p_mode, "free");
  assert.equal(receivedBody.p_amount_cents, 0);
  assert.equal(receivedBody.p_is_demo, false);
  assert.equal(receivedBody.p_buyer_id, "user-A");
});

test("TX-005: createTransaction 创建时 paid_amount_cents 强制为 0 (DB 默认)", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_transaction"),
      respond: (p, init) => {
        const body = JSON.parse(init.body);
        // DB RPC 总是写入 paid_amount=0 (TX-005), amount_cents 保留输入值
        return Promise.resolve({
          ...sampleTransactionRow,
          mode: body.p_mode,
          amount_cents: body.p_amount_cents,
          paid_amount_cents: 0,
        });
      },
    },
  ]);

  // manual_review 模式 amountCents=1000, 但 paid_amount_cents 必须为 0
  const tx = await createTransaction(
    fetcher,
    makeValidInput({ mode: "manual_review", amountCents: 1000 }),
  );
  assert.equal(tx.amountCents, 1000);
  assert.equal(tx.paidAmountCents, 0); // TX-005: 未移动资金
  assert.ok(isUnfunded(tx));
});

test("createTransaction 校验失败时抛 TransactionServiceError (validation_failed)", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    createTransaction(fetcher, makeValidInput({ mode: "auto_paid" })),
    (err) => err instanceof TransactionServiceError && err.code === "validation_failed" && err.status === 400,
  );
});

test("TX-008: createTransaction 拒绝 forbidden 字段 (forbidden_feature)", async () => {
  const fetcher = makeMockFetcher([]);
  // 构造含禁止字段的 input (绕过契约校验直接传给服务)
  await assert.rejects(
    createTransaction(fetcher, {
      ...makeValidInput({ mode: "free" }),
      autoSettle: true,
    }),
    (err) =>
      err instanceof TransactionServiceError &&
      (err.code === "validation_failed" || err.code === "forbidden_feature"),
  );
});

test("createTransaction fetcher 失败抛 service_unavailable", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_transaction"),
      respond: () => Promise.reject(new Error("network down")),
    },
  ]);
  await assert.rejects(
    createTransaction(fetcher, makeValidInput({ mode: "free" })),
    (err) => err instanceof TransactionServiceError && err.code === "service_unavailable" && err.status === 503,
  );
});

// ============================================================
// 8. TX-002: approveTransaction (批准关联 grant_id 审计链)
// ============================================================

test("TX-002: approveTransaction 调用 RPC 并关联 grant_id", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/approve_transaction"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return Promise.resolve({
          ...sampleTransactionRow,
          status: "approved",
          grant_id: "grant-xyz",
          approved_at: "2026-08-14T01:00:00Z",
          approved_by: "user-B",
        });
      },
    },
  ]);

  const approved = await approveTransaction(fetcher, {
    transactionId: "tx-1",
    approverId: "user-B",
    grantId: "grant-xyz",
  });

  assert.equal(approved.status, "approved");
  assert.equal(approved.grantId, "grant-xyz");
  assert.equal(approved.approvedBy, "user-B");
  assert.ok(Object.isFrozen(approved));
  // 审计链: RPC 入参含 transaction_id + approver_id + grant_id
  assert.equal(receivedBody.p_transaction_id, "tx-1");
  assert.equal(receivedBody.p_approver_id, "user-B");
  assert.equal(receivedBody.p_grant_id, "grant-xyz");
});

test("TX-002: approveTransaction 无 grant_id 时允许 (不创建 grant 的场景)", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/approve_transaction"),
      respond: (p, init) => {
        const body = JSON.parse(init.body);
        return Promise.resolve({
          ...sampleTransactionRow,
          status: "approved",
          grant_id: body.p_grant_id,
          approved_by: body.p_approver_id,
        });
      },
    },
  ]);

  const approved = await approveTransaction(fetcher, {
    transactionId: "tx-1",
    approverId: "user-B",
    grantId: null,
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.grantId, null);
});

test("approveTransaction 缺失 transactionId 抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    approveTransaction(fetcher, { transactionId: "", approverId: "user-B" }),
    (err) => err instanceof TransactionServiceError && err.code === "validation_failed",
  );
});

test("approveTransaction 缺失 approverId 抛 unauthenticated", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    approveTransaction(fetcher, { transactionId: "tx-1", approverId: "" }),
    (err) => err instanceof TransactionServiceError && err.code === "unauthenticated" && err.status === 401,
  );
});

// ============================================================
// 9. rejectTransaction
// ============================================================

test("rejectTransaction 调用 RPC 并记录拒绝原因", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/reject_transaction"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return Promise.resolve({
          ...sampleTransactionRow,
          status: "rejected",
          rejection_reason: receivedBody.p_rejection_reason,
          rejected_by: receivedBody.p_rejecter_id,
          rejected_at: "2026-08-14T02:00:00Z",
        });
      },
    },
  ]);

  const rejected = await rejectTransaction(fetcher, {
    transactionId: "tx-1",
    rejecterId: "user-B",
    rejectionReason: "terms not acceptable",
  });

  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.rejectionReason, "terms not acceptable");
  assert.equal(rejected.rejectedBy, "user-B");
  assert.ok(Object.isFrozen(rejected));
  assert.equal(receivedBody.p_transaction_id, "tx-1");
  assert.equal(receivedBody.p_rejecter_id, "user-B");
  assert.equal(receivedBody.p_rejection_reason, "terms not acceptable");
});

test("rejectTransaction 缺失 rejecterId 抛 unauthenticated", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    rejectTransaction(fetcher, { transactionId: "tx-1", rejecterId: "" }),
    (err) => err instanceof TransactionServiceError && err.code === "unauthenticated",
  );
});

// ============================================================
// 10. 查询服务
// ============================================================

test("getTransaction 返回实体或 null", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_transactions?id=eq"),
      respond: () => Promise.resolve([{ ...sampleTransactionRow }]),
    },
  ]);
  const tx = await getTransaction(fetcher, "tx-1");
  assert.equal(tx.id, "tx-1");

  const emptyFetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_transactions?id=eq"),
      respond: () => Promise.resolve([]),
    },
  ]);
  const none = await getTransaction(emptyFetcher, "missing");
  assert.equal(none, null);
});

test("getTransaction 缺失 id 抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    getTransaction(fetcher, ""),
    (err) => err instanceof TransactionServiceError && err.code === "validation_failed",
  );
});

test("listTransactionsByBuyer 构造正确查询路径", async () => {
  let receivedPath = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_transactions?buyer_id=eq"),
      respond: (p) => {
        receivedPath = p;
        return Promise.resolve([{ ...sampleTransactionRow }]);
      },
    },
  ]);
  const items = await listTransactionsByBuyer(fetcher, "user-A", { status: "pending", limit: 10 });
  assert.equal(items.length, 1);
  assert.ok(receivedPath.includes("buyer_id=eq.user-A"));
  assert.ok(receivedPath.includes("status=eq.pending"));
  assert.ok(receivedPath.includes("limit=10"));
});

test("listTransactionsByBuyer 缺失 buyerId 抛 unauthenticated", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    listTransactionsByBuyer(fetcher, ""),
    (err) => err instanceof TransactionServiceError && err.code === "unauthenticated",
  );
});

test("TX-007: listPendingTransactions 构造 pending 查询路径", async () => {
  let receivedPath = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_transactions?status=eq.pending"),
      respond: (p) => {
        receivedPath = p;
        return Promise.resolve([{ ...sampleTransactionRow, status: "pending" }]);
      },
    },
  ]);
  const items = await listPendingTransactions(fetcher, { mode: "manual_review", limit: 20 });
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "pending");
  assert.ok(receivedPath.includes("status=eq.pending"));
  assert.ok(receivedPath.includes("mode=eq.manual_review"));
  assert.ok(receivedPath.includes("limit=20"));
});

// ============================================================
// 11. TX-003: 条款快照不可变性 (变更后历史交易保持原快照)
// ============================================================

test("TX-003: 条款模板变更后历史交易快照不变", () => {
  // 模拟: 交易创建时快照 version=1
  const txV1 = parseTransaction({
    ...sampleTransactionRow,
    terms_snapshot: { ...sampleTermsSnapshot, version: 1, body: { royaltyRate: 0 } },
  });

  // 条款模板后续变更到 version=2 (royaltyRate=10)
  // 但历史交易 txV1 的快照仍保持 version=1 + royaltyRate=0
  assert.equal(txV1.termsSnapshot.version, 1);
  assert.equal(txV1.termsSnapshot.body.royaltyRate, 0);
  assert.ok(Object.isFrozen(txV1.termsSnapshot));
  assert.ok(Object.isFrozen(txV1.termsSnapshot.body));
});

// ============================================================
// 12. TX-007: 演示数据永久标记
// ============================================================

test("TX-007: is_demo=true 演示数据永久标记", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_transaction"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return Promise.resolve({
          ...sampleTransactionRow,
          is_demo: true,
        });
      },
    },
  ]);

  const tx = await createTransaction(
    fetcher,
    makeValidInput({ mode: "free", isDemo: true }),
  );
  assert.equal(tx.isDemo, true);
  assert.equal(receivedBody.p_is_demo, true);
});

test("TX-007: 默认 is_demo=false (非演示数据)", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_transaction"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return Promise.resolve({ ...sampleTransactionRow, is_demo: false });
      },
    },
  ]);

  const tx = await createTransaction(fetcher, makeValidInput({ mode: "free" }));
  assert.equal(tx.isDemo, false);
  assert.equal(receivedBody.p_is_demo, false);
});

// ============================================================
// 13. 交付文件存在性检查
// ============================================================

test("TX migration 文件存在", () => {
  const p = path.join(ROOT, "supabase/migrations/20260827060100_kiikis_21_transactions.sql");
  assert.ok(fs.existsSync(p), `migration should exist: ${p}`);
});

test("TX migration 含关键元素", () => {
  const p = path.join(ROOT, "supabase/migrations/20260827060100_kiikis_21_transactions.sql");
  const content = fs.readFileSync(p, "utf8");
  assert.ok(content.includes("storyflow_transactions"), "TX table");
  assert.ok(content.includes("'free', 'invite_only', 'manual_review'"), "TX-001 modes check");
  assert.ok(content.includes("paid_amount_cents"), "TX-005 paid amount");
  assert.ok(content.includes("is_demo"), "TX-007 demo marker");
  assert.ok(content.includes("grant_id"), "TX-002 grant id");
  assert.ok(content.includes("terms_snapshot"), "TX-003 terms snapshot");
  assert.ok(content.includes("settlement_intent"), "TX-004 settlement intent");
  assert.ok(content.includes("ENABLE ROW LEVEL SECURITY"), "RLS");
  assert.ok(content.includes("create_transaction"), "RPC create");
  assert.ok(content.includes("approve_transaction"), "RPC approve");
  assert.ok(content.includes("reject_transaction"), "RPC reject");
  assert.ok(content.includes("SECURITY DEFINER"), "SECURITY DEFINER");
  assert.ok(content.includes("idempotency_key"), "idempotency");
  // TX-008: 注释明确禁止自动收益/提现/分账
  assert.ok(/禁止.*自动收益|auto.*revenue/i.test(content), "TX-008 forbidden note");
});

test("TX contract 文件存在且导出关键符号", () => {
  const p = path.join(ROOT, "lib/contracts/v2/transactions.ts");
  assert.ok(fs.existsSync(p));
  const content = fs.readFileSync(p, "utf8");
  assert.ok(content.includes("TRANSACTION_MODES"));
  assert.ok(content.includes("validateCreateTransaction"));
  assert.ok(content.includes("isUnfunded"));
  assert.ok(content.includes("FORBIDDEN_FEATURES"));
  assert.ok(content.includes("DEMO_MARKERS"));
});

test("TX service 文件存在且导出关键符号", () => {
  const p = path.join(ROOT, "lib/server/v2/transactions/orders.ts");
  assert.ok(fs.existsSync(p));
  const content = fs.readFileSync(p, "utf8");
  assert.ok(content.includes("createTransaction"));
  assert.ok(content.includes("approveTransaction"));
  assert.ok(content.includes("rejectTransaction"));
  assert.ok(content.includes("getTransaction"));
  assert.ok(content.includes("listPendingTransactions"));
  assert.ok(content.includes("TransactionServiceError"));
});

test("TX API route 文件存在", () => {
  const listRoute = path.join(ROOT, "app/api/v2/transactions/orders/route.ts");
  const detailRoute = path.join(ROOT, "app/api/v2/transactions/orders/[id]/route.ts");
  assert.ok(fs.existsSync(listRoute), "orders list/create route");
  assert.ok(fs.existsSync(detailRoute), "orders detail route");

  const listContent = fs.readFileSync(listRoute, "utf8");
  assert.ok(listContent.includes("isTransactionMode"), "TX-001 mode validation in route");
  assert.ok(listContent.includes("kiikis.transaction.order/1"), "contract version");

  const detailContent = fs.readFileSync(detailRoute, "utf8");
  assert.ok(detailContent.includes("approveTransaction"), "TX-002 approve in route");
  assert.ok(detailContent.includes("createGrant"), "TX-002 grant creation in route");
  assert.ok(detailContent.includes("kiikis.transaction.order/1"), "contract version");
});

// ============================================================
// 14. TX-008: 禁止功能不存在性验证
// ============================================================

test("TX-008: contract 层不包含自动收益/提现/分账函数", () => {
  const p = path.join(ROOT, "lib/contracts/v2/transactions.ts");
  const content = fs.readFileSync(p, "utf8");
  // 不应出现这些函数名
  assert.ok(!/function\s+calculateAutoRevenue/.test(content));
  assert.ok(!/function\s+processWithdrawal/.test(content));
  assert.ok(!/function\s+autoSplitRevenue/.test(content));
  assert.ok(!/function\s+displayFakeBalance/.test(content));
  // FORBIDDEN_FEATURES 列表明确禁止
  assert.ok(content.includes("auto_revenue_calculation"));
  assert.ok(content.includes("withdrawal"));
  assert.ok(content.includes("auto_revenue_split"));
  assert.ok(content.includes("fake_balance_display"));
});

test("TX-008: service 层不包含提现/分账/自动收益功能", () => {
  const p = path.join(ROOT, "lib/server/v2/transactions/orders.ts");
  const content = fs.readFileSync(p, "utf8");
  assert.ok(!/function\s+withdraw/.test(content));
  assert.ok(!/function\s+splitRevenue/.test(content));
  assert.ok(!/function\s+calculateRevenue/.test(content));
  // 明确拒绝 forbidden 字段
  assert.ok(content.includes("forbidden_feature"));
  assert.ok(content.includes("autoSettle"));
});

test("TX-008: migration 不含提现/分账/自动收益表/字段", () => {
  const p = path.join(ROOT, "supabase/migrations/20260827060100_kiikis_21_transactions.sql");
  const content = fs.readFileSync(p, "utf8");
  assert.ok(!/withdrawal_table|withdrawal_log/.test(content));
  assert.ok(!/revenue_split|auto_revenue/.test(content));
  assert.ok(!/fake_balance|displayed_balance/.test(content));
});

test("TX-008: SETTLEMENT_INTENTS 不含 auto_settlement (禁止自动结算)", () => {
  assert.ok(!SETTLEMENT_INTENTS.includes("auto_settlement"));
  assert.ok(!SETTLEMENT_INTENTS.includes("auto_payout"));
});

// ============================================================
// 15. 集成场景: 创建 → 批准 → grant 审计链
// ============================================================

test("TX-002 集成: 创建 pending → 批准 → grant_id 关联 + 状态 approved", async () => {
  const createdRow = { ...sampleTransactionRow, mode: "invite_only", status: "pending" };
  const approvedRow = {
    ...createdRow,
    status: "approved",
    grant_id: "grant-tx-1",
    approved_at: "2026-08-14T03:00:00Z",
    approved_by: "user-B",
  };

  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_transaction"),
      respond: () => Promise.resolve(createdRow),
    },
    {
      match: (p) => p.includes("/rpc/approve_transaction"),
      respond: () => Promise.resolve(approvedRow),
    },
    {
      match: (p) => p.includes("/rest/v1/storyflow_transactions?id=eq"),
      respond: () => Promise.resolve([approvedRow]),
    },
  ]);

  // 1. 创建
  const created = await createTransaction(
    fetcher,
    makeValidInput({ mode: "invite_only", buyerId: "user-A", sellerId: "user-B" }),
  );
  assert.equal(created.status, "pending");
  assert.equal(created.grantId, null);

  // 2. 批准 (关联 grant)
  const approved = await approveTransaction(fetcher, {
    transactionId: created.id,
    approverId: "user-B",
    grantId: "grant-tx-1",
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.grantId, "grant-tx-1");
  assert.equal(approved.approvedBy, "user-B");

  // 3. 查询确认审计链
  const fetched = await getTransaction(fetcher, approved.id);
  assert.equal(fetched.status, "approved");
  assert.equal(fetched.grantId, "grant-tx-1");
});

test("TX-002 集成: 创建 pending → 拒绝 (不创建 grant)", async () => {
  const createdRow = { ...sampleTransactionRow, mode: "manual_review", status: "pending" };
  const rejectedRow = {
    ...createdRow,
    status: "rejected",
    rejection_reason: "resource unavailable",
    rejected_by: "user-B",
    rejected_at: "2026-08-14T04:00:00Z",
  };

  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_transaction"),
      respond: () => Promise.resolve(createdRow),
    },
    {
      match: (p) => p.includes("/rpc/reject_transaction"),
      respond: () => Promise.resolve(rejectedRow),
    },
  ]);

  const created = await createTransaction(
    fetcher,
    makeValidInput({ mode: "manual_review", amountCents: 500, buyerId: "user-A", sellerId: "user-B" }),
  );
  assert.equal(created.status, "pending");
  assert.equal(created.grantId, null);

  const rejected = await rejectTransaction(fetcher, {
    transactionId: created.id,
    rejecterId: "user-B",
    rejectionReason: "resource unavailable",
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.grantId, null); // 拒绝不创建 grant
  assert.equal(rejected.rejectionReason, "resource unavailable");
});
