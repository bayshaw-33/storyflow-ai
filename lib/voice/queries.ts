/**
 * Voice Profile + Voice Line 查询与写入（TRAE-V2-03）
 *
 * 所有函数接收服务端 SupabaseClient（service-role，绕过 RLS）。
 * 调用方负责所有者校验（通过 getUniverseOwnership 或 authenticateRequest）。
 *
 * 数据来源（V2-03 新增表）：
 * - storyflow_character_voice_profiles → 角色声音档案
 * - storyflow_voice_lines              → 单条对白 TTS 记录
 *
 * 复用：storyflow_generation_jobs（job_type='audio', target_type='voice_line'）
 *
 * 安全约束（PRD §9 + §TRAE-V2-03）：
 * - 所有写入强制 owner_id = auth.uid()（service role 绕过 RLS，但业务层仍校验）
 * - 一个 actor/entity 至多一个非 archived 的 Voice Profile（唯一索引已建）
 * - Voice Line 必须挂在已存在的 Voice Profile 下
 * - 已批准音频不被新版本覆盖（revision 递增，asset_id 保留）
 * - 临时 Provider URL 永不入库（只接收 storage_path + signed_url 由 storage.ts 生成）
 *
 * 设计文档：Kiikis-V2.0-TRAE-80%-执行PRD.md §TRAE-V2-03
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateVoiceProfileInput,
  CreateVoiceLineInput,
  UpdateVoiceProfileInput,
  UpdateVoiceLineInput,
  VoiceLineStatus,
  VoiceProfileDTO,
  VoiceLineDTO,
  VoiceProfileStatus,
} from "./types";

// ============================================================
// 行类型（数据库 schema 对应）
// ============================================================

type VoiceProfileRow = {
  id: string;
  owner_id: string;
  actor_profile_id: string | null;
  universe_entity_id: string | null;
  voice_label: string;
  voice_provider: string;
  voice_provider_voice_id: string | null;
  language: string;
  speed: number;
  pitch: number;
  stability: number;
  style_prompt: string;
  sample_asset_id: string | null;
  consent_status?: string | null;
  consent_source_asset_id?: string | null;
  consent_confirmed_at?: string | null;
  consent_metadata?: Record<string, unknown> | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type VoiceLineRow = {
  id: string;
  owner_id: string;
  voice_profile_id: string;
  text: string;
  language: string;
  ssml: string | null;
  project_id: string | null;
  scene_id: string | null;
  shot_id: string | null;
  latest_job_id: string | null;
  asset_id: string | null;
  storage_path: string | null;
  signed_url: string | null;
  signed_url_expires_at: string | null;
  status: string;
  error: string | null;
  last_failed_at: string | null;
  duration_seconds: number | null;
  provider_metadata: Record<string, unknown> | null;
  revision: number;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

// ============================================================
// 读取：Voice Profile
// ============================================================

/**
 * 按 universe_entity_id 查询所有者的 Voice Profile。
 * 自动跳过 archived。
 */
export async function fetchVoiceProfileByEntity(
  serverClient: SupabaseClient,
  universeEntityId: string,
  ownerId: string,
): Promise<VoiceProfileDTO | null> {
  const { data, error } = await serverClient
    .from("storyflow_character_voice_profiles")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("universe_entity_id", universeEntityId)
    .neq("status", "archived")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapProfileRow(data as VoiceProfileRow);
}

/**
 * 按 actor_profile_id 查询所有者的 Voice Profile。
 * 自动跳过 archived。
 */
export async function fetchVoiceProfileByActor(
  serverClient: SupabaseClient,
  actorProfileId: string,
  ownerId: string,
): Promise<VoiceProfileDTO | null> {
  const { data, error } = await serverClient
    .from("storyflow_character_voice_profiles")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("actor_profile_id", actorProfileId)
    .neq("status", "archived")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapProfileRow(data as VoiceProfileRow);
}

/**
 * 按 ID 查询单个 Voice Profile（带 owner 校验）。
 */
