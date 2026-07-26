/**
 * TRAE-V2-07 Production Package 与资产清单
 * 数据收集层：从数据库读取各模块数据
 *
 * 复用 serviceFetch（service_role）+ owner 校验
 * 不读 API Key、不读 Provider 原始错误正文、不读签名 URL
 */

import { serviceFetch } from "@/lib/supabase/server";
import { ExportError } from "./types";
import type {
  UniverseCanonPayload,
  CharacterGraphPayload,
  CharacterPassportsPayload,
  VoiceProfilesPayload,
  ScriptEpisodePayload,
  ScriptScenesPayload,
  DirectorShotListPayload,
  DirectorPromptsPayload,
  MediaSelectedTakesPayload,
  MediaVoiceLinesPayload,
  MediaAssetsPayload,
  AssemblyTimelinePayload,
  EvidenceGenerationJobsPayload,
} from "./types";
import { serializeTimeline } from "@/lib/editor/timeline-schema";
import {
  getAssemblySequence,
  getAssemblyItems,
  getSelectedTakes,
  getApprovedVoiceLines,
  validateProjectOwnership,
} from "@/lib/editor/queries";

// ============================================================
// 项目作用域解析
// ============================================================

type ProductionProjectRow = {
  id: string;
  project_id: string;
  owner_id: string;
  universe_id: string | null;
  source_unit_id: string | null;
  title: string | null;
};

export async function resolveProjectScope(
  ownerId: string,
  projectId: string,
): Promise<{
  productionProjectId: string;
  universeId: string | null;
  sourceUnitId: string;
  title: string;
}> {
  const rows = await serviceFetch<ProductionProjectRow[]>(
    `/rest/v1/storyflow_production_projects?project_id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=id,project_id,owner_id,universe_id,source_unit_id,title&limit=1`,
  );
  if (!rows[0]) {
    throw new ExportError(
      "SCOPE_NOT_FOUND",
      `Project ${projectId} 不存在或无权访问。`,
      404,
    );
  }
  const row = rows[0];
  return {
    productionProjectId: row.id,
    universeId: row.universe_id,
    sourceUnitId: row.source_unit_id || "legacy",
    title: row.title || "Untitled Project",
  };
}

// ============================================================
// Universe
// ============================================================

type CanonFactRow = {
  id: string;
  title: string;
  content: string;
  status: string;
  created_at: string;
};

export async function fetchUniverseCanon(
  universeId: string,
): Promise<UniverseCanonPayload> {
  const rows = await serviceFetch<CanonFactRow[]>(
    `/rest/v1/storyflow_canon_facts?universe_id=eq.${encodeURIComponent(universeId)}&order=created_at.desc&limit=500&select=id,title,content,status,created_at`,
  );
  return {
    universeId,
    universeName: "",
    canonFacts: (rows ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      status: r.status,
      createdAt: r.created_at,
    })),
  };
}

type CharacterEntityRow = {
  id: string;
  name: string;
  type: string;
  status: string;
};

type RelationshipRow = {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  status: string;
  label: string | null;
};

export async function fetchCharacterGraph(
  universeId: string,
): Promise<CharacterGraphPayload> {
  const [entities, relationships] = await Promise.all([
    serviceFetch<CharacterEntityRow[]>(
      `/rest/v1/storyflow_universe_entities?universe_id=eq.${encodeURIComponent(universeId)}&type=eq.character&order=name.asc&limit=500&select=id,name,type,status`,
    ),
    serviceFetch<RelationshipRow[]>(
      `/rest/v1/storyflow_universe_relationships?universe_id=eq.${encodeURIComponent(universeId)}&status=neq.deprecated&order=created_at.desc&limit=1000&select=id,source_entity_id,target_entity_id,relationship_type,status,label`,
    ),
  ]);
  return {
    universeId,
    nodes: (entities ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      status: e.status,
    })),
    edges: (relationships ?? []).map((r) => ({
      id: r.id,
      source: r.source_entity_id,
      target: r.target_entity_id,
      type: r.relationship_type,
      status: r.status,
      label: r.label ?? undefined,
    })),
  };
}

// ============================================================
// Characters
// ============================================================

