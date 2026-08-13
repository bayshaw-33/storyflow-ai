/**
 * K2-T-10 创建者中心 - 领域类型契约。
 *
 * 复用 licensing/types.ts 中的收益相关类型（EarningRecord / EarningsSummary /
 * SettlementStatus），并扩展创建者档案与创建者中心数据集类型。
 *
 * 关键约束（PRD §9.6 强制）：
 * - 所有结算状态均标注为人工，不显示为自动到账
 * - 平台服务费默认比例为 15%（PLATFORM_FEE_RATE）
 * - 收益净额 netAmount = grossAmount - platformFee
 *
 * contract_version 与 Codex v2 / licensing / marketplace 契约对齐。
 */

// 复用 licensing 收益相关类型（任务规格允许：可复用 licensing/types.ts）
// 使用相对路径，确保 Node.js 测试运行时可解析（与 licensing 内部模式一致）
import {
  CONTRACT_VERSION,
  ALL_SETTLEMENT_STATUSES,
  isManualSettlement,
  isTerminalSettlement,
  assertContractVersion,
  assertEarningNetAmount,
  assertEarningsSummary,
} from "../licensing/types.ts";
import type {
  EarningRecord,
  EarningsSummary,
  SettlementStatus,
  LicensingStatus,
} from "../licensing/types.ts";

// 暴露给外部消费者（保持 licensing 类型可从 creator-center 一处导入）
export {
  CONTRACT_VERSION,
  ALL_SETTLEMENT_STATUSES,
  isManualSettlement,
  isTerminalSettlement,
  assertContractVersion,
  assertEarningNetAmount,
  assertEarningsSummary,
};
export type {
  EarningRecord,
  EarningsSummary,
  SettlementStatus,
  LicensingStatus,
};

// ============================================================
// 平台服务费比例（PRD §9.6：默认 15%）
// ============================================================

/** 平台服务费默认比例（15%） */
export const PLATFORM_FEE_RATE = 0.15;

/**
 * 根据总收入计算平台服务费（分）。
 *
 * 默认比例 15%，向上取整到分，避免小数误差。
 */
export function computePlatformFee(grossAmountCents: number): number {
  return Math.ceil(grossAmountCents * PLATFORM_FEE_RATE);
}

/**
 * 根据总收入计算净收入（分）= grossAmount - platformFee。
 */
export function computeNetAmount(grossAmountCents: number): number {
  return grossAmountCents - computePlatformFee(grossAmountCents);
}

/**
 * 校验平台服务费比例是否为 15%。
 *
 * 允许 1 分的取整误差（因为 computePlatformFee 使用 Math.ceil）。
 */
export function assertPlatformFeeRate(earning: EarningRecord): void {
  const expected = computePlatformFee(earning.grossAmount);
  const actual = earning.platformFee;
  if (Math.abs(actual - expected) > 1) {
    throw new Error(
      `收益 ${earning.id} 服务费比例错误：期望 ${expected}（15%），实际 ${actual}`,
    );
  }
}

// ============================================================
// 创建者档案
// ============================================================

/** 创建者档案（创建者中心顶部展示） */
export interface CreatorProfile {
  /** 创建者用户 ID */
  id: string;
  /** 显示名称 */
  displayName: string;
  /** 头像 URL（可为空，UI 用占位符） */
  avatarUrl: string | null;
  /** 简介 */
  bio: string;
  /** 已发布资产数 */
  totalAssets: number;
  /** 已完成销售数（paid 订单数） */
  totalSales: number;
  /** 加入时间 */
  joinedAt: string;
}

/** 校验创建者档案字段完整性 */
export function assertCreatorProfile(profile: CreatorProfile): void {
  if (!profile.id) {
    throw new Error("创建者档案缺少 id");
  }
  if (!profile.displayName) {
    throw new Error("创建者档案缺少 displayName");
  }
  if (profile.totalAssets < 0) {
    throw new Error("创建者档案 totalAssets 不得为负");
  }
  if (profile.totalSales < 0) {
    throw new Error("创建者档案 totalSales 不得为负");
  }
}

// ============================================================
// 创建者中心数据集
// ============================================================

/** 创建者中心完整数据集（一次性加载） */
export interface CreatorDataset {
  /** 创建者档案 */
  profile: CreatorProfile;
  /** 收益记录列表 */
  earnings: EarningRecord[];
  /** 收益汇总 */
  earningsSummary: EarningsSummary;
}

/** 创建者中心加载状态（复用 LicensingStatus） */
export type CreatorCenterStatus = LicensingStatus;

/**
 * 校验创建者中心数据集完整性。
 *
 * 包括：
 * - 创建者档案字段
 * - 每条收益净额计算（netAmount = grossAmount - platformFee）
 * - 收益汇总净额计算（totalNet = totalGross - totalPlatformFee）
 * - 收益汇总人工结算标记（manualSettlement = true）
 */
export function assertCreatorDataset(dataset: CreatorDataset): void {
  assertCreatorProfile(dataset.profile);
  for (const e of dataset.earnings) {
    assertEarningNetAmount(e);
  }
  if (dataset.earningsSummary) {
    assertEarningsSummary(dataset.earningsSummary);
  }
}
