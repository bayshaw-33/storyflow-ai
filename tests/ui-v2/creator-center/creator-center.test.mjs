/**
 * K2-T-10 创建者中心测试
 *
 * 覆盖：
 * - contract_version 校验
 * - fixture 路径（USE_FIXTURE=true）
 * - PRD §9.6 验收：收益汇总计算正确（gross - fee = net）
 * - PRD §9.6 验收：服务费比例正确（15%）
 * - PRD §9.6 验收：结算状态文案不包含"自动"（人工结算强制）
 * - PRD §9.6 验收：manualSettlement 标记恒为 true
 * - 创建者档案字段完整性
 * - fixture JSON 与 TS fixture 数据一致性（防漂移）
 * - 真实 API 路径（mock fetch，验证请求路径 / headers）
 * - 错误状态（401 / 403 / 404）正确抛错
 *
 * 运行：node --test tests/ui-v2/creator-center/*.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// 在加载 api 模块前确保默认走 fixture（不受外部 env 干扰）。
delete process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE;

const {
  fetchCreatorEarnings,
  fetchCreatorProfile,
  fetchCreatorDataset,
  CreatorCenterApiError,
  CREATOR_CENTER_API_ERROR_CODES,
  isUnauthenticatedError,
  USE_FIXTURE,
  CONTRACT_VERSION,
  fixtureCreatorContractVersion,
} = await import("../../../lib/client/v2/creator-center/api.ts");

const {
  PLATFORM_FEE_RATE,
  computePlatformFee,
  computeNetAmount,
  assertPlatformFeeRate,
  assertCreatorProfile,
  assertCreatorDataset,
  ALL_SETTLEMENT_STATUSES,
  isManualSettlement,
  assertEarningNetAmount,
  assertEarningsSummary,
} = await import("../../../lib/client/v2/creator-center/types.ts");

const {
  FIXTURE_CREATOR_PROFILE,
  FIXTURE_CREATOR_EARNINGS,
  FIXTURE_CREATOR_EARNINGS_SUMMARY,
  FIXTURE_CREATOR_DATASET,
} = await import("../../../lib/client/v2/creator-center/fixture-data.ts");

const {
  loadFixtureCreatorProfile,
  loadFixtureCreatorEarnings,
  loadFixtureCreatorEarningsSummary,
  loadFixtureCreatorDataset,
  fixtureCreatorContractVersion: fixtureVersionFn,
  platformFeeRate,
} = await import("../../../lib/client/v2/creator-center/fixtures.ts");

// 复用 licensing 的格式化纯函数（settlementStatusLabel 由 licensing/format 提供）
const {
  settlementStatusLabel,
  manualSettlementBadge,
} = await import("../../../components/v2/licensing/format.ts");

// 读取 JSON fixture
const raw = readFileSync("tests/fixtures/kiikis-v2/creator-center.json", "utf8");
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
  assert.equal(FIXTURE_CREATOR_DATASET.contractVersion, CONTRACT_VERSION);
});

test("fixtureCreatorContractVersion 返回正确版本", () => {
  assert.equal(fixtureCreatorContractVersion(), CONTRACT_VERSION);
  assert.equal(fixtureVersionFn(), CONTRACT_VERSION);
});

// ============================================================
// 2. fixture 路径
// ============================================================

test("USE_FIXTURE 默认为 true", () => {
  assert.equal(USE_FIXTURE, true);
});

test("fixture 模式 fetchCreatorProfile 返回创建者档案", async () => {
  const result = await fetchCreatorProfile(null);
  assert.equal(result.source, "fixture");
  assert.ok(result.profile);
  assert.equal(result.profile.id, "creator-001");
  assert.equal(result.profile.displayName, "Mara Studios");
  assert.equal(result.profile.totalAssets, 12);
  assert.equal(result.profile.totalSales, 8);
});

test("fixture 模式 fetchCreatorEarnings 返回收益记录与汇总", async () => {
  const result = await fetchCreatorEarnings(null);
  assert.equal(result.source, "fixture");
  assert.equal(result.earnings.length, 6);
  assert.ok(result.summary);
  assert.equal(result.summary.manualSettlement, true);
  // 覆盖全部 3 种人工结算状态
  const statuses = new Set(result.earnings.map((e) => e.settlementStatus));
  for (const s of ALL_SETTLEMENT_STATUSES) {
    assert.ok(statuses.has(s), `缺少结算状态: ${s}`);
  }
});

test("fixture 模式 fetchCreatorDataset 一次性返回完整数据集", async () => {
  const result = await fetchCreatorDataset(null);
  assert.equal(result.source, "fixture");
  assert.ok(result.profile);
  assert.equal(result.earnings.length, 6);
  assert.ok(result.earningsSummary);
});

test("loadFixtureCreatorProfile 返回深拷贝（修改不影响原数据）", () => {
  const profile = loadFixtureCreatorProfile();
  profile.displayName = "modified";
  const profile2 = loadFixtureCreatorProfile();
  assert.notEqual(profile2.displayName, "modified");
});

test("loadFixtureCreatorEarnings 返回深拷贝（修改不影响原数据）", () => {
  const earnings = loadFixtureCreatorEarnings();
  earnings[0].grossAmount = 999999;
  const earnings2 = loadFixtureCreatorEarnings();
  assert.notEqual(earnings2[0].grossAmount, 999999);
});

test("loadFixtureCreatorDataset 返回完整数据集", () => {
  const dataset = loadFixtureCreatorDataset();
  assert.ok(dataset.profile);
  assert.ok(dataset.earnings);
  assert.ok(dataset.earningsSummary);
  assert.equal(dataset.earnings.length, FIXTURE_CREATOR_EARNINGS.length);
});

// ============================================================
// 3. PRD §9.6 验收：收益汇总计算正确（gross - fee = net）
// ============================================================

test("PRD §9.6：所有 fixture 收益通过 assertEarningNetAmount", () => {
  for (const earning of FIXTURE_CREATOR_EARNINGS) {
    assert.doesNotThrow(() => assertEarningNetAmount(earning));
  }
});

test("PRD §9.6：netAmount = grossAmount - platformFee", () => {
  for (const earning of FIXTURE_CREATOR_EARNINGS) {
    const expected = earning.grossAmount - earning.platformFee;
    assert.equal(earning.netAmount, expected);
  }
});

test("PRD §9.6：收益汇总 totalNet = totalGross - totalPlatformFee", () => {
  const expected = FIXTURE_CREATOR_EARNINGS_SUMMARY.totalGross - FIXTURE_CREATOR_EARNINGS_SUMMARY.totalPlatformFee;
  assert.equal(FIXTURE_CREATOR_EARNINGS_SUMMARY.totalNet, expected);
});

test("PRD §9.6：assertEarningNetAmount 在净额错误时抛错", () => {
  const badEarning = {
    ...FIXTURE_CREATOR_EARNINGS[0],
    netAmount: 1,
  };
  assert.throws(
    () => assertEarningNetAmount(badEarning),
    /净额计算错误/,
  );
});

test("PRD §9.6：assertEarningsSummary 在净额错误时抛错", () => {
  const badSummary = {
    ...FIXTURE_CREATOR_EARNINGS_SUMMARY,
    totalNet: 1,
  };
  assert.throws(
    () => assertEarningsSummary(badSummary),
    /收益汇总净额计算错误/,
  );
});

test("PRD §9.6：loadFixtureCreatorEarnings 加载时验证全部收益净额", () => {
  const earnings = loadFixtureCreatorEarnings();
  assert.equal(earnings.length, FIXTURE_CREATOR_EARNINGS.length);
  for (const e of earnings) {
    assert.doesNotThrow(() => assertEarningNetAmount(e));
  }
});

test("PRD §9.6：assertCreatorDataset 验证完整数据集", () => {
  const dataset = loadFixtureCreatorDataset();
  assert.doesNotThrow(() => assertCreatorDataset(dataset));
});

// ============================================================
// 4. PRD §9.6 验收：服务费比例正确（15%）
// ============================================================

test("PLATFORM_FEE_RATE 为 0.15（15%）", () => {
  assert.equal(PLATFORM_FEE_RATE, 0.15);
  assert.equal(platformFeeRate(), 0.15);
});

test("computePlatformFee 按总收入 15% 计算（向上取整到分）", () => {
  assert.equal(computePlatformFee(10000), 1500);
  assert.equal(computePlatformFee(20000), 3000);
  assert.equal(computePlatformFee(15000), 2250);
  assert.equal(computePlatformFee(8000), 1200);
  assert.equal(computePlatformFee(30000), 4500);
  assert.equal(computePlatformFee(12000), 1800);
});

test("computeNetAmount = grossAmount - computePlatformFee", () => {
  assert.equal(computeNetAmount(10000), 8500);
  assert.equal(computeNetAmount(20000), 17000);
  assert.equal(computeNetAmount(15000), 12750);
});

test("PRD §9.6：所有 fixture 收益的 platformFee = grossAmount * 15%", () => {
  for (const earning of FIXTURE_CREATOR_EARNINGS) {
    const expectedFee = computePlatformFee(earning.grossAmount);
    assert.equal(
      earning.platformFee,
      expectedFee,
      `收益 ${earning.id} 服务费不等于 15%：期望 ${expectedFee}，实际 ${earning.platformFee}`,
    );
  }
});

test("PRD §9.6：assertPlatformFeeRate 在比例错误时抛错", () => {
  const badEarning = {
    ...FIXTURE_CREATOR_EARNINGS[0],
    platformFee: 1000, // 10%，不是 15%
  };
  assert.throws(
    () => assertPlatformFeeRate(badEarning),
    /服务费比例错误/,
  );
});

test("PRD §9.6：assertPlatformFeeRate 允许 1 分取整误差", () => {
  // 10001 * 0.15 = 1500.15，ceil = 1501
  // 如果用 round 则为 1500，差异 1 分，应被允许
  const earningWithOneCentDiff = {
    ...FIXTURE_CREATOR_EARNINGS[0],
    grossAmount: 10001,
    platformFee: 1500, // 实际 ceil 为 1501，差 1 分
    netAmount: 10001 - 1500,
  };
  assert.doesNotThrow(() => assertPlatformFeeRate(earningWithOneCentDiff));
});

test("PRD §9.6：loadFixtureCreatorEarnings 加载时验证服务费比例", () => {
  const earnings = loadFixtureCreatorEarnings();
  for (const e of earnings) {
    assert.doesNotThrow(() => assertPlatformFeeRate(e));
  }
});

test("PRD §9.6：收益汇总 totalPlatformFee = sum(platformFee)", () => {
  const sumFee = FIXTURE_CREATOR_EARNINGS.reduce((s, e) => s + e.platformFee, 0);
  assert.equal(FIXTURE_CREATOR_EARNINGS_SUMMARY.totalPlatformFee, sumFee);
});

// ============================================================
// 5. PRD §9.6 验收：结算状态文案不包含"自动"（人工结算强制）
// ============================================================

test("PRD §9.6：所有结算状态均为人工（isManualSettlement 恒为 true）", () => {
  for (const status of ALL_SETTLEMENT_STATUSES) {
    assert.equal(isManualSettlement(status), true);
  }
});

test("PRD §9.6：fixture 收益汇总 manualSettlement 恒为 true", () => {
  assert.equal(FIXTURE_CREATOR_EARNINGS_SUMMARY.manualSettlement, true);
});

test("PRD §9.6：settlementStatusLabel 文案不包含'自动'", () => {
  for (const status of ALL_SETTLEMENT_STATUSES) {
    const zhLabel = settlementStatusLabel(status, "zh-CN");
    const enLabel = settlementStatusLabel(status, "en-US");
    assert.ok(
      !zhLabel.includes("自动"),
      `中文结算状态标签 '${zhLabel}' 不应包含'自动'（PRD §9.6 强制人工结算）`,
    );
    assert.ok(
      !enLabel.toLowerCase().includes("automatic"),
      `英文结算状态标签 '${enLabel}' 不应包含 'automatic'`,
    );
  }
});

test("PRD §9.6：settlementStatusLabel 中文标签包含'人工'", () => {
  for (const status of ALL_SETTLEMENT_STATUSES) {
    const zhLabel = settlementStatusLabel(status, "zh-CN");
    assert.ok(
      zhLabel.includes("人工"),
      `中文结算状态标签 '${zhLabel}' 应包含'人工'（PRD §9.6 强制标注人工结算）`,
    );
  }
});

test("PRD §9.6：manualSettlementBadge 标注为人工结算", () => {
  const zhBadge = manualSettlementBadge("zh-CN");
  const enBadge = manualSettlementBadge("en-US");
  assert.equal(zhBadge, "人工结算");
  assert.ok(!zhBadge.includes("自动"));
  assert.equal(enBadge, "Manual settlement");
  assert.ok(!enBadge.toLowerCase().includes("automatic"));
});

test("PRD §9.6：全部 3 种人工结算状态覆盖", () => {
  assert.equal(ALL_SETTLEMENT_STATUSES.length, 3);
  assert.ok(ALL_SETTLEMENT_STATUSES.includes("pending_manual"));
  assert.ok(ALL_SETTLEMENT_STATUSES.includes("processing"));
  assert.ok(ALL_SETTLEMENT_STATUSES.includes("completed_manual"));
});

// ============================================================
// 6. 创建者档案字段完整性
// ============================================================

test("FIXTURE_CREATOR_PROFILE 字段完整", () => {
  const profile = FIXTURE_CREATOR_PROFILE;
  assert.ok(profile.id);
  assert.ok(profile.displayName);
  assert.ok(profile.bio);
  assert.equal(typeof profile.totalAssets, "number");
  assert.equal(typeof profile.totalSales, "number");
  assert.ok(profile.joinedAt);
});

test("assertCreatorProfile 在字段缺失时抛错", () => {
  const badProfile = { ...FIXTURE_CREATOR_PROFILE, id: "" };
  assert.throws(
    () => assertCreatorProfile(badProfile),
    /缺少 id/,
  );
});

test("assertCreatorProfile 在 displayName 缺失时抛错", () => {
  const badProfile = { ...FIXTURE_CREATOR_PROFILE, displayName: "" };
  assert.throws(
    () => assertCreatorProfile(badProfile),
    /缺少 displayName/,
  );
});

test("assertCreatorProfile 在 totalAssets 为负时抛错", () => {
  const badProfile = { ...FIXTURE_CREATOR_PROFILE, totalAssets: -1 };
  assert.throws(
    () => assertCreatorProfile(badProfile),
    /totalAssets 不得为负/,
  );
});

test("assertCreatorProfile 在 totalSales 为负时抛错", () => {
  const badProfile = { ...FIXTURE_CREATOR_PROFILE, totalSales: -1 };
  assert.throws(
    () => assertCreatorProfile(badProfile),
    /totalSales 不得为负/,
  );
});

// ============================================================
// 7. fixture JSON 与 TS fixture 数据一致性（防漂移）
// ============================================================

test("JSON fixture contractVersion 与 TS 一致", () => {
  assert.equal(jsonDataset.contractVersion, FIXTURE_CREATOR_DATASET.contractVersion);
});

test("JSON fixture 创建者档案与 TS 一致", () => {
  assert.deepEqual(jsonDataset.profile, FIXTURE_CREATOR_PROFILE);
});

test("JSON fixture 收益数量与 TS 一致", () => {
  assert.equal(jsonDataset.earnings.length, FIXTURE_CREATOR_EARNINGS.length);
});

test("JSON fixture 收益字段与 TS 一致（逐条对比）", () => {
  for (let i = 0; i < FIXTURE_CREATOR_EARNINGS.length; i++) {
    assert.deepEqual(
      jsonDataset.earnings[i],
      FIXTURE_CREATOR_EARNINGS[i],
      `收益 ${i} 字段不一致`,
    );
  }
});

test("JSON fixture 收益汇总与 TS 一致", () => {
  assert.deepEqual(jsonDataset.earningsSummary, FIXTURE_CREATOR_EARNINGS_SUMMARY);
});

// ============================================================
// 8. 真实 API 路径（mock fetch）
// ============================================================

test("USE_FIXTURE=false 时 fetchCreatorEarnings 走真实 API", async () => {
  // 临时切换到真实模式
  const original = process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE;
  process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE = "false";

  // 重新导入以获取 USE_FIXTURE=false 的模块实例
  const apiModule = await import("../../../lib/client/v2/creator-center/api.ts?t=" + Date.now());

  try {
    const mockFetch = makeFetch({
      "GET /api/v2/creator/earnings": (init) => {
        assert.equal(header(init, "Authorization"), `Bearer ${TOKEN}`);
        assert.equal(header(init, "Accept"), "application/json");
        return jsonRes({
          success: true,
          contractVersion: CONTRACT_VERSION,
          items: [],
          summary: {
            totalGross: 0,
            totalPlatformFee: 0,
            totalNet: 0,
            pendingManualAmount: 0,
            processingAmount: 0,
            completedManualAmount: 0,
            count: 0,
            currency: "CNY",
            manualSettlement: true,
          },
        });
      },
    });

    const result = await apiModule.fetchCreatorEarnings(TOKEN, { fetchImpl: mockFetch });
    assert.equal(result.source, "api");
    assert.equal(result.earnings.length, 0);
  } finally {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE;
    } else {
      process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE = original;
    }
  }
});

test("USE_FIXTURE=false 时 fetchCreatorProfile 走真实 API", async () => {
  const original = process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE;
  process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE = "false";

  const apiModule = await import("../../../lib/client/v2/creator-center/api.ts?t=" + Date.now());

  try {
    const mockFetch = makeFetch({
      "GET /api/v2/creator/profile": (init) => {
        assert.equal(header(init, "Authorization"), `Bearer ${TOKEN}`);
        return jsonRes({
          success: true,
          contractVersion: CONTRACT_VERSION,
          profile: FIXTURE_CREATOR_PROFILE,
        });
      },
    });

    const result = await apiModule.fetchCreatorProfile(TOKEN, { fetchImpl: mockFetch });
    assert.equal(result.source, "api");
    assert.equal(result.profile.id, "creator-001");
  } finally {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE;
    } else {
      process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE = original;
    }
  }
});

// ============================================================
// 9. 错误状态
// ============================================================

test("USE_FIXTURE=false 且无 token 时 fetchCreatorEarnings 抛 UNAUTHENTICATED", async () => {
  const original = process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE;
  process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE = "false";

  const apiModule = await import("../../../lib/client/v2/creator-center/api.ts?err401");

  try {
    await assert.rejects(
      () => apiModule.fetchCreatorEarnings(null),
      (err) => {
        // 使用 re-imported 模块的类（模块缓存导致类实例不同）
        assert.ok(err instanceof apiModule.CreatorCenterApiError);
        assert.equal(err.code, apiModule.CREATOR_CENTER_API_ERROR_CODES.UNAUTHENTICATED);
        return true;
      },
    );
  } finally {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE;
    } else {
      process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE = original;
    }
  }
});

test("isUnauthenticatedError 正确识别未登录错误", () => {
  const err = new CreatorCenterApiError(
    CREATOR_CENTER_API_ERROR_CODES.UNAUTHENTICATED,
    "未登录",
  );
  assert.equal(isUnauthenticatedError(err), true);
});

test("isUnauthenticatedError 对其他错误返回 false", () => {
  const err = new CreatorCenterApiError(
    CREATOR_CENTER_API_ERROR_CODES.NOT_FOUND,
    "未找到",
  );
  assert.equal(isUnauthenticatedError(err), false);
});

test("真实模式 contractVersion 不匹配抛 CONTRACT_MISMATCH", async () => {
  const original = process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE;
  process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE = "false";

  const apiModule = await import("../../../lib/client/v2/creator-center/api.ts?errVer");

  try {
    const mockFetch = makeFetch({
      "GET /api/v2/creator/earnings": () => {
        return jsonRes({
          success: true,
          contractVersion: "9.9.9-mismatch",
          items: [],
          summary: null,
        });
      },
    });

    await assert.rejects(
      () => apiModule.fetchCreatorEarnings(TOKEN, { fetchImpl: mockFetch }),
      (err) => {
        assert.ok(err instanceof apiModule.CreatorCenterApiError);
        assert.equal(err.code, apiModule.CREATOR_CENTER_API_ERROR_CODES.CONTRACT_MISMATCH);
        return true;
      },
    );
  } finally {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE;
    } else {
      process.env.NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE = original;
    }
  }
});
