import { serviceFetch } from "@/lib/supabase/server";
import { createEmptyProductionState } from "./state";
import type {
  ProductionAspectRatio,
  ProductionContentType,
  ProductionLanguage,
  ProductionMode,
  ProductionProjectState,
  ProductionShot,
  ProductionChatMessage,
  ProductionHistoryItem,
  ProductionProviderSettings,
  ProductionSourceFile,
  ProductionStoryBrief,
  ProductionVisualBible,
} from "./types";

type ProductionProjectRow = {
  id: string;
  project_id: string | null;
  owner_id: string;
  title: string;
  workflow_type: string;
  content_type: string;
  aspect_ratio: string;
  language: string;
  universe_id: string | null;
  mode: string;
  story_brief: Record<string, unknown>;
  visual_bible: Record<string, unknown>;
  providers: Record<string, unknown>;
  source_files: unknown[];
  source_summary: string;
  chat_messages: unknown[];
  history: unknown[];
  casting: Record<string, unknown>;
  selected_shot_id: string | null;
  created_at: string;
  updated_at: string;
};

type ProductionShotRow = {
  id: string;
  production_project_id: string;
  owner_id: string;
  index: number;
  scene_title: string;
  shot_type: string;
  duration: string;
  description: string;
  composition: string;
  camera_movement: string;
  image_prompt: string;
  video_prompt: string;
  dialogue: string | null;
  sound: string | null;
  continuity: string | null;
  character_refs: unknown[];
  scene_refs: unknown[];
  image_url: string | null;
  video_url: string | null;
  image_task_id: string | null;
  video_task_id: string | null;
  image_provider: string | null;
  video_provider: string | null;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export async function loadProductionState(
  userId: string,
  projectId: string,
): Promise<ProductionProjectState | null> {
  // Try structured table first
  const rows = await serviceFetch<ProductionProjectRow[]>(
    `/rest/v1/storyflow_production_projects?project_id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  );

  const projectRow = rows[0];
  if (!projectRow) {
    // Fallback: try legacy JSON from storyflow_projects.deliveryPackage
    return loadLegacyState(userId, projectId);
  }

  const shotRows = await serviceFetch<ProductionShotRow[]>(
    `/rest/v1/storyflow_production_shots?production_project_id=eq.${encodeURIComponent(projectRow.id)}&owner_id=eq.${encodeURIComponent(userId)}&select=*&order=index.asc`,
  );

  return parseProjectRowToState(projectRow, shotRows);
}

async function loadLegacyState(
  userId: string,
  projectId: string,
): Promise<ProductionProjectState | null> {
  const rows = await serviceFetch<Array<{ delivery_package: string | null }>>(
    `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}&select=delivery_package&limit=1`,
  );

  const deliveryPackage = rows[0]?.delivery_package;
  if (!deliveryPackage) return null;

  try {
    const parsed = JSON.parse(deliveryPackage);
    if (parsed.productionState) {
      return createEmptyProductionState(parsed.productionState);
    }
  } catch {
    // Invalid JSON
  }
  return null;
}

export async function saveProductionState(
  userId: string,
  projectId: string,
  state: ProductionProjectState,
): Promise<string> {
  const projectRow = serializeStateToProjectRow(state, userId, projectId);

  // Check if record already exists
  const existing = await serviceFetch<Array<{ id: string }>>(
    `/rest/v1/storyflow_production_projects?project_id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
  );

  let productionProjectId: string;

  if (existing[0]) {
    productionProjectId = existing[0].id;
    await serviceFetch(
      `/rest/v1/storyflow_production_projects?id=eq.${encodeURIComponent(productionProjectId)}`,
      { method: "PATCH", body: JSON.stringify(projectRow) },
    );
  } else {
    const inserted = await serviceFetch<ProductionProjectRow[]>(
      "/rest/v1/storyflow_production_projects",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(projectRow),
      },
    );
    productionProjectId = inserted[0]?.id || "";
  }

  // Sync shots: delete old, insert new
  await serviceFetch(
    `/rest/v1/storyflow_production_shots?production_project_id=eq.${encodeURIComponent(productionProjectId)}`,
    { method: "DELETE" },
  );

  if (state.shots.length > 0) {
    const shotRows = state.shots.map((shot, index) =>
      serializeShotToRow(shot, productionProjectId, userId, index + 1),
    );
    await serviceFetch("/rest/v1/storyflow_production_shots", {
      method: "POST",
      body: JSON.stringify(shotRows),
    });
  }

  // Sync JSON snapshot to storyflow_projects.deliveryPackage
  await syncJsonSnapshot(userId, projectId, state);

  return productionProjectId;
}

