/**
 * 演员市场抽成与定价计算（阶段 D）。
 *
 * 平台抽成 1%（PLATFORM_FEE_RATE = 1，单位：百分比）。
 * 1% 抽成在低价（≤99 KK）时为 0，这是自然结果。
 */

/** 平台抽成比例（百分比）。1 = 1%。 */
export const PLATFORM_FEE_RATE = 1;

/**
 * 计算抽成与创作者收益。
 * feeKk = floor(priceKk * PLATFORM_FEE_RATE / 100)
 * revenueKk = priceKk - feeKk
 */
export function calculateFees(priceKk: number): { feeKk: number; revenueKk: number } {
  const safe = Math.max(0, Math.floor(Number(priceKk) || 0));
  const feeKk = Math.floor((safe * PLATFORM_FEE_RATE) / 100);
  const revenueKk = safe - feeKk;
  return { feeKk, revenueKk };
}

/**
 * 判断演员是否为免费。NULL 或 0 视为免费。
 */
export function isFreeActor(priceKk: number | null | undefined): boolean {
  if (priceKk == null) return true;
  return Number(priceKk) === 0;
}
