import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import {
  approveVoiceLine,
  unapproveVoiceLine,
  fetchVoiceLineById,
} from "@/lib/voice/queries";

/**
 * POST /api/voice-lines/:voiceLineId/approve
 * POST /api/voice-lines/:voiceLineId/approve?action=unapprove
 *
 * 批准 / 撤销批准 Voice Line（TRAE-V2-03）。
 *
 * 批准约束：
 * - 必须 asset_id 非 null（已完成转存）
 * - 状态变为 approved（终态）
 *
 * 撤销批准：
 * - 从 approved 回到 generated
 * - asset_id 保留
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ voiceLineId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { voiceLineId } = await context.params;
    const user = await authenticateRequest(request);

    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
    const serverClient = getSupabaseServerClient();
    if (!serverClient) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "approve";

    if (action === "unapprove") {
      const voiceLine = await unapproveVoiceLine(serverClient, voiceLineId, user.id);
      return ok({ voiceLine, requestId });
    }

    // approve：校验 asset 存在
    const current = await fetchVoiceLineById(serverClient, voiceLineId, user.id);
    if (!current) {
      return Response.json(
        { success: false, error: "Voice Line 不存在或无权访问。", requestId },
        { status: 404 },
      );
    }
    if (!current.assetId) {
      return Response.json(
        {
          success: false,
          error: "尚未生成音频资产，无法批准。请先调用 generate 接口。",
          requestId,
        },
        { status: 422 },
      );
    }

    const voiceLine = await approveVoiceLine(serverClient, voiceLineId, user.id);
    return ok({ voiceLine, requestId });
  } catch (error) {
    const errRes = apiError(error, "批准操作失败。");
    const body = await errRes.json().catch(() => ({
      success: false,
      error: "批准操作失败。",
    }));
    return Response.json({ ...body, requestId }, { status: errRes.status });
  }
}
