import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import { getUniverseOwnership } from "@/lib/supabase/universe-share-queries";
import { createRelationship, type RelationshipInput } from "@/lib/universe/character-graph-queries";

/**
 * POST /api/universes/:universeId/relationships
 *
 * 新建关系。同一 source+target+type 幂等。
 *
 * 请求体：
 * { source_entity_id, target_entity_id, relationship_type?, relationship_status?, summary?, status? }
 *
 * 响应：
 * - 200 { success: true, relationship: CharacterEdge }
 * - 400 参数错误（自指、缺失端点）
 * - 403 非所有者
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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

    const body = (await request.json().catch(() => null)) as RelationshipInput | null;
    if (!body?.source_entity_id || !body?.target_entity_id) {
      return Response.json(
        { success: false, error: "缺少 source_entity_id 或 target_entity_id。", requestId },
        { status: 400 },
      );
    }

    const relationship = await createRelationship(serverClient, universeId, user.id, body);

    return ok({
      relationship,
      requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // 业务错误映射
    if (message.includes("RELATIONSHIP_SELF_REFERENCE")) {
      return Response.json(
        { success: false, error: "不能创建自指关系。", requestId },
        { status: 400 },
      );
    }
    if (message.includes("RELATIONSHIP_MISSING_ENDPOINT")) {
      return Response.json(
        { success: false, error: "关系两端不能为空。", requestId },
        { status: 400 },
      );
    }
    if (message.includes("RELATIONSHIP_ENTITY_NOT_FOUND")) {
      return Response.json(
        { success: false, error: "关系端点不属于该宇宙或不是角色实体。", requestId },
        { status: 404 },
      );
    }
    const errRes = apiError(error, "新建关系失败。");
    const body = await errRes.json().catch(() => ({ success: false, error: "新建关系失败。" }));
    return Response.json({ ...body, requestId }, { status: errRes.status });
  }
}
