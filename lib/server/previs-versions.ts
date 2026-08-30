import { createHash, randomUUID } from "node:crypto";

import {
  buildPrevisCapabilityTranslation,
  parsePrevisVersionSnapshot,
  type PrevisVersionRecord,
  type PrevisVersionSnapshotV1,
} from "../director/previs-version.ts";
import type { PrevisScene } from "../director/previs.ts";
import { loadStoryboardState, type StoryboardFetch } from "../storyboard/state-api.ts";

export type SavePrevisVersionInput = {
  projectId: string;
  workId: string;
  sourceUnitId: string;
  storyboardRevision: number;
  shotId: string;
  scene: PrevisScene;
  promptInputHash?: string;
  referenceVersionIds?: string[];
};

type VersionRow = {
  id: string;
  version_no: number | null;
  snapshot_json: unknown;
};

type ImageJobRow = {
  id: string;
  result_url: string | null;
  status: string;
};

type Scope = {
  userId: string;
  projectId: string;
  sourceUnitId: string;
  shotId: string;
  fetcher?: StoryboardFetch;
};

function required(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}

function parseVersionRow(row: VersionRow | undefined, scope: Omit<Scope, "fetcher">): PrevisVersionRecord | null {
  if (!row) return null;
  const snapshot = parsePrevisVersionSnapshot(row.snapshot_json);
  const { snapshotHash, ...snapshotWithoutHash } = snapshot;
  const actualHash = createHash("sha256").update(JSON.stringify(snapshotWithoutHash)).digest("hex");
  if (actualHash !== snapshotHash) throw new Error("PREVIS_SNAPSHOT_HASH_MISMATCH");
  if (
    snapshot.projectId !== scope.projectId
    || snapshot.sourceUnitId !== scope.sourceUnitId
    || snapshot.shotId !== scope.shotId
  ) {
    throw new Error("PREVIS_VERSION_SCOPE_MISMATCH");
  }
  const versionNo = Number(row.version_no);
  if (!row.id || !Number.isInteger(versionNo) || versionNo < 1) throw new Error("PREVIS_VERSION_ROW_INVALID");
  return { id: row.id, versionNo, snapshot };
}

function versionScopeQuery(scope: Omit<Scope, "fetcher">): string {
  return [
    `user_id=eq.${encodeURIComponent(scope.userId)}`,
    `project_id=eq.${encodeURIComponent(scope.projectId)}`,
    "entity_type=eq.previs_scene",
    `entity_id=eq.${encodeURIComponent(scope.shotId)}`,
    `snapshot_json-%3E%3EsourceUnitId=eq.${encodeURIComponent(scope.sourceUnitId)}`,
  ].join("&");
}

export async function resolveExactFirstframeJob(params: Scope & { jobId?: string }): Promise<ImageJobRow> {
  const fetcher = params.fetcher ?? (await import("../supabase/server.ts")).serviceFetch;
  const jobIdFilter = params.jobId ? `&id=eq.${encodeURIComponent(params.jobId)}` : "";
  const rows = await fetcher<ImageJobRow[]>(
    `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(params.userId)}&project_id=eq.${encodeURIComponent(params.projectId)}&job_type=eq.image&target_type=eq.storyboard_shot&target_id=eq.${encodeURIComponent(params.shotId)}&status=eq.completed&input_params-%3E%3EsourceUnitId=eq.${encodeURIComponent(params.sourceUnitId)}${jobIdFilter}&order=created_at.desc&limit=1&select=id,result_url,status`,
  );
  const job = rows[0];
  if (!job?.id || job.status !== "completed" || !job.result_url?.trim()) {
    throw new Error(params.jobId ? "PREVIS_FIRSTFRAME_JOB_INVALID" : "PREVIS_FIRSTFRAME_NOT_FOUND");
  }
  return job;
}

