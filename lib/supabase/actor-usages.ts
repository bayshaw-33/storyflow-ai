import type { ActorProfile } from "@/lib/actors";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

function ensureServiceRole() {
  if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
}

/**
 * 平台共享演员使用留痕（PRD §P1 新增使用留痕表）。
 *
 * 业务规则：
 * - 其他用户点击"使用此演员"时，不复制或修改原演员，而是建立使用授权记录
 * - 同一演员在同一项目中的使用必须幂等（ON CONFLICT DO NOTHING）
 * - 初期所有平台演员免费使用（usage_type = internal_free）
 * - 取消共享后旧记录保留，但新使用被拒绝（createActorUsage 检查当前 visibility）
 * - 使用记录不可改不可删（RLS 无 UPDATE/DELETE 策略）
 */

export type ActorUsage = {
  id: string;
  actor_id: string;
  actor_owner_id: string;
  consumer_id: string;
  project_id: string;
  source_unit_id?: string | null;
  portrayal_id?: string | null;
  usage_type: string;
  terms_version: string;
  creator_snapshot: Record<string, unknown>;
  created_at: string;
  revoked_at?: string | null;
};

export type PlatformActorCard = {
  actor: PublicActorProfile;
  creator_display_name: string | null;
  usage_count: number;
};

/** Public platform card DTO. Never return owner IDs, asset IDs, prompts or internal metadata. */
export type PublicActorProfile = Pick<ActorProfile,
  "id" | "visibility" | "name" | "bio" | "age_range" | "gender_expression" |
  "ethnicity_style" | "face_description" | "hair_description" | "body_description" |
  "temperament" | "playable_roles" | "status" | "updated_at" | "avatar_url"
>;

export type ActorUsageWithActor = ActorUsage & {
  actor: ActorProfile | null;
};

/**
 * 创建使用记录（幂等）。
 * - 校验 actor 当前 visibility === "platform" 且 status === "ready"
 * - 校验 consumer 不是 actor_owner（创建者不需要"使用"自己的演员）
 * - 用 ON CONFLICT DO NOTHING 保证幂等
 * - creator_snapshot 存储使用时的演员快照（防止后续篡改）
 */
export async function createActorUsage(params: {
  consumerId: string;
  actorId: string;
  projectId: string;
  sourceUnitId?: string | null;
  portrayalId?: string | null;
}): Promise<ActorUsage> {
  ensureServiceRole();
  if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
  if (!params.projectId) throw new Error("PROJECT_REQUIRED");

  // 1. 用 service role 查 actor（不走 assertCanReadActor，因为 consumer 可能不是 owner/team）
  const rows = await serviceFetch<ActorProfile[]>(
    `/rest/v1/storyflow_actor_profiles?id=eq.${encodeURIComponent(params.actorId)}&select=*&limit=1`,
  );
  const actor = rows[0];
  if (!actor) throw new Error("ACTOR_NOT_FOUND");

  // 2. 校验当前 visibility 仍是 platform（取消共享后禁止新使用）
  if (actor.visibility !== "platform") throw new Error("ACTOR_NOT_PLATFORM_SHARED");
  if (actor.status === "archived") throw new Error("ACTOR_ARCHIVED");

  // 3. 创建者不需要"使用"自己的演员
  if (actor.owner_id === params.consumerId) throw new Error("ACTOR_OWNER_CANNOT_USE_SELF");

  // 4. 使用必须属于当前用户自己的项目。service role 会绕过 RLS，因此这里不能
  //    信任浏览器传入的 projectId。
  const projects = await serviceFetch<Array<{ id: string; owner_id: string | null; user_id: string | null }>>(
    `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(params.projectId)}&select=id,owner_id,user_id&limit=1`,
  );
  const project = projects[0];
  const projectOwnerId = project?.owner_id || project?.user_id;
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  if (!projectOwnerId || projectOwnerId !== params.consumerId) throw new Error("PROJECT_FORBIDDEN");

  // 5. 创建快照（防止后续创建者修改演员资料后，使用记录失去上下文）
  const creatorSnapshot = {
    name: actor.name,
    age_range: actor.age_range,
    gender_expression: actor.gender_expression,
    ethnicity_style: actor.ethnicity_style,
    temperament: actor.temperament,
    playable_roles: actor.playable_roles,
    avatar_asset_id: actor.avatar_asset_id,
    snapshot_at: new Date().toISOString(),
  };

  // 6. 幂等插入（ON CONFLICT DO NOTHING）
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    actor_id: params.actorId,
    actor_owner_id: actor.owner_id,
    consumer_id: params.consumerId,
    project_id: params.projectId,
    source_unit_id: params.sourceUnitId || null,
    portrayal_id: params.portrayalId || null,
    usage_type: "internal_free",
    terms_version: "v1",
    creator_snapshot: creatorSnapshot,
    created_at: now,
  };

  try {
    await serviceFetch("/rest/v1/storyflow_actor_usages", {
      method: "POST",
      headers: { Prefer: "return=representation,resolution=merge-duplicates" },
      body: JSON.stringify(row),
    });
  } catch (error) {
    // ON CONFLICT 命中时 PostgREST 返回 409，serviceFetch 抛错；这里降级为查询已有记录
    const msg = error instanceof Error ? error.message : "";
    if (!msg.includes("409") && !msg.includes("PGRST116")) throw error;
  }

  // 7. 查询并返回（无论新建还是已存在）
  const existing = await serviceFetch<ActorUsage[]>(
    `/rest/v1/storyflow_actor_usages?actor_id=eq.${encodeURIComponent(params.actorId)}&consumer_id=eq.${encodeURIComponent(params.consumerId)}&project_id=eq.${encodeURIComponent(params.projectId)}&select=*&limit=1`,
  );
  const usage = existing[0];
  if (!usage) throw new Error("ACTOR_USAGE_CREATE_FAILED");
  return usage;
}

