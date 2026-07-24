/**
 * 演员市场销售总览聚合（阶段 D）。
 *
 * 设计文档 §3.5 / §5.3：
 * - total_revenue_kk / pending_revenue_kk / settled_revenue_kk / withdrawn_revenue_kk
 * - available_for_withdrawal_kk（= settled - withdrawn）
 * - total_sales_count / this_month_revenue_kk / this_month_sales_count
 *
 * 所有函数接收 service-role SupabaseClient（绕过 RLS）。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type SalesSummary = {
  total_revenue_kk: number;
  pending_revenue_kk: number;
  settled_revenue_kk: number;
  withdrawn_revenue_kk: number;
  available_for_withdrawal_kk: number;
  total_sales_count: number;
  this_month_revenue_kk: number;
  this_month_sales_count: number;
};

export const ZERO_SUMMARY: SalesSummary = {
  total_revenue_kk: 0,
  pending_revenue_kk: 0,
  settled_revenue_kk: 0,
  withdrawn_revenue_kk: 0,
  available_for_withdrawal_kk: 0,
  total_sales_count: 0,
  this_month_revenue_kk: 0,
  this_month_sales_count: 0,
};

/**
 * 获取创作者销售总览。
 * 收益账本（storyflow_creator_revenue_ledger）状态机：
 *   pending → settled → withdrawn
 */
export async function getSalesSummary(
  serverClient: SupabaseClient,
  userId: string,
): Promise<SalesSummary> {
  // 并发执行 4 个聚合查询 + 2 个月度查询
  const [
    totalRev,
    pendingRev,
    settledRev,
    withdrawnRev,
    totalSales,
    thisMonthSales,
  ] = await Promise.all([
    sumRevenue(serverClient, userId, undefined),
    sumRevenue(serverClient, userId, "pending"),
    sumRevenue(serverClient, userId, "settled"),
    sumRevenue(serverClient, userId, "withdrawn"),
    countSales(serverClient, userId),
    countSalesThisMonth(serverClient, userId),
  ]);

  const thisMonthRevenue = await sumRevenueThisMonth(serverClient, userId);

  const settled = settledRev;
  const withdrawn = withdrawnRev;
  const available = Math.max(0, settled - withdrawn);

  return {
    total_revenue_kk: totalRev,
    pending_revenue_kk: pendingRev,
    settled_revenue_kk: settled,
    withdrawn_revenue_kk: withdrawn,
    available_for_withdrawal_kk: available,
    total_sales_count: totalSales,
    this_month_revenue_kk: thisMonthRevenue,
    this_month_sales_count: thisMonthSales,
  };
}

// ============================================================
// 内部辅助
// ============================================================

async function sumRevenue(
  c: SupabaseClient,
  userId: string,
  status: "pending" | "settled" | "withdrawn" | undefined,
): Promise<number> {
  let q = c
    .from("storyflow_creator_revenue_ledger")
    .select("amount_kk")
    .eq("user_id", userId)
    .eq("type", "sale");
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).reduce((sum, row) => sum + (Number(row.amount_kk) || 0), 0);
}

async function sumRevenueThisMonth(
  c: SupabaseClient,
  userId: string,
): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data, error } = await c
    .from("storyflow_creator_revenue_ledger")
    .select("amount_kk")
    .eq("user_id", userId)
    .eq("type", "sale")
    .gte("created_at", monthStart);
  if (error) throw error;
  return (data || []).reduce((sum, row) => sum + (Number(row.amount_kk) || 0), 0);
}

async function countSales(c: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await c
    .from("storyflow_actor_orders")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", userId)
    .eq("status", "paid");
  if (error) throw error;
  return count ?? 0;
}

async function countSalesThisMonth(
  c: SupabaseClient,
  userId: string,
): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { count, error } = await c
    .from("storyflow_actor_orders")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", userId)
    .eq("status", "paid")
    .gte("paid_at", monthStart);
  if (error) throw error;
  return count ?? 0;
}
