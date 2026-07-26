import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import { getUniverseOwnership } from "@/lib/supabase/universe-share-queries";
import {
  deprecateRelationship,
  updateRelationship,
  type RelationshipUpdate,
} from "@/lib/universe/character-graph-queries";

/**
 * PATCH /api/universes/:universeId/relationships/:relationshipId
 * 编辑关系类型、状态、摘要、Canon 状态。
 *
 * DELETE /api/universes/:universeId/relationships/:relationshipId
 * 废弃关系（改为 deprecated，不物理删除）。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ universeId: string; relationshipId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { universeId, relationshipId } = await context.params;
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

    const body = (await request.json().catch(() => null)) as RelationshipUpdate | null;
    if (!body) {
      return Response.json(
        { success: false, error: "请求体必须是 JSON 对象。", requestId },
        { status: 400 },
      );
    }

    const relationship = await updateRelationship(
      serverClient,
      universeId,
      user.id,
      relationshipId,
      body,
    );

    return ok({
      relationship,
      requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("RELATIONSHIP_NOT_FOUND")) {
      return Response.json(
        { success: false, error: "关系不存在。", requestId },
        { status: 404 },
      );
    }
    const errRes = apiError(error, "更新关系失败。");
    const body = await errRes.json().catch(() => ({ success: false, error: "更新关系失败。" }));
    return Response.json({ ...body, requestId }, { status: errRes.status });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ universeId: string; relationshipId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { universeId, relationshipId } = await context.params;
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

    const result = await deprecateRelationship(
      serverClient,
      universeId,
      user.id,
      relationshipId,
    );

    return ok({
      deprecated: result.deprecated,
      relationship: result.relationship,
      requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("RELATIONSHIP_NOT_FOUND")) {
      return Response.json(
        { success: false, error: "关系不存在。", requestId },
        { status: 404 },
      );
    }
    const errRes = apiError(error, "废弃关系失败。");
    const body = await errRes.json().catch(() => ({ success: false, error: "废弃关系失败。" }));
    return Response.json({ ...body, requestId }, { status: errRes.status });
  }
}
