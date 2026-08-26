import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, getSupabaseServerClient, hasServiceRoleConfig } from "@/lib/supabase/server";
import { getUniverseOwnership } from "@/lib/supabase/universe-share-queries";
import { createVoiceLine, createVoiceProfile, fetchVoiceProfileByEntity } from "@/lib/voice/queries";
import { isUuid, normalizeOptionalUuid } from "@/lib/validation/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
    const serverClient = getSupabaseServerClient();
    if (!serverClient) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const body = await request.json().catch(() => null) as {
      universeId?: string;
      entityId?: string;
      projectId?: string;
      sceneId?: string;
      lines?: Array<{ text?: string; language?: string; sceneId?: string; shotId?: string }>;
    } | null;
    if (!body?.universeId || !body.entityId || !Array.isArray(body.lines)) {
      return Response.json({ success: false, error: "缺少 universeId、entityId 或 lines。", requestId }, { status: 422 });
    }
    if (!isUuid(body.universeId)) return Response.json({ success: false, error: "universeId 必须是有效 UUID。", code: "INVALID_UNIVERSE_ID", requestId }, { status: 422 });
    if (!isUuid(body.entityId)) return Response.json({ success: false, error: "entityId 必须是有效 UUID。", code: "INVALID_ENTITY_ID", requestId }, { status: 422 });
    let projectId: string | null;
    try {
      projectId = normalizeOptionalUuid(body.projectId, "project_id");
    } catch {
      return Response.json({ success: false, error: "projectId 必须是有效 UUID。", code: "INVALID_PROJECT_ID", requestId }, { status: 422 });
    }
    const lines = body.lines.filter((line) => typeof line.text === "string" && line.text.trim()).slice(0, 100);
    if (!lines.length) return Response.json({ success: false, error: "至少输入一条台词。", requestId }, { status: 422 });

    const ownership = await getUniverseOwnership(serverClient, body.universeId, user.id);
    if (!ownership.isOwner) return Response.json({ success: false, error: "没有访问该 Universe 的权限。", requestId }, { status: 403 });

    let profile = await fetchVoiceProfileByEntity(serverClient, body.entityId, user.id);
    if (!profile) profile = await createVoiceProfile(serverClient, user.id, { universeEntityId: body.entityId });
    const voiceLines = [];
    for (const line of lines) {
      let sceneId: string | null;
      let shotId: string | null;
      try {
        sceneId = normalizeOptionalUuid(line.sceneId || body.sceneId, "scene_id");
        shotId = normalizeOptionalUuid(line.shotId, "shot_id");
      } catch {
        return Response.json({ success: false, error: "sceneId 和 shotId 必须是有效 UUID。", code: "INVALID_VOICE_LINE_SCOPE", requestId }, { status: 422 });
      }
      voiceLines.push(await createVoiceLine(serverClient, user.id, {
        voiceProfileId: profile.id,
        text: line.text!.trim(),
        language: line.language || profile.language,
        projectId: projectId ?? undefined,
        sceneId: sceneId ?? undefined,
        shotId: shotId ?? undefined,
      }));
    }
    return ok({ voiceProfile: profile, voiceLines, requestId });
  } catch (error) {
    const errRes = apiError(error, "批量创建台词失败。");
    const data = await errRes.json().catch(() => ({ success: false, error: "批量创建台词失败。" }));
    return Response.json({ ...data, requestId }, { status: errRes.status });
  }
}
