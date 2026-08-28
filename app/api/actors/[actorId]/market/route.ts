import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getViewerFromRequest, getSupabaseServerClient, hasServiceRoleConfig } from "@/lib/supabase/server";
import { getActorMarketDetail } from "@/lib/supabase/marketplace-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/actors/[actorId]/market
 * 公开，返回演员市场详情（演员信息+价格+销量+创作者+买家购买状态）。
 * 未登录 viewerId=null；已登录从 cookie 解析 viewerId。
 */
export async function GET(request: NextRequest, context: { params: Promise<{ actorId: string }> }) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "服务端缺少 SUPABASE_SERVICE_ROLE_KEY 配置。" }, { status: 503 });
    }
    const client = getSupabaseServerClient();
    if (!client) {
      return NextResponse.json({ success: false, error: "服务端 Supabase client 不可用。" }, { status: 503 });
    }

    const { actorId } = await context.params;
    const viewer = await getViewerFromRequest(request);
    const detail = await getActorMarketDetail(client, actorId, viewer?.id ?? null);

    if (!detail) {
      return NextResponse.json({ success: false, error: "演员不存在。", code: "ACTOR_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ success: true, ...detail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SUPABASE_SERVICE_ERROR")) {
      return NextResponse.json({ success: false, error: "云端数据服务暂时不可用。" }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: "读取市场详情失败。" }, { status: 500 });
  }
}
