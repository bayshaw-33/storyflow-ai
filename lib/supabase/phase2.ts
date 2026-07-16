import type { TaskType } from "@/lib/ai/prompts";
import { compareJsonVersions, compareTextVersions } from "@/lib/diff";
import type { StoryBible } from "@/lib/projects";
import { serviceFetch } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;
type StepStatus = "empty" | "draft" | "confirmed" | "stale";
type VersionSource = "ai" | "manual" | "import" | "restore" | "demo" | "optimize";

type ProjectRow = {
  id: string;
  user_id?: string | null;
  owner_id?: string | null;
  title?: string | null;
  mode?: string | null;
  workflow_type?: string | null;
  target_market?: string | null;
  genre?: string | null;
  language?: string | null;
  episode_count?: number | null;
  episode_duration?: string | null;
  current_phase?: string | null;
  story_bible?: StoryBible | null;
  data?: JsonRecord | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ProjectStepRow = {
  id: string;
  user_id: string;
  project_id: string;
  phase_key: string;
  step_key: TaskType;
  title?: string | null;
  content_text?: string | null;
  content_json?: unknown;
  content?: unknown;
  status: StepStatus;
  version?: number | null;
  version_no?: number | null;
  updated_at: string;
};

export type SaveProjectStepInput = {
  projectId: string;
  phaseKey: string;
  stepKey: TaskType;
  title?: string;
  contentText?: string;
  contentJson?: unknown;
  status?: StepStatus;
  source?: VersionSource;
  createVersion?: boolean;
};

export type CharacterInput = {
  id?: string;
  projectId: string;
  name?: string;
  role?: string;
  age?: string;
  goal?: string;
  wound?: string;
  secret?: string;
  relationshipNotes?: string;
  voiceStyle?: string;
  visualPrompt?: string;
  contentJson?: unknown;
};

export type EpisodeInput = {
  id?: string;
  projectId: string;
  episodeNo: number;
  title?: string;
  openingHook?: string;
  emotionalGoal?: string;
  conflict?: string;
  reversal?: string;
  cliffhanger?: string;
  summary?: string;
  scoreJson?: unknown;
  contentJson?: unknown;
};

export type SceneInput = {
  id?: string;
  projectId: string;
  episodeId: string;
  sceneNo: number;
  location?: string;
  time?: string;
  characters?: unknown[];
  beats?: unknown[];
  visualPrompt?: string;
};

export async function requireProjectAccess(userId: string, projectId: string) {
  const rows = await serviceFetch<ProjectRow[]>(
    `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(projectId)}&select=*&limit=1`,
  );
  const project = rows[0];
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const ownerId = project.owner_id || project.user_id;
  if (ownerId && ownerId !== userId) throw new Error("PROJECT_FORBIDDEN");
  return project;
}

export async function getStoryBible(userId: string, projectId: string) {
  const project = await requireProjectAccess(userId, projectId);
  return normalizeStoryBible(project.story_bible || (project.data?.storyBible as Partial<StoryBible> | undefined), project);
}

export async function updateStoryBible(userId: string, projectId: string, storyBible: Partial<StoryBible>, changedEntity = "story_bible") {
  const project = await requireProjectAccess(userId, projectId);
  const nextBible = normalizeStoryBible(storyBible, project);
  const data = { ...(project.data || {}), storyBible: nextBible };
  const now = new Date().toISOString();

  await createVersion(userId, {
    projectId,
    entityType: "story_bible",
    entityId: projectId,
    stepKey: "brief",
    source: "manual",
    snapshotText: JSON.stringify(nextBible, null, 2),
    snapshotJson: nextBible,
    diffJson: compareJsonVersions(project.story_bible || {}, nextBible),
  });

  await serviceFetch(`/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      story_bible: nextBible,
      target_market: nextBible.targetMarket || project.target_market,
      genre: nextBible.genreType || project.genre,
      data,
      updated_at: now,
    }),
  });

  await markDownstreamStepsStale(userId, projectId, changedEntity);
  return nextBible;
}

export async function markDownstreamStepsStale(userId: string, projectId: string, changedEntity: string) {
  await requireProjectAccess(userId, projectId);
  const keys = downstreamStepKeys(changedEntity);
  if (!keys.length) return { staleSteps: [] as string[] };
  await serviceFetch(`/rest/v1/storyflow_project_steps?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}&step_key=in.(${keys.join(",")})`, {
    method: "PATCH",
    body: JSON.stringify({ status: "stale", updated_at: new Date().toISOString() }),
  });
  return { staleSteps: keys };
}

export async function listProjectSteps(userId: string, projectId: string) {
  await requireProjectAccess(userId, projectId);
  return serviceFetch<ProjectStepRow[]>(
    `/rest/v1/storyflow_project_steps?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}&select=*&order=updated_at.desc`,
  );
}

export async function saveProjectStep(userId: string, input: SaveProjectStepInput) {
  await requireProjectAccess(userId, input.projectId);
  const existing = await readProjectStep(userId, input.projectId, input.stepKey);
  const nextVersion = Number(existing?.version || existing?.version_no || 0) + 1;
  const now = new Date().toISOString();
  const contentJson = input.contentJson ?? {};
  const contentText = input.contentText ?? "";

  const rows = await serviceFetch<ProjectStepRow[]>("/rest/v1/storyflow_project_steps?on_conflict=project_id,step_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      user_id: userId,
      project_id: input.projectId,
      phase_key: input.phaseKey,
      step_key: input.stepKey,
      title: input.title || input.stepKey,
      content_text: contentText,
      content_json: contentJson,
      content: contentJson,
      status: input.status || "draft",
      version: nextVersion,
      version_no: nextVersion,
      updated_at: now,
    }),
  });

  const row = rows[0];
  if (input.createVersion !== false) {
    await createVersion(userId, {
      projectId: input.projectId,
      entityType: "project_step",
      entityId: row?.id || `${input.projectId}:${input.stepKey}`,
      stepKey: input.stepKey,
      source: input.source || "manual",
      snapshotText: contentText,
      snapshotJson: contentJson,
      diffJson: {
        text: compareTextVersions(existing?.content_text || "", contentText),
        json: compareJsonVersions(existing?.content_json || existing?.content || {}, contentJson),
      },
    });
  }

  return row;
}

export async function readProjectStep(userId: string, projectId: string, stepKey: TaskType) {
  await requireProjectAccess(userId, projectId);
  const rows = await serviceFetch<ProjectStepRow[]>(
    `/rest/v1/storyflow_project_steps?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}&step_key=eq.${encodeURIComponent(stepKey)}&select=*&limit=1`,
  );
  return rows[0] || null;
}

export async function listCharacters(userId: string, projectId: string) {
  await requireProjectAccess(userId, projectId);
  return serviceFetch(`/rest/v1/storyflow_characters?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}&select=*&order=updated_at.desc`);
}

export async function upsertCharacter(userId: string, input: CharacterInput) {
  await requireProjectAccess(userId, input.projectId);
  const id = input.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const rows = await serviceFetch("/rest/v1/storyflow_characters?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      id,
      user_id: userId,
      project_id: input.projectId,
      name: input.name || "未命名角色",
      role: input.role || "",
      age: input.age || "",
      goal: input.goal || "",
      wound: input.wound || "",
      secret: input.secret || "",
      relationship_notes: input.relationshipNotes || "",
      voice_style: input.voiceStyle || "",
      visual_prompt: input.visualPrompt || "",
      content_json: input.contentJson || {},
      updated_at: now,
    }),
  });
  await markDownstreamStepsStale(userId, input.projectId, "characters");
  return rows;
}

export async function deleteCharacter(userId: string, projectId: string, id: string) {
  await requireProjectAccess(userId, projectId);
  await serviceFetch(`/rest/v1/storyflow_characters?id=eq.${encodeURIComponent(id)}&project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
  await markDownstreamStepsStale(userId, projectId, "characters");
  return { id };
}

