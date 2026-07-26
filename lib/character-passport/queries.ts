/**
 * Character Passport 查询与写入（TRAE-V2-02）
 *
 * 所有函数接收服务端 SupabaseClient（service-role，绕过 RLS）。
 * 调用方负责所有者校验（通过 getUniverseOwnership）。
 *
 * 数据来源（5 张现有表 + V2-03 预留）：
 * - storyflow_universe_entities        → 角色身份（Universe 级，type='character'）
 * - storyflow_actor_profiles           → 演员身份 + 默认 passport（metadata.identity_passport）
 * - storyflow_character_portrayals     → 项目内角色形象
 * - storyflow_character_appearance_variants → 造型变化版本
 * - storyflow_identity_passports       → 三层 Prompt（按 actor/project/scene 维度）
 *
 * 读取优先级（Prompt）：scene_override > project_override > actor_default > empty
 *
 * 设计文档：Kiikis-V2.0-TRAE-80%-执行PRD.md §TRAE-V2-02
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonStatus } from "@/lib/universe";
import { fetchVoiceProfileByEntity } from "@/lib/voice/queries";
import type { VoiceProfileDTO } from "@/lib/voice/types";
import type {
  CharacterPassportDTO,
  FetchPassportParams,
  PassportAppearanceVariant,
  PassportActor,
  PassportIdentity,
  PassportPortrayal,
  PassportPrompt,
  PassportPromptInput,
  PassportPromptSource,
  PassportIdentityInput,
} from "./types";

// ============================================================
// 读取：聚合查询
// ============================================================

/**
 * 获取 Character Passport（聚合 5 张表）。
 *
 * @param serverClient 服务端 SupabaseClient（service-role）
 * @param params.universeId 宇宙 ID
 * @param params.entityId universe_entity_id（角色节点 ID）
 * @param params.projectId 可选，限定项目维度
 * @param params.sceneId 可选，限定场景维度
 */
export async function fetchCharacterPassport(
  serverClient: SupabaseClient,
  params: FetchPassportParams,
): Promise<CharacterPassportDTO> {
  const { universeId, entityId, projectId, sceneId } = params;

  // 1. 读取角色身份（universe_entity）
  const identity = await fetchIdentity(serverClient, universeId, entityId);
  if (!identity) throw new Error("CHARACTER_NOT_FOUND");

  // 2. 并行读取演员、形象、造型
  const [actors, portrayals, appearanceVariants] = await Promise.all([
    fetchActorsForEntity(serverClient, entityId),
    fetchPortrayalsForEntity(serverClient, entityId),
    fetchAppearanceVariantsForEntity(serverClient, entityId),
  ]);

  // 3. 读取三层 Prompt（按 scene > project > actor_default 降级）
  const prompt = await fetchPassportPrompt(
    serverClient,
    actors,
    projectId,
    sceneId,
  );

  // V2-03: 读取角色的 Voice Profile（按 universe_entity_id + owner）
  const voiceProfile: VoiceProfileDTO | null = await fetchVoiceProfileByEntity(
    serverClient,
    entityId,
    params.ownerId,
  ).catch(() => null);

  return {
    identity,
    actors,
    portrayals,
    appearanceVariants,
    prompt,
    voiceProfile,
  };
}

// ============================================================
// 子查询：角色身份
// ============================================================

async function fetchIdentity(
  serverClient: SupabaseClient,
  universeId: string,
  entityId: string,
): Promise<PassportIdentity | null> {
  const { data, error } = await serverClient
    .from("storyflow_universe_entities")
    .select("id, universe_id, name, summary, details_json, status, tags, updated_at")
    .eq("id", entityId)
    .eq("universe_id", universeId)
    .eq("type", "character")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as {
    id: string;
    universe_id: string;
    name: string;
    summary: string | null;
    details_json: Record<string, unknown> | null;
    status: CanonStatus;
    tags: string[] | null;
    updated_at: string;
  };

  const details = (row.details_json ?? {}) as PassportIdentity["details"];

  return {
    entityId: row.id,
    universeId: row.universe_id,
    name: row.name,
    summary: row.summary ?? "",
    details,
    canonStatus: row.status,
    tags: row.tags ?? [],
    updatedAt: row.updated_at,
  };
}