/**
 * 列出平台共享演员（分页 + 创建者昵称 + 使用次数）。
 * 不暴露创建者邮箱/UUID/供应商 URL/内部存储路径。
 */
export async function listPlatformActors(params: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<{ actors: PlatformActorCard[]; total: number }> {
  ensureServiceRole();
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize || 20));
  const offset = (page - 1) * pageSize;

  // 1. 查询 platform 共享演员
  let query = `/rest/v1/storyflow_actor_profiles?visibility=eq.platform&status=neq.archived&select=*&order=updated_at.desc&limit=${pageSize}&offset=${offset}`;
  if (params.search) {
    const enc = encodeURIComponent(`%${params.search}%`);
    query = `/rest/v1/storyflow_actor_profiles?visibility=eq.platform&status=neq.archived&or=(name.ilike.${enc},bio.ilike.${enc},temperament.cs.%5B%22${encodeURIComponent(params.search)}%22%5D)&select=*&order=updated_at.desc&limit=${pageSize}&offset=${offset}`;
  }

  const actors = await serviceFetch<ActorProfile[]>(query);

  // 2. 查询总数（用 Prefer: count=exact header 或单独 count 请求）
  let countQuery = `/rest/v1/storyflow_actor_profiles?visibility=eq.platform&status=neq.archived&select=id`;
  const countResp = await serviceFetch<{ id: string }[]>(countQuery);
  const total = countResp.length;

  if (!actors.length) return { actors: [], total };

  // 3. 批量查询创建者昵称（不查邮箱）
  // Phase 0 Task 0.5：不再 .catch(() => []) 吞没 DB 错误，让 schema/RLS 错误透传到 route 层。
  const ownerIds = [...new Set(actors.map((a) => a.owner_id))];
  const profiles = await serviceFetch<{ user_id: string; display_name: string | null }[]>(
    `/rest/v1/storyflow_profiles?user_id=in.(${ownerIds.map(encodeURIComponent).join(",")})&select=user_id,display_name`,
  );
  const profileMap = new Map(profiles.map((p) => [p.user_id, p.display_name]));

  // 4. 批量查询使用次数
  // Phase 0 Task 0.5：同上，不再吞没 DB 错误。
  const actorIds = actors.map((a) => a.id);
  const usageCounts = await serviceFetch<{ actor_id: string }[]>(
    `/rest/v1/storyflow_actor_usages?actor_id=in.(${actorIds.map(encodeURIComponent).join(",")})&select=actor_id`,
  );
  const usageCountMap = new Map<string, number>();
  for (const u of usageCounts) {
    usageCountMap.set(u.actor_id, (usageCountMap.get(u.actor_id) || 0) + 1);
  }

  // 5. 组装返回（不暴露 owner_id 原始值给前端——只暴露 display_name）
  const cards: PlatformActorCard[] = actors.map((actor) => ({
    actor: toPublicActorProfile(actor),
    creator_display_name: profileMap.get(actor.owner_id) || null,
    usage_count: usageCountMap.get(actor.id) || 0,
  }));

  return { actors: cards, total };
}

function toPublicActorProfile(actor: ActorProfile): PublicActorProfile {
  return {
    id: actor.id,
    visibility: actor.visibility,
    name: actor.name,
    bio: actor.bio,
    age_range: actor.age_range,
    gender_expression: actor.gender_expression,
    ethnicity_style: actor.ethnicity_style,
    face_description: actor.face_description,
    hair_description: actor.hair_description,
    body_description: actor.body_description,
    temperament: actor.temperament,
    playable_roles: actor.playable_roles,
    status: actor.status,
    updated_at: actor.updated_at,
    avatar_url: actor.avatar_url || null,
  };
}

/**
 * 列出当前用户的使用记录（带演员最新信息）。
 */
export async function listMyUsages(consumerId: string): Promise<ActorUsageWithActor[]> {
  ensureServiceRole();
  const usages = await serviceFetch<ActorUsage[]>(
    `/rest/v1/storyflow_actor_usages?consumer_id=eq.${encodeURIComponent(consumerId)}&order=created_at.desc&select=*`,
  );

  if (!usages.length) return [];

  // 批量查询演员最新信息
  const actorIds = [...new Set(usages.map((u) => u.actor_id))];
  const actors = await serviceFetch<ActorProfile[]>(
    `/rest/v1/storyflow_actor_profiles?id=in.(${actorIds.map(encodeURIComponent).join(",")})&select=*`,
  ).catch(() => []);
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  return usages.map((u) => ({
    ...u,
    actor: actorMap.get(u.actor_id) || null,
  }));
}

/**
 * 列出当前用户创建的演员被使用的记录（创建者视角）。
 */
export async function listUsagesForActorOwner(ownerId: string): Promise<ActorUsageWithActor[]> {
  ensureServiceRole();
  const usages = await serviceFetch<ActorUsage[]>(
    `/rest/v1/storyflow_actor_usages?actor_owner_id=eq.${encodeURIComponent(ownerId)}&order=created_at.desc&select=*`,
  );

  if (!usages.length) return [];

  const actorIds = [...new Set(usages.map((u) => u.actor_id))];
  const actors = await serviceFetch<ActorProfile[]>(
    `/rest/v1/storyflow_actor_profiles?id=in.(${actorIds.map(encodeURIComponent).join(",")})&select=*`,
  ).catch(() => []);
  const actorMap = new Map(actors.map((a) => [a.id, a]));

  return usages.map((u) => ({
    ...u,
    actor: actorMap.get(u.actor_id) || null,
  }));
}