export async function listEpisodes(userId: string, projectId: string) {
  await requireProjectAccess(userId, projectId);
  return serviceFetch(`/rest/v1/storyflow_episodes?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}&select=*&order=episode_no.asc`);
}

export async function upsertEpisode(userId: string, input: EpisodeInput) {
  await requireProjectAccess(userId, input.projectId);
  const now = new Date().toISOString();
  const rows = await serviceFetch("/rest/v1/storyflow_episodes?on_conflict=project_id,episode_no", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      id: input.id || crypto.randomUUID(),
      user_id: userId,
      project_id: input.projectId,
      episode_no: input.episodeNo,
      title: input.title || `第 ${input.episodeNo} 集`,
      opening_hook: input.openingHook || "",
      emotional_goal: input.emotionalGoal || "",
      conflict: input.conflict || "",
      reversal: input.reversal || "",
      cliffhanger: input.cliffhanger || "",
      summary: input.summary || "",
      score_json: input.scoreJson || {},
      content_json: input.contentJson || {},
      updated_at: now,
    }),
  });
  await markDownstreamStepsStale(userId, input.projectId, "episodes");
  return rows;
}

export async function listScenes(userId: string, projectId: string, episodeId: string) {
  await requireProjectAccess(userId, projectId);
  return serviceFetch(`/rest/v1/storyflow_scenes?project_id=eq.${encodeURIComponent(projectId)}&episode_id=eq.${encodeURIComponent(episodeId)}&user_id=eq.${encodeURIComponent(userId)}&select=*&order=scene_no.asc`);
}