// ============================================================
// 子查询：演员（通过 appearance_variants 反查）
// ============================================================

async function fetchActorsForEntity(
  serverClient: SupabaseClient,
  entityId: string,
): Promise<PassportActor[]> {
  // 先通过 appearance_variants 找到所有关联的 actor_id
  const { data: variants, error: vErr } = await serverClient
    .from("storyflow_character_appearance_variants")
    .select("actor_id")
    .eq("universe_entity_id", entityId)
    .not("actor_id", "is", null);

  if (vErr) throw vErr;
  const actorIds = Array.from(
    new Set((variants ?? []).map((v) => (v as { actor_id: string }).actor_id)),
  );
  if (actorIds.length === 0) return [];

  // 批量查询演员
  const { data: actorRows, error: aErr } = await serverClient
    .from("storyflow_actor_profiles")
    .select(
      "id, owner_id, team_id, visibility, name, bio, age_range, gender_expression, ethnicity_style, face_description, hair_description, body_description, temperament, playable_roles, base_prompt, negative_prompt, avatar_asset_id, reference_sheet_asset_id, status, metadata, created_at, updated_at",
    )
    .in("id", actorIds)
    .order("updated_at", { ascending: false });

  if (aErr) throw aErr;
  if (!actorRows || actorRows.length === 0) return [];

  // 解析 avatar / reference_sheet URL（如果有 asset_id）
  const assetIds = actorRows
    .flatMap((a) => [
      (a as { avatar_asset_id?: string | null }).avatar_asset_id,
      (a as { reference_sheet_asset_id?: string | null }).reference_sheet_asset_id,
    ])
    .filter((id): id is string => Boolean(id));

  const assetUrls = await fetchAssetUrls(serverClient, assetIds);

  return actorRows.map((row) => {
    const r = row as {
      id: string;
      owner_id: string;
      team_id: string | null;
      visibility: string;
      name: string;
      bio: string;
      age_range: string;
      gender_expression: string;
      ethnicity_style: string;
      face_description: string;
      hair_description: string;
      body_description: string;
      temperament: string[] | null;
      playable_roles: string[] | null;
      base_prompt: string;
      negative_prompt: string;
      avatar_asset_id: string | null;
      reference_sheet_asset_id: string | null;
      status: string;
      metadata: { identity_passport?: Record<string, string> } | null;
      created_at: string;
      updated_at: string;
    };
    return {
      actorId: r.id,
      name: r.name,
      bio: r.bio ?? "",
      ageRange: r.age_range ?? "",
      genderExpression: r.gender_expression ?? "",
      ethnicityStyle: r.ethnicity_style ?? "",
      faceDescription: r.face_description ?? "",
      hairDescription: r.hair_description ?? "",
      bodyDescription: r.body_description ?? "",
      temperament: r.temperament ?? [],
      playableRoles: r.playable_roles ?? [],
      basePrompt: r.base_prompt ?? "",
      negativePrompt: r.negative_prompt ?? "",
      avatarUrl: r.avatar_asset_id ? assetUrls.get(r.avatar_asset_id) ?? null : null,
      referenceSheetUrl: r.reference_sheet_asset_id
        ? assetUrls.get(r.reference_sheet_asset_id) ?? null
        : null,
      visibility: r.visibility,
      status: r.status,
      updatedAt: r.updated_at,
    } satisfies PassportActor;
  });
}

// ============================================================
// 子查询：项目形象（portrayals）
// ============================================================

