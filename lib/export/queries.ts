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
  // 通过 characters 表关联 portrayal + voice_profile
  // 此处做最小可用聚合：分别查询再合并
  type CharacterRow = {
    id: string;
    name: string;
    project_id: string | null;
    actor_profile_id: string | null;
  };
  type PortrayalRow = {
    id: string;
    character_id: string;
    project_id: string | null;
    appearance_variant_id: string | null;
    identity_core_prompt: string | null;
    visual_dna: unknown;
    forbidden_changes: string[];
  };
  type VoiceProfileRow = {
    id: string;
    character_id: string;
    project_id: string | null;
  };
  type ActorRow = {
    id: string;
    display_name: string;
  };

  const [characters, portrayals, voiceProfiles] = await Promise.all([
    serviceFetch<CharacterRow[]>(
      `/rest/v1/storyflow_characters?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,name,project_id,actor_profile_id&order=name.asc&limit=500`,
    ),
    serviceFetch<PortrayalRow[]>(
      `/rest/v1/storyflow_character_portrayals?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,character_id,project_id,appearance_variant_id,identity_core_prompt,visual_dna,forbidden_changes&limit=500`,
    ),
    serviceFetch<VoiceProfileRow[]>(
      `/rest/v1/storyflow_character_voice_profiles?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,character_id,project_id&limit=500`,
    ),
  ]);

  const actorIds = new Set<string>();
  for (const c of characters ?? []) {
    if (c.actor_profile_id) actorIds.add(c.actor_profile_id);
  }
  const actorList = Array.from(actorIds);
  const actors = actorList.length === 0 ? [] : await serviceFetch<ActorRow[]>(
    `/rest/v1/storyflow_actor_profiles?id=in.(${actorList.map((id) => encodeURIComponent(id)).join(",")})&select=id,display_name`,
  );
  const actorMap = new Map((actors ?? []).map((a) => [a.id, a.display_name]));

  const portrayalByCharId = new Map<string, PortrayalRow>();
  for (const p of portrayals ?? []) {
    if (!portrayalByCharId.has(p.character_id)) {
      portrayalByCharId.set(p.character_id, p);
    }
  }
  const voiceByCharId = new Map<string, string>();
  for (const v of voiceProfiles ?? []) {
    if (!voiceByCharId.has(v.character_id)) {
      voiceByCharId.set(v.character_id, v.id);
    }
  }

  const passports: CharacterPassportCompositeRow[] = (characters ?? []).map((c) => {
    const p = portrayalByCharId.get(c.id);
    return {
      character_id: c.id,
      character_name: c.name,
      actor_profile_id: c.actor_profile_id,
      actor_name: c.actor_profile_id ? actorMap.get(c.actor_profile_id) ?? null : null,
      portrayal_id: p?.id ?? null,
      appearance_variant_id: p?.appearance_variant_id ?? null,
      identity_core_prompt: p?.identity_core_prompt ?? null,
      visual_dna: p?.visual_dna ?? null,
      forbidden_changes: p?.forbidden_changes ?? [],
      voice_profile_id: voiceByCharId.get(c.id) ?? null,
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
  character_id: string;
  display_name: string;
  language: string;
  locale: string | null;
  provider: string;
  provider_voice_id: string;
  timbre_tags: unknown;
  speaking_rate: number;
  pitch: number;
  license_status: string;
  status: string;
};

export async function fetchVoiceProfiles(
  ownerId: string,
  projectId: string,
): Promise<VoiceProfilesPayload> {
  const rows = await serviceFetch<VoiceProfileDetailRow[]>(
    `/rest/v1/storyflow_character_voice_profiles?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,character_id,display_name,language,locale,provider,provider_voice_id,timbre_tags,speaking_rate,pitch,license_status,status&order=created_at.desc&limit=500`,
  );
  return {
    projectId,
    profiles: (rows ?? []).map((r) => ({
      id: r.id,
      characterId: r.character_id,
      displayName: r.display_name,
      language: r.language,
      locale: r.locale,
      provider: r.provider,
      providerVoiceId: r.provider_voice_id,
      timbreTags: Array.isArray(r.timbre_tags) ? (r.timbre_tags as string[]) : [],
      speakingRate: r.speaking_rate,
      pitch: r.pitch,
      licenseStatus: r.license_status,
      status: r.status,
    })),
  };
}

// ============================================================
// Script
// ============================================================

type ScriptEpisodeRow = {
  id: string;
  project_id: string;
  source_unit_id: string;
  title: string;
  content_md: string | null;
};

export async function fetchScriptEpisode(
  ownerId: string,
  projectId: string,
  sourceUnitId: string,
): Promise<ScriptEpisodePayload | null> {
  const rows = await serviceFetch<ScriptEpisodeRow[]>(
    `/rest/v1/storyflow_script_episodes?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&source_unit_id=eq.${encodeURIComponent(sourceUnitId)}&select=id,project_id,source_unit_id,title,content_md&order=updated_at.desc&limit=1`,
  );
  const row = rows?.[0];
  if (!row) return null;
  return {
    projectId: row.project_id,
    sourceUnitId: row.source_unit_id,
    title: row.title,
    contentMd: row.content_md ?? "",
    wordCount: (row.content_md ?? "").length,
  };
}

type SceneRow = {
  id: string;
  project_id: string;
  scene_number: number;
  location: string | null;
  time_of_day: string | null;
  function_role: string | null;
  characters: string[];
  conflict: string | null;
  emotion: string | null;
  duration_target: number | null;
  director_meta: unknown;
  locked: boolean;
};

export async function fetchScenes(
  ownerId: string,
  projectId: string,
): Promise<ScriptScenesPayload> {
  const rows = await serviceFetch<SceneRow[]>(
    `/rest/v1/storyflow_production_scenes?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&order=scene_number.asc&limit=500&select=id,project_id,scene_number,location,time_of_day,function_role,characters,conflict,emotion,duration_target,director_meta,locked`,
  );
  return {
    projectId,
    scenes: (rows ?? []).map((r) => ({
      id: r.id,
      sceneNumber: r.scene_number,
      location: r.location,
      timeOfDay: r.time_of_day,
      functionRole: r.function_role,
      characters: Array.isArray(r.characters) ? (r.characters as string[]) : [],
      conflict: r.conflict,
      emotion: r.emotion,
      durationTarget: r.duration_target,
      directorMeta: (r.director_meta as Record<string, unknown> | null) ?? null,
      locked: Boolean(r.locked),
    })),
  };
}

// ============================================================
// Director
// ============================================================

type ShotRow = {
  id: string;
  scene_id: string;
  shot_number: number;
  shot_type: string | null;
  camera_angle: string | null;
  focal_length: string | null;
  duration: number | null;
  dialogue: string | null;
  image_prompt: string | null;
  video_prompt: string | null;
  negative_rules: string[];
  provider_params: unknown;
  prompt_hash: string | null;
  locked: boolean;
};

async function fetchShots(
  ownerId: string,
  projectId: string,
): Promise<ShotRow[]> {
  const rows = await serviceFetch<ShotRow[]>(
    `/rest/v1/storyflow_production_shots?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&order=shot_number.asc&limit=2000&select=id,scene_id,shot_number,shot_type,camera_angle,focal_length,duration,dialogue,image_prompt,video_prompt,negative_rules,provider_params,prompt_hash,locked`,
  );
  return rows ?? [];
}

export async function fetchDirectorShotList(
  ownerId: string,
  projectId: string,
): Promise<DirectorShotListPayload> {
  const shots = await fetchShots(ownerId, projectId);
  // CSV with BOM for Excel compatibility
  const header = "shot_id,scene_id,shot_number,shot_type,camera_angle,focal_length,duration,dialogue,locked\n";
  const body = shots
    .map((s) => {
      const cells = [
        s.id,
        s.scene_id,
        String(s.shot_number),
        s.shot_type ?? "",
        s.camera_angle ?? "",
        s.focal_length ?? "",
        s.duration != null ? String(s.duration) : "",
        (s.dialogue ?? "").replace(/[\r\n]+/g, " ").replace(/"/g, '""'),
        s.locked ? "true" : "false",
      ];
      return cells.map((c) => `"${c}"`).join(",");
    })
    .join("\n");
  return {
    projectId,
    csv: "\uFEFF" + header + body,
    shots: shots.map((s) => ({
      id: s.id,
      sceneId: s.scene_id,
      shotNumber: s.shot_number,
      shotType: s.shot_type,
      cameraAngle: s.camera_angle,
      focalLength: s.focal_length,
      duration: s.duration,
      dialogue: s.dialogue,
      locked: s.locked,
    })),
  };
}

export async function fetchDirectorPrompts(
  ownerId: string,
  projectId: string,
): Promise<DirectorPromptsPayload> {
  const shots = await fetchShots(ownerId, projectId);
  return {
    projectId,
    prompts: shots.map((s) => ({
      shotId: s.id,
      imagePrompt: s.image_prompt,
      videoPrompt: s.video_prompt,
      negativeRules: Array.isArray(s.negative_rules) ? (s.negative_rules as string[]) : [],
      providerParams: (s.provider_params as Record<string, unknown> | null) ?? null,
      promptHash: s.prompt_hash,
    })),
  };
}

// ============================================================
// Media
// ============================================================

type SelectedTakeRow = {
  id: string;
  shot_id: string;
  take_label: string | null;
  status: string;
  asset_id: string | null;
  storage_path: string | null;
  provider_name: string | null;
  model_name: string | null;
  created_at: string;
};

export async function fetchSelectedTakes(
  ownerId: string,
  projectId: string,
): Promise<MediaSelectedTakesPayload> {
  const rows = await serviceFetch<SelectedTakeRow[]>(
    `/rest/v1/storyflow_selected_takes?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc&limit=2000&select=id,shot_id,take_label,status,asset_id,storage_path,provider_name,model_name,created_at`,
  );
  return {
    projectId,
    takes: (rows ?? []).map((r) => ({
      id: r.id,
      shotId: r.shot_id,
      takeLabel: r.take_label,
      status: r.status,
      assetId: r.asset_id,
      storagePath: r.storage_path,
      providerName: r.provider_name,
      modelName: r.model_name,
      createdAt: r.created_at,
    })),
  };
}

type VoiceLineRow = {
  id: string;
  shot_id: string | null;
  character_id: string | null;
  voice_profile_id: string | null;
  dialogue_text: string;
  status: string;
  approved_asset_id: string | null;
  storage_path: string | null;
  locale: string | null;
};

export async function fetchVoiceLines(
  ownerId: string,
  projectId: string,
): Promise<MediaVoiceLinesPayload> {
  const rows = await serviceFetch<VoiceLineRow[]>(
    `/rest/v1/storyflow_voice_lines?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc&limit=2000&select=id,shot_id,character_id,voice_profile_id,dialogue_text,status,approved_asset_id,storage_path,locale`,
  );
  return {
    projectId,
    voiceLines: (rows ?? []).map((r) => ({
      id: r.id,
      shotId: r.shot_id,
      characterId: r.character_id,
      voiceProfileId: r.voice_profile_id,
      dialogueText: r.dialogue_text,
      status: r.status,
      approvedAssetId: r.approved_asset_id,
      storagePath: r.storage_path,
      locale: r.locale,
    })),
  };
}

type AssetRow = {
  id: string;
  asset_type: string;
  storage_path: string;
  size_bytes: number | null;
  mime_type: string | null;
  source_job_id: string | null;
  shot_id: string | null;
  character_id: string | null;
  created_at: string;
};

export async function fetchAssets(
  ownerId: string,
  projectId: string,
): Promise<MediaAssetsPayload> {
  const rows = await serviceFetch<AssetRow[]>(
    `/rest/v1/storyflow_assets?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc&limit=2000&select=id,asset_type,storage_path,size_bytes,mime_type,source_job_id,shot_id,character_id,created_at`,
  );
  return {
    projectId,
    assets: (rows ?? []).map((r) => ({
      id: r.id,
      assetType: r.asset_type,
      storagePath: r.storage_path,
      sizeBytes: r.size_bytes,
      mimeType: r.mime_type,
      sourceJobId: r.source_job_id,
      shotId: r.shot_id,
      characterId: r.character_id,
      createdAt: r.created_at,
    })),
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
