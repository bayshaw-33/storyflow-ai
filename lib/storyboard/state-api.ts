import { serviceFetch } from "../supabase/server.ts";
import type { SaveRequest, SaveResponse, SnapshotRequest, SnapshotResponse } from "./contracts.ts";

export type StoryboardFetch = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export class RevisionConflictError extends Error {
  readonly code = "REVISION_CONFLICT";
  readonly currentRevision: number;

  constructor(currentRevision: number) {
    super(`REVISION_CONFLICT:${currentRevision}`);
    this.currentRevision = currentRevision;
  }
}

export async function saveStoryboardState(
  ownerId: string,
  request: SaveRequest,
  fetcher: StoryboardFetch = serviceFetch,
): Promise<SaveResponse> {
  try {
    const response = await fetcher<unknown>("/rest/v1/rpc/save_storyboard_state", {
      method: "POST",
      body: JSON.stringify({
        p_owner_id: ownerId,
        p_project_id: request.projectId,
        p_source_unit_id: request.sourceUnitId,
        p_expected_revision: request.expectedRevision,
        p_scenes: request.scenes,
        p_deleted_scene_ids: request.deletedSceneIds,
        p_deleted_shot_ids: request.deletedShotIds,
      }),
    });
    return assertSaveResponse(response);
  } catch (error) {
    throw toStoryboardError(error);
  }
}

export async function loadStoryboardState(
  ownerId: string,
  projectId: string,
  sourceUnitId: string,
  fetcher: StoryboardFetch = serviceFetch,
): Promise<SaveResponse | null> {
  const response = await fetcher<unknown>("/rest/v1/rpc/get_storyboard_state", {
    method: "POST",
    body: JSON.stringify({
      p_owner_id: ownerId,
      p_project_id: projectId,
      p_source_unit_id: sourceUnitId,
    }),
  });
  return response === null ? null : assertSaveResponse(response);
}

export async function createStoryboardSnapshot(
  ownerId: string,
  request: SnapshotRequest,
  fetcher: StoryboardFetch = serviceFetch,
): Promise<SnapshotResponse> {
  const states = await fetcher<Array<{ id: string; revision: number }>>(
    `/rest/v1/storyflow_production_projects?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(request.projectId)}&source_unit_id=eq.${encodeURIComponent(request.sourceUnitId)}&select=id,revision&limit=1`,
  );
  const state = states[0];
  if (!state) throw new Error("STORYBOARD_STATE_NOT_FOUND");
  if (state.revision !== request.expectedRevision) {
    throw new RevisionConflictError(state.revision);
  }

  const versions = await fetcher<Array<{ id: string }>>("/rest/v1/storyflow_versions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: ownerId,
      project_id: request.projectId,
      entity_type: "storyboard_state",
      entity_id: `${state.id}:${request.sourceUnitId}`,
      version_type: request.reason,
      source: request.reason === "before_reanalysis" ? "ai" : "manual",
      snapshot_json: {
        sourceUnitId: request.sourceUnitId,
        revision: state.revision,
        reason: request.reason,
      },
    }),
  });
  const version = versions[0];
  if (!version?.id) throw new Error("STORYBOARD_SNAPSHOT_WRITE_FAILED");
  return { snapshotId: version.id, revision: state.revision };
}

function assertSaveResponse(value: unknown): SaveResponse {
  if (!value || typeof value !== "object") throw new Error("STORYBOARD_SAVE_RESPONSE_INVALID");
  const result = value as Partial<SaveResponse>;
  if (
    typeof result.projectId !== "string" ||
    typeof result.sourceUnitId !== "string" ||
    typeof result.revision !== "number" ||
    !Array.isArray(result.scenes) ||
    !result.idMap ||
    typeof result.idMap !== "object"
  ) {
    throw new Error("STORYBOARD_SAVE_RESPONSE_INVALID");
  }
  return result as SaveResponse;
}

function toStoryboardError(error: unknown): Error {
  if (error instanceof RevisionConflictError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/REVISION_CONFLICT:(\d+)/);
  if (match) return new RevisionConflictError(Number(match[1]));
  return error instanceof Error ? error : new Error(message);
}