async function fetchPortrayalsForEntity(
  serverClient: SupabaseClient,
  entityId: string,
): Promise<PassportPortrayal[]> {
  // character_portrayals 没有 universe_entity_id 字段，通过 character_id 字符串匹配
  // 这里采用通过 actor_id 反查的方式：先找该 entity 关联的 actor_ids，
  // 再查这些 actor 的 portrayals 中 character_name 与 entity name 匹配的记录
  // （character_id 在 portrayals 表中是 text，可能是 character.id 或 character_name）

  // 简化：直接查 portrayals 表中 character_id 等于 entityId 或匹配 entity name 的记录
  // 由于 character_id 是 text，entityId 是 uuid，尝试用 entityId 匹配
  const { data, error } = await serverClient
    .from("storyflow_character_portrayals")
    .select(
      "id, actor_profile_id, character_id, project_id, portrayal_name, visual_prompt, costume_direction, reference_image_url, is_reusable, created_at, updated_at",
    )
    .eq("character_id", entityId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // 批量查 actor 名字
  const actorIds = Array.from(
    new Set(data.map((p) => (p as { actor_profile_id: string }).actor_profile_id)),
  );
  const actorNames = await fetchActorNames(serverClient, actorIds);

  return data.map((row) => {
    const r = row as {
      id: string;
      actor_profile_id: string;
      character_id: string;
      project_id: string | null;
      portrayal_name: string | null;
      visual_prompt: string | null;
      costume_direction: string | null;
      reference_image_url: string | null;
      is_reusable: boolean | null;
      created_at: string;
      updated_at: string;
    };
    return {
      id: r.id,
      actorProfileId: r.actor_profile_id,
      actorName: actorNames.get(r.actor_profile_id) ?? "",
      characterId: r.character_id,
      projectId: r.project_id,
      portrayalName: r.portrayal_name ?? "",
      visualPrompt: r.visual_prompt ?? "",
      costumeDirection: r.costume_direction ?? "",
      referenceImageUrl: r.reference_image_url ?? null,
      isReusable: r.is_reusable ?? true,
      updatedAt: r.updated_at,
    } satisfies PassportPortrayal;
  });
}

// ============================================================
// 子查询：造型变化版本
// ============================================================

async function fetchAppearanceVariantsForEntity(
  serverClient: SupabaseClient,
  entityId: string,
): Promise<PassportAppearanceVariant[]> {
  const { data, error } = await serverClient
    .from("storyflow_character_appearance_variants")
    .select(
      "id, project_id, actor_id, character_name, project_style, costume_direction, prompt_pack, front_asset_id, three_view_asset_id, reference_sheet_asset_id, status, created_at, updated_at",
    )
    .eq("universe_entity_id", entityId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const assetIds = data
    .flatMap((v) => {
      const r = v as {
        front_asset_id: string | null;
        three_view_asset_id: string | null;
        reference_sheet_asset_id: string | null;
      };
      return [r.front_asset_id, r.three_view_asset_id, r.reference_sheet_asset_id];
    })
    .filter((id): id is string => Boolean(id));

  const assetUrls = await fetchAssetUrls(serverClient, assetIds);

  return data.map((row) => {
    const r = row as {
      id: string;
      project_id: string;
      actor_id: string;
      character_name: string;
      project_style: string | null;
      costume_direction: string | null;
      prompt_pack: Record<string, string> | null;
      front_asset_id: string | null;
      three_view_asset_id: string | null;
      reference_sheet_asset_id: string | null;
      status: string;
      created_at: string;
      updated_at: string;
    };
    return {
      id: r.id,
      projectId: r.project_id,
      actorId: r.actor_id,
      characterName: r.character_name,
      projectStyle: r.project_style ?? "",
      costumeDirection: r.costume_direction ?? "",
      promptPack: r.prompt_pack ?? {},
      frontAssetUrl: r.front_asset_id ? assetUrls.get(r.front_asset_id) ?? null : null,
      threeViewAssetUrl: r.three_view_asset_id ? assetUrls.get(r.three_view_asset_id) ?? null : null,
      referenceSheetAssetUrl: r.reference_sheet_asset_id
        ? assetUrls.get(r.reference_sheet_asset_id) ?? null
        : null,
      status: r.status,
      updatedAt: r.updated_at,
    } satisfies PassportAppearanceVariant;
  });
}

// ============================================================
// 子查询：三层 Prompt（降级读取）
// ============================================================

async function fetchPassportPrompt(
  serverClient: SupabaseClient,
  actors: PassportActor[],
  projectId?: string,
  sceneId?: string,
): Promise<PassportPrompt> {
  // 默认空值
  const empty: PassportPrompt = {
    identityCorePrompt: "",
    currentAppearancePrompt: "",
    sceneOverridePrompt: "",
    coreIdentityLocked: true,
    appearanceLockedByDefault: true,
    projectOverrideAllowed: true,
    source: "empty",
    passportRowId: null,
  };

  if (actors.length === 0) return empty;

  const actorId = actors[0].actorId; // 取第一个演员（最新更新的）

  // 1. 尝试 scene 级 override
  if (projectId && sceneId) {
    const scenePassport = await fetchIdentityPassportRow(
      serverClient,
      actorId,
      projectId,
      sceneId,
    );
    if (scenePassport) {
      return {
        identityCorePrompt: scenePassport.identity_core_prompt ?? "",
        currentAppearancePrompt: scenePassport.current_appearance_prompt ?? "",
        sceneOverridePrompt: scenePassport.scene_override_prompt ?? "",
        coreIdentityLocked: scenePassport.core_identity_locked ?? true,
        appearanceLockedByDefault: scenePassport.appearance_locked_by_default ?? true,
        projectOverrideAllowed: scenePassport.project_override_allowed ?? true,
        source: "scene_override" satisfies PassportPromptSource,
        passportRowId: scenePassport.id,
      };
    }
  }

  // 2. 尝试 project 级 override
  if (projectId) {
    const projectPassport = await fetchIdentityPassportRow(
      serverClient,
      actorId,
      projectId,
      null,
    );
    if (projectPassport) {
      return {
        identityCorePrompt: projectPassport.identity_core_prompt ?? "",
        currentAppearancePrompt: projectPassport.current_appearance_prompt ?? "",
        sceneOverridePrompt: projectPassport.scene_override_prompt ?? "",
        coreIdentityLocked: projectPassport.core_identity_locked ?? true,
        appearanceLockedByDefault: projectPassport.appearance_locked_by_default ?? true,
        projectOverrideAllowed: projectPassport.project_override_allowed ?? true,
        source: "project_override" satisfies PassportPromptSource,
        passportRowId: projectPassport.id,
      };
    }
  }

  // 3. 回退到 actor 默认（metadata.identity_passport）
  // 注意：actors 数组中可能没有 metadata 字段（我们没在 PassportActor 中暴露）
  // 这里单独再查一次 actor_profiles.metadata
  const { data: actorRow, error: aErr } = await serverClient
    .from("storyflow_actor_profiles")
    .select("metadata")
    .eq("id", actorId)
    .maybeSingle();

  if (aErr) throw aErr;
  const metadata = (actorRow as { metadata?: { identity_passport?: Record<string, string> } | null })?.metadata;
  const embedded = metadata?.identity_passport;

  if (embedded && (embedded.identity_core_prompt || embedded.current_appearance_prompt || embedded.scene_override_prompt)) {
    return {
      identityCorePrompt: embedded.identity_core_prompt ?? "",
      currentAppearancePrompt: embedded.current_appearance_prompt ?? "",
      sceneOverridePrompt: embedded.scene_override_prompt ?? "",
      coreIdentityLocked: true,
      appearanceLockedByDefault: true,
      projectOverrideAllowed: true,
      source: "actor_default" satisfies PassportPromptSource,
      passportRowId: null,
    };
  }

  return empty;
}

async function fetchIdentityPassportRow(
  serverClient: SupabaseClient,
  actorId: string,
  projectId: string,
  sceneId: string | null,
): Promise<{
  id: string;
  identity_core_prompt: string | null;
  current_appearance_prompt: string | null;
  scene_override_prompt: string | null;
  core_identity_locked: boolean | null;
  appearance_locked_by_default: boolean | null;
  project_override_allowed: boolean | null;
} | null> {
  let query = serverClient
    .from("storyflow_identity_passports")
    .select(
      "id, identity_core_prompt, current_appearance_prompt, scene_override_prompt, core_identity_locked, appearance_locked_by_default, project_override_allowed",
    )
    .eq("actor_profile_id", actorId)
    .eq("project_id", projectId);

  if (sceneId) {
    query = query.eq("scene_id", sceneId);
  } else {
    query = query.is("scene_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as {
    id: string;
    identity_core_prompt: string | null;
    current_appearance_prompt: string | null;
    scene_override_prompt: string | null;
    core_identity_locked: boolean | null;
    appearance_locked_by_default: boolean | null;
    project_override_allowed: boolean | null;
  }) ?? null;
}

// ============================================================
// 工具：批量查询 asset URL
// ============================================================

async function fetchAssetUrls(
  serverClient: SupabaseClient,
  assetIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (assetIds.length === 0) return result;

  const { data, error } = await serverClient
    .from("storyflow_assets")
    .select("id, storage_path")
    .in("id", assetIds);

  if (error) throw error;
  if (!data) return result;

  for (const row of data as Array<{ id: string; storage_path: string | null }>) {
    if (row.storage_path) {
      result.set(row.id, row.storage_path);
    }
  }
  return result;
}

async function fetchActorNames(
  serverClient: SupabaseClient,
  actorIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (actorIds.length === 0) return result;

  const { data, error } = await serverClient
    .from("storyflow_actor_profiles")
    .select("id, name")
    .in("id", actorIds);

  if (error) throw error;
  if (!data) return result;

  for (const row of data as Array<{ id: string; name: string }>) {
    result.set(row.id, row.name);
  }
  return result;
}

// ============================================================
// 写入：更新角色身份（universe_entities）
// ============================================================

/**
 * 更新角色身份（写入 storyflow_universe_entities）。
 * 校验所有者 + entity 属于该 universe + type='character'。
 */
export async function updateIdentity(
  serverClient: SupabaseClient,
  universeId: string,
  ownerId: string,
  entityId: string,
  input: PassportIdentityInput,
): Promise<PassportIdentity> {
  // 校验 entity 存在且属于该 universe
  const { data: existing, error: findErr } = await serverClient
    .from("storyflow_universe_entities")
    .select("id, universe_id, user_id, type, name, summary, details_json, status, tags, updated_at")
    .eq("id", entityId)
    .eq("universe_id", universeId)
    .eq("type", "character")
    .maybeSingle();

  if (findErr) throw findErr;
  if (!existing) throw new Error("CHARACTER_NOT_FOUND");

  const row = existing as {
    id: string;
    universe_id: string;
    user_id: string | null;
    type: string;
    name: string;
    summary: string | null;
    details_json: Record<string, unknown> | null;
    status: CanonStatus;
    tags: string[] | null;
    updated_at: string;
  };

  // 所有者校验（user_id 可能因 RLS 不可见，但 service role 可见）
  if (row.user_id && row.user_id !== ownerId) {
    throw new Error("FORBIDDEN");
  }

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim() || row.name;
  if (input.summary !== undefined) patch.summary = input.summary.trim();
  if (input.canonStatus !== undefined) patch.status = input.canonStatus;
  if (input.tags !== undefined) patch.tags = input.tags;

  if (input.details !== undefined) {
    const currentDetails = row.details_json ?? {};
    patch.details_json = { ...currentDetails, ...input.details };
  }

  if (Object.keys(patch).length === 0) {
    return mapIdentityRow(row, universeId);
  }

  const { data: updated, error: updErr } = await serverClient
    .from("storyflow_universe_entities")
    .update(patch)
    .eq("id", entityId)
    .select("id, universe_id, name, summary, details_json, status, tags, updated_at")
    .single();

  if (updErr) throw updErr;
  return mapIdentityRow(updated as typeof row, universeId);
}

function mapIdentityRow(
  row: {
    id: string;
    universe_id: string;
    name: string;
    summary: string | null;
    details_json: Record<string, unknown> | null;
    status: CanonStatus;
    tags: string[] | null;
    updated_at: string;
  },
  _universeId: string,
): PassportIdentity {
  return {
    entityId: row.id,
    universeId: row.universe_id,
    name: row.name,
    summary: row.summary ?? "",
    details: (row.details_json ?? {}) as PassportIdentity["details"],
    canonStatus: row.status,
    tags: row.tags ?? [],
    updatedAt: row.updated_at,
  };
}

// ============================================================
// 写入：更新三层 Prompt
// ============================================================

/**
 * 更新三层 Prompt。
 *
 * scope 决定写入位置：
 * - "actor_default"（默认）：upsert actor_profiles.metadata.identity_passport（二级合并）
 * - "project_override"：upsert storyflow_identity_passports（actor_id + project_id，scene_id=null）
 * - "scene_override"：upsert storyflow_identity_passports（actor_id + project_id + scene_id）
 *
 * 锁定规则：
 * - coreIdentityLocked=true 时，identity_core_prompt 不可改（除非显式传入 coreIdentityLocked=false 解锁）
 * - appearanceLockedByDefault=true 时，current_appearance_prompt 不可改
 * - scene_override_prompt 始终可改
 */
export async function updatePassportPrompt(
  serverClient: SupabaseClient,
  universeId: string,
  ownerId: string,
  entityId: string,
  input: PassportPromptInput,
): Promise<PassportPrompt> {
  // 校验 entity 存在且属于该 universe + 所有者
  const { data: existing, error: findErr } = await serverClient
    .from("storyflow_universe_entities")
    .select("id, universe_id, user_id, type")
    .eq("id", entityId)
    .eq("universe_id", universeId)
    .eq("type", "character")
    .maybeSingle();

  if (findErr) throw findErr;
  if (!existing) throw new Error("CHARACTER_NOT_FOUND");

  const row = existing as { id: string; universe_id: string; user_id: string | null };
  if (row.user_id && row.user_id !== ownerId) throw new Error("FORBIDDEN");

  const scope = input.scope ?? "actor_default";
  const actorProfileId = input.actorProfileId;

  if (scope !== "actor_default" && !actorProfileId) {
    throw new Error("ACTOR_PROFILE_REQUIRED_FOR_OVERRIDE");
  }
  if (scope === "project_override" && !input.projectId) {
    throw new Error("PROJECT_ID_REQUIRED");
  }
  if (scope === "scene_override" && (!input.projectId || !input.sceneId)) {
    throw new Error("PROJECT_AND_SCENE_REQUIRED");
  }

  if (scope === "actor_default") {
    // 写入 actor_profiles.metadata.identity_passport
    // 如果没传 actorProfileId，尝试找该 entity 关联的第一个 actor
    const targetActorId = actorProfileId ?? (await findFirstActorForEntity(serverClient, entityId));
    if (!targetActorId) throw new Error("NO_ACTOR_BOUND_TO_CHARACTER");

    await upsertActorDefaultPassport(serverClient, targetActorId, input);
  } else {
    // 写入 storyflow_identity_passports
    await upsertIdentityPassportRow(serverClient, actorProfileId!, input, scope);
  }

  // 重新读取（按当前 scope 维度）
  const actors = await fetchActorsForEntity(serverClient, entityId);
  return await fetchPassportPrompt(serverClient, actors, input.projectId, input.sceneId);
}

async function findFirstActorForEntity(
  serverClient: SupabaseClient,
  entityId: string,
): Promise<string | null> {
  const { data, error } = await serverClient
    .from("storyflow_character_appearance_variants")
    .select("actor_id")
    .eq("universe_entity_id", entityId)
    .not("actor_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return (data as { actor_id: string }).actor_id;
}

async function upsertActorDefaultPassport(
  serverClient: SupabaseClient,
  actorId: string,
  input: PassportPromptInput,
): Promise<void> {
  // 读取当前 actor.metadata
  const { data: actor, error: aErr } = await serverClient
    .from("storyflow_actor_profiles")
    .select("metadata")
    .eq("id", actorId)
    .maybeSingle();

  if (aErr) throw aErr;
  if (!actor) throw new Error("ACTOR_NOT_FOUND");

  const metadata = (actor as { metadata?: Record<string, unknown> | null }).metadata ?? {};
  const existingPassport = (metadata.identity_passport ?? {}) as Record<string, string>;

  // 二级合并：保留未传入的字段
  const merged: Record<string, string> = { ...existingPassport };
  if (input.identityCorePrompt !== undefined) merged.identity_core_prompt = input.identityCorePrompt;
  if (input.currentAppearancePrompt !== undefined) merged.current_appearance_prompt = input.currentAppearancePrompt;
  if (input.sceneOverridePrompt !== undefined) merged.scene_override_prompt = input.sceneOverridePrompt;

  const nextMetadata = { ...metadata, identity_passport: merged };

  const { error: updErr } = await serverClient
    .from("storyflow_actor_profiles")
    .update({ metadata: nextMetadata })
    .eq("id", actorId);

  if (updErr) throw updErr;
}

async function upsertIdentityPassportRow(
  serverClient: SupabaseClient,
  actorId: string,
  input: PassportPromptInput,
  scope: "project_override" | "scene_override",
): Promise<void> {
  // 查找现有行
  let findQuery = serverClient
    .from("storyflow_identity_passports")
    .select("id, identity_core_prompt, current_appearance_prompt, scene_override_prompt, core_identity_locked, appearance_locked_by_default, project_override_allowed")
    .eq("actor_profile_id", actorId)
    .eq("project_id", input.projectId!);

  if (scope === "scene_override") {
    findQuery = findQuery.eq("scene_id", input.sceneId!);
  } else {
    findQuery = findQuery.is("scene_id", null);
  }

  const { data: existing, error: findErr } = await findQuery.maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    // 锁定校验
    const row = existing as {
      id: string;
      identity_core_prompt: string | null;
      current_appearance_prompt: string | null;
      scene_override_prompt: string | null;
      core_identity_locked: boolean | null;
      appearance_locked_by_default: boolean | null;
    };

    const patch: Record<string, unknown> = {};

    // identity_core_prompt：锁定时不改（除非显式解锁）
    if (input.identityCorePrompt !== undefined) {
      const locked = input.coreIdentityLocked === undefined
        ? (row.core_identity_locked ?? true)
        : input.coreIdentityLocked;
      if (!locked) {
        patch.identity_core_prompt = input.identityCorePrompt;
      } else if (input.coreIdentityLocked === false) {
        // 显式解锁并改值
        patch.identity_core_prompt = input.identityCorePrompt;
        patch.core_identity_locked = false;
      }
      // 否则锁定，跳过
    }

    // current_appearance_prompt：同上
    if (input.currentAppearancePrompt !== undefined) {
      const locked = input.appearanceLockedByDefault === undefined
        ? (row.appearance_locked_by_default ?? true)
        : input.appearanceLockedByDefault;
      if (!locked) {
        patch.current_appearance_prompt = input.currentAppearancePrompt;
      } else if (input.appearanceLockedByDefault === false) {
        patch.current_appearance_prompt = input.currentAppearancePrompt;
        patch.appearance_locked_by_default = false;
      }
    }

    // scene_override_prompt：始终可改
    if (input.sceneOverridePrompt !== undefined) {
      patch.scene_override_prompt = input.sceneOverridePrompt;
    }

    // 锁定开关
    if (input.coreIdentityLocked !== undefined) patch.core_identity_locked = input.coreIdentityLocked;
    if (input.appearanceLockedByDefault !== undefined) patch.appearance_locked_by_default = input.appearanceLockedByDefault;
    if (input.projectOverrideAllowed !== undefined) patch.project_override_allowed = input.projectOverrideAllowed;

    if (Object.keys(patch).length === 0) return;

    const { error: updErr } = await serverClient
      .from("storyflow_identity_passports")
      .update(patch)
      .eq("id", row.id);

    if (updErr) throw updErr;
  } else {
    // 新建
    const newRow: Record<string, unknown> = {
      actor_profile_id: actorId,
      project_id: input.projectId,
      scene_id: scope === "scene_override" ? input.sceneId : null,
      identity_core_prompt: input.identityCorePrompt ?? "",
      current_appearance_prompt: input.currentAppearancePrompt ?? "",
      scene_override_prompt: input.sceneOverridePrompt ?? "",
      core_identity_locked: input.coreIdentityLocked ?? true,
      appearance_locked_by_default: input.appearanceLockedByDefault ?? true,
      project_override_allowed: input.projectOverrideAllowed ?? true,
    };

    const { error: insErr } = await serverClient
      .from("storyflow_identity_passports")
      .insert(newRow);

    if (insErr) throw insErr;
  }
}