type CharacterPassportCompositeRow = {
  character_id: string;
  character_name: string;
  actor_profile_id: string | null;
  actor_name: string | null;
  portrayal_id: string | null;
  appearance_variant_id: string | null;
  identity_core_prompt: string | null;
  visual_dna: unknown;
  forbidden_changes: string[];
  voice_profile_id: string | null;
};

export async function fetchCharacterPassports(
  ownerId: string,
  projectId: string,
): Promise<CharacterPassportsPayload> {
  // characters 表用 user_id（非 owner_id），无 actor_profile_id 字段
  // 角色和演员通过 character_portrayals 表关联
  type CharacterRow = {
    id: string;
    user_id: string;
    project_id: string;
    name: string;
    role: string | null;
    age: string | null;
    goal: string | null;
    visual_prompt: string | null;
    content_json: Record<string, unknown> | null;
  };
  // portrayals 表无 owner_id, appearance_variant_id, identity_core_prompt, visual_dna, forbidden_changes 字段
  // 这些在 metadata JSONB 中
  type PortrayalRow = {
    id: string;
    actor_profile_id: string;
    character_id: string;
    project_id: string | null;
    portrayal_name: string;
    visual_prompt: string;
    metadata: Record<string, unknown> | null;
  };
  // V2-03 实际表结构：voice_profiles 无 character_id/project_id 字段
  // 通过 actor_profile_id 或 universe_entity_id 关联
  type VoiceProfileRow = {
    id: string;
    actor_profile_id: string | null;
    universe_entity_id: string | null;
  };
  type ActorRow = {
    id: string;
    display_name: string;
  };

  const [characters, portrayals, voiceProfiles] = await Promise.all([
    serviceFetch<CharacterRow[]>(
      `/rest/v1/storyflow_characters?user_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,user_id,project_id,name,role,age,goal,visual_prompt,content_json&order=name.asc&limit=500`,
    ),
    serviceFetch<PortrayalRow[]>(
      `/rest/v1/storyflow_character_portrayals?project_id=eq.${encodeURIComponent(projectId)}&select=id,actor_profile_id,character_id,project_id,portrayal_name,visual_prompt,metadata&limit=500`,
    ),
    serviceFetch<VoiceProfileRow[]>(
      `/rest/v1/storyflow_character_voice_profiles?owner_id=eq.${encodeURIComponent(ownerId)}&select=id,actor_profile_id,universe_entity_id&limit=500`,
    ),
  ]);

  // V2-04: actor_profile_id 在 portrayals 表中，不在 characters 表中
  const actorIds = new Set<string>();
  for (const p of portrayals ?? []) {
    if (p.actor_profile_id) actorIds.add(p.actor_profile_id);
  }
  const actorList = Array.from(actorIds);
  const actors = actorList.length === 0 ? [] : await serviceFetch<ActorRow[]>(
    `/rest/v1/storyflow_actor_profiles?id=in.(${actorList.map((id) => encodeURIComponent(id)).join(",")})&select=id,display_name`,
  );
  const actorMap = new Map((actors ?? []).map((a) => [a.id, a.display_name]));

  // V2-04: portrayals 通过 character_id 关联，一个 character 可能有多个 portrayal
  // 取第一个作为主 portrayal
  const portrayalByCharId = new Map<string, PortrayalRow>();
  for (const p of portrayals ?? []) {
    if (!portrayalByCharId.has(p.character_id)) {
      portrayalByCharId.set(p.character_id, p);
    }
  }
  // V2-03: voice_profiles 通过 actor_profile_id 关联到 character
  const voiceByActorId = new Map<string, string>();
  for (const v of voiceProfiles ?? []) {
    if (v.actor_profile_id && !voiceByActorId.has(v.actor_profile_id)) {
      voiceByActorId.set(v.actor_profile_id, v.id);
    }
  }

  const passports: CharacterPassportCompositeRow[] = (characters ?? []).map((c) => {
    const p = portrayalByCharId.get(c.id);
    const meta = p?.metadata ?? {};
    return {
      character_id: c.id,
      character_name: c.name,
      actor_profile_id: p?.actor_profile_id ?? null,
      actor_name: p?.actor_profile_id ? actorMap.get(p.actor_profile_id) ?? null : null,
      portrayal_id: p?.id ?? null,
      appearance_variant_id: (meta.appearance_variant_id as string | null) ?? null,
      identity_core_prompt: (meta.identity_core_prompt as string | null) ?? p?.visual_prompt ?? null,
      visual_dna: (meta.visual_dna as Record<string, unknown> | null) ?? null,
      forbidden_changes: Array.isArray(meta.forbidden_changes) ? (meta.forbidden_changes as string[]) : [],
      voice_profile_id: p?.actor_profile_id ? voiceByActorId.get(p.actor_profile_id) ?? null : null,
    };
  });

  return {
    projectId,
    passports: passports.map((p) => ({
      characterId: p.character_id,
      characterName: p.character_name,
      actorProfileId: p.actor_profile_id,
      actorName: p.actor_name,
      portrayalId: p.portrayal_id,
      appearanceVariantId: p.appearance_variant_id,
      identityCorePrompt: p.identity_core_prompt,
      visualDNA: (p.visual_dna as Record<string, unknown> | null) ?? null,
      forbiddenChanges: p.forbidden_changes,
      voiceProfileId: p.voice_profile_id,
    })),
  };
}

