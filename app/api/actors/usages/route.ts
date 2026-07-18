import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig } from "@/lib/supabase/server";
import { listMyUsages, listUsagesForActorOwner } from "@/lib/supabase/actor-usages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/actors/usages
 * 列出使用记录。
 *
 * Query: view=mine|owned
 *   - mine: 当前用户作为 consumer 的使用记录（我在用谁的演员）
 *   - owned: 当前用户作为 actor_owner 的被使用记录（谁在用我的演员）
 *
 * 返回: { usages: ActorUsageWithActor[] }
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const view = request.nextUrl.searchParams.get("view") || "mine";
    const usages = view === "owned"
      ? await listUsagesForActorOwner(user.id)
      : await listMyUsages(user.id);

    return ok({ usages });
  } catch (error) {
    return apiError(error, "读取使用记录失败。");
  }
}
