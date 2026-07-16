import {
  buildActorBasePrompt,
  buildActorNegativePrompt,
  buildReferenceSheetPrompt,
  normalizeActorInput,
  type ActorProfile,
  type ActorProfileInput,
  type CharacterAppearanceVariant,
  type Team,
  type TeamMember,
  type TeamRole,
} from "@/lib/actors";
import { hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

type AssetRow = {
  id: string;
  user_id: string;
  team_id?: string | null;
  project_id?: string | null;
  asset_type: string;
  public_url?: string | null;
  storage_path?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const TEAM_WRITE_ROLES = new Set<TeamRole>(["owner", "admin", "editor"]);
const TEAM_ADMIN_ROLES = new Set<TeamRole>(["owner", "admin"]);

export type ActorLibraryStorageMode = "structured" | "project_snapshot" | "unavailable";

export type ActorLibraryResult = {
  actors: ActorProfile[];
  storageMode: ActorLibraryStorageMode;
  warning?: string;
};

export async function listTeamsForUser(userId: string) {
  ensureServiceRole();
  try {
    const memberships = await listMemberships(userId);
    const teamIds = memberships.map((item) => item.team_id);
    if (!teamIds.length) return [];

    const teams = await serviceFetch<Team[]>(
      `/rest/v1/storyflow_teams?id=in.(${teamIds.map(encodeURIComponent).join(",")})&select=*&order=updated_at.desc`,
    );

    return teams.map((team) => ({
      ...team,
      role: memberships.find((item) => item.team_id === team.id)?.role || "viewer",
    }));
  } catch (error) {
    if (isActorSchemaUnavailable(error)) return [];
    throw error;
  }
}

export async function createTeamForUser(userId: string, name: string) {
  ensureServiceRole();
  await assertActorSchemaAvailable();
  const now = new Date().toISOString();
  const team: Team = {
    id: crypto.randomUUID(),
    owner_id: userId,
    name: name.trim() || "Kiikis Team",
    created_at: now,
    updated_at: now,
  };

  await serviceFetch("/rest/v1/storyflow_teams", {
    method: "POST",
    body: JSON.stringify(team),
  });

  const member: TeamMember = {
    id: crypto.randomUUID(),
    team_id: team.id,
    user_id: userId,
    role: "owner",
    status: "active",
    created_at: now,
    updated_at: now,
  };

  await serviceFetch("/rest/v1/storyflow_team_members", {
    method: "POST",
    body: JSON.stringify(member),
  });

  return { ...team, role: "owner" as TeamRole };
}

export async function listActorLibraryForUser(userId: string): Promise<ActorLibraryResult> {
  ensureServiceRole();
  try {
    return {
      actors: await listStructuredActorsForUser(userId),
      storageMode: "structured",
    };
  } catch (error) {
    if (isServiceKeyInvalid(error)) {
      // service_role key 未配置或为占位值 —— 返回空列表 + 明确警告，而不是硬崩
      return {
        actors: [],
        storageMode: "unavailable",
        warning: "SUPABASE_SERVICE_ROLE_KEY 未配置或无效，演员库暂不可用。请在环境变量中填入真实的 service_role key。",
      };
    }
    if (isActorSchemaUnavailable(error)) {
      return {
        actors: await listFallbackActors(userId),
        storageMode: "project_snapshot",
        warning: "Actor structured tables are not available. Using storyflow_projects fallback storage.",
      };
    }
    throw error;
  }
}

export async function listActorsForUser(userId: string): Promise<ActorProfile[]> {
  return (await listActorLibraryForUser(userId)).actors;
}

async function listStructuredActorsForUser(userId: string) {
  const memberships = await listMemberships(userId);
  const teamIds = memberships.map((item) => item.team_id);
  const filters = [`owner_id=eq.${encodeURIComponent(userId)}`];
  if (teamIds.length) {
    filters.push(`and(visibility.eq.team,team_id.in.(${teamIds.map(encodeURIComponent).join(",")}))`);
  }

  const actors = await serviceFetch<ActorProfile[]>(
    `/rest/v1/storyflow_actor_profiles?or=(${filters.join(",")})&status=neq.archived&select=*&order=updated_at.desc`,
  );

  return hydrateActorAssets(actors);
}

export async function getActorForUser(userId: string, actorId: string) {
  ensureServiceRole();
  try {
    const rows = await serviceFetch<ActorProfile[]>(
      `/rest/v1/storyflow_actor_profiles?id=eq.${encodeURIComponent(actorId)}&status=neq.archived&select=*&limit=1`,
    );
    const actor = rows[0];
    if (!actor) throw new Error("ACTOR_NOT_FOUND");
    await assertCanReadActor(userId, actor);
    return (await hydrateActorAssets([actor]))[0];
  } catch (error) {
    if (isActorSchemaUnavailable(error) || isNotFound(error)) return getFallbackActor(userId, actorId);
    throw error;
  }
}

export async function createActorForUser(userId: string, input: ActorProfileInput) {
  ensureServiceRole();
  const normalized = normalizeActorInput(input);
  if (!normalized.name) throw new Error("ACTOR_NAME_REQUIRED");
  try {
    if (normalized.visibility === "team") {
      if (!normalized.team_id) throw new Error("TEAM_REQUIRED");
      await assertTeamRole(userId, normalized.team_id, TEAM_WRITE_ROLES);
    }
  } catch (error) {
    if (isActorSchemaUnavailable(error)) return createFallbackActor(userId, input);
    throw error;
  }

  const now = new Date().toISOString();
  const row: ActorProfile = {
    id: crypto.randomUUID(),
    owner_id: userId,
    team_id: normalized.visibility === "team" ? normalized.team_id : null,
    visibility: normalized.visibility,
    name: normalized.name,
    bio: normalized.bio,
    age_range: normalized.age_range,
    gender_expression: normalized.gender_expression,
    ethnicity_style: normalized.ethnicity_style,
    face_description: normalized.face_description,
    hair_description: normalized.hair_description,
    body_description: normalized.body_description,
    temperament: normalized.temperament,
    playable_roles: normalized.playable_roles,
    base_prompt: normalized.base_prompt || buildActorBasePrompt(normalized),
    negative_prompt: normalized.negative_prompt || buildActorNegativePrompt(normalized),
    avatar_asset_id: null,
    reference_sheet_asset_id: null,
    status: "draft",
    created_at: now,
    updated_at: now,
    metadata: normalized.metadata || undefined,
  };

  if (input.uploaded_avatar_data_url?.startsWith("data:image/")) {
    const asset = await createActorAsset({
      userId,
      teamId: row.team_id || null,
      actorId: row.id,
      assetType: "actor_avatar",
      publicUrl: input.uploaded_avatar_data_url,
      metadata: { source: "uploaded_avatar" },
    }).catch((error) => {
      if (isActorSchemaUnavailable(error)) return null;
      throw error;
    });
    row.avatar_asset_id = asset?.id || null;
    row.status = "ready";
  }

  try {
    await serviceFetch("/rest/v1/storyflow_actor_profiles", {
      method: "POST",
      body: JSON.stringify(row),
    });

    return (await hydrateActorAssets([row]))[0];
  } catch (error) {
    if (isActorSchemaUnavailable(error)) return createFallbackActor(userId, input);
    throw error;
  }
}

export async function updateActorForUser(userId: string, actorId: string, input: ActorProfileInput) {
  ensureServiceRole();
  const actor = await getActorForUser(userId, actorId);
  if (actor.storage_source === "project_snapshot") return updateFallbackActor(userId, actorId, input);
  await assertCanEditActor(userId, actor);
  const normalized = normalizeActorInput({ ...actor, ...input });
  if (!normalized.name) throw new Error("ACTOR_NAME_REQUIRED");

  if (normalized.visibility === "team") {
    if (!normalized.team_id) throw new Error("TEAM_REQUIRED");
    await assertTeamRole(userId, normalized.team_id, TEAM_WRITE_ROLES);
  }

  const patch: Partial<ActorProfile> = {
    team_id: normalized.visibility === "team" ? normalized.team_id : null,
    visibility: normalized.visibility,
    name: normalized.name,
    bio: normalized.bio,
    age_range: normalized.age_range,
    gender_expression: normalized.gender_expression,
    ethnicity_style: normalized.ethnicity_style,
    face_description: normalized.face_description,
    hair_description: normalized.hair_description,
    body_description: normalized.body_description,
    temperament: normalized.temperament,
    playable_roles: normalized.playable_roles,
    base_prompt: normalized.base_prompt,
    negative_prompt: normalized.negative_prompt,
    updated_at: new Date().toISOString(),
    metadata: normalized.metadata || undefined,
  };

  if (input.uploaded_avatar_data_url?.startsWith("data:image/")) {
    const asset = await createActorAsset({
      userId,
      teamId: patch.team_id || null,
      actorId,
      assetType: "actor_avatar",
      publicUrl: input.uploaded_avatar_data_url,
      metadata: { source: "uploaded_avatar" },
    });
    patch.avatar_asset_id = asset.id;
    patch.status = "ready";
  }

  await serviceFetch(`/rest/v1/storyflow_actor_profiles?id=eq.${encodeURIComponent(actorId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  return getActorForUser(userId, actorId);
}

export async function archiveActorForUser(userId: string, actorId: string) {
  ensureServiceRole();
  const actor = await getActorForUser(userId, actorId);
  if (actor.storage_source === "project_snapshot") return archiveFallbackActor(userId, actorId);
  await assertCanEditActor(userId, actor);
  await serviceFetch(`/rest/v1/storyflow_actor_profiles?id=eq.${encodeURIComponent(actorId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "archived", updated_at: new Date().toISOString() }),
  });
  return { id: actorId, status: "archived" };
}

export async function saveActorPrompt(userId: string, actorId: string | null, input: ActorProfileInput) {
  ensureServiceRole();
  const actor = actorId ? await getActorForUser(userId, actorId) : normalizeActorInput(input);
  if (actorId && (actor as ActorProfile).storage_source === "project_snapshot") {
    const merged = { ...actor, ...normalizeActorInput(input) };
    const basePrompt = buildActorBasePrompt(merged);
    const negativePrompt = buildActorNegativePrompt(merged);
    await updateFallbackActor(userId, actorId, { ...input, base_prompt: basePrompt, negative_prompt: negativePrompt });
    return { basePrompt, negativePrompt };
  }
  if (actorId) await assertCanEditActor(userId, actor as ActorProfile);
  const merged = { ...actor, ...normalizeActorInput(input) };
  const basePrompt = buildActorBasePrompt(merged);
  const negativePrompt = buildActorNegativePrompt(merged);

  if (actorId) {
    await serviceFetch(`/rest/v1/storyflow_actor_profiles?id=eq.${encodeURIComponent(actorId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        base_prompt: basePrompt,
        negative_prompt: negativePrompt,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  return { basePrompt, negativePrompt };
}

export async function saveGeneratedActorImage(params: {
  userId: string;
  actorId: string;
  imageUrl: string;
  assetType: "actor_avatar" | "actor_reference_sheet";
  prompt: string;
  provider: string;
  model: string;
}) {
  ensureServiceRole();
  const actor = await getActorForUser(params.userId, params.actorId);
  if (actor.storage_source === "project_snapshot") {
    const actorPatch: Partial<ActorProfile> = {
      status: "ready",
      updated_at: new Date().toISOString(),
    };
    if (params.assetType === "actor_avatar") actorPatch.avatar_url = params.imageUrl;
    if (params.assetType === "actor_reference_sheet") actorPatch.reference_sheet_url = params.imageUrl;
    const updated = await updateFallbackActor(params.userId, params.actorId, actorPatch as ActorProfileInput);
    return {
      asset: {
        id: crypto.randomUUID(),
        user_id: params.userId,
        project_id: null,
        asset_type: params.assetType,
        public_url: params.imageUrl,
        storage_path: null,
        metadata: { prompt: params.prompt, provider: params.provider, model: params.model, fallback: true },
        created_at: new Date().toISOString(),
      },
      actor: updated,
    };
  }
  await assertCanEditActor(params.userId, actor);
  const asset = await createActorAsset({
    userId: params.userId,
    teamId: actor.team_id || null,
    actorId: actor.id,
    assetType: params.assetType,
    publicUrl: params.imageUrl,
    metadata: {
      prompt: params.prompt,
      provider: params.provider,
      model: params.model,
    },
  });

  const patch: Partial<ActorProfile> = {
    status: "ready",
    updated_at: new Date().toISOString(),
  };
  if (params.assetType === "actor_avatar") patch.avatar_asset_id = asset.id;
  if (params.assetType === "actor_reference_sheet") patch.reference_sheet_asset_id = asset.id;

  await serviceFetch(`/rest/v1/storyflow_actor_profiles?id=eq.${encodeURIComponent(actor.id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  await recordVisualGeneration({
    userId: params.userId,
    actorId: actor.id,
    assetId: asset.id,
    stepKey: params.assetType,
    provider: params.provider,
    model: params.model,
    prompt: params.prompt,
    output: params.imageUrl,
  });

  return { asset, actor: await getActorForUser(params.userId, actor.id) };
}

export async function listAppearanceVariantsForProject(userId: string, projectId: string) {
  ensureServiceRole();
  return serviceFetch<CharacterAppearanceVariant[]>(
    `/rest/v1/storyflow_character_appearance_variants?user_id=eq.${encodeURIComponent(userId)}&project_id=eq.${encodeURIComponent(projectId)}&status=neq.archived&select=*&order=updated_at.desc`,
  );
}

export async function upsertAppearanceVariant(userId: string, input: Partial<CharacterAppearanceVariant>) {
  ensureServiceRole();
  if (!input.project_id) throw new Error("PROJECT_REQUIRED");
  if (!input.actor_id) throw new Error("ACTOR_REQUIRED");
  if (!input.character_name?.trim()) throw new Error("CHARACTER_NAME_REQUIRED");
  await getActorForUser(userId, input.actor_id);

  const now = new Date().toISOString();
  const row: CharacterAppearanceVariant = {
    id: input.id || crypto.randomUUID(),
    user_id: userId,
    project_id: input.project_id,
    universe_id: input.universe_id || null,
    actor_id: input.actor_id,
    universe_entity_id: input.universe_entity_id || null,
    character_name: input.character_name.trim(),
    project_style: input.project_style || "",
    costume_direction: input.costume_direction || "",
    prompt_pack: input.prompt_pack || {},
    front_asset_id: input.front_asset_id || null,
    three_view_asset_id: input.three_view_asset_id || null,
    reference_sheet_asset_id: input.reference_sheet_asset_id || null,
    status: input.status || "draft",
    created_at: input.created_at || now,
    updated_at: now,
  };

  await serviceFetch("/rest/v1/storyflow_character_appearance_variants?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(row),
  });

  return row;
}

export function buildActorReferencePrompt(actor: ActorProfile, input: { projectStyle?: string; characterRole?: string; costumeDirection?: string }) {
  return buildReferenceSheetPrompt({
    actor,
    avatarReference: actor.avatar_url ? `Use actor avatar URL as reference: ${actor.avatar_url}` : undefined,
    projectStyle: input.projectStyle,
    characterRole: input.characterRole,
    costumeDirection: input.costumeDirection,
  });
}

async function listMemberships(userId: string) {
  return serviceFetch<TeamMember[]>(
    `/rest/v1/storyflow_team_members?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=*`,
  );
}

async function assertCanReadActor(userId: string, actor: ActorProfile) {
  if (actor.owner_id === userId) return;
  if (actor.visibility === "team" && actor.team_id) {
    await assertTeamRole(userId, actor.team_id, new Set<TeamRole>(["owner", "admin", "editor", "viewer"]));
    return;
  }
  throw new Error("ACTOR_FORBIDDEN");
}

async function assertCanEditActor(userId: string, actor: ActorProfile) {
  if (actor.owner_id === userId) return;
  if (actor.team_id) {
    await assertTeamRole(userId, actor.team_id, TEAM_ADMIN_ROLES);
    return;
  }
  throw new Error("ACTOR_FORBIDDEN");
}

async function assertTeamRole(userId: string, teamId: string, allowed: Set<TeamRole>) {
  const rows = await serviceFetch<TeamMember[]>(
    `/rest/v1/storyflow_team_members?team_id=eq.${encodeURIComponent(teamId)}&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=*&limit=1`,
  );
  const member = rows[0];
  if (!member || !allowed.has(member.role)) throw new Error("TEAM_FORBIDDEN");
  return member;
}

async function hydrateActorAssets(actors: ActorProfile[]) {
  const assetIds = actors.flatMap((actor) => [actor.avatar_asset_id, actor.reference_sheet_asset_id].filter(Boolean) as string[]);
  if (!assetIds.length) return actors.map(markStructuredActor);

  const assets = await serviceFetch<AssetRow[]>(
    `/rest/v1/storyflow_assets?id=in.(${assetIds.map(encodeURIComponent).join(",")})&select=id,public_url,asset_type,metadata`,
  ).catch(() => []);
  const byId = new Map(assets.map((asset) => [asset.id, asset]));

  return actors.map((actor) => ({
    ...markStructuredActor(actor),
    avatar_url: actor.avatar_asset_id ? byId.get(actor.avatar_asset_id)?.public_url || null : null,
    reference_sheet_url: actor.reference_sheet_asset_id ? byId.get(actor.reference_sheet_asset_id)?.public_url || null : null,
  }));
}

function markStructuredActor(actor: ActorProfile): ActorProfile {
  return {
    ...actor,
    storage_source: actor.storage_source || "structured",
  };
}

async function createActorAsset(params: {
  userId: string;
  teamId?: string | null;
  actorId: string;
  assetType: string;
  publicUrl: string;
  metadata: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const asset: AssetRow = {
    id: crypto.randomUUID(),
    user_id: params.userId,
    team_id: params.teamId || null,
    project_id: null,
    asset_type: params.assetType,
    public_url: params.publicUrl,
    storage_path: null,
    metadata: {
      ...params.metadata,
      actor_id: params.actorId,
    },
    created_at: now,
  };

  try {
    await serviceFetch("/rest/v1/storyflow_assets", {
      method: "POST",
      body: JSON.stringify(asset),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("team_id") && !message.includes("PGRST204") && !message.includes("42703")) throw error;
    const { team_id: _teamId, ...legacyAsset } = asset;
    await serviceFetch("/rest/v1/storyflow_assets", {
      method: "POST",
      body: JSON.stringify(legacyAsset),
    });
  }

  return asset;
}

async function recordVisualGeneration(params: {
  userId: string;
  actorId: string;
  assetId: string;
  stepKey: string;
  provider: string;
  model: string;
  prompt: string;
  output: string;
}) {
  const now = new Date().toISOString();
  const taskId = crypto.randomUUID();
  await serviceFetch("/rest/v1/storyflow_generation_tasks", {
    method: "POST",
    body: JSON.stringify({
      id: taskId,
      user_id: params.userId,
      project_id: null,
      project_ref: params.actorId,
      step_key: params.stepKey,
      phase_key: "visual_asset",
      status: "completed",
      provider: params.provider,
      model: params.model,
      input_snapshot: { actorId: params.actorId, assetId: params.assetId, prompt: params.prompt },
      output_snapshot: params.output,
      started_at: now,
      completed_at: now,
      created_at: now,
    }),
  });

  await serviceFetch("/rest/v1/storyflow_generations", {
    method: "POST",
    body: JSON.stringify({
      id: crypto.randomUUID(),
      task_id: taskId,
      user_id: params.userId,
      project_id: null,
      step_key: params.stepKey,
      phase_key: "visual_asset",
      provider: params.provider,
      model: params.model,
      input_snapshot: { actorId: params.actorId, assetId: params.assetId, prompt: params.prompt },
      output_snapshot: params.output,
      created_at: now,
    }),
  });
}

type ActorLibrarySnapshot = {
  actors?: ActorProfile[];
};

type ActorLibraryProjectRow = {
  id: string;
  user_id: string;
  title: string;
  workflow_type: string;
  project_group: string;
  status: string;
  data: ActorLibrarySnapshot;
  created_at?: string;
  updated_at?: string;
};

async function listFallbackActors(userId: string) {
  const snapshot = await readFallbackActorLibrary(userId);
  return (snapshot.actors || [])
    .filter((actor) => actor.status !== "archived")
    .map(markFallbackActor)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

async function getFallbackActor(userId: string, actorId: string) {
  const actor = (await listFallbackActors(userId)).find((item) => item.id === actorId);
  if (!actor) throw new Error("ACTOR_NOT_FOUND");
  return actor;
}

async function createFallbackActor(userId: string, input: ActorProfileInput) {
  const normalized = normalizeActorInput({ ...input, visibility: "private", team_id: null });
  if (!normalized.name) throw new Error("ACTOR_NAME_REQUIRED");
  const snapshot = await readFallbackActorLibrary(userId);
  const now = new Date().toISOString();
  const actor = markFallbackActor({
    id: crypto.randomUUID(),
    owner_id: userId,
    team_id: null,
    visibility: "private",
    name: normalized.name,
    bio: normalized.bio,
    age_range: normalized.age_range,
    gender_expression: normalized.gender_expression,
    ethnicity_style: normalized.ethnicity_style,
    face_description: normalized.face_description,
    hair_description: normalized.hair_description,
    body_description: normalized.body_description,
    temperament: normalized.temperament,
    playable_roles: normalized.playable_roles,
    base_prompt: normalized.base_prompt || buildActorBasePrompt(normalized),
    negative_prompt: normalized.negative_prompt || buildActorNegativePrompt(normalized),
    avatar_asset_id: null,
    reference_sheet_asset_id: null,
    avatar_url: input.uploaded_avatar_data_url?.startsWith("data:image/") ? input.uploaded_avatar_data_url : null,
    reference_sheet_url: null,
    status: input.uploaded_avatar_data_url?.startsWith("data:image/") ? "ready" : "draft",
    created_at: now,
    updated_at: now,
    metadata: normalized.metadata || undefined,
  });

  await writeFallbackActorLibrary(userId, {
    actors: [actor, ...(snapshot.actors || []).filter((item) => item.id !== actor.id)],
  });

  return actor;
}

async function updateFallbackActor(userId: string, actorId: string, input: ActorProfileInput) {
  const snapshot = await readFallbackActorLibrary(userId);
  const actors = snapshot.actors || [];
  const current = actors.find((item) => item.id === actorId);
  if (!current) throw new Error("ACTOR_NOT_FOUND");

  const normalized = normalizeActorInput({ ...current, ...input, visibility: "private", team_id: null });
  const raw = input as Partial<ActorProfile>;
  const updated = markFallbackActor({
    ...current,
    team_id: null,
    visibility: "private",
    name: normalized.name || current.name,
    bio: normalized.bio,
    age_range: normalized.age_range,
    gender_expression: normalized.gender_expression,
    ethnicity_style: normalized.ethnicity_style,
    face_description: normalized.face_description,
    hair_description: normalized.hair_description,
    body_description: normalized.body_description,
    temperament: normalized.temperament,
    playable_roles: normalized.playable_roles,
    base_prompt: normalized.base_prompt || current.base_prompt,
    negative_prompt: normalized.negative_prompt || current.negative_prompt,
    avatar_url: raw.avatar_url || (input.uploaded_avatar_data_url?.startsWith("data:image/") ? input.uploaded_avatar_data_url : current.avatar_url),
    reference_sheet_url: raw.reference_sheet_url || current.reference_sheet_url,
    status: raw.status || current.status,
    updated_at: new Date().toISOString(),
    metadata: normalized.metadata || current.metadata || undefined,
  });

  await writeFallbackActorLibrary(userId, {
    actors: actors.map((actor) => (actor.id === actorId ? updated : actor)),
  });

  return updated;
}

async function archiveFallbackActor(userId: string, actorId: string) {
  const actor = await updateFallbackActor(userId, actorId, { status: "archived" } as ActorProfileInput);
  return { id: actor.id, status: actor.status };
}

async function readFallbackActorLibrary(userId: string): Promise<ActorLibrarySnapshot> {
  const rows = await serviceFetch<ActorLibraryProjectRow[]>(
    `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(fallbackActorProjectId(userId))}&user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,title,workflow_type,project_group,status,data&limit=1`,
  );
  return rows[0]?.data || { actors: [] };
}

async function writeFallbackActorLibrary(userId: string, snapshot: ActorLibrarySnapshot) {
  const now = new Date().toISOString();
  const row: ActorLibraryProjectRow = {
    id: fallbackActorProjectId(userId),
    user_id: userId,
    title: "Actor Library",
    workflow_type: "actor_library",
    project_group: "系统资产",
    status: "ready",
    data: {
      actors: (snapshot.actors || []).map((actor) => markFallbackActor(actor)),
    },
    updated_at: now,
  };

  await serviceFetch("/rest/v1/storyflow_projects?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(row),
  });
}

function fallbackActorProjectId(userId: string) {
  return `actor-library:${userId}`;
}

function markFallbackActor(actor: ActorProfile): ActorProfile {
  return {
    ...actor,
    team_id: null,
    visibility: "private",
    storage_source: "project_snapshot",
  };
}

async function assertActorSchemaAvailable() {
  try {
    await serviceFetch("/rest/v1/storyflow_actor_profiles?select=id&limit=1");
  } catch (error) {
    if (isActorSchemaUnavailable(error)) throw new Error("ACTOR_SCHEMA_UNAVAILABLE");
    throw error;
  }
}

function isActorSchemaUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    message.includes("storyflow_actor_profiles") ||
    message.includes("storyflow_team_members") ||
    message.includes("storyflow_teams") ||
    message.includes("storyflow_character_appearance_variants") ||
    message.includes("storyflow_projects") ||
    message.includes("Could not find") ||
    message.includes("PGRST205") ||
    message.includes("PGRST204") ||
    message.includes("42P01") ||
    message.includes("42703") ||
    message.includes("ACTOR_SCHEMA_UNAVAILABLE")
  );
}

// 401 通常是 service_role key 未配置或为占位值；交给上层返回明确提示而不是"云端数据服务暂时不可用"
function isServiceKeyInvalid(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    message.includes("SUPABASE_SERVICE_ERROR:401") ||
    message.includes("Invalid API key") ||
    message.includes("MISSING_SUPABASE_SERVICE_ROLE_KEY")
  );
}

function isNotFound(error: unknown) {
  return error instanceof Error && error.message === "ACTOR_NOT_FOUND";
}

function ensureServiceRole() {
  if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
}
