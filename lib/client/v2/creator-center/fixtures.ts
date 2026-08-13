/**
 * K2-T-10 创建者中心 fixture 加载器。
 *
 * 从内联 TS 模块（fixture-data.ts）读取演示数据，
 * 不用 dynamic import 加载 tests/ 目录 JSON，避免打包与类型问题。
 * 真实数据走 api.ts 的 API 适配器。
 *
 * 返回深拷贝，避免调用方误改原 fixture 数据。
 *
 * 关键约束（PRD §9.6 强制）：
 * - 加载时验证收益净额计算（netAmount = grossAmount - platformFee）
 * - 加载时验证收益汇总人工结算标记（manualSettlement = true）
 * - 加载时验证平台服务费比例（15%）
 */
import {
  FIXTURE_CREATOR_DATASET,
  FIXTURE_CREATOR_EARNINGS,
  FIXTURE_CREATOR_EARNINGS_SUMMARY,
  FIXTURE_CREATOR_PROFILE,
} from "./fixture-data.ts";
import {
  CONTRACT_VERSION,
  PLATFORM_FEE_RATE,
  assertCreatorProfile,
  assertPlatformFeeRate,
  type CreatorDataset,
  type CreatorProfile,
} from "./types.ts";
import {
  assertEarningNetAmount,
  assertEarningsSummary,
  type EarningRecord,
  type EarningsSummary,
} from "../licensing/types.ts";

/** 深拷贝单个收益记录 */
function cloneEarning(earning: EarningRecord): EarningRecord {
  return { ...earning };
}

/** 深拷贝创建者档案 */
function cloneProfile(profile: CreatorProfile): CreatorProfile {
  return { ...profile };
}

/** 深拷贝收益汇总 */
function cloneSummary(summary: EarningsSummary): EarningsSummary {
  return { ...summary };
}

/** 加载 fixture 创建者档案（返回深拷贝） */
export function loadFixtureCreatorProfile(): CreatorProfile {
  const profile = cloneProfile(FIXTURE_CREATOR_PROFILE);
  assertCreatorProfile(profile);
  return profile;
}

/** 加载 fixture 创建者收益记录（返回深拷贝） */
export function loadFixtureCreatorEarnings(): EarningRecord[] {
  const earnings = FIXTURE_CREATOR_EARNINGS.map(cloneEarning);
  for (const e of earnings) {
    // PRD §9.6：净额计算校验
    assertEarningNetAmount(e);
    // PRD §9.6：平台服务费比例校验（15%）
    assertPlatformFeeRate(e);
  }
  return earnings;
}

/** 加载 fixture 创建者收益汇总（PRD §9.6：manualSettlement=true） */
export function loadFixtureCreatorEarningsSummary(): EarningsSummary {
  const summary = cloneSummary(FIXTURE_CREATOR_EARNINGS_SUMMARY);
  assertEarningsSummary(summary);
  return summary;
}

/** 加载完整 fixture 创建者数据集 */
export function loadFixtureCreatorDataset(): CreatorDataset {
  return {
    profile: loadFixtureCreatorProfile(),
    earnings: loadFixtureCreatorEarnings(),
    earningsSummary: loadFixtureCreatorEarningsSummary(),
  };
}

/** fixture 契约版本（用于运行时校验） */
export function fixtureCreatorContractVersion(): string {
  return FIXTURE_CREATOR_DATASET.contractVersion || CONTRACT_VERSION;
}

/** 平台服务费比例（PRD §9.6：15%） */
export function platformFeeRate(): number {
  return PLATFORM_FEE_RATE;
}
