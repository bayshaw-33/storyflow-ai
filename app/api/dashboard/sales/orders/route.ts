import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest, getSupabaseServerClient, hasServiceRoleConfig } from "@/lib/supabase/server";
import { getSellerOrders } from "@/lib/supabase/marketplace-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/sales/orders?cursor=0&limit=12
 * 订单列表（必须登录）。
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

    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const limitRaw = Number(url.searchParams.get("limit") || "12");
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 50 ? limitRaw : 12;

    const result = await getSellerOrders(client, user.id, cursor, limit);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN") {
      return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
    }
    if (message.includes("SUPABASE_SERVICE_ERROR")) {
      return NextResponse.json({ success: false, error: "云端数据服务暂时不可用。" }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: "读取订单列表失败。" }, { status: 500 });
  }
}