export async function upsertScene(userId: string, input: SceneInput) {
  await requireProjectAccess(userId, input.projectId);
  const now = new Date().toISOString();
  const rows = await serviceFetch("/rest/v1/storyflow_scenes?on_conflict=episode_id,scene_no", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      id: input.id || crypto.randomUUID(),
      user_id: userId,
      project_id: input.projectId,
      episode_id: input.episodeId,
      scene_no: input.sceneNo,
      location: input.location || "",
      time: input.time || "",
      characters: input.characters || [],
      beats: input.beats || [],
      visual_prompt: input.visualPrompt || "",
      updated_at: now,
    }),
  });
  await markDownstreamStepsStale(userId, input.projectId, "scenes");
  return rows;
}

export async function listVersions(userId: string, params: { projectId: string; entityType?: string; entityId?: string; stepKey?: string }) {
  await requireProjectAccess(userId, params.projectId);
  const filters = [
    `project_id=eq.${encodeURIComponent(params.projectId)}`,
    `user_id=eq.${encodeURIComponent(userId)}`,
    params.entityType ? `entity_type=eq.${encodeURIComponent(params.entityType)}` : "",
    params.entityId ? `entity_id=eq.${encodeURIComponent(params.entityId)}` : "",
    params.stepKey ? `step_key=eq.${encodeURIComponent(params.stepKey)}` : "",
    "select=*",
    "order=created_at.desc",
    "limit=80",
  ].filter(Boolean).join("&");
  return serviceFetch(`/rest/v1/storyflow_versions?${filters}`);
}

export async function createVersion(
  userId: string,
  input: {
    projectId: string;
    entityType: string;
    entityId?: string;
    stepKey?: TaskType | string;
    source?: VersionSource;
    snapshotText?: string;
    snapshotJson?: unknown;
    diffJson?: unknown;
  },
) {
  await requireProjectAccess(userId, input.projectId);
  const latest = await serviceFetch<Array<{ version_no: number | null }>>(
    `/rest/v1/storyflow_versions?project_id=eq.${encodeURIComponent(input.projectId)}&entity_type=eq.${encodeURIComponent(input.entityType)}&entity_id=eq.${encodeURIComponent(input.entityId || "")}&select=version_no&order=version_no.desc&limit=1`,
  );
  const versionNo = Number(latest[0]?.version_no || 0) + 1;
  const rows = await serviceFetch("/rest/v1/storyflow_versions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      user_id: userId,
      project_id: input.projectId,
      entity_type: input.entityType,
      entity_id: input.entityId || "",
      step_key: input.stepKey || null,
      version_no: versionNo,
      source: input.source || "manual",
      version_type: input.source || "manual",
      snapshot_text: input.snapshotText || "",
      snapshot_json: input.snapshotJson || {},
      content_snapshot: input.snapshotJson || { text: input.snapshotText || "" },
      diff_json: input.diffJson || {},
      diff_snapshot: input.diffJson || {},
      created_by: userId,
      created_at: new Date().toISOString(),
    }),
  });
  return rows;
}

