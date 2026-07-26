import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import { getUniverseOwnership } from "@/lib/supabase/universe-share-queries";
import {
  fetchCharacterPassport,
  updateIdentity,
  updatePassportPrompt,
} from "@/lib/character-passport/queries";
import {
  createVoiceProfile,
  updateVoiceProfile,
  fetchVoiceProfileByEntity,
} from "@/lib/voice/queries";
import type { CreateVoiceProfileInput, UpdateVoiceProfileInput } from "@/lib/voice/types";
import type {
  PassportIdentityInput,
  PassportPromptInput,
} from "@/lib/character-passport/types";

/**
 * GET /api/universes/:universeId/characters/:entityId/passport
 *
 * 返回 Character Passport（聚合 5 张表的组合 DTO）。
 *
 * Query:
 * - projectId?: 限定项目维度（影响 passport 读取顺序）
 * - sceneId?: 限定场景维度
 *
 * 响应：
 * - 200 { success: true, passport: CharacterPassportDTO }
 * - 401 未登录
 * - 403 非所有者
 * - 404 角色不存在
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

    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") || undefined;
    const sceneId = url.searchParams.get("sceneId") || undefined;

    const passport = await fetchCharacterPassport(serverClient, {
      ownerId: user.id,
      universeId,
      entityId,
      projectId,
      sceneId,
    });

    return ok({ passport, requestId });
  } catch (error) {
    const errRes = apiError(error, "读取 Character Passport 失败。");
    const body = await errRes.json().catch(() => ({
      success: false,
      error: "读取 Character Passport 失败。",
    }));
    return Response.json({ ...body, requestId }, { status: errRes.status });
  }
}

/**
 * PATCH /api/universes/:universeId/characters/:entityId/passport
 *
 * 更新 Passport。按 body.section 分发：
 * - section: "identity"  → 更新角色身份（universe_entities）
 * - section: "prompt"    → 更新三层 Prompt
 *
 * Body:
 * - section: "identity"
 *   { section: "identity", identity: PassportIdentityInput }
 * - section: "prompt"
 *   { section: "prompt", prompt: PassportPromptInput }
 *
 * 响应：
 * - 200 { success: true, ...更新后的部分 }
 * - 401 / 403 / 404
 * - 422 锁定字段被尝试修改
 */
export async function PATCH(
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

    const body = (await request.json().catch(() => null)) as
      | { section: "identity"; identity: PassportIdentityInput }
      | { section: "prompt"; prompt: PassportPromptInput }
      | { section: "voice"; voice: Partial<CreateVoiceProfileInput> }
      | null;

    if (!body || !body.section) {
      return Response.json(
        { success: false, error: "缺少 section 字段。", requestId },
        { status: 422 },
      );
    }

    if (body.section === "identity") {
      const identity = await updateIdentity(
        serverClient,
        universeId,
        user.id,
        entityId,
        body.identity,
      );
      return ok({ identity, requestId });
    }

    if (body.section === "prompt") {
      const prompt = await updatePassportPrompt(
        serverClient,
        universeId,
        user.id,
        entityId,
        body.prompt,
      );
      return ok({ prompt, requestId });
    }

    if (body.section === "voice") {
      // V2-03: 创建或更新该角色的 Voice Profile
      // - 已存在 → 更新
      // - 不存在 → 创建（自动绑定 universe_entity_id + owner_id）
      const input: CreateVoiceProfileInput = {
        universeEntityId: entityId,
        ...body.voice,
      };
      const existing = await fetchVoiceProfileByEntity(serverClient, entityId, user.id);
      let voiceProfile;
      if (existing) {
        voiceProfile = await updateVoiceProfile(
          serverClient,
          existing.id,
          user.id,
          input as UpdateVoiceProfileInput,
        );
      } else {
        voiceProfile = await createVoiceProfile(serverClient, user.id, input);
      }
      return ok({ voiceProfile, requestId });
    }

    const section = (body as { section?: string }).section ?? 'unknown';
    return Response.json(
      { success: false, error: `未知的 section: ${section}`, requestId },
      { status: 422 },
    );
  } catch (error) {
    const errRes = apiError(error, "更新 Character Passport 失败。");
    const body = await errRes.json().catch(() => ({
      success: false,
      error: "更新 Character Passport 失败。",
    }));
    return Response.json({ ...body, requestId }, { status: errRes.status });
  }
}
