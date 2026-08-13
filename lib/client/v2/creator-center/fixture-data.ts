/**
 * K2-T-10 创建者中心 fixture 数据（内联 TS 模块）。
 *
 * 独立于 licensing/fixture-data.ts，使用 15% 平台服务费比例（PRD §9.6 默认值）。
 *
 * 数据约束（PRD §9.6 强制）：
 * - netAmount = grossAmount - platformFee
 * - platformFee = grossAmount * 15%（向上取整到分）
 * - 结算状态全部为人工（pending_manual / processing / completed_manual）
 * - manualSettlement 恒为 true
 * - 不暴露内部 Prompt、存储路径与敏感元数据
 *
 * 同步副本写入 tests/fixtures/kiikis-v2/creator-center.json，由测试防漂移断言保证一致。
 */
import type {
  EarningRecord,
  EarningsSummary,
} from "../licensing/types.ts";
import type { CreatorProfile } from "./types.ts";

// ============================================================
// 创建者档案
// ============================================================

export const FIXTURE_CREATOR_PROFILE: CreatorProfile = {
  id: "creator-001",
  displayName: "Mara Studios",
  avatarUrl: null,
  bio: "独立数字艺术家，专注于赛博朋克与奇幻世界观创作。",
  totalAssets: 12,
  totalSales: 8,
  joinedAt: "2026-01-15T00:00:00.000Z",
};

// ============================================================
// 收益记录（6 个，覆盖全部 3 种人工结算状态，15% 服务费）
// ============================================================

export const FIXTURE_CREATOR_EARNINGS: readonly EarningRecord[] = [
  {
    id: "ern-cc-001",
    orderId: "ord-001",
    assetId: "ast-001",
    assetName: "Mara 赛博女侦探",
    grossAmount: 10000,
    platformFee: 1500, // 15%
    netAmount: 8500,
    settlementStatus: "completed_manual",
    createdAt: "2026-07-15T08:25:12.000Z",
    settledAt: "2026-08-01T10:00:00.000Z",
  },
  {
    id: "ern-cc-002",
    orderId: "ord-003",
    assetId: "ast-005",
    assetName: "玻璃海奇幻世界观包",
    grossAmount: 20000,
    platformFee: 3000, // 15%
    netAmount: 17000,
    settlementStatus: "processing",
    createdAt: "2026-06-20T10:31:00.000Z",
    settledAt: null,
  },
  {
    id: "ern-cc-003",
    orderId: "ord-001",
    assetId: "ast-001",
    assetName: "Mara 赛博女侦探",
    grossAmount: 15000,
    platformFee: 2250, // 15%
    netAmount: 12750,
    settlementStatus: "pending_manual",
    createdAt: "2026-07-22T08:25:12.000Z",
    settledAt: null,
  },
  {
    id: "ern-cc-004",
    orderId: "ord-001",
    assetId: "ast-001",
    assetName: "Mara 赛博女侦探",
    grossAmount: 8000,
    platformFee: 1200, // 15%
    netAmount: 6800,
    settlementStatus: "completed_manual",
    createdAt: "2026-07-29T08:25:12.000Z",
    settledAt: "2026-08-05T10:00:00.000Z",
  },
  {
    id: "ern-cc-005",
    orderId: "ord-001",
    assetId: "ast-001",
    assetName: "Mara 赛博女侦探",
    grossAmount: 30000,
    platformFee: 4500, // 15%
    netAmount: 25500,
    settlementStatus: "pending_manual",
    createdAt: "2026-08-08T08:25:12.000Z",
    settledAt: null,
  },
  {
    id: "ern-cc-006",
    orderId: "ord-001",
    assetId: "ast-001",
    assetName: "Mara 赛博女侦探",
    grossAmount: 12000,
    platformFee: 1800, // 15%
    netAmount: 10200,
    settlementStatus: "processing",
    createdAt: "2026-08-10T08:25:12.000Z",
    settledAt: null,
  },
];

// 预计算汇总（PRD §9.6 强制：manualSettlement=true）
export const FIXTURE_CREATOR_EARNINGS_SUMMARY: EarningsSummary = (() => {
  const totalGross = FIXTURE_CREATOR_EARNINGS.reduce(
    (s, e) => s + e.grossAmount,
    0,
  );
  const totalPlatformFee = FIXTURE_CREATOR_EARNINGS.reduce(
    (s, e) => s + e.platformFee,
    0,
  );
  const totalNet = FIXTURE_CREATOR_EARNINGS.reduce(
    (s, e) => s + e.netAmount,
    0,
  );
  const pendingManualAmount = FIXTURE_CREATOR_EARNINGS.filter(
    (e) => e.settlementStatus === "pending_manual",
  ).reduce((s, e) => s + e.netAmount, 0);
  const processingAmount = FIXTURE_CREATOR_EARNINGS.filter(
    (e) => e.settlementStatus === "processing",
  ).reduce((s, e) => s + e.netAmount, 0);
  const completedManualAmount = FIXTURE_CREATOR_EARNINGS.filter(
    (e) => e.settlementStatus === "completed_manual",
  ).reduce((s, e) => s + e.netAmount, 0);
  return {
    totalGross,
    totalPlatformFee,
    totalNet,
    pendingManualAmount,
    processingAmount,
    completedManualAmount,
    count: FIXTURE_CREATOR_EARNINGS.length,
    currency: "CNY",
    manualSettlement: true,
  };
})();

// ============================================================
// 完整 fixture 数据集
// ============================================================

export const FIXTURE_CREATOR_DATASET = {
  contractVersion: "2.0.0-alpha.1",
  profile: FIXTURE_CREATOR_PROFILE,
  earnings: FIXTURE_CREATOR_EARNINGS,
  earningsSummary: FIXTURE_CREATOR_EARNINGS_SUMMARY,
} as const;
