import { NextResponse } from "next/server";
import { getSupabaseServerClient, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/settle-revenue
 * 月结 cron：每月 1 号把上月及更早的 pending 改为 settled。
 *
 * 鉴权：header Authorization: Bearer ${CRON_SECRET}（环境变量）
 *
 * 设计文档 §6.2：
 * UPDATE storyflow_creator_revenue_ledger
 * SET status = 'settled', settled_at = now(),
 *     settlement_period = to_char(now() - interval '1 month', 'YYYYMM')
 * WHERE status = 'pending' AND created_at < date_trunc('month', now());
 */
export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ success: false, error: "CRON_SECRET 未配置。" }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (!token || token !== cronSecret) {
      return NextResponse.json({ success: false, error: "未授权。" }, { status: 401 });
    }

    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "服务端缺少 SUPABASE_SERVICE_ROLE_KEY 配置。" }, { status: 503 });
    }
    const client = getSupabaseServerClient();
    if (!client) {
      return NextResponse.json({ success: false, error: "服务端 Supabase client 不可用。" }, { status: 503 });
    }

    // 计算上月标识（YYYYMM）
    const now = new Date();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const settlementPeriod = `${lastMonth.getUTCFullYear()}${String(lastMonth.getUTCMonth() + 1).padStart(2, "0")}`;

    // 月初时间戳（UTC），pending 且 created_at 在本月之前的都需要结算
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const settledAt = now.toISOString();

    const { data, error } = await client
      .from("storyflow_creator_revenue_ledger")
      .update({
        status: "settled",
        settled_at: settledAt,
        settlement_period: settlementPeriod,
      })
      .eq("status", "pending")
      .lt("created_at", monthStart)
      .select("id");

    if (error) throw error;

    const settledCount = Array.isArray(data) ? data.length : 0;
    return NextResponse.json({
      success: true,
      settled_count: settledCount,
      settlement_period: settlementPeriod,
      settled_at: settledAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SUPABASE_SERVICE_ERROR")) {
      return NextResponse.json({ success: false, error: "云端数据服务暂时不可用。" }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: "月结失败。" }, { status: 500 });
  }
}