export async function saveDiffToVersion(userId: string, versionId: string, diffJson: unknown) {
  await serviceFetch(`/rest/v1/storyflow_versions?id=eq.${encodeURIComponent(versionId)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ diff_json: diffJson, diff_snapshot: diffJson }),
  });
  return { id: versionId, diffJson };
}

export async function restoreVersion(userId: string, versionId: string) {
  const rows = await serviceFetch<Array<{ id: string; project_id: string; entity_type: string; entity_id: string; step_key?: TaskType; snapshot_text?: string; snapshot_json?: unknown }>>(
    `/rest/v1/storyflow_versions?id=eq.${encodeURIComponent(versionId)}&user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  );
  const version = rows[0];
  if (!version) throw new Error("VERSION_NOT_FOUND");
  await requireProjectAccess(userId, version.project_id);

  if (version.entity_type === "project_step" && version.step_key) {
    await saveProjectStep(userId, {
      projectId: version.project_id,
      phaseKey: "restore",
      stepKey: version.step_key,
      contentText: version.snapshot_text || "",
      contentJson: version.snapshot_json || {},
      status: "draft",
      source: "restore",
      createVersion: true,
    });
  }

  if (version.entity_type === "story_bible") {
    await updateStoryBible(userId, version.project_id, version.snapshot_json as Partial<StoryBible>, "story_bible");
  }

  if (version.entity_type === "production_workbench") {
    // Restore production workbench state by writing the snapshot back to the
    // delivery_package JSON column. The frontend will pick it up on next load.
    const snapshot = version.snapshot_json as { productionState?: unknown } | null;
    if (snapshot?.productionState) {
      const payload = JSON.stringify({
        productionState: snapshot.productionState,
        exportedAt: new Date().toISOString(),
        version: "production-storyboard-backend-v1",
        restoredFrom: version.id,
      });
      await serviceFetch(
        `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(version.project_id)}&user_id=eq.${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            delivery_package: payload,
            updated_at: new Date().toISOString(),
          }),
        },
      );
    }
  }

  return version;
}

export async function applyGenerationTask(userId: string, taskId: string) {
  const rows = await serviceFetch<Array<{ id: string; user_id: string; project_id: string; step_key: TaskType; phase_key: string; output_snapshot?: string | null; target_entity_type?: string | null; target_entity_id?: string | null }>>(
    `/rest/v1/storyflow_generation_tasks?id=eq.${encodeURIComponent(taskId)}&user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  );
  const task = rows[0];
  if (!task?.project_id) throw new Error("TASK_NOT_FOUND");
  await requireProjectAccess(userId, task.project_id);
  const output = task.output_snapshot || "";

  const step = await saveProjectStep(userId, {
    projectId: task.project_id,
    phaseKey: task.phase_key,
    stepKey: task.step_key,
    contentText: output,
    contentJson: { output, taskId },
    status: "draft",
    source: "ai",
    createVersion: true,
  });

  await serviceFetch(`/rest/v1/storyflow_generation_tasks?id=eq.${encodeURIComponent(taskId)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ applied_at: new Date().toISOString() }),
  });
  return { task, step };
}

export async function markTaskRetrying(userId: string, taskId: string) {
  const rows = await serviceFetch(`/rest/v1/storyflow_generation_tasks?id=eq.${encodeURIComponent(taskId)}&user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "retrying" }),
  });
  return rows;
}

export async function listLocalizationDiffs(userId: string, projectId: string) {
  await requireProjectAccess(userId, projectId);
  return serviceFetch(`/rest/v1/storyflow_localization_diffs?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc`);
}

