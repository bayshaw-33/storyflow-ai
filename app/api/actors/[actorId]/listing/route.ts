import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest, getSupabaseServerClient, hasServiceRoleConfig } from "@/lib/supabase/server";
import { getActorListingStatus, updateActorListing, type ListingAction } from "@/lib/supabase/marketplace-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/actors/[actorId]/listing
 * 获取本人演员的上架状态（必须所有者）。
 */
export async function GET(request: NextRequest, context: { params: Promise<{ actorId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "服务端缺少 SUPABASE_SERVICE_ROLE_KEY 配置。" }, { status: 503 });
    }
    const client = getSupabaseServerClient();
    if (!client) {
      return NextResponse.json({ success: false, error: "服务端 Supabase client 不可用。" }, { status: 503 });
    }

    const { actorId } = await context.params;
    const listing = await getActorListingStatus(client, actorId, user.id);
    return NextResponse.json({ success: true, listing });
  } catch (error) {
    return errorResponse(error, "读取上架状态失败。");
  }
}

/**
 * PATCH /api/actors/[actorId]/listing
 * 上架/下架/改价（必须所有者）。
 * Body: { action: "publish"|"delist"|"update_price", price_kk?: number|null }
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ actorId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "服务端缺少 SUPABASE_SERVICE_ROLE_KEY 配置。" }, { status: 503 });
    }
    const client = getSupabaseServerClient();
    if (!client) {
      return NextResponse.json({ success: false, error: "服务端 Supabase client 不可用。" }, { status: 503 });
    }

    const { actorId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const action = body.action as ListingAction;
    if (action !== "publish" && action !== "delist" && action !== "update_price") {
      return NextResponse.json({ success: false, error: "无效的 action，支持 publish/delist/update_price。", code: "INVALID_LISTING_ACTION" }, { status: 400 });
    }

    let priceKk: number | null | undefined = undefined;
    if (body.price_kk !== undefined) {
      const n = Number(body.price_kk);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ success: false, error: "price_kk 必须为非负整数。", code: "INVALID_PRICE" }, { status: 400 });
      }
      priceKk = body.price_kk === null ? null : Math.floor(n);
    }

    const result = await updateActorListing(client, actorId, user.id, action, priceKk);
    return NextResponse.json({ success: true, listing: result });
  } catch (error) {
    return errorResponse(error, "更新上架状态失败。");
  }
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN") {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }
  if (message === "ACTOR_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "演员不存在。", code: "ACTOR_NOT_FOUND" }, { status: 404 });
  }
  if (message === "ACTOR_FORBIDDEN") {
    return NextResponse.json({ success: false, error: "无权操作该演员。", code: "ACTOR_FORBIDDEN" }, { status: 403 });
  }
  if (message === "LISTING_REMOVED_REQUIRES_ADMIN") {
    return NextResponse.json({ success: false, error: "该演员已被平台下架，需管理员恢复。", code: "LISTING_REMOVED_REQUIRES_ADMIN" }, { status: 403 });
  }
  if (message === "NOT_CURRENTLY_LISTED") {
    return NextResponse.json({ success: false, error: "当前不在上架状态，无法执行该操作。", code: "NOT_CURRENTLY_LISTED" }, { status: 400 });
  }
  if (message === "INVALID_LISTING_ACTION" || message === "INVALID_PRICE") {
    return NextResponse.json({ success: false, error: "参数无效。", code: message }, { status: 400 });
  }
  if (message.includes("SUPABASE_SERVICE_ERROR")) {
    return NextResponse.json({ success: false, error: "云端数据服务暂时不可用。" }, { status: 503 });
  }
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}
