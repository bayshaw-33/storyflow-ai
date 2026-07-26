/**
 * TRAE-V2-06 OpenCut-ready Editor Framework
 * Queries：读取 Assembly Sequence + Selected Takes + Voice Lines
 *
 * 复用现有 storyflow_assembly_sequences/items + selected_takes + voice_lines 表
 * Owner 校验：通过 project_id 关联到 storyflow_production_projects.owner_id
 */

import { serviceFetch } from "@/lib/supabase/server";
import type {
  AssemblyItemRow,
  AssemblySequenceRow,
  SelectedTakeRow,
  VoiceLineSummary,
} from "./types";
import { EditorError } from "./types";

// ============================================================
// Owner 校验
// ============================================================

type ProductionProjectRow = {
  id: string;
  project_id: string;
  owner_id: string;
};

/**
 * 校验 projectId 归属 ownerId
 * 通过 storyflow_production_projects 表
 */
export async function validateProjectOwnership(
  ownerId: string,
  projectId: string,
): Promise<string> {
  const rows = await serviceFetch<ProductionProjectRow[]>(
    `/rest/v1/storyflow_production_projects?project_id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(ownerId)}&select=id,project_id,owner_id&limit=1`,
  );
  if (!rows[0]) {
    throw new EditorError(
      "SCOPE_NOT_FOUND",
      `Project ${projectId} 不存在或无权访问。`,
    );
  }
  return rows[0].id;
}

// ============================================================
// Assembly Sequence
// ============================================================

export async function getAssemblySequence(
  projectId: string,
): Promise<AssemblySequenceRow | null> {
  const rows = await serviceFetch<AssemblySequenceRow[]>(
    `/rest/v1/storyflow_assembly_sequences?project_id=eq.${encodeURIComponent(projectId)}&order=created_at.asc&limit=1&select=*`,
  );
  return rows[0] ?? null;
}

export async function getAssemblyItems(
  sequenceId: string,
): Promise<AssemblyItemRow[]> {
  const rows = await serviceFetch<AssemblyItemRow[]>(
    `/rest/v1/storyflow_assembly_items?assembly_sequence_id=eq.${encodeURIComponent(sequenceId)}&order=sort_order.asc&select=*`,
  );
  return rows ?? [];
}

// ============================================================
// Selected Takes
// ============================================================

export async function getSelectedTakes(
  projectId: string,
): Promise<SelectedTakeRow[]> {
  const rows = await serviceFetch<SelectedTakeRow[]>(
    `/rest/v1/storyflow_selected_takes?project_id=eq.${encodeURIComponent(projectId)}&status=eq.current&select=*`,
  );
  return rows ?? [];
}

// ============================================================
// Voice Lines（已批准）
// ============================================================

// V2-03 实际表结构：voice_lines 无 character_id/dialogue_text/approved_asset_id 字段
// character_id 通过 voice_profile_id 关联，dialogue_text→text, approved_asset_id→asset_id+is_approved
type VoiceLineRow = {
  id: string;
  project_id: string | null;
  shot_id: string | null;
  scene_id: string | null;
  voice_profile_id: string | null;
  text: string;
  language: string;
  status: string;
  asset_id: string | null;
  storage_path: string | null;
  is_approved: boolean;
};

export async function getApprovedVoiceLines(
  projectId: string,
): Promise<VoiceLineSummary[]> {
  // V2-03 实际表结构：用 text（非 dialogue_text）, asset_id（非 approved_asset_id）
  // character_id 不在 voice_lines 表，置 null（调用方需通过 voice_profile_id 关联）
  const rows = await serviceFetch<VoiceLineRow[]>(
    `/rest/v1/storyflow_voice_lines?project_id=eq.${encodeURIComponent(projectId)}&is_approved=eq.true&select=id,shot_id,scene_id,voice_profile_id,text,language,status,asset_id,storage_path,is_approved`,
  );
  return (rows ?? []).map((r) => ({
    id: r.id,
    shot_id: r.shot_id,
    character_id: null,
    dialogue_text: r.text,
    status: r.is_approved ? "approved" : r.status,
    approved_asset_id: r.is_approved ? r.asset_id : null,
    storage_path: r.storage_path,
  }));
}

// ============================================================
// 聚合读取
// ============================================================

export type EditorTimelineData = {
  sequence: AssemblySequenceRow;
  items: AssemblyItemRow[];
  selectedTakes: SelectedTakeRow[];
  voiceLines: VoiceLineSummary[];
};

export async function loadEditorTimelineData(
  ownerId: string,
  projectId: string,
): Promise<EditorTimelineData> {
  // 1. owner 校验
  await validateProjectOwnership(ownerId, projectId);

  // 2. 读取 assembly sequence
  const sequence = await getAssemblySequence(projectId);
  if (!sequence) {
    throw new EditorError(
      "SEQUENCE_NOT_FOUND",
      `Project ${projectId} 没有关联的 Assembly Sequence，请先在 Production 中创建。`,
    );
  }

  // 3. 并行读取 items / takes / voice_lines
  const [items, selectedTakes, voiceLines] = await Promise.all([
    getAssemblyItems(sequence.id),
    getSelectedTakes(projectId),
    getApprovedVoiceLines(projectId),
  ]);

  return { sequence, items, selectedTakes, voiceLines };
}

/**
 * 检查是否有 completed 视频资产
 */
export function hasCompletedVideo(
  selectedTakes: SelectedTakeRow[],
): boolean {
  return selectedTakes.some((t) => t.status === "current" && t.video_url);
}
