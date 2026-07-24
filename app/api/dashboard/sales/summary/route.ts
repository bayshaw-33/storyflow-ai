import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest, getSupabaseServerClient, hasServiceRoleConfig } from "@/lib/supabase/server";
import { getSalesSummary } from "@/lib/marketplace/revenue-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/sales/summary
 * 销售总览（必须登录）。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "服务端缺少 SUPABASE_SERVICE_ROLE_KEY 配置。" }, { status: 503 });
    }
    const client = getSupabaseServerClient();
    if (!client) {
      return NextResponse.json({ success: false, error: "服务端 Supabase client 不可用。" }, { status: 503 });
    }

    const summary = await getSalesSummary(client, user.id);
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN") {
      return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
    }
    if (message.includes("SUPABASE_SERVICE_ERROR")) {
      return NextResponse.json({ success: false, error: "云端数据服务暂时不可用。" }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: "读取销售总览失败。" }, { status: 500 });
  }
}