export async function saveLocalizationDiff(userId: string, input: JsonRecord & { projectId: string }) {
  await requireProjectAccess(userId, input.projectId);
  return serviceFetch("/rest/v1/storyflow_localization_diffs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      user_id: userId,
      project_id: input.projectId,
      episode_id: input.episodeId || null,
      scene_id: input.sceneId || null,
      source_text: input.sourceText || "",
      localized_text: input.localizedText || "",
      target_market: input.targetMarket || "",
      target_language: input.targetLanguage || "",
      reason_json: input.reasonJson || [],
      risk_notes: input.riskNotes || "",
      accepted: Boolean(input.accepted),
    }),
  });
}

export async function listDramaScores(userId: string, projectId: string) {
  await requireProjectAccess(userId, projectId);
  return serviceFetch(`/rest/v1/storyflow_drama_scores?project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc`);
}

export async function saveDramaScore(userId: string, input: JsonRecord & { projectId: string }) {
  await requireProjectAccess(userId, input.projectId);
  return serviceFetch("/rest/v1/storyflow_drama_scores", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      user_id: userId,
      project_id: input.projectId,
      episode_id: input.episodeId || null,
      total_score: input.totalScore || null,
      hook_score: input.hookScore || null,
      conflict_density_score: input.conflictDensityScore || null,
      emotional_progression_score: input.emotionalProgressionScore || null,
      reversal_score: input.reversalScore || null,
      cliffhanger_score: input.cliffhangerScore || null,
      dialogue_naturalness_score: input.dialogueNaturalnessScore || null,
      localization_score: input.localizationScore || null,
      production_feasibility_score: input.productionFeasibilityScore || null,
      suggestions_json: input.suggestionsJson || [],
    }),
  });
}

export async function exportProjectAsJson(userId: string, projectId: string) {
  const payload = await buildExportPayload(userId, projectId);
  await recordExport(userId, projectId, "json", payload);
  return payload;
}

export async function exportProjectAsMarkdown(userId: string, projectId: string) {
  const payload = await buildExportPayload(userId, projectId);
  const markdown = renderExportMarkdown(payload);
  await recordExport(userId, projectId, "markdown", { markdown, payload });
  return markdown;
}

async function buildExportPayload(userId: string, projectId: string) {
  const project = await requireProjectAccess(userId, projectId);
  const [steps, characters, episodes, localizationDiffs, dramaScores] = await Promise.all([
    listProjectSteps(userId, projectId),
    listCharacters(userId, projectId),
    listEpisodes(userId, projectId),
    listLocalizationDiffs(userId, projectId),
    listDramaScores(userId, projectId),
  ]);
  const episodeRows = episodes as Array<{ id: string }>;
  const sceneGroups = await Promise.all(episodeRows.map((episode) => listScenes(userId, projectId, episode.id).catch(() => [])));
  return {
    exportedAt: new Date().toISOString(),
    project,
    storyBible: normalizeStoryBible(project.story_bible || (project.data?.storyBible as Partial<StoryBible> | undefined), project),
    steps,
    characters,
    episodes,
    scenes: sceneGroups.flat(),
    localizationDiffs,
    dramaScores,
  };
}

async function recordExport(userId: string, projectId: string, exportType: "json" | "markdown", payload: unknown) {
  await serviceFetch("/rest/v1/storyflow_exports", {
    method: "POST",
    body: JSON.stringify({
      id: crypto.randomUUID(),
      user_id: userId,
      project_id: projectId,
      export_type: exportType,
      format: exportType,
      payload_json: payload,
      metadata: payload,
      status: "completed",
      created_at: new Date().toISOString(),
    }),
  });
}

