import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import { getUniverseOwnership } from "@/lib/supabase/universe-share-queries";
import { fetchCharacterGraph } from "@/lib/universe/character-graph-queries";

/**
 * GET /api/universes/:universeId/character-graph
 *
 * 返回该宇宙的 Character Graph 数据（节点 + 边）。
 * 仅所有者可访问（访客分享通过 /shared 端点）。
 *
 * 响应：
 * - 200 { success: true, nodes: CharacterNode[], edges: CharacterEdge[] }
 * - 401 未登录
 * - 403 非所有者
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

    const ownership = await getUniverseOwnership(serverClient, universeId, user.id);
    if (!ownership.isOwner) {
      return Response.json(
        { success: false, error: "没有访问该宇宙的权限。", requestId },
        { status: 403 },
      );
    }

    const graph = await fetchCharacterGraph(serverClient, universeId);

    return ok({
      nodes: graph.nodes,
      edges: graph.edges,
      requestId,
    });
  } catch (error) {
    const errRes = apiError(error, "读取 Character Graph 失败。");
    const body = await errRes.json().catch(() => ({ success: false, error: "读取 Character Graph 失败。" }));
    return Response.json({ ...body, requestId }, { status: errRes.status });
  }
}
