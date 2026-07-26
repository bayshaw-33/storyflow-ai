/**
 * TRAE-V2-04 AI Director 数据读写层
 * - applyBreakdown: 批量写入 scene/shot + director_meta
 * - updateShotDirectorMeta / updateSceneDirectorMeta: 单字段更新
 * - fetchScenesWithDirectorMeta: 读取
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DirectorSceneMeta,
  DirectorShotMeta,
  SceneBreakdownPreview,
  ApplyBreakdownRequest,
  ApplyBreakdownResponse,
} from "./types.ts";
import { DirectorError } from "./types.ts";

// ============================================================
// 类型
// ============================================================

type SceneRow = {
  id: string;
  production_project_id: string;
  owner_id: string;
  source_unit_id: string;
  sort_order: number;
  heading: string;
  location: string;
  time_of_day: string;
  summary: string;
  source_text: string;
  director_meta: Record<string, unknown> | null;
  locked: boolean | null;
  deleted_at: string | null;
};

type ShotRow = {
  id: string;
  production_project_id: string;
  owner_id: string;
  scene_id: string | null;
  index: number;
  story_beat: string | null;
  visual_description: string | null;
  shot_size: string | null;
  camera_movement: string | null;
  angle: string | null;
  duration_seconds: number | null;
  dialogue: string | null;
  emotion: string | null;
  continuity: string | null;
  director_meta: Record<string, unknown> | null;
  locked: boolean | null;
  deleted_at: string | null;
};

type ProjectRow = {
  id: string;
  owner_id: string;
  project_id: string;
  source_unit_id: string;
};

// ============================================================
// 获取 production_project_id
// ============================================================

export async function getProductionProjectId(
  client: SupabaseClient,
  ownerId: string,
  projectId: string,
  sourceUnitId: string,
): Promise<string> {
  const { data, error } = await client
    .from("storyflow_production_projects")
    .select("id, owner_id, project_id, source_unit_id")
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .eq("source_unit_id", sourceUnitId)
    .limit(1);

  if (error) throw new DirectorError("INVALID_INPUT", `查询项目失败: ${error.message}`);
  if (!data || data.length === 0) {
    throw new DirectorError("INVALID_INPUT", `未找到项目 projectId=${projectId} sourceUnitId=${sourceUnitId}`);
  }
  return (data[0] as ProjectRow).id;
}

// ============================================================
// Apply Breakdown（批量写入）
// ============================================================

export async function applyBreakdown(
  client: SupabaseClient,
  ownerId: string,
  request: ApplyBreakdownRequest,
): Promise<ApplyBreakdownResponse> {
  const productionProjectId = await getProductionProjectId(
    client,
    ownerId,
    request.projectId,
    request.sourceUnitId,
  );

  const sceneIdMap: Record<string, string> = {};
  const shotIdMap: Record<string, string> = {};
  let applied = 0;
  let skipped = 0;

  // 处理删除（用户确认废弃的）
  if (request.deletedSceneIds && request.deletedSceneIds.length > 0) {
    await client
      .from("storyflow_production_scenes")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", request.deletedSceneIds)
      .eq("owner_id", ownerId);
  }
  if (request.deletedShotIds && request.deletedShotIds.length > 0) {
    await client
      .from("storyflow_production_shots")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", request.deletedShotIds)
      .eq("owner_id", ownerId);
  }

  // 逐个处理 scene
  for (let sceneIdx = 0; sceneIdx < request.scenes.length; sceneIdx++) {
    const preview = request.scenes[sceneIdx];
    const isExisting = preview.sceneId && !preview.sceneId.startsWith("preview-scene-");

    let sceneId: string;

    if (isExisting) {
      // 已有 scene：检查 locked
      const { data: existing } = await client
        .from("storyflow_production_scenes")
        .select("id, locked, director_meta")
        .eq("id", preview.sceneId)
        .eq("owner_id", ownerId)
        .is("deleted_at", null)
        .limit(1);

      if (!existing || existing.length === 0) {
        skipped += 1;
        continue;
      }

      const row = existing[0] as SceneRow;
      if (row.locked) {
        // 锁定不覆盖 director_meta，只更新其他字段
        skipped += 1;
        sceneId = row.id;
        sceneIdMap[preview.sceneId] = sceneId;
      } else {
        // 更新 scene + director_meta
        const newMeta: DirectorSceneMeta = {
          ...(row.director_meta as DirectorSceneMeta ?? {}),
          ...preview.directorMeta,
          ai_generated: true,
          user_confirmed: false,
        };
        await client
          .from("storyflow_production_scenes")
          .update({
            heading: preview.heading,
            location: preview.location,
            time_of_day: preview.timeOfDay,
            summary: preview.summary,
            source_text: preview.sourceText,
            director_meta: newMeta as unknown as Record<string, unknown>,
            sort_order: sceneIdx,
            updated_at: new Date().toISOString(),
          })
          .eq("id", preview.sceneId)
          .eq("owner_id", ownerId);
        sceneId = preview.sceneId;
        sceneIdMap[preview.sceneId] = sceneId;
        applied += 1;
      }
    } else {
      // 新 scene：INSERT
      const insertPayload = {
        production_project_id: productionProjectId,
        owner_id: ownerId,
        source_unit_id: request.sourceUnitId,
        sort_order: sceneIdx,
        heading: preview.heading,
        location: preview.location,
        time_of_day: preview.timeOfDay,
        summary: preview.summary,
        source_text: preview.sourceText,
        source_range: preview.directorMeta.source_quote_range ?? null,
        character_asset_ids: preview.characterAssetIds,
        prop_asset_ids: preview.propAssetIds,
        director_meta: preview.directorMeta as unknown as Record<string, unknown>,
        locked: false,
        user_edited: false,
        confirmed: false,
        revision: 0,
        analysis_version: 1,
        source_hash: "",
      };

      const { data, error } = await client
        .from("storyflow_production_scenes")
        .insert(insertPayload)
        .select("id")
        .single();

      if (error) {
        throw new DirectorError("INVALID_INPUT", `创建 Scene 失败: ${error.message}`);
      }
      sceneId = (data as { id: string }).id;
      sceneIdMap[preview.sceneId] = sceneId;
      applied += 1;
    }

    // 处理该 scene 下的 shots
    for (let shotIdx = 0; shotIdx < preview.shots.length; shotIdx++) {
      const shotPreview = preview.shots[shotIdx];
      const shotIsExisting = shotPreview.shotId && !shotPreview.shotId.startsWith("preview-shot-");

      let shotId: string;

      if (shotIsExisting) {
        const { data: existingShot } = await client
          .from("storyflow_production_shots")
          .select("id, locked, director_meta")
          .eq("id", shotPreview.shotId)
          .eq("owner_id", ownerId)
          .is("deleted_at", null)
          .limit(1);

        if (!existingShot || existingShot.length === 0) {
          skipped += 1;
          continue;
        }

        const shotRow = existingShot[0] as ShotRow;
        if (shotRow.locked) {
          skipped += 1;
          shotId = shotRow.id;
          shotIdMap[shotPreview.shotId] = shotId;
        } else {
          const newShotMeta: DirectorShotMeta = {
            ...(shotRow.director_meta as DirectorShotMeta ?? {}),
            ...shotPreview.directorMeta,
            ai_generated: true,
            user_confirmed: false,
          };
          await client
            .from("storyflow_production_shots")
            .update({
              story_beat: shotPreview.storyBeat,
              visual_description: shotPreview.visualDescription,
              shot_size: shotPreview.shotSize,
              camera_movement: shotPreview.cameraMovement,
              angle: shotPreview.angle,
              duration_seconds: shotPreview.durationSeconds,
              dialogue: shotPreview.dialogue,
              emotion: shotPreview.emotion,
              continuity: shotPreview.continuity,
              director_meta: newShotMeta as unknown as Record<string, unknown>,
              index: shotIdx,
              scene_id: sceneId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", shotPreview.shotId)
            .eq("owner_id", ownerId);
          shotId = shotPreview.shotId;
          shotIdMap[shotPreview.shotId] = shotId;
          applied += 1;
        }
      } else {
        // 新 shot：INSERT
        const insertPayload = {
          production_project_id: productionProjectId,
          owner_id: ownerId,
          source_unit_id: request.sourceUnitId,
          scene_id: sceneId,
          index: shotIdx,
          scene_title: preview.heading,
          source_text: shotPreview.sourceText,
          story_beat: shotPreview.storyBeat,
          visual_description: shotPreview.visualDescription,
          shot_type: "普通画面",
          duration: `${shotPreview.durationSeconds}s`,
          duration_seconds: shotPreview.durationSeconds,
          composition: "",
          camera_movement: shotPreview.cameraMovement,
          shot_size: shotPreview.shotSize,
          angle: shotPreview.angle,
          dialogue: shotPreview.dialogue,
          sound: shotPreview.directorMeta.sound_effects ?? "",
          continuity: shotPreview.continuity,
          emotion: shotPreview.emotion,
          image_prompt: "",
          video_prompt: "",
          director_meta: shotPreview.directorMeta as unknown as Record<string, unknown>,
          locked: false,
          user_edited: false,
          confirmed: false,
          revision: 0,
          analysis_version: 1,
          source_hash: "",
          status: "draft",
        };

        const { data, error } = await client
          .from("storyflow_production_shots")
          .insert(insertPayload)
          .select("id")
          .single();

        if (error) {
          throw new DirectorError("INVALID_INPUT", `创建 Shot 失败: ${error.message}`);
        }
        shotId = (data as { id: string }).id;
        shotIdMap[shotPreview.shotId] = shotId;
        applied += 1;
      }
    }
  }

  return { applied, skipped, sceneIdMap, shotIdMap };
}

// ============================================================
// 单字段更新
// ============================================================

export async function updateShotDirectorMeta(
  client: SupabaseClient,
  shotId: string,
  ownerId: string,
  meta: DirectorShotMeta,
): Promise<void> {
  const { error } = await client
    .from("storyflow_production_shots")
    .update({
      director_meta: meta as unknown as Record<string, unknown>,
      user_edited: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shotId)
    .eq("owner_id", ownerId);

  if (error) {
    throw new DirectorError("INVALID_INPUT", `更新 Shot director_meta 失败: ${error.message}`);
  }
}

export async function updateSceneDirectorMeta(
  client: SupabaseClient,
  sceneId: string,
  ownerId: string,
  meta: DirectorSceneMeta,
): Promise<void> {
  const { error } = await client
    .from("storyflow_production_scenes")
    .update({
      director_meta: meta as unknown as Record<string, unknown>,
      user_edited: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sceneId)
    .eq("owner_id", ownerId);

  if (error) {
    throw new DirectorError("INVALID_INPUT", `更新 Scene director_meta 失败: ${error.message}`);
  }
}

// ============================================================
// 锁定/解锁
// ============================================================

export async function setShotLocked(
  client: SupabaseClient,
  shotId: string,
  ownerId: string,
  locked: boolean,
): Promise<void> {
  const { error } = await client
    .from("storyflow_production_shots")
    .update({ locked, updated_at: new Date().toISOString() })
    .eq("id", shotId)
    .eq("owner_id", ownerId);
  if (error) {
    throw new DirectorError("INVALID_INPUT", `锁定 Shot 失败: ${error.message}`);
  }
}

export async function setSceneLocked(
  client: SupabaseClient,
  sceneId: string,
  ownerId: string,
  locked: boolean,
): Promise<void> {
  const { error } = await client
    .from("storyflow_production_scenes")
    .update({ locked, updated_at: new Date().toISOString() })
    .eq("id", sceneId)
    .eq("owner_id", ownerId);
  if (error) {
    throw new DirectorError("INVALID_INPUT", `锁定 Scene 失败: ${error.message}`);
  }
}

// ============================================================
// 读取
// ============================================================

export type SceneWithDirectorMeta = {
  id: string;
  sortOrder: number;
  heading: string;
  location: string;
  timeOfDay: string;
  summary: string;
  sourceText: string;
  directorMeta: DirectorSceneMeta;
  locked: boolean;
  confirmed: boolean;
  shots: ShotWithDirectorMeta[];
};

export type ShotWithDirectorMeta = {
  id: string;
  sceneId: string | null;
  index: number;
  storyBeat: string;
  visualDescription: string;
  shotSize: string;
  cameraMovement: string;
  angle: string;
  durationSeconds: number;
  dialogue: string;
  emotion: string;
  continuity: string;
  directorMeta: DirectorShotMeta;
  locked: boolean;
  confirmed: boolean;
};

export async function fetchScenesWithDirectorMeta(
  client: SupabaseClient,
  ownerId: string,
  projectId: string,
  sourceUnitId: string,
): Promise<SceneWithDirectorMeta[]> {
  const productionProjectId = await getProductionProjectId(client, ownerId, projectId, sourceUnitId);

  // 查询 scenes
  const { data: sceneRows, error: sceneErr } = await client
    .from("storyflow_production_scenes")
    .select("*")
    .eq("production_project_id", productionProjectId)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (sceneErr) throw new DirectorError("INVALID_INPUT", `查询 Scenes 失败: ${sceneErr.message}`);
  if (!sceneRows || sceneRows.length === 0) return [];

  const scenes = sceneRows as SceneRow[];
  const sceneIds = scenes.map((s) => s.id);

  // 查询 shots
  const { data: shotRows, error: shotErr } = await client
    .from("storyflow_production_shots")
    .select("*")
    .in("scene_id", sceneIds)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .order("index", { ascending: true });

  if (shotErr) throw new DirectorError("INVALID_INPUT", `查询 Shots 失败: ${shotErr.message}`);

  const shotsByScene = new Map<string, ShotWithDirectorMeta[]>();
  for (const row of (shotRows ?? []) as ShotRow[]) {
    const sceneId = row.scene_id ?? "";
    if (!shotsByScene.has(sceneId)) shotsByScene.set(sceneId, []);
    shotsByScene.get(sceneId)!.push({
      id: row.id,
      sceneId: row.scene_id,
      index: row.index,
      storyBeat: row.story_beat ?? "",
      visualDescription: row.visual_description ?? "",
      shotSize: row.shot_size ?? "",
      cameraMovement: row.camera_movement ?? "",
      angle: row.angle ?? "",
      durationSeconds: row.duration_seconds ?? 0,
      dialogue: row.dialogue ?? "",
      emotion: row.emotion ?? "",
      continuity: row.continuity ?? "",
      directorMeta: (row.director_meta as DirectorShotMeta) ?? {},
      locked: row.locked ?? false,
      confirmed: false,
    });
  }

  return scenes.map((s): SceneWithDirectorMeta => ({
    id: s.id,
    sortOrder: s.sort_order,
    heading: s.heading,
    location: s.location,
    timeOfDay: s.time_of_day,
    summary: s.summary,
    sourceText: s.source_text,
    directorMeta: (s.director_meta as DirectorSceneMeta) ?? {},
    locked: s.locked ?? false,
    confirmed: false,
    shots: shotsByScene.get(s.id) ?? [],
  }));
}
