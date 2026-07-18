import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig } from "@/lib/supabase/server";
import { createActorUsage } from "@/lib/supabase/actor-usages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/actors/[actorId]/use
 * 在项目中"使用此演员"——创建幂等使用授权记录。
 *
 * Body: { projectId, sourceUnitId?, portrayalId? }
 * 返回: { usage }
 *
 * 权限：
 * - 任意 authenticated 用户可调用（platform 共享演员对所有已登录用户可用）
 * - 校验 actor.visibility === "platform" 且 status !== "archived"
 * - 创建者不能"使用"自己的演员（ACTOR_OWNER_CANNOT_USE_SELF）
 * - 同 actor + 同 consumer + 同 project 幂等（ON CONFLICT DO NOTHING）
 *
 * PRD §使用规则：其他用户点击"使用此演员"时，不复制或修改原演员，
 * 而是建立使用授权记录。其他用户可以：在自己的作品中选用该演员；
 * 创建本作服装、妆造和角色形象；生成分镜图和视频。
 * 其他用户不能：修改演员身份资料；删除演员；修改基础头像和三视图。
 */
export async function POST(request: NextRequest, context: { params: Promise<{ actorId: string }> }) {
  try {
    const { actorId } = await context.params;
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const body = await request.json().catch(() => ({}));
    const projectId = String(body.projectId || "").trim();
    if (!projectId) throw new Error("PROJECT_REQUIRED");

    const usage = await createActorUsage({
      consumerId: user.id,
      actorId,
      projectId,
      sourceUnitId: body.sourceUnitId ? String(body.sourceUnitId) : null,
      portrayalId: body.portrayalId ? String(body.portrayalId) : null,
    });

    return ok({ usage });
  } catch (error) {
    return apiError(error, "使用演员失败。");
  }
}
