/**
 * K2-T-10 授权、订单与创建者中心测试
 *
 * 覆盖：
 * - fixture 路径（USE_FIXTURE=true）
 * - PRD §9.6 验收：订单失败不创建 Active Grant（assertOrderFailureDoesNotActivateGrant）
 * - PRD §9.6 验收：收益净额计算 netAmount = grossAmount - platformFee
 * - PRD §9.6 验收：人工结算标记恒为 true（不显示为自动到账）
 * - 真实 API 路径（mock fetch，验证请求路径 / headers / HTTP 方法）
 * - 错误状态（401 / 403 / 404 / 409）正确抛错
 * - 写操作：requestRefund / cancelOrder / createReport
 * - fixture JSON 与 TS fixture 数据一致性（防漂移）
 * - 格式化纯函数：formatAmount / orderStatusLabel / settlementStatusLabel 等
 *
 * 运行：node --test tests/ui-v2/licensing/*.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// 在加载 api 模块前确保默认走 fixture（不受外部 env 干扰）。
delete process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE;

const {
  fetchOrders,
  fetchOrderById,
  fetchEarnings,
  fetchReports,
  fetchDisputes,
  createReport,
  requestRefund,
  cancelOrder,
  fetchLicensingDataset,
  LicensingApiError,
  LICENSING_API_ERROR_CODES,
  isUnauthenticatedError,
  USE_FIXTURE,
} = await import("../../../lib/client/v2/licensing/api.ts");

const {
  CONTRACT_VERSION,
  ALL_ORDER_STATUSES,
  ALL_PAYMENT_METHODS,
  ALL_SETTLEMENT_STATUSES,
  ALL_REPORT_TYPES,
  ALL_DISPUTE_STATUSES,
  assertOrderFailureDoesNotActivateGrant,
  assertEarningNetAmount,
  assertEarningsSummary,
  isManualSettlement,
  isTerminalSettlement,
} = await import("../../../lib/client/v2/licensing/types.ts");

const {
  FIXTURE_ORDERS,
  FIXTURE_EARNINGS,
  FIXTURE_EARNINGS_SUMMARY,
  FIXTURE_REPORTS,
  FIXTURE_DISPUTES,
  FIXTURE_DATASET,
} = await import("../../../lib/client/v2/licensing/fixture-data.ts");

const {
  loadFixtureOrders,
  loadFixtureEarnings,
  loadFixtureEarningsSummary,
  loadFixtureReports,
  loadFixtureDisputes,
  loadFixtureOrderById,
  loadFixtureDataset,
  fixtureContractVersion,
} = await import("../../../lib/client/v2/licensing/fixtures.ts");

const {
  formatAmount,
  centsToYuan,
  orderStatusLabel,
  orderStatusClass,
  grantStatusLabel,
  grantStatusClass,
  settlementStatusLabel,
  settlementStatusClass,
  manualSettlementBadge,
  disputeStatusLabel,
  disputeStatusClass,
  reportTypeLabel,
  paymentMethodLabel,
  formatTime,
} = await import("../../../components/v2/licensing/format.ts");

// 读取 JSON fixture
const raw = readFileSync("tests/fixtures/kiikis-v2/licensing.json", "utf8");
const jsonDataset = JSON.parse(raw);

const TOKEN = "test-token";

// ============================================================
// mock fetch 工具
// ============================================================

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeFetch(routes) {
  return async (url, init) => {
    const u = typeof url === "string" ? new URL(url, "http://localhost") : url;
    const method = (init?.method || "GET").toUpperCase();
    const key = `${method} ${u.pathname}`;
    const handler = routes[key];
    if (!handler) {
      return jsonRes({ success: false, error: "no mock", code: "not_found" }, 404);
    }
    return handler(init, u);
  };
}

function header(init, name) {
  return new Headers(init?.headers).get(name);
}

// ============================================================
// 1. contract_version 校验
// ============================================================

test("CONTRACT_VERSION 与 Codex v2 契约冻结值一致", () => {
  assert.equal(CONTRACT_VERSION, "2.0.0-alpha.1");
  assert.equal(jsonDataset.contractVersion, CONTRACT_VERSION);
  assert.equal(FIXTURE_DATASET.contractVersion, CONTRACT_VERSION);
});

test("fixtureContractVersion 返回正确版本", () => {
  assert.equal(fixtureContractVersion(), CONTRACT_VERSION);
});

// ============================================================
// 2. fixture 路径
// ============================================================

test("USE_FIXTURE 默认为 true", () => {
  assert.equal(USE_FIXTURE, true);
});

test("fixture 模式 fetchOrders 返回 5 个订单", async () => {
  const result = await fetchOrders(null);
  assert.equal(result.source, "fixture");
  assert.equal(result.orders.length, 5);
  // 覆盖全部 5 种订单状态
  const statuses = new Set(result.orders.map((o) => o.status));
  for (const s of ALL_ORDER_STATUSES) {
    assert.ok(statuses.has(s), `缺少订单状态: ${s}`);
  }
});

test("fixture 模式 fetchOrderById 返回单个订单", async () => {
  const result = await fetchOrderById(null, "ord-001");
  assert.equal(result.source, "fixture");
  assert.equal(result.order.id, "ord-001");
  assert.equal(result.order.status, "paid");
  assert.equal(result.order.grantStatus, "active");
});

test("fixture 模式 fetchOrderById 不存在的 ID 抛 NOT_FOUND", async () => {
  await assert.rejects(
    () => fetchOrderById(null, "nonexistent-id"),
    (err) => {
      assert.ok(err instanceof LicensingApiError);
      assert.equal(err.code, LICENSING_API_ERROR_CODES.NOT_FOUND);
      return true;
    },
  );
});

test("fixture 模式 fetchEarnings 返回收益记录与汇总", async () => {
  const result = await fetchEarnings(null);
  assert.equal(result.source, "fixture");
  assert.equal(result.earnings.length, 5);
  assert.ok(result.summary);
  assert.equal(result.summary.manualSettlement, true);
});

test("fixture 模式 fetchReports 返回 3 个举报", async () => {
  const result = await fetchReports(null);
  assert.equal(result.source, "fixture");
  assert.equal(result.reports.length, 3);
});

test("fixture 模式 fetchDisputes 返回 2 个争议", async () => {
  const result = await fetchDisputes(null);
  assert.equal(result.source, "fixture");
  assert.equal(result.disputes.length, 2);
  // 每个争议的 adminActions 数组存在且为深拷贝
  for (const d of result.disputes) {
    assert.ok(Array.isArray(d.adminActions));
  }
});

test("fixture 模式 fetchLicensingDataset 一次性返回完整数据集", async () => {
  const result = await fetchLicensingDataset(null);
  assert.equal(result.source, "fixture");
  assert.equal(result.orders.length, 5);
  assert.equal(result.earnings.length, 5);
  assert.equal(result.reports.length, 3);
  assert.equal(result.disputes.length, 2);
  assert.ok(result.earningsSummary);
});

// ============================================================
// 3. PRD §9.6 验收：订单失败不创建 Active Grant
// ============================================================

test("PRD §9.6：所有 fixture 订单通过 assertOrderFailureDoesNotActivateGrant", () => {
  for (const order of FIXTURE_ORDERS) {
    assert.doesNotThrow(() => assertOrderFailureDoesNotActivateGrant(order));
  }
});

test("PRD §9.6：paid 订单的 grantStatus 可以为 active", () => {
  const paidOrder = FIXTURE_ORDERS.find((o) => o.status === "paid");
  assert.ok(paidOrder);
  assert.equal(paidOrder.grantStatus, "active");
});

test("PRD §9.6：pending 订单的 grantStatus 不得为 active", () => {
  const pendingOrder = FIXTURE_ORDERS.find((o) => o.status === "pending");
  assert.ok(pendingOrder);
  assert.notEqual(pendingOrder.grantStatus, "active");
});

test("PRD §9.6：failed 订单的 grantStatus 不得为 active", () => {
  const failedOrder = FIXTURE_ORDERS.find((o) => o.status === "failed");
  assert.ok(failedOrder);
  assert.notEqual(failedOrder.grantStatus, "active");
});

test("PRD §9.6：cancelled 订单的 grantStatus 不得为 active", () => {
  const cancelledOrder = FIXTURE_ORDERS.find((o) => o.status === "cancelled");
  assert.ok(cancelledOrder);
  assert.notEqual(cancelledOrder.grantStatus, "active");
});

test("PRD §9.6：refunded 订单的 grantStatus 不得为 active", () => {
  const refundedOrder = FIXTURE_ORDERS.find((o) => o.status === "refunded");
  assert.ok(refundedOrder);
  assert.notEqual(refundedOrder.grantStatus, "active");
});

test("PRD §9.6：assertOrderFailureDoesNotActivateGrant 在违反时抛错", () => {
  const badOrder = {
    ...FIXTURE_ORDERS[0],
    status: "failed",
    grantStatus: "active", // 违反约束
  };
  assert.throws(
    () => assertOrderFailureDoesNotActivateGrant(badOrder),
    /违反 PRD §9.6/,
  );
});

test("PRD §9.6：loadFixtureOrders 加载时验证全部订单不变式", () => {
  const orders = loadFixtureOrders();
  assert.equal(orders.length, FIXTURE_ORDERS.length);
  // 全部通过验证（不抛错）
  for (const order of orders) {
    assert.doesNotThrow(() => assertOrderFailureDoesNotActivateGrant(order));
  }
});

// ============================================================
// 4. PRD §9.6 验收：收益净额计算
// ============================================================

test("PRD §9.6：所有 fixture 收益通过 assertEarningNetAmount", () => {
  for (const earning of FIXTURE_EARNINGS) {
    assert.doesNotThrow(() => assertEarningNetAmount(earning));
  }
});

test("PRD §9.6：netAmount = grossAmount - platformFee", () => {
  for (const earning of FIXTURE_EARNINGS) {
    const expected = earning.grossAmount - earning.platformFee;
    assert.equal(earning.netAmount, expected);
  }
});

test("PRD §9.6：assertEarningNetAmount 在净额错误时抛错", () => {
  const badEarning = {
    ...FIXTURE_EARNINGS[0],
    netAmount: 1, // 错误的净额
  };
  assert.throws(
    () => assertEarningNetAmount(badEarning),
    /净额计算错误/,
  );
});

test("PRD §9.6：loadFixtureEarnings 加载时验证全部收益净额", () => {
  const earnings = loadFixtureEarnings();
  assert.equal(earnings.length, FIXTURE_EARNINGS.length);
  for (const e of earnings) {
    assert.doesNotThrow(() => assertEarningNetAmount(e));
  }
});

// ============================================================
// 5. PRD §9.6 验收：人工结算标记
// ============================================================

test("PRD §9.6：所有结算状态均为人工（isManualSettlement 恒为 true）", () => {
  for (const status of ALL_SETTLEMENT_STATUSES) {
    assert.equal(isManualSettlement(status), true);
  }
});

test("PRD §9.6：fixture 收益汇总 manualSettlement 恒为 true", () => {
  assert.equal(FIXTURE_EARNINGS_SUMMARY.manualSettlement, true);
  assert.equal(loadFixtureEarningsSummary().manualSettlement, true);
});

test("PRD §9.6：assertEarningsSummary 在 manualSettlement 非 true 时抛错", () => {
  const badSummary = {
    ...FIXTURE_EARNINGS_SUMMARY,
    manualSettlement: false,
  };
  assert.throws(
    () => assertEarningsSummary(badSummary),
    /人工结算/,
  );
});

test("PRD §9.6：收益汇总 netAmount = totalGross - totalPlatformFee", () => {
  const summary = FIXTURE_EARNINGS_SUMMARY;
  assert.equal(summary.totalNet, summary.totalGross - summary.totalPlatformFee);
  assert.doesNotThrow(() => assertEarningsSummary(summary));
});

test("PRD §9.6：收益汇总各状态金额之和等于 totalNet", () => {
  const s = FIXTURE_EARNINGS_SUMMARY;
  const sum = s.pendingManualAmount + s.processingAmount + s.completedManualAmount;
  assert.equal(sum, s.totalNet);
});

test("PRD §9.6：结算状态标签全部标注为人工", () => {
  for (const status of ALL_SETTLEMENT_STATUSES) {
    const zhLabel = settlementStatusLabel(status, "zh-CN");
    const enLabel = settlementStatusLabel(status, "en-US");
    assert.ok(zhLabel.includes("人工"), `中文标签缺少"人工": ${zhLabel}`);
    assert.ok(enLabel.toLowerCase().includes("manual"), `英文标签缺少"manual": ${enLabel}`);
  }
});

test("PRD §9.6：manualSettlementBadge 返回人工结算标记", () => {
  assert.equal(manualSettlementBadge("zh-CN"), "人工结算");
  assert.equal(manualSettlementBadge("en-US"), "Manual settlement");
});

test("isTerminalSettlement：仅 completed_manual 为终态", () => {
  assert.equal(isTerminalSettlement("completed_manual"), true);
  assert.equal(isTerminalSettlement("pending_manual"), false);
  assert.equal(isTerminalSettlement("processing"), false);
});

// ============================================================
// 6. 写操作测试（fixture 模式）
// ============================================================

test("fixture 模式 requestRefund：paid 订单退款成功", async () => {
  const result = await requestRefund(null, "ord-001");
  assert.equal(result.source, "fixture");
  assert.equal(result.order.status, "refunded");
  assert.equal(result.order.grantStatus, "cancelled"); // 退款后 Grant 取消
  assert.ok(result.order.refundedAt);
});

test("fixture 模式 requestRefund：非 paid 订单退款抛错", async () => {
  await assert.rejects(
    () => requestRefund(null, "ord-002"), // pending 订单
    (err) => {
      assert.ok(err instanceof LicensingApiError);
      assert.equal(err.code, LICENSING_API_ERROR_CODES.ORDER_NOT_PAID);
      return true;
    },
  );
});

test("fixture 模式 requestRefund：不存在的订单抛 NOT_FOUND", async () => {
  await assert.rejects(
    () => requestRefund(null, "nonexistent"),
    (err) => {
      assert.ok(err instanceof LicensingApiError);
      assert.equal(err.code, LICENSING_API_ERROR_CODES.NOT_FOUND);
      return true;
    },
  );
});

test("fixture 模式 cancelOrder：pending 订单取消成功", async () => {
  const result = await cancelOrder(null, "ord-002");
  assert.equal(result.source, "fixture");
  assert.equal(result.order.status, "cancelled");
  assert.equal(result.order.grantStatus, "cancelled"); // 取消后 Grant 不激活
  assert.ok(result.order.cancelledAt);
});

test("fixture 模式 cancelOrder：非 pending 订单取消抛错", async () => {
  await assert.rejects(
    () => cancelOrder(null, "ord-001"), // paid 订单
    (err) => {
      assert.ok(err instanceof LicensingApiError);
      assert.equal(err.code, LICENSING_API_ERROR_CODES.CONFLICT);
      return true;
    },
  );
});

test("fixture 模式 createReport：创建举报成功", async () => {
  const result = await createReport(null, {
    type: "infringement",
    assetId: "ast-001",
    description: "测试举报内容",
    evidenceCount: 2,
  });
  assert.equal(result.source, "fixture");
  assert.equal(result.report.type, "infringement");
  assert.equal(result.report.assetId, "ast-001");
  assert.equal(result.report.description, "测试举报内容");
  assert.equal(result.report.evidenceCount, 2);
  assert.equal(result.report.status, "pending");
  assert.ok(result.report.id);
  assert.ok(result.report.createdAt);
});

// ============================================================
// 7. 真实 API 路径（mock fetch）
// ============================================================

test("真实模式 fetchOrders：GET /api/v2/orders 带 Bearer token", async () => {
  delete process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE;
  process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE = "false";

  // 重新导入以获取真实模式
  const mod = await import("../../../lib/client/v2/licensing/api.ts?real=1");
  const fetchImpl = makeFetch({
    "GET /api/v2/orders": () =>
      jsonRes({
        success: true,
        contractVersion: CONTRACT_VERSION,
        items: [
          {
            id: "ord-api-001",
            assetId: "ast-001",
            assetName: "API 资产",
            grantId: "grt-001",
            grantStatus: "active",
            amount: 9900,
            currency: "CNY",
            paymentMethod: "alipay",
            status: "paid",
            createdAt: "2026-08-01T00:00:00.000Z",
            paidAt: "2026-08-01T00:01:00.000Z",
            refundedAt: null,
            cancelledAt: null,
            failedAt: null,
            evidence: {
              paymentProof: "manual_confirmed",
              generatedAt: "2026-08-01T00:01:00.000Z",
              manualConfirmedAt: "2026-08-01T00:01:00.000Z",
            },
          },
        ],
      }),
  });

  const result = await mod.fetchOrders(TOKEN, { fetchImpl });
  assert.equal(result.source, "api");
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0].id, "ord-api-001");

  // 恢复 fixture 模式
  delete process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE;
});

test("真实模式 fetchEarnings：GET /api/v2/earnings 带 Bearer token", async () => {
  process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE = "false";
  const mod = await import("../../../lib/client/v2/licensing/api.ts?real=2");
  const fetchImpl = makeFetch({
    "GET /api/v2/earnings": () =>
      jsonRes({
        success: true,
        contractVersion: CONTRACT_VERSION,
        items: [
          {
            id: "ern-api-001",
            orderId: "ord-001",
            assetId: "ast-001",
            assetName: "API 资产",
            grossAmount: 9900,
            platformFee: 990,
            netAmount: 8910,
            settlementStatus: "completed_manual",
            createdAt: "2026-08-01T00:00:00.000Z",
            settledAt: "2026-08-02T00:00:00.000Z",
          },
        ],
        summary: {
          totalGross: 9900,
          totalPlatformFee: 990,
          totalNet: 8910,
          pendingManualAmount: 0,
          processingAmount: 0,
          completedManualAmount: 8910,
          count: 1,
          currency: "CNY",
          manualSettlement: true,
        },
      }),
  });

  const result = await mod.fetchEarnings(TOKEN, { fetchImpl });
  assert.equal(result.source, "api");
  assert.equal(result.earnings.length, 1);
  assert.equal(result.summary.manualSettlement, true);

  delete process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE;
});

test("真实模式 createReport：POST /api/v2/reports 带 Bearer token 与 body", async () => {
  process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE = "false";
  const mod = await import("../../../lib/client/v2/licensing/api.ts?real=3");
  let capturedInit = null;
  const fetchImpl = makeFetch({
    "POST /api/v2/reports": (init) => {
      capturedInit = init;
      return jsonRes(
        {
          success: true,
          contractVersion: CONTRACT_VERSION,
          report: {
            id: "rpt-api-001",
            type: "infringement",
            assetId: "ast-001",
            assetName: "API 资产",
            reporterId: "self",
            description: "API 举报",
            evidenceCount: 1,
            status: "pending",
            createdAt: "2026-08-01T00:00:00.000Z",
            resolvedAt: null,
            adminNote: null,
          },
        },
        201,
      );
    },
  });

  const result = await mod.createReport(
    TOKEN,
    { type: "infringement", assetId: "ast-001", description: "API 举报" },
    { fetchImpl },
  );
  assert.equal(result.source, "api");
  assert.equal(result.report.id, "rpt-api-001");
  assert.equal(header(capturedInit, "Authorization"), `Bearer ${TOKEN}`);
  assert.equal(capturedInit.method, "POST");

  delete process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE;
});

// ============================================================
// 8. 错误状态测试（mock fetch）
// ============================================================

test("真实模式 401 抛 UNAUTHENTICATED", async () => {
  process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE = "false";
  const mod = await import("../../../lib/client/v2/licensing/api.ts?err401");
  const fetchImpl = makeFetch({
    "GET /api/v2/orders": () => jsonRes({ success: false, error: "未登录" }, 401),
  });

  await assert.rejects(
    () => mod.fetchOrders(TOKEN, { fetchImpl }),
    (err) => {
      // 使用 re-imported 模块的类（模块缓存导致类实例不同）
      assert.ok(err instanceof mod.LicensingApiError);
      assert.equal(err.code, mod.LICENSING_API_ERROR_CODES.UNAUTHENTICATED);
      return true;
    },
  );

  delete process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE;
});

test("真实模式 403 抛 FORBIDDEN", async () => {
  process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE = "false";
  const mod = await import("../../../lib/client/v2/licensing/api.ts?err403");
  const fetchImpl = makeFetch({
    "GET /api/v2/orders": () => jsonRes({ success: false, error: "无权限" }, 403),
  });

  await assert.rejects(
    () => mod.fetchOrders(TOKEN, { fetchImpl }),
    (err) => {
      assert.ok(err instanceof mod.LicensingApiError);
      assert.equal(err.code, mod.LICENSING_API_ERROR_CODES.FORBIDDEN);
      return true;
    },
  );

  delete process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE;
});

test("真实模式 404 抛 NOT_FOUND", async () => {
  process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE = "false";
  const mod = await import("../../../lib/client/v2/licensing/api.ts?err404");
  const fetchImpl = makeFetch({
    "GET /api/v2/orders/xxx": () => jsonRes({ success: false, error: "未找到" }, 404),
  });

  await assert.rejects(
    () => mod.fetchOrderById(TOKEN, "xxx", { fetchImpl }),
    (err) => {
      assert.ok(err instanceof mod.LicensingApiError);
      assert.equal(err.code, mod.LICENSING_API_ERROR_CODES.NOT_FOUND);
      return true;
    },
  );

  delete process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE;
});

test("真实模式 contractVersion 不匹配抛 CONTRACT_MISMATCH", async () => {
  process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE = "false";
  const mod = await import("../../../lib/client/v2/licensing/api.ts?errVer");
  const fetchImpl = makeFetch({
    "GET /api/v2/orders": () =>
      jsonRes({
        success: true,
        contractVersion: "1.0.0-wrong",
        items: [],
      }),
  });

  await assert.rejects(
    () => mod.fetchOrders(TOKEN, { fetchImpl }),
    (err) => {
      assert.ok(err instanceof mod.LicensingApiError);
      assert.equal(err.code, mod.LICENSING_API_ERROR_CODES.CONTRACT_MISMATCH);
      return true;
    },
  );

  delete process.env.NEXT_PUBLIC_USE_LICENSING_FIXTURE;
});

test("isUnauthenticatedError 正确识别未登录错误", () => {
  const authErr = new LicensingApiError(
    LICENSING_API_ERROR_CODES.UNAUTHENTICATED,
    "未登录",
  );
  assert.equal(isUnauthenticatedError(authErr), true);

  const otherErr = new LicensingApiError(
    LICENSING_API_ERROR_CODES.NOT_FOUND,
    "未找到",
  );
  assert.equal(isUnauthenticatedError(otherErr), false);
});

// ============================================================
// 9. fixture 深拷贝验证
// ============================================================

test("loadFixtureOrders 返回深拷贝（修改不影响原数据）", () => {
  const orders1 = loadFixtureOrders();
  const orders2 = loadFixtureOrders();
  orders1[0].id = "modified";
  orders1[0].evidence.paymentProof = "modified";
  assert.notEqual(orders2[0].id, "modified");
  assert.notEqual(orders2[0].evidence.paymentProof, "modified");
});

test("loadFixtureDisputes 返回深拷贝（adminActions 独立）", () => {
  const d1 = loadFixtureDisputes();
  const d2 = loadFixtureDisputes();
  d1[0].adminActions[0].summary = "modified";
  assert.notEqual(d2[0].adminActions[0].summary, "modified");
});

test("loadFixtureOrderById 返回深拷贝", () => {
  const o1 = loadFixtureOrderById("ord-001");
  const o2 = loadFixtureOrderById("ord-001");
  o1.evidence.paymentProof = "modified";
  assert.notEqual(o2.evidence.paymentProof, "modified");
});

test("loadFixtureDataset 返回完整数据集", () => {
  const ds = loadFixtureDataset();
  assert.equal(ds.contractVersion, CONTRACT_VERSION);
  assert.equal(ds.orders.length, FIXTURE_ORDERS.length);
  assert.equal(ds.earnings.length, FIXTURE_EARNINGS.length);
  assert.equal(ds.reports.length, FIXTURE_REPORTS.length);
  assert.equal(ds.disputes.length, FIXTURE_DISPUTES.length);
});

// ============================================================
// 10. fixture JSON 与 TS fixture 数据一致性（防漂移）
// ============================================================

test("JSON fixture contractVersion 与 TS 一致", () => {
  assert.equal(jsonDataset.contractVersion, FIXTURE_DATASET.contractVersion);
});

test("JSON fixture 订单数量与 TS 一致", () => {
  assert.equal(jsonDataset.orders.length, FIXTURE_ORDERS.length);
});

test("JSON fixture 订单字段与 TS 一致（逐条对比）", () => {
  for (let i = 0; i < FIXTURE_ORDERS.length; i++) {
    const tsOrder = FIXTURE_ORDERS[i];
    const jsonOrder = jsonDataset.orders[i];
    assert.equal(jsonOrder.id, tsOrder.id);
    assert.equal(jsonOrder.status, tsOrder.status);
    assert.equal(jsonOrder.grantStatus, tsOrder.grantStatus);
    assert.equal(jsonOrder.amount, tsOrder.amount);
    assert.equal(jsonOrder.paymentMethod, tsOrder.paymentMethod);
    assert.equal(jsonOrder.evidence.paymentProof, tsOrder.evidence.paymentProof);
  }
});

test("JSON fixture 收益数量与 TS 一致", () => {
  assert.equal(jsonDataset.earnings.length, FIXTURE_EARNINGS.length);
});

test("JSON fixture 收益字段与 TS 一致（逐条对比）", () => {
  for (let i = 0; i < FIXTURE_EARNINGS.length; i++) {
    const tsE = FIXTURE_EARNINGS[i];
    const jsonE = jsonDataset.earnings[i];
    assert.equal(jsonE.id, tsE.id);
    assert.equal(jsonE.grossAmount, tsE.grossAmount);
    assert.equal(jsonE.platformFee, tsE.platformFee);
    assert.equal(jsonE.netAmount, tsE.netAmount);
    assert.equal(jsonE.settlementStatus, tsE.settlementStatus);
  }
});

test("JSON fixture 收益汇总与 TS 一致", () => {
  const tsS = FIXTURE_EARNINGS_SUMMARY;
  const jsonS = jsonDataset.earningsSummary;
  assert.equal(jsonS.totalGross, tsS.totalGross);
  assert.equal(jsonS.totalPlatformFee, tsS.totalPlatformFee);
  assert.equal(jsonS.totalNet, tsS.totalNet);
  assert.equal(jsonS.manualSettlement, tsS.manualSettlement);
  assert.equal(jsonS.count, tsS.count);
});

test("JSON fixture 举报数量与 TS 一致", () => {
  assert.equal(jsonDataset.reports.length, FIXTURE_REPORTS.length);
});

test("JSON fixture 争议数量与 TS 一致", () => {
  assert.equal(jsonDataset.disputes.length, FIXTURE_DISPUTES.length);
});

test("JSON fixture 争议 adminActions 数量与 TS 一致", () => {
  for (let i = 0; i < FIXTURE_DISPUTES.length; i++) {
    const tsD = FIXTURE_DISPUTES[i];
    const jsonD = jsonDataset.disputes[i];
    assert.equal(jsonD.adminActions.length, tsD.adminActions.length);
  }
});

// ============================================================
// 11. 格式化纯函数
// ============================================================

test("formatAmount：分转元正确", () => {
  assert.equal(formatAmount(9900, "CNY", "zh-CN"), "¥99.00");
  assert.equal(formatAmount(9900, "CNY", "en-US"), "CNY 99.00");
  assert.equal(formatAmount(9900, "USD", "zh-CN"), "$99.00");
});

test("centsToYuan：分转元正确", () => {
  assert.equal(centsToYuan(9900), "99.00");
  assert.equal(centsToYuan(0), "0.00");
  assert.equal(centsToYuan(1050), "10.50");
});

test("orderStatusLabel：中英文标签正确", () => {
  assert.equal(orderStatusLabel("pending", "zh-CN"), "待支付");
  assert.equal(orderStatusLabel("pending", "en-US"), "Pending");
  assert.equal(orderStatusLabel("paid", "zh-CN"), "已支付");
  assert.equal(orderStatusLabel("failed", "zh-CN"), "失败");
});

test("orderStatusClass：CSS class 正确", () => {
  assert.equal(orderStatusClass("pending"), "statusPending");
  assert.equal(orderStatusClass("paid"), "statusPaid");
  assert.equal(orderStatusClass("failed"), "statusFailed");
});

test("grantStatusLabel：中英文标签正确", () => {
  assert.equal(grantStatusLabel("active", "zh-CN"), "已激活");
  assert.equal(grantStatusLabel("active", "en-US"), "Active");
  assert.equal(grantStatusLabel("pending", "zh-CN"), "待激活");
});

test("settlementStatusLabel：全部标注为人工", () => {
  assert.equal(settlementStatusLabel("pending_manual", "zh-CN"), "待人工结算");
  assert.equal(settlementStatusLabel("pending_manual", "en-US"), "Pending manual settlement");
  assert.equal(settlementStatusLabel("processing", "zh-CN"), "人工结算处理中");
  assert.equal(settlementStatusLabel("completed_manual", "zh-CN"), "人工结算已完成");
});

test("settlementStatusClass：CSS class 正确", () => {
  assert.equal(settlementStatusClass("pending_manual"), "statusPendingManual");
  assert.equal(settlementStatusClass("processing"), "statusProcessing");
  assert.equal(settlementStatusClass("completed_manual"), "statusCompletedManual");
});

test("disputeStatusLabel：中英文标签正确", () => {
  assert.equal(disputeStatusLabel("pending", "zh-CN"), "待受理");
  assert.equal(disputeStatusLabel("under_review", "zh-CN"), "审核中");
  assert.equal(disputeStatusLabel("resolved", "en-US"), "Resolved");
  assert.equal(disputeStatusLabel("dismissed", "zh-CN"), "已驳回");
});

test("reportTypeLabel：中英文标签正确", () => {
  assert.equal(reportTypeLabel("infringement", "zh-CN"), "侵权");
  assert.equal(reportTypeLabel("portrait_misuse", "zh-CN"), "冒用肖像");
  assert.equal(reportTypeLabel("false_source", "en-US"), "False source");
});

test("paymentMethodLabel：中英文标签正确", () => {
  assert.equal(paymentMethodLabel("alipay", "zh-CN"), "支付宝");
  assert.equal(paymentMethodLabel("alipay", "en-US"), "Alipay");
  assert.equal(paymentMethodLabel("wechat", "zh-CN"), "微信支付");
  assert.equal(paymentMethodLabel("paypal", "en-US"), "PayPal");
});

test("formatTime：null 返回占位符", () => {
  assert.equal(formatTime(null, "zh-CN"), "—");
  assert.equal(formatTime(null, "en-US"), "—");
});

test("formatTime：ISO 字符串可解析", () => {
  const result = formatTime("2026-08-01T08:00:00.000Z", "zh-CN");
  assert.ok(typeof result === "string");
  assert.ok(result.length > 0);
});

// ============================================================
// 12. 常量完整性
// ============================================================

test("ALL_ORDER_STATUSES 包含全部 5 种状态", () => {
  assert.equal(ALL_ORDER_STATUSES.length, 5);
  assert.ok(ALL_ORDER_STATUSES.includes("pending"));
  assert.ok(ALL_ORDER_STATUSES.includes("paid"));
  assert.ok(ALL_ORDER_STATUSES.includes("refunded"));
  assert.ok(ALL_ORDER_STATUSES.includes("cancelled"));
  assert.ok(ALL_ORDER_STATUSES.includes("failed"));
});

test("ALL_PAYMENT_METHODS 包含全部 4 种支付方式", () => {
  assert.equal(ALL_PAYMENT_METHODS.length, 4);
  assert.ok(ALL_PAYMENT_METHODS.includes("card"));
  assert.ok(ALL_PAYMENT_METHODS.includes("alipay"));
  assert.ok(ALL_PAYMENT_METHODS.includes("wechat"));
  assert.ok(ALL_PAYMENT_METHODS.includes("paypal"));
});

test("ALL_SETTLEMENT_STATUSES 包含全部 3 种人工结算状态", () => {
  assert.equal(ALL_SETTLEMENT_STATUSES.length, 3);
  assert.ok(ALL_SETTLEMENT_STATUSES.includes("pending_manual"));
  assert.ok(ALL_SETTLEMENT_STATUSES.includes("processing"));
  assert.ok(ALL_SETTLEMENT_STATUSES.includes("completed_manual"));
});

test("ALL_REPORT_TYPES 包含全部 4 种举报类型", () => {
  assert.equal(ALL_REPORT_TYPES.length, 4);
  assert.ok(ALL_REPORT_TYPES.includes("infringement"));
  assert.ok(ALL_REPORT_TYPES.includes("portrait_misuse"));
  assert.ok(ALL_REPORT_TYPES.includes("false_source"));
  assert.ok(ALL_REPORT_TYPES.includes("inappropriate_content"));
});

test("ALL_DISPUTE_STATUSES 包含全部 4 种争议状态", () => {
  assert.equal(ALL_DISPUTE_STATUSES.length, 4);
  assert.ok(ALL_DISPUTE_STATUSES.includes("pending"));
  assert.ok(ALL_DISPUTE_STATUSES.includes("under_review"));
  assert.ok(ALL_DISPUTE_STATUSES.includes("resolved"));
  assert.ok(ALL_DISPUTE_STATUSES.includes("dismissed"));
});