type VoiceProfileDetailRow = {
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
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/**
 * 查询 Voice Profile（V2-03 实际表结构）
 * 注意：表无 project_id 字段，按 owner_id 过滤
 * character_id 用 universe_entity_id 近似（若存在）
 */
export async function fetchVoiceProfiles(
  ownerId: string,
  _projectId: string,
): Promise<VoiceProfilesPayload> {
  const rows = await serviceFetch<VoiceProfileDetailRow[]>(
    `/rest/v1/storyflow_character_voice_profiles?owner_id=eq.${encodeURIComponent(ownerId)}&select=id,owner_id,actor_profile_id,universe_entity_id,voice_label,voice_provider,voice_provider_voice_id,language,speed,pitch,stability,style_prompt,status,metadata,created_at&order=created_at.desc&limit=500`,
  );
  return {
    projectId: _projectId,
    profiles: (rows ?? []).map((r) => {
      const meta = r.metadata ?? {};
      return {
        id: r.id,
        characterId: r.universe_entity_id ?? r.actor_profile_id ?? "",
        displayName: r.voice_label,
        language: r.language,
        locale: (meta.locale as string | null) ?? null,
        provider: r.voice_provider,
        providerVoiceId: r.voice_provider_voice_id ?? "",
        timbreTags: Array.isArray(meta.timbre_tags) ? (meta.timbre_tags as string[]) : [],
        speakingRate: r.speed,
        pitch: r.pitch,
        licenseStatus: (meta.license_status as string) ?? "unknown",
        status: r.status,
      };
    }),
  };
}

// ============================================================
// Script
// ============================================================

// 剧本数据存储在 storyflow_projects.data JSONB 中（DramaProject 对象）
// storyflow_script_episodes 表不存在
type ProjectScriptRow = {
  id: string;
  title: string;
  data: Record<string, unknown> | null;
};

export async function fetchScriptEpisode(
  ownerId: string,
  projectId: string,
  sourceUnitId: string,
): Promise<ScriptEpisodePayload | null> {
  const rows = await serviceFetch<ProjectScriptRow[]>(
    `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=id,title,data&limit=1`,
  );
  const row = rows?.[0];
  if (!row) return null;
  const data = row.data ?? {};
  // 从 DramaProject JSONB 读取剧本内容
  const finalScriptVersion = (data.finalScriptVersion as string) ?? "chinese";
  const finalScriptChinese = (data.finalScriptChinese as string) ?? "";
  const finalScriptForeign = (data.finalScriptForeign as string) ?? "";
  const finalScriptBilingual = (data.finalScriptBilingual as string) ?? "";
  const contentMd =
    finalScriptVersion === "bilingual"
      ? finalScriptBilingual
      : finalScriptVersion === "chinese"
        ? finalScriptChinese
        : finalScriptForeign;
  if (!contentMd.trim()) return null;
  return {
    projectId: row.id,
    sourceUnitId,
    title: row.title,
    contentMd,
    wordCount: contentMd.length,
  };
}

// V2-04 实际表结构：scenes 用 production_project_id + sort_order
// function_role/conflict/emotion/duration_target 在 director_meta JSONB 中
type SceneRow = {
  id: string;
  production_project_id: string;
  owner_id: string;
  source_unit_id: string | null;
  sort_order: number;
  heading: string | null;
  location: string | null;
  time_of_day: string | null;
  summary: string | null;
  character_asset_ids: string[] | null;
  director_meta: unknown;
  locked: boolean;
  deleted_at: string | null;
};

export async function fetchScenes(
  ownerId: string,
  projectId: string,
): Promise<ScriptScenesPayload> {
  // 注意：scenes 表用 production_project_id 关联，不是 project_id
  // 这里按 owner_id 过滤，deleted_at is null
  const rows = await serviceFetch<SceneRow[]>(
    `/rest/v1/storyflow_production_scenes?owner_id=eq.${encodeURIComponent(ownerId)}&deleted_at=is.null&order=sort_order.asc&limit=500&select=id,production_project_id,owner_id,source_unit_id,sort_order,heading,location,time_of_day,summary,character_asset_ids,director_meta,locked,deleted_at`,
  );
  return {
    projectId,
    scenes: (rows ?? []).map((r) => {
      const meta = (r.director_meta as Record<string, unknown> | null) ?? {};
      return {
        id: r.id,
        sceneNumber: r.sort_order,
        location: r.location,
        timeOfDay: r.time_of_day,
        functionRole: (meta.scene_function as string | null) ?? null,
        characters: Array.isArray(r.character_asset_ids) ? (r.character_asset_ids as string[]) : [],
        conflict: (meta.conflict as string | null) ?? null,
        emotion: (meta.emotion as string | null) ?? null,
        durationTarget: (meta.duration_target as number | null) ?? null,
        directorMeta: (r.director_meta as Record<string, unknown> | null) ?? null,
        locked: Boolean(r.locked),
      };
    }),
  };
}

// ============================================================
// Director
// ============================================================

// V2-04 实际表结构：shots 用 scene_id + index
// shot_type→shot_size, camera_angle→angle, focal_length/negative_rules/provider_params 在 director_meta 中
// prompt_hash→source_hash
type ShotRow = {
  id: string;
  scene_id: string;
  owner_id: string;
  index: number;
  story_beat: string | null;
  visual_description: string | null;
  shot_size: string | null;
  camera_movement: string | null;
  angle: string | null;
  duration_seconds: number | null;
  duration: number | null;
  dialogue: string | null;
  emotion: string | null;
  continuity: string | null;
  image_prompt: string | null;
  jimeng_prompt_zh: string | null;
  jimeng_prompt_en: string | null;
  source_hash: string | null;
  director_meta: unknown;
  locked: boolean;
  status: string | null;
  deleted_at: string | null;
};

async function fetchShots(
  ownerId: string,
  _projectId: string,
): Promise<ShotRow[]> {
  const rows = await serviceFetch<ShotRow[]>(
    `/rest/v1/storyflow_production_shots?owner_id=eq.${encodeURIComponent(ownerId)}&deleted_at=is.null&order=index.asc&limit=2000&select=id,scene_id,owner_id,index,story_beat,visual_description,shot_size,camera_movement,angle,duration_seconds,duration,dialogue,emotion,continuity,image_prompt,jimeng_prompt_zh,jimeng_prompt_en,source_hash,director_meta,locked,status,deleted_at`,
  );
  return rows ?? [];
}

export async function fetchDirectorShotList(
  ownerId: string,
  projectId: string,
): Promise<DirectorShotListPayload> {
  const shots = await fetchShots(ownerId, projectId);
  // CSV with BOM for Excel compatibility
  const header = "shot_id,scene_id,shot_index,shot_size,angle,focal_length,duration_seconds,dialogue,locked\n";
  const body = shots
    .map((s) => {
      const meta = (s.director_meta as Record<string, unknown> | null) ?? {};
      const focalLength = (meta.focal_length as string | null) ?? "";
      const cells = [
        s.id,
        s.scene_id,
        String(s.index),
        s.shot_size ?? "",
        s.angle ?? "",
        focalLength,
        s.duration_seconds != null ? String(s.duration_seconds) : "",
        (s.dialogue ?? "").replace(/[\r\n]+/g, " ").replace(/"/g, '""'),
        s.locked ? "true" : "false",
      ];
      return cells.map((c) => `"${c}"`).join(",");
    })
    .join("\n");
  return {
    projectId,
    csv: "\uFEFF" + header + body,
    shots: shots.map((s) => {
      const meta = (s.director_meta as Record<string, unknown> | null) ?? {};
      return {
        id: s.id,
        sceneId: s.scene_id,
        shotNumber: s.index,
        shotType: s.shot_size,
        cameraAngle: s.angle,
        focalLength: (meta.focal_length as string | null) ?? null,
        duration: s.duration_seconds ?? s.duration,
        dialogue: s.dialogue,
        locked: s.locked,
      };
    }),
  };
}

export async function fetchDirectorPrompts(
  ownerId: string,
  projectId: string,
): Promise<DirectorPromptsPayload> {
  const shots = await fetchShots(ownerId, projectId);
  return {
    projectId,
    prompts: shots.map((s) => {
      const meta = (s.director_meta as Record<string, unknown> | null) ?? {};
      return {
        shotId: s.id,
        imagePrompt: s.image_prompt,
        videoPrompt: (meta.video_prompt as string | null) ?? null,
        negativeRules: Array.isArray(meta.negative_rules) ? (meta.negative_rules as string[]) : [],
        providerParams: (meta.provider_params as Record<string, unknown> | null) ?? null,
        promptHash: s.source_hash,
      };
    }),
  };
}

// ============================================================
// Media
// ============================================================

// V2-04 实际表结构：selected_takes 无 owner_id, asset_id, storage_path, provider_name, model_name 字段
// 这些信息存在 metadata JSONB 中或通过 video_url 引用
type SelectedTakeRow = {
  id: string;
  project_id: string;
  shot_id: string;
  video_url: string;
  take_label: string;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export async function fetchSelectedTakes(
  _ownerId: string,
  projectId: string,
): Promise<MediaSelectedTakesPayload> {
  const rows = await serviceFetch<SelectedTakeRow[]>(
    `/rest/v1/storyflow_selected_takes?project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc&limit=2000&select=id,project_id,shot_id,video_url,take_label,status,metadata,created_at`,
  );
  return {
    projectId,
    takes: (rows ?? []).map((r) => {
      const meta = r.metadata ?? {};
      return {
        id: r.id,
        shotId: r.shot_id,
        takeLabel: r.take_label,
        status: r.status,
        // asset_id / storage_path / provider_name / model_name 从 metadata 读取
        assetId: (meta.asset_id as string | null) ?? null,
        storagePath: (meta.storage_path as string | null) ?? null,
        providerName: (meta.provider_name as string | null) ?? null,
        modelName: (meta.model_name as string | null) ?? null,
        createdAt: r.created_at,
      };
    }),
  };
}

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
  status: string;
  revision: number;
  is_approved: boolean;
  created_at: string;
  completed_at: string | null;
};

/**
 * 查询 Voice Lines（V2-03 实际表结构）
 * character_id 不在 voice_lines 表，需通过 voice_profile_id 关联获取
 */
export async function fetchVoiceLines(
  ownerId: string,
  projectId: string,
): Promise<MediaVoiceLinesPayload> {
  const rows = await serviceFetch<VoiceLineRow[]>(
    `/rest/v1/storyflow_voice_lines?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc&limit=2000&select=id,owner_id,voice_profile_id,text,language,ssml,project_id,scene_id,shot_id,latest_job_id,asset_id,storage_path,status,revision,is_approved,created_at,completed_at`,
  );
  return {
    projectId,
    voiceLines: (rows ?? []).map((r) => ({
      id: r.id,
      shotId: r.shot_id,
      characterId: null, // 需通过 voice_profile_id 关联，此处留空
      voiceProfileId: r.voice_profile_id,
      dialogueText: r.text,
      status: r.is_approved ? "approved" : r.status,
      approvedAssetId: r.is_approved ? r.asset_id : null,
      storagePath: r.storage_path,
      locale: r.language,
    })),
  };
}

// V2-04 实际表结构：assets 用 user_id（非 owner_id）
// size_bytes/mime_type/source_job_id/shot_id/character_id 在 metadata JSONB 中
type AssetRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  asset_type: string;
  storage_path: string | null;
  public_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export async function fetchAssets(
  ownerId: string,
  projectId: string,
): Promise<MediaAssetsPayload> {
  const rows = await serviceFetch<AssetRow[]>(
    `/rest/v1/storyflow_assets?user_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc&limit=2000&select=id,user_id,project_id,asset_type,storage_path,public_url,metadata,created_at`,
  );
  return {
    projectId,
    assets: (rows ?? []).map((r) => {
      const meta = r.metadata ?? {};
      return {
        id: r.id,
        assetType: r.asset_type,
        storagePath: r.storage_path ?? "",
        sizeBytes: (meta.size_bytes as number | null) ?? null,
        mimeType: (meta.mime_type as string | null) ?? null,
        sourceJobId: (meta.source_job_id as string | null) ?? null,
        shotId: (meta.shot_id as string | null) ?? null,
        characterId: (meta.character_id as string | null) ?? null,
        createdAt: r.created_at,
      };
    }),
  };
}

// ============================================================
// Assembly (复用 editor/queries)
// ============================================================

export async function fetchAssemblyTimeline(
  ownerId: string,
  projectId: string,
  sourceUnitId: string,
  aspectRatio: "9:16" | "16:9" | "1:1" = "9:16",
): Promise<AssemblyTimelinePayload | null> {
  await validateProjectOwnership(ownerId, projectId);
  const sequence = await getAssemblySequence(projectId);
  if (!sequence) return null;

  const [items, selectedTakes, voiceLines] = await Promise.all([
    getAssemblyItems(sequence.id),
    getSelectedTakes(projectId),
    getApprovedVoiceLines(projectId),
  ]);

  const timeline = serializeTimeline({
    sequence,
    items,
    selectedTakes,
    voiceLines,
    projectId,
    sourceUnitId,
    aspectRatio,
  });

  const meta = (sequence.metadata ?? {}) as Record<string, unknown>;
  return {
    projectId,
    sourceUnitId,
    timeline,
    sequence: {
      id: sequence.id,
      status: sequence.status,
      editorStatus: (meta.editor_status as string | null) ?? null,
      editorEngine: (meta.editor_engine as string | null) ?? null,
    },
  };
}

// ============================================================
// Evidence
// ============================================================

type GenerationJobRow = {
  id: string;
  job_type: string;
  provider: string;
  model: string | null;
  status: string;
  error: string | null;
  target_type: string;
  target_id: string | null;
  input_params: unknown;
  created_at: string;
  completed_at: string | null;
};

/**
 * 从 error 字段提取 error_code（约定格式 ERROR_CODE:detail 或 ERROR_CODE）
 */
function extractErrorCode(errorText: string | null): string | null {
  if (!errorText) return null;
  const trimmed = errorText.trim();
  if (!trimmed) return null;
  // 形如 MINIMAX_VIDEO_API_ERROR:500:... → MINIMAX_VIDEO_API_ERROR
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0) {
    const code = trimmed.slice(0, colonIdx);
    if (/^[A-Z][A-Z0-9_]+$/.test(code)) return code;
  }
  // 单一 token
  if (/^[A-Z][A-Z0-9_]+$/.test(trimmed)) return trimmed;
  // 兜底：脱敏为 UNKNOWN
  return "UNKNOWN";
}

export async function fetchGenerationJobs(
  ownerId: string,
  projectId: string,
): Promise<EvidenceGenerationJobsPayload> {
  const rows = await serviceFetch<GenerationJobRow[]>(
    `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc&limit=2000&select=id,job_type,provider,model,status,error,target_type,target_id,input_params,created_at,completed_at`,
  );
  return {
    projectId,
    jobs: (rows ?? []).map((r) => {
      const inputParams = (r.input_params ?? {}) as Record<string, unknown>;
      const shotId = (inputParams.shotId as string) || (inputParams.shot_id as string) || null;
      const durationMs =
        r.completed_at && r.created_at
          ? new Date(r.completed_at).getTime() - new Date(r.created_at).getTime()
          : null;
      return {
        id: r.id,
        jobType: r.job_type,
        provider: r.provider,
        model: r.model,
        status: r.status,
        errorCode: extractErrorCode(r.error),
        targetType: r.target_type,
        targetId: r.target_id,
        shotId,
        createdAt: r.created_at,
        completedAt: r.completed_at,
        durationMs,
      };
    }),
  };
}
