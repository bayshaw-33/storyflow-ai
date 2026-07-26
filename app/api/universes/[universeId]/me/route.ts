import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import { getUniverseOwnership } from "@/lib/supabase/universe-share-queries";

/**
 * GET /api/universes/:universeId/me
 *
 * 返回当前访问者相对该宇宙的身份与分享状态。
 * 用于客户端 isOwner 判断，避免依赖浏览器 RLS 返回 user_id 列。
 *
 * 响应：
 * - 200 { success: true, isOwner: boolean, shareStatus: "private"|"shared"|"removed"|null }
 * - 401 未登录
 *
 * 注意：本端点不暴露 user_id、share_password 等敏感字段。
 *       出于安全，不区分“宇宙不存在”与“非所有者访问”，统一返回 isOwner=false。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ universeId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { universeId } = await context.params;
    const user = await authenticateRequest(request);

    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
    const serverClient = getSupabaseServerClient();
    if (!serverClient) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const result = await getUniverseOwnership(serverClient, universeId, user.id);

    return ok({
      isOwner: result.isOwner,
      shareStatus: result.shareStatus,
      requestId,
    });
  } catch (error) {
    const errRes = apiError(error, "读取宇宙身份失败。");
    const body = await errRes.json().catch(() => ({ success: false, error: "读取宇宙身份失败。" }));
    return Response.json({ ...body, requestId }, { status: errRes.status });
  }
}
