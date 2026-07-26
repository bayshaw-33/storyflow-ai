import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import {
  fetchVoiceLineById,
  updateVoiceLine,
  markVoiceLineStatus,
} from "@/lib/voice/queries";
import type { UpdateVoiceLineInput } from "@/lib/voice/types";

/**
 * Single Voice Line CRUD (TRAE-V2-03)
 *
 * GET   /api/voice-lines/:voiceLineId         读取单条
 * PATCH /api/voice-lines/:voiceLineId         更新文本/作用域字段（已 approved 不可改）
 * DELETE /api/voice-lines/:voiceLineId        软删除（status='draft'，不可恢复 approved）
 *
 * 所有操作强制 owner_id 校验。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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

    const voiceLine = await fetchVoiceLineById(serverClient, voiceLineId, user.id);
    if (!voiceLine) {
      return Response.json(
        { success: false, error: "Voice Line 不存在或无权访问。", requestId },
        { status: 404 },
      );
    }

    return ok({ voiceLine, requestId });
  } catch (error) {
    const errRes = apiError(error, "读取 Voice Line 失败。");
    const body = await errRes.json().catch(() => ({
      success: false,
      error: "读取 Voice Line 失败。",
    }));
    return Response.json({ ...body, requestId }, { status: errRes.status });
  }
}

export async function PATCH(
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

    const body = (await request.json().catch(() => null)) as UpdateVoiceLineInput | null;
    if (!body) {
      return Response.json(
        { success: false, error: "缺少请求体。", requestId },
        { status: 422 },
      );
    }

    const voiceLine = await updateVoiceLine(serverClient, voiceLineId, user.id, body);
    return ok({ voiceLine, requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("VOICE_LINE_APPROVED_LOCKED")) {
      return Response.json(
        {
          success: false,
          error: "已批准的 Voice Line 不可直接修改，请先撤销批准。",
          requestId,
        },
        { status: 409 },
      );
    }
    const errRes = apiError(error, "更新 Voice Line 失败。");
    const body = await errRes.json().catch(() => ({
      success: false,
      error: "更新 Voice Line 失败。",
    }));
    return Response.json({ ...body, requestId }, { status: errRes.status });
  }
}

export async function DELETE(
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

    // 软删除：状态回到 draft，asset 保留（可恢复）
    // 注意：已 approved 的 Line 撤销批准前不允许删除
    const voiceLine = await markVoiceLineStatus(
      serverClient,
      voiceLineId,
      user.id,
      "draft",
    );
    return ok({ voiceLine, requestId });
  } catch (error) {
    const errRes = apiError(error, "删除 Voice Line 失败。");
    const body = await errRes.json().catch(() => ({
      success: false,
      error: "删除 Voice Line 失败。",
    }));
    return Response.json({ ...body, requestId }, { status: errRes.status });
  }
}