export async function fetchVoiceProfileById(
  serverClient: SupabaseClient,
  voiceProfileId: string,
  ownerId: string,
): Promise<VoiceProfileDTO | null> {
  const { data, error } = await serverClient
    .from("storyflow_character_voice_profiles")
    .select("*")
    .eq("id", voiceProfileId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapProfileRow(data as VoiceProfileRow);
}

// ============================================================
// 读取：Voice Line
// ============================================================

/**
 * 列出某 Voice Profile 下的所有 Voice Line（最新优先）。
 */
export async function fetchVoiceLinesForProfile(
  serverClient: SupabaseClient,
  voiceProfileId: string,
  ownerId: string,
): Promise<VoiceLineDTO[]> {
  const { data, error } = await serverClient
    .from("storyflow_voice_lines")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("voice_profile_id", voiceProfileId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data as VoiceLineRow[] | null ?? []).map(mapLineRow);
}

/**
 * 按 ID 查询单条 Voice Line（带 owner 校验）。
 */
export async function fetchVoiceLineById(
  serverClient: SupabaseClient,
  voiceLineId: string,
  ownerId: string,
): Promise<VoiceLineDTO | null> {
  const { data, error } = await serverClient
    .from("storyflow_voice_lines")
    .select("*")
    .eq("id", voiceLineId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapLineRow(data as VoiceLineRow);
}

/**
 * 列出某 Shot 下的所有 Voice Line（用于 Production Assembly / Director）。
 */
export async function fetchVoiceLinesForShot(
  serverClient: SupabaseClient,
  projectId: string,
  shotId: string,
  ownerId: string,
): Promise<VoiceLineDTO[]> {
  const { data, error } = await serverClient
    .from("storyflow_voice_lines")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("project_id", projectId)
    .eq("shot_id", shotId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data as VoiceLineRow[] | null ?? []).map(mapLineRow);
}

// ============================================================
// 写入：Voice Profile
// ============================================================

/**
 * 创建 Voice Profile。
 *
 * 幂等规则：
 * - 同一 entity（或 actor）已有非 archived 的 Voice Profile → 直接返回现有
 * - 否则新建
 *
 * 校验：
 * - actor_profile_id 与 universe_entity_id 至少一个非空（DB CHECK）
 * - 都传时以 entity 优先（actor 作为辅助关联）
 */
export async function createVoiceProfile(
  serverClient: SupabaseClient,
  ownerId: string,
  input: CreateVoiceProfileInput,
): Promise<VoiceProfileDTO> {
  const actorProfileId = input.actorProfileId ?? null;
  const universeEntityId = input.universeEntityId ?? null;

  if (!actorProfileId && !universeEntityId) {
    throw new Error("VOICE_PROFILE_TARGET_REQUIRED");
  }

  // 幂等：先查
  let existing: VoiceProfileDTO | null = null;
  if (universeEntityId) {
    existing = await fetchVoiceProfileByEntity(serverClient, universeEntityId, ownerId);
  }
  if (!existing && actorProfileId) {
    existing = await fetchVoiceProfileByActor(serverClient, actorProfileId, ownerId);
  }
  if (existing) return existing;

  const newRow: Record<string, unknown> = {
    owner_id: ownerId,
    actor_profile_id: actorProfileId,
    universe_entity_id: universeEntityId,
    voice_label: input.voiceLabel ?? "",
    voice_provider: input.voiceProvider ?? "placeholder",
    voice_provider_voice_id: input.voiceProviderVoiceId ?? null,
    language: input.language ?? "zh",
    speed: input.speed ?? 1.0,
    pitch: input.pitch ?? 0,
    stability: input.stability ?? 0.5,
    style_prompt: input.stylePrompt ?? "",
    status: "draft",
    metadata: {},
  };

  const { data, error } = await serverClient
    .from("storyflow_character_voice_profiles")
    .insert(newRow)
    .select("*")
    .single();

  if (error) throw error;
  return mapProfileRow(data as VoiceProfileRow);
}

/**
 * 更新 Voice Profile。
 * 已 archived 的 Profile 不可再修改。
 */
export async function updateVoiceProfile(
  serverClient: SupabaseClient,
  voiceProfileId: string,
  ownerId: string,
  input: UpdateVoiceProfileInput,
): Promise<VoiceProfileDTO> {
  const current = await fetchVoiceProfileById(serverClient, voiceProfileId, ownerId);
  if (!current) throw new Error("VOICE_PROFILE_NOT_FOUND");
  if (current.status === "archived") throw new Error("VOICE_PROFILE_ARCHIVED");

  const patch: Record<string, unknown> = {};
  if (input.voiceLabel !== undefined) patch.voice_label = input.voiceLabel;
  if (input.voiceProvider !== undefined) patch.voice_provider = input.voiceProvider;
  if (input.voiceProviderVoiceId !== undefined) patch.voice_provider_voice_id = input.voiceProviderVoiceId;
  if (input.language !== undefined) patch.language = input.language;
  if (input.speed !== undefined) patch.speed = input.speed;
  if (input.pitch !== undefined) patch.pitch = input.pitch;
  if (input.stability !== undefined) patch.stability = input.stability;
  if (input.stylePrompt !== undefined) patch.style_prompt = input.stylePrompt;
  if (input.status !== undefined) patch.status = input.status;

  if (Object.keys(patch).length === 0) return current;

  const { data, error } = await serverClient
    .from("storyflow_character_voice_profiles")
    .update(patch)
    .eq("id", voiceProfileId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw error;
  return mapProfileRow(data as VoiceProfileRow);
}

/**
 * 归档 Voice Profile（软删除）。
 * 关联的 Voice Line 不会被删除，但状态会保留。
 */
export async function archiveVoiceProfile(
  serverClient: SupabaseClient,
  voiceProfileId: string,
  ownerId: string,
): Promise<void> {
  const { error } = await serverClient
    .from("storyflow_character_voice_profiles")
    .update({ status: "archived" })
    .eq("id", voiceProfileId)
    .eq("owner_id", ownerId);

  if (error) throw error;
}

// ============================================================
// 写入：Voice Line
// ============================================================

/**
 * 创建 Voice Line。
 *
 * 校验：
 * - voice_profile_id 必须存在且属于同一 owner
 * - 同一 (voice_profile_id, project_id, shot_id, text) 已存在 → 幂等返回现有
 */
export async function createVoiceLine(
  serverClient: SupabaseClient,
  ownerId: string,
  input: CreateVoiceLineInput,
): Promise<VoiceLineDTO> {
  // 校验 profile 归属
  const profile = await fetchVoiceProfileById(serverClient, input.voiceProfileId, ownerId);
  if (!profile) throw new Error("VOICE_PROFILE_NOT_FOUND");
  if (profile.status === "archived") throw new Error("VOICE_PROFILE_ARCHIVED");

  // 幂等：同一 profile + 同一 shot + 同一 text 不重复创建
  if (input.shotId && input.projectId) {
    const { data: existing } = await serverClient
      .from("storyflow_voice_lines")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("voice_profile_id", input.voiceProfileId)
      .eq("project_id", input.projectId)
      .eq("shot_id", input.shotId)
      .eq("text", input.text)
      .maybeSingle();

    if (existing) return mapLineRow(existing as VoiceLineRow);
  }

  const newRow: Record<string, unknown> = {
    owner_id: ownerId,
    voice_profile_id: input.voiceProfileId,
    text: input.text,
    language: input.language ?? profile.language ?? "zh",
    ssml: input.ssml ?? null,
    project_id: input.projectId ?? null,
    scene_id: input.sceneId ?? null,
    shot_id: input.shotId ?? null,
    status: "draft",
    revision: 0,
    is_approved: false,
  };

  const { data, error } = await serverClient
    .from("storyflow_voice_lines")
    .insert(newRow)
    .select("*")
    .single();

  if (error) throw error;
  return mapLineRow(data as VoiceLineRow);
}

/**
 * 更新 Voice Line 文本/作用域字段。
 * 已 approved 的 Line 不可直接修改（需先回到 draft）。
 */
export async function updateVoiceLine(
  serverClient: SupabaseClient,
  voiceLineId: string,
  ownerId: string,
  input: UpdateVoiceLineInput,
): Promise<VoiceLineDTO> {
  const current = await fetchVoiceLineById(serverClient, voiceLineId, ownerId);
  if (!current) throw new Error("VOICE_LINE_NOT_FOUND");
  if (current.isApproved) throw new Error("VOICE_LINE_APPROVED_LOCKED");

  const patch: Record<string, unknown> = {};
  if (input.text !== undefined) patch.text = input.text;
  if (input.language !== undefined) patch.language = input.language;
  if (input.ssml !== undefined) patch.ssml = input.ssml;
  if (input.projectId !== undefined) patch.project_id = input.projectId;
  if (input.sceneId !== undefined) patch.scene_id = input.sceneId;
  if (input.shotId !== undefined) patch.shot_id = input.shotId;

  if (Object.keys(patch).length === 0) return current;

  const { data, error } = await serverClient
    .from("storyflow_voice_lines")
    .update(patch)
    .eq("id", voiceLineId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw error;
  return mapLineRow(data as VoiceLineRow);
}

/**
 * 更新 Voice Line 状态（状态机入口）。
 *
 * 状态机约束：
 * - approved 是终态，需通过 approveVoiceLine 进入
 * - 进入 generating/queued 前会清空 error/last_failed_at
 * - 进入 failed/provider_timeout/moderation_blocked 会写入 error + last_failed_at
 */
export async function markVoiceLineStatus(
  serverClient: SupabaseClient,
  voiceLineId: string,
  ownerId: string,
  status: VoiceLineStatus,
  extra?: {
    error?: string;
    durationSeconds?: number;
    providerMetadata?: Record<string, unknown>;
  },
): Promise<VoiceLineDTO> {
  const current = await fetchVoiceLineById(serverClient, voiceLineId, ownerId);
  if (!current) throw new Error("VOICE_LINE_NOT_FOUND");

  const patch: Record<string, unknown> = { status };
  const failedStatuses: VoiceLineStatus[] = ["failed", "provider_timeout", "moderation_blocked"];

  if (failedStatuses.includes(status)) {
    patch.error = extra?.error ?? null;
    patch.last_failed_at = new Date().toISOString();
  } else {
    patch.error = null;
    patch.last_failed_at = null;
  }

  if (extra?.durationSeconds !== undefined) {
    patch.duration_seconds = extra.durationSeconds;
  }
  if (extra?.providerMetadata !== undefined) {
    patch.provider_metadata = extra.providerMetadata;
  }

  if (status === "generated" || status === "approved") {
    patch.completed_at = new Date().toISOString();
  }

  const { data, error } = await serverClient
    .from("storyflow_voice_lines")
    .update(patch)
    .eq("id", voiceLineId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw error;
  return mapLineRow(data as VoiceLineRow);
}

/**
 * 批准 Voice Line（终态）。
 * 需要已完成转存（assetId 非 null）。
 */
export async function approveVoiceLine(
  serverClient: SupabaseClient,
  voiceLineId: string,
  ownerId: string,
): Promise<VoiceLineDTO> {
  const current = await fetchVoiceLineById(serverClient, voiceLineId, ownerId);
  if (!current) throw new Error("VOICE_LINE_NOT_FOUND");
  if (!current.assetId) {
    throw new Error("VOICE_LINE_ASSET_REQUIRED_FOR_APPROVAL");
  }

  const { data, error } = await serverClient
    .from("storyflow_voice_lines")
    .update({
      status: "approved",
      is_approved: true,
      completed_at: new Date().toISOString(),
    })
    .eq("id", voiceLineId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw error;
  return mapLineRow(data as VoiceLineRow);
}

/**
 * 撤销批准（从 approved 回到 generated）。
 */
export async function unapproveVoiceLine(
  serverClient: SupabaseClient,
  voiceLineId: string,
  ownerId: string,
): Promise<VoiceLineDTO> {
  const { data, error } = await serverClient
    .from("storyflow_voice_lines")
    .update({
      status: "generated",
      is_approved: false,
    })
    .eq("id", voiceLineId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw error;
  return mapLineRow(data as VoiceLineRow);
}

// ============================================================
// 关联：Job / Asset
// ============================================================

/**
 * 把 generation_job_id 关联到 Voice Line（开始生成时调用）。
 * 同时将状态推进到 queued/generating（caller 决定）。
 */
export async function attachJobToVoiceLine(
  serverClient: SupabaseClient,
  voiceLineId: string,
  ownerId: string,
  jobId: string,
  status: VoiceLineStatus = "queued",
): Promise<VoiceLineDTO> {
  const { data, error } = await serverClient
    .from("storyflow_voice_lines")
    .update({
      latest_job_id: jobId,
      status,
      error: null,
      last_failed_at: null,
    })
    .eq("id", voiceLineId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw error;
  return mapLineRow(data as VoiceLineRow);
}

/**
 * 把转存后的 Asset 关联到 Voice Line（生成完成时调用）。
 *
 * 该函数推进到 `generated` 状态，并增加 revision。
 * 真正进入 `approved` 需用户显式调用 approveVoiceLine。
 *
 * 安全：
 * - storage_path 必须为私有 bucket 路径，不能是 Provider 临时 URL
 * - signed_url 由 storage.ts 生成的有限期签名 URL
 */
export async function attachAssetToVoiceLine(
  serverClient: SupabaseClient,
  voiceLineId: string,
  ownerId: string,
  params: {
    assetId: string;
    storagePath: string;
    signedUrl: string;
    signedUrlExpiresAt: string;
    durationSeconds?: number;
    providerMetadata?: Record<string, unknown>;
  },
): Promise<VoiceLineDTO> {
  const current = await fetchVoiceLineById(serverClient, voiceLineId, ownerId);
  if (!current) throw new Error("VOICE_LINE_NOT_FOUND");

  const patch: Record<string, unknown> = {
    asset_id: params.assetId,
    storage_path: params.storagePath,
    signed_url: params.signedUrl,
    signed_url_expires_at: params.signedUrlExpiresAt,
    status: "generated",
    error: null,
    last_failed_at: null,
    completed_at: new Date().toISOString(),
    revision: current.revision + 1,
  };

  if (params.durationSeconds !== undefined) {
    patch.duration_seconds = params.durationSeconds;
  }
  if (params.providerMetadata !== undefined) {
    patch.provider_metadata = params.providerMetadata;
  }

  const { data, error } = await serverClient
    .from("storyflow_voice_lines")
    .update(patch)
    .eq("id", voiceLineId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw error;
  return mapLineRow(data as VoiceLineRow);
}

// ============================================================
// 映射：DB row → DTO
// ============================================================

function mapProfileRow(row: VoiceProfileRow): VoiceProfileDTO {
  return {
    id: row.id,
    ownerId: row.owner_id,
    actorProfileId: row.actor_profile_id,
    universeEntityId: row.universe_entity_id,
    voiceLabel: row.voice_label,
    voiceProvider: row.voice_provider as VoiceProfileDTO["voiceProvider"],
    voiceProviderVoiceId: row.voice_provider_voice_id,
    language: row.language,
    speed: Number(row.speed),
    pitch: Number(row.pitch),
    stability: Number(row.stability),
    stylePrompt: row.style_prompt,
    sampleAssetUrl: null, // sample_asset_id 暂不解析为 URL，V1 不展示样本
    consentStatus: (row.consent_status as VoiceProfileDTO["consentStatus"]) || "not_required",
    consentSourceAssetId: row.consent_source_asset_id ?? null,
    consentConfirmedAt: row.consent_confirmed_at ?? null,
    consentMetadata: row.consent_metadata ?? {},
    status: row.status as VoiceProfileStatus,
    metadata: row.metadata ?? {},
    updatedAt: row.updated_at,
  };
}

function mapLineRow(row: VoiceLineRow): VoiceLineDTO {
  return {
    id: row.id,
    ownerId: row.owner_id,
    voiceProfileId: row.voice_profile_id,
    text: row.text,
    language: row.language,
    ssml: row.ssml,
    projectId: row.project_id,
    sceneId: row.scene_id,
    shotId: row.shot_id,
    latestJobId: row.latest_job_id,
    assetId: row.asset_id,
    audioUrl: row.signed_url,
    signedUrlExpiresAt: row.signed_url_expires_at,
    status: row.status as VoiceLineStatus,
    error: row.error,
    durationSeconds: row.duration_seconds !== null ? Number(row.duration_seconds) : null,
    revision: row.revision,
    isApproved: row.is_approved,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

/**
 * KIIKIS V2.2 配音显式关系 + 真人声音保护 — Phase 5 Task 5.4.
 * 角色声音绑定 Character → Voice Identity；台词绑定 Scene / Dialogue Line /
 * Text Version；替换配音 append-only，不改变已定稿剪辑。
 * voice clone 缺授权：仅私有试用，不可公开/商业（服务端 enforce）。
 */

export interface VoiceUsageLinkDraft {
  sourceWorkId: string;
  sourceWorkVersionId: string;
  targetProjectId: string;
  targetWorkId: string;
  usageRole: "character_voice" | "narration" | "dialogue_line";
  targetEntityType: string | null;
  targetEntityId: string | null;
  voiceIdentityId?: string;
  dialogueLineId?: string;
  textVersionId?: string;
}

export interface BuildVoiceUsageInput {
  sourceWorkId: string;
  sourceWorkVersionId: string;
  targetProjectId: string;
  targetWorkId: string;
  characterId?: string | null;
  voiceIdentityId?: string | null;
  sceneId?: string | null;
  dialogueLineId?: string | null;
  textVersionId?: string | null;
  narration?: boolean;
}

/** 角色声音 / 旁白 / 台词 → WorkUsageLink 草稿（usage roles 对应 Task 5.1）。 */
export function buildVoiceUsageLinks(input: BuildVoiceUsageInput): VoiceUsageLinkDraft[] {
  const links: VoiceUsageLinkDraft[] = [];
  if (input.characterId) {
    links.push({
      sourceWorkId: input.sourceWorkId,
      sourceWorkVersionId: input.sourceWorkVersionId,
      targetProjectId: input.targetProjectId,
      targetWorkId: input.targetWorkId,
      usageRole: "character_voice",
      targetEntityType: "character",
      targetEntityId: input.characterId,
      voiceIdentityId: input.voiceIdentityId ?? undefined,
    });
  }
  if (input.narration) {
    links.push({
      sourceWorkId: input.sourceWorkId,
      sourceWorkVersionId: input.sourceWorkVersionId,
      targetProjectId: input.targetProjectId,
      targetWorkId: input.targetWorkId,
      usageRole: "narration",
      targetEntityType: null,
      targetEntityId: null,
      voiceIdentityId: input.voiceIdentityId ?? undefined,
    });
  }
  if (input.sceneId && input.dialogueLineId) {
    links.push({
      sourceWorkId: input.sourceWorkId,
      sourceWorkVersionId: input.sourceWorkVersionId,
      targetProjectId: input.targetProjectId,
      targetWorkId: input.targetWorkId,
      usageRole: "dialogue_line",
      targetEntityType: "scene",
      targetEntityId: input.sceneId,
      dialogueLineId: input.dialogueLineId,
      textVersionId: input.textVersionId ?? undefined,
    });
  }
  return links;
}

export interface ReplaceDubbingResult {
  finalizedEditingVersion: { id: string; versionNo: number; finalizedAt: string; dubbingId: string };
  newDubbingLink: {
    sourceDubbingId: string;
    finalizedEditingVersionId: string | null;
  };
}

/** 替换配音：append 新 link；已定稿剪辑版本与配音引用原样保留。 */
export function replaceDubbing(input: {
  editingWorkId: string;
  finalizedEditingVersion: { id: string; versionNo: number; finalizedAt: string; dubbingId: string };
  newDubbingId: string;
}): ReplaceDubbingResult {
  return {
    finalizedEditingVersion: { ...input.finalizedEditingVersion },
    newDubbingLink: {
      sourceDubbingId: input.newDubbingId,
      finalizedEditingVersionId: null, // 新配音永不指向已定稿版本
    },
  };
}

export interface VoiceTrialPolicy {
  voiceIdentityId: string;
  canUsePrivately: boolean;
  canPublish: boolean;
  canCommercial: boolean;
  reason: string;
}

/** 真人声音保护（服务端 enforce）：clone 缺授权 → 仅私有试用。 */
export function privateTrialOnly(input: {
  voiceIdentityId: string;
  isRealPerson: boolean;
  cloneAuthorized: boolean;
}): VoiceTrialPolicy {
  const needsAuth = input.isRealPerson && !input.cloneAuthorized;
  return {
    voiceIdentityId: input.voiceIdentityId,
    canUsePrivately: true,
    canPublish: !needsAuth,
    canCommercial: !needsAuth,
    reason: needsAuth
      ? "真人声音克隆缺少授权：仅可在私有范围试听，不可公开、不可商业使用。"
      : "",
  };
}