function renderExportMarkdown(payload: Awaited<ReturnType<typeof buildExportPayload>>) {
  const project = payload.project;
  const bible = payload.storyBible;
  const lines = [
    `# ${project.title || "StoryFlow Project"}`,
    "",
    "## 项目信息",
    `- 模式：${project.mode || project.workflow_type || "creation"}`,
    `- 目标市场：${project.target_market || bible.targetMarket || ""}`,
    `- 题材：${project.genre || bible.genreType || ""}`,
    `- 语言：${project.language || ""}`,
    `- 集数：${project.episode_count || ""}`,
    `- 单集时长：${project.episode_duration || ""}`,
    "",
    "## Story Bible",
    `- 一句话故事：${bible.logline || ""}`,
    `- 核心卖点：${bible.sellingPoint || ""}`,
    `- 世界观：${bible.world || ""}`,
    `- 主线冲突：${bible.mainConflict || ""}`,
    `- 角色关系：${bible.characterRelationships || ""}`,
    `- 禁改设定：${bible.lockedCanon || ""}`,
    `- 语言风格：${bible.languageStyle || ""}`,
    `- 节奏规则：${bible.pacingRules || ""}`,
    "",
    "## 角色卡",
    renderTable(payload.characters as JsonRecord[], ["name", "role", "goal", "secret", "visual_prompt"]),
    "",
    "## 分集大纲",
    renderTable(payload.episodes as JsonRecord[], ["episode_no", "title", "opening_hook", "conflict", "cliffhanger", "summary"]),
    "",
    "## 剧本步骤",
    ...((payload.steps as ProjectStepRow[]).map((step) => [`### ${step.title || step.step_key}`, step.content_text || JSON.stringify(step.content_json || step.content || {}, null, 2), ""].join("\n"))),
    "## 本土化 Diff 摘要",
    renderTable(payload.localizationDiffs as JsonRecord[], ["target_market", "target_language", "source_text", "localized_text", "risk_notes"]),
    "",
    "## DramaScore 摘要",
    renderTable(payload.dramaScores as JsonRecord[], ["total_score", "hook_score", "conflict_density_score", "cliffhanger_score", "production_feasibility_score"]),
    "",
    "## 分镜提示词",
    renderTable(payload.scenes as JsonRecord[], ["scene_no", "location", "time", "visual_prompt"]),
  ];
  return lines.join("\n");
}

function renderTable(rows: JsonRecord[], keys: string[]) {
  if (!rows.length) return "暂无数据";
  return [
    `| ${keys.join(" | ")} |`,
    `| ${keys.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${keys.map((key) => sanitizeTableCell(row[key])).join(" | ")} |`),
  ].join("\n");
}

function sanitizeTableCell(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(typeof value === "object" ? JSON.stringify(value) : value).replace(/\|/g, "\\|").replace(/\n/g, "<br />");
}

function downstreamStepKeys(changedEntity: string) {
  if (changedEntity === "story_bible" || changedEntity === "brief") {
    return ["characters", "structure_model", "beat_cards", "series_outline", "chinese_script", "translation", "localization", "quality_evaluation", "final_script", "format_check", "storyboard_script", "final_delivery"];
  }
  if (changedEntity === "characters") {
    return ["structure_model", "beat_cards", "series_outline", "chinese_script", "translation", "localization", "quality_evaluation", "final_script", "format_check", "storyboard_script", "final_delivery"];
  }
  if (changedEntity === "episodes" || changedEntity === "outline") {
    return ["chinese_script", "translation", "localization", "quality_evaluation", "final_script", "format_check", "storyboard_script", "final_delivery"];
  }
  if (changedEntity === "scenes") {
    return ["translation", "localization", "quality_evaluation", "final_script", "format_check", "storyboard_script", "final_delivery"];
  }
  return [];
}

function normalizeStoryBible(storyBible?: Partial<StoryBible> | null, project?: ProjectRow): StoryBible {
  return {
    logline: storyBible?.logline || "",
    sellingPoint: storyBible?.sellingPoint || "",
    targetMarket: storyBible?.targetMarket || project?.target_market || "",
    genreType: storyBible?.genreType || project?.genre || "",
    world: storyBible?.world || "",
    mainConflict: storyBible?.mainConflict || "",
    characterRelationships: storyBible?.characterRelationships || "",
    lockedCanon: storyBible?.lockedCanon || "",
    languageStyle: storyBible?.languageStyle || "",
    pacingRules: storyBible?.pacingRules || "",
    confirmedFacts: storyBible?.confirmedFacts || "",
  };
}
