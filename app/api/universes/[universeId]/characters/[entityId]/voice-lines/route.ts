import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import { getUniverseOwnership } from "@/lib/supabase/universe-share-queries";
import {
  fetchVoiceProfileByEntity,
  fetchVoiceLinesForProfile,
  createVoiceLine,
} from "@/lib/voice/queries";

/**
 * Voice Lines for a Character (TRAE-V2-03)
 *
 * GET  /api/universes/:universeId/characters/:entityId/voice-lines
 *   - 列出该角色当前 Voice Profile 下的所有 Voice Line
 *
 * POST /api/universes/:universeId/characters/:entityId/voice-lines
 *   - 为该角色创建一条 Voice Line
 *   - 若角色还没有 Voice Profile，先自动创建一个（draft 状态）
 *   - body: { text, language?, projectId?, sceneId?, shotId? }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ universeId: string; entityId: string }>;
  },
) {
  const requestId = crypto.randomUUID();
  try {
    const { universeId, entityId } = await context.params;
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

    const profile = await fetchVoiceProfileByEntity(serverClient, entityId, user.id);
    if (!profile) {
      return ok({ voiceProfile: null, voiceLines: [], requestId });
    }

    const voiceLines = await fetchVoiceLinesForProfile(serverClient, profile.id, user.id);
    return ok({ voiceProfile: profile, voiceLines, requestId });
  } catch (error) {
    const errRes = apiError(error, "读取 Voice Lines 失败。");
    const body = await errRes.json().catch(() => ({
      success: false,
      error: "读取 Voice Lines 失败。",
    }));
    return Response.json({ ...body, requestId }, { status: errRes.status });
  }
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ universeId: string; entityId: string }>;
  },
) {
  const requestId = crypto.randomUUID();
  try {
    const { universeId, entityId } = await context.params;
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

    const body = (await request.json().catch(() => null)) as {
      text: string;
      language?: string;
      ssml?: string;
      projectId?: string;
      sceneId?: string;
      shotId?: string;
    } | null;

    if (!body?.text?.trim()) {
      return Response.json(
        { success: false, error: "缺少 text 字段。", requestId },
        { status: 422 },
      );
    }

    // 若角色还没有 Voice Profile，自动创建一个 draft
    let profile = await fetchVoiceProfileByEntity(serverClient, entityId, user.id);
    if (!profile) {
      const { createVoiceProfile } = await import("@/lib/voice/queries");
      profile = await createVoiceProfile(serverClient, user.id, {
        universeEntityId: entityId,
      });
    }

    const voiceLine = await createVoiceLine(serverClient, user.id, {
      voiceProfileId: profile.id,
      text: body.text,
      language: body.language,
      ssml: body.ssml,
      projectId: body.projectId,
      sceneId: body.sceneId,
      shotId: body.shotId,
    });

    return ok({ voiceProfile: profile, voiceLine, requestId });
  } catch (error) {
    const errRes = apiError(error, "创建 Voice Line 失败。");
    const body = await errRes.json().catch(() => ({
      success: false,
      error: "创建 Voice Line 失败。",
    }));
    return Response.json({ ...body, requestId }, { status: errRes.status });
  }
}