export async function savePrevisVersion(params: {
  userId: string;
  input: SavePrevisVersionInput;
  fetcher?: StoryboardFetch;
  now?: () => string;
  createId?: () => string;
}): Promise<PrevisVersionRecord> {
  const fetcher = params.fetcher ?? (await import("../supabase/server.ts")).serviceFetch;
  const input = params.input;
  const userId = required(params.userId, "PREVIS_OWNER_REQUIRED");
  const projectId = required(input.projectId, "PREVIS_PROJECT_REQUIRED");
  const workId = required(input.workId, "PREVIS_WORK_REQUIRED");
  const sourceUnitId = required(input.sourceUnitId, "PREVIS_SOURCE_UNIT_REQUIRED");
  const shotId = required(input.shotId, "PREVIS_SHOT_REQUIRED");
  if (!Number.isInteger(input.storyboardRevision) || input.storyboardRevision < 0) {
    throw new Error("PREVIS_REVISION_INVALID");
  }

  const state = await loadStoryboardState(userId, projectId, sourceUnitId, fetcher);
  if (!state) throw new Error("PREVIS_STORYBOARD_NOT_FOUND");
  if (state.revision !== input.storyboardRevision) throw new Error("PREVIS_REVISION_STALE");
  const scene = state.scenes.find((candidate) => candidate.shots.some((shot) => shot.id === shotId));
  const shot = scene?.shots.find((candidate) => candidate.id === shotId);
  if (!scene || !shot) throw new Error("PREVIS_SHOT_NOT_FOUND");
  if (!shot.confirmed) throw new Error("PREVIS_SHOT_NOT_CONFIRMED");
  const prompt = required(shot.jimengPromptZh, "PREVIS_PROMPT_REQUIRED");

  const firstframe = await resolveExactFirstframeJob({ userId, projectId, sourceUnitId, shotId, fetcher });
  const scope = { userId, projectId, sourceUnitId, shotId };
  const latest = await fetcher<Array<{ version_no: number | null }>>(
    `/rest/v1/storyflow_versions?${versionScopeQuery(scope)}&select=version_no&order=version_no.desc&limit=1`,
  );
  const versionNo = Number(latest[0]?.version_no ?? 0) + 1;
  const createdAt = (params.now ?? (() => new Date().toISOString()))();
  const durationSeconds = input.scene.durationSeconds >= 7.5 ? 10 : 5;
  const promptInputHash = input.promptInputHash?.trim()
    || createHash("sha256").update(prompt).digest("hex");
  const referenceVersionIds = (input.referenceVersionIds ?? []).filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim());
  const snapshotWithoutHash = {
    schemaVersion: 1 as const,
    kind: "kiikis.previs.version" as const,
    projectId,
    workId,
    sourceUnitId,
    storyboardRevision: input.storyboardRevision,
    sceneId: scene.id,
    shotId,
    shotLabel: `场 ${scene.order} · 镜头 ${shot.order}`,
    previs: input.scene,
    adoptedInput: {
      firstframeJobId: firstframe.id,
      firstframeUrlAtSave: firstframe.result_url,
      prompt,
      promptInputHash,
      referenceVersionIds,
      durationSeconds: durationSeconds as 5 | 10,
      aspectRatio: "9:16" as const,
    },
    capabilityTranslation: buildPrevisCapabilityTranslation(),
    createdAt,
  };
  const snapshotHash = createHash("sha256").update(JSON.stringify(snapshotWithoutHash)).digest("hex");
  const snapshot = parsePrevisVersionSnapshot({ ...snapshotWithoutHash, snapshotHash });
  const id = (params.createId ?? randomUUID)();
  const rows = await fetcher<VersionRow[]>("/rest/v1/storyflow_versions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id,
      user_id: userId,
      project_id: projectId,
      step_key: "storyboard",
      version_type: "manual",
      entity_type: "previs_scene",
      entity_id: shotId,
      version_no: versionNo,
      source: "manual",
      snapshot_json: snapshot,
      content_snapshot: snapshot,
      created_by: userId,
      created_at: createdAt,
    }),
  });
  if (!rows[0]?.id) throw new Error("PREVIS_VERSION_WRITE_FAILED");
  return { id: rows[0].id, versionNo: Number(rows[0].version_no ?? versionNo), snapshot };
}

export async function readLatestPrevisVersion(params: Scope): Promise<PrevisVersionRecord | null> {
  const fetcher = params.fetcher ?? (await import("../supabase/server.ts")).serviceFetch;
  const scope = {
    userId: required(params.userId, "PREVIS_OWNER_REQUIRED"),
    projectId: required(params.projectId, "PREVIS_PROJECT_REQUIRED"),
    sourceUnitId: required(params.sourceUnitId, "PREVIS_SOURCE_UNIT_REQUIRED"),
    shotId: required(params.shotId, "PREVIS_SHOT_REQUIRED"),
  };
  const rows = await fetcher<VersionRow[]>(
    `/rest/v1/storyflow_versions?${versionScopeQuery(scope)}&select=id,version_no,snapshot_json&order=version_no.desc&limit=1`,
  );
  return parseVersionRow(rows[0], scope);
}

export async function readPrevisVersion(params: Scope & { versionId: string }): Promise<PrevisVersionRecord | null> {
  const fetcher = params.fetcher ?? (await import("../supabase/server.ts")).serviceFetch;
  const scope = {
    userId: required(params.userId, "PREVIS_OWNER_REQUIRED"),
    projectId: required(params.projectId, "PREVIS_PROJECT_REQUIRED"),
    sourceUnitId: required(params.sourceUnitId, "PREVIS_SOURCE_UNIT_REQUIRED"),
    shotId: required(params.shotId, "PREVIS_SHOT_REQUIRED"),
  };
  const versionId = required(params.versionId, "PREVIS_VERSION_REQUIRED");
  const rows = await fetcher<VersionRow[]>(
    `/rest/v1/storyflow_versions?${versionScopeQuery(scope)}&id=eq.${encodeURIComponent(versionId)}&select=id,version_no,snapshot_json&limit=1`,
  );
  return parseVersionRow(rows[0], scope);
}

export type { PrevisVersionSnapshotV1 };