async function syncJsonSnapshot(
  userId: string,
  projectId: string,
  state: ProductionProjectState,
) {
  const snapshot = JSON.stringify({
    productionState: state,
    exportedAt: new Date().toISOString(),
    version: "production-storyboard-backend-v1",
  });

  await serviceFetch(
    `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        delivery_package: snapshot,
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

function serializeStateToProjectRow(
  state: ProductionProjectState,
  ownerId: string,
  projectId: string,
): Omit<ProductionProjectRow, "id" | "created_at" | "updated_at"> {
  return {
    project_id: projectId,
    owner_id: ownerId,
    title: state.title,
    workflow_type: state.workflowType,
    content_type: state.contentType,
    aspect_ratio: state.aspectRatio,
    language: state.language,
    universe_id: state.universeId || null,
    mode: state.mode,
    story_brief: state.storyBrief as unknown as Record<string, unknown>,
    visual_bible: state.visualBible as unknown as Record<string, unknown>,
    providers: state.providers as unknown as Record<string, unknown>,
    source_files: state.sourceFiles as unknown[],
    source_summary: state.sourceSummary,
    chat_messages: state.chatMessages as unknown[],
    history: state.history as unknown[],
    casting: (state.casting || {}) as Record<string, unknown>,
    selected_shot_id: state.selectedShotId || null,
  };
}

function serializeShotToRow(
  shot: ProductionShot,
  productionProjectId: string,
  ownerId: string,
  index: number,
): Omit<ProductionShotRow, "id" | "created_at" | "updated_at"> {
  return {
    production_project_id: productionProjectId,
    owner_id: ownerId,
    index,
    scene_title: shot.sceneTitle,
    shot_type: shot.shotType,
    duration: shot.duration,
    description: shot.description,
    composition: shot.composition,
    camera_movement: shot.cameraMovement,
    image_prompt: shot.imagePrompt,
    video_prompt: shot.videoPrompt,
    dialogue: shot.dialogue || null,
    sound: shot.sound || null,
    continuity: shot.continuity || null,
    character_refs: shot.characterRefs || [],
    scene_refs: shot.sceneRefs || [],
    image_url: shot.imageUrl || null,
    video_url: shot.videoUrl || null,
    image_task_id: shot.imageTaskId || null,
    video_task_id: shot.videoTaskId || null,
    image_provider: shot.imageProvider || null,
    video_provider: shot.videoProvider || null,
    status: shot.status,
    error: shot.error || null,
  };
}

function parseProjectRowToState(
  row: ProductionProjectRow,
  shotRows: ProductionShotRow[],
): ProductionProjectState {
  return {
    id: row.id,
    projectId: row.project_id || undefined,
    title: row.title,
    workflowType: row.workflow_type as ProductionProjectState["workflowType"],
    contentType: row.content_type as ProductionContentType,
    aspectRatio: row.aspect_ratio as ProductionAspectRatio,
    language: row.language as ProductionLanguage,
    universeId: row.universe_id || null,
    sourceFiles: (row.source_files as ProductionSourceFile[]) || [],
    sourceSummary: row.source_summary,
    storyBrief: (row.story_brief as unknown as ProductionStoryBrief) || ({} as ProductionStoryBrief),
    visualBible: (row.visual_bible as unknown as ProductionVisualBible) || ({} as ProductionVisualBible),
    shots: shotRows.map(parseRowToShot),
    selectedShotId: row.selected_shot_id || undefined,
    mode: row.mode as ProductionMode,
    providers: (row.providers as unknown as ProductionProviderSettings) || ({} as ProductionProviderSettings),
    chatMessages: (row.chat_messages as ProductionChatMessage[]) || [],
    history: (row.history as ProductionHistoryItem[]) || [],
    casting: (row.casting as Record<string, string>) || {},
    updatedAt: row.updated_at,
  };
}

function parseRowToShot(row: ProductionShotRow): ProductionShot {
  return {
    id: row.id,
    index: row.index,
    sceneTitle: row.scene_title,
    shotType: row.shot_type as ProductionShot["shotType"],
    duration: row.duration,
    description: row.description,
    composition: row.composition,
    cameraMovement: row.camera_movement,
    imagePrompt: row.image_prompt,
    videoPrompt: row.video_prompt,
    dialogue: row.dialogue || undefined,
    sound: row.sound || undefined,
    continuity: row.continuity || undefined,
    characterRefs: (row.character_refs as string[]) || [],
    sceneRefs: (row.scene_refs as string[]) || [],
    imageUrl: row.image_url || undefined,
    videoUrl: row.video_url || undefined,
    imageTaskId: row.image_task_id || undefined,
    videoTaskId: row.video_task_id || undefined,
    imageProvider: (row.image_provider as ProductionShot["imageProvider"]) || undefined,
    videoProvider: (row.video_provider as ProductionShot["videoProvider"]) || undefined,
    status: row.status as ProductionShot["status"],
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateShotStatus(
  userId: string,
  productionProjectId: string,
  shotId: string,
  patch: {
    status?: string;
    image_url?: string;
    video_url?: string;
    image_task_id?: string;
    video_task_id?: string;
    image_provider?: string;
    video_provider?: string;
    error?: string | null;
  },
): Promise<void> {
  const dbPatch: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  };
  await serviceFetch(
    `/rest/v1/storyflow_production_shots?id=eq.${encodeURIComponent(shotId)}&production_project_id=eq.${encodeURIComponent(productionProjectId)}&owner_id=eq.${encodeURIComponent(userId)}`,
    { method: "PATCH", body: JSON.stringify(dbPatch) },
  );
}

export async function getShotById(
  userId: string,
  shotId: string,
): Promise<ProductionShot | null> {
  const rows = await serviceFetch<ProductionShotRow[]>(
    `/rest/v1/storyflow_production_shots?id=eq.${encodeURIComponent(shotId)}&owner_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  );
  return rows[0] ? parseRowToShot(rows[0]) : null;
}
