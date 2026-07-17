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

/**
 * P3 BLOCKER v2: 把本地完整内容（scenes + 删除清单）保留为不可变快照版本。
 *
 * 关键契约（用户明确要求）：
 *   1. 绝不触碰当前工作态：不查询 storyflow_production_projects，不调用
 *      save_storyboard_state RPC，不更新 current state 的 revision/scenes。
 *   2. 不绕过 CAS：本函数不做 CAS 校验也不需要——快照只是把"本地内容副本"
 *      原样写入 storyflow_versions.snapshot_json，与 current state 完全隔离。
 *      current state 的 CAS 由 saveStoryboardState 独立负责，强约束 expectedRevision: number。
 *   3. 完整可恢复：snapshot_json 含 scenes / deletedSceneIds / deletedShotIds /
 *      baseRevision / reason / createdAt，未来读取此 version 即可重建本地状态。
 *
 * 调用方：409 冲突 "基于当前内容另存快照" 出口。本地未提交修改被保留为快照后，
 * 调用方再 loadFromServer() 拉服务端最新到本地继续工作。
 */
export async function createStoryboardSnapshot(
  ownerId: string,
  request: SnapshotRequest,
  fetcher: StoryboardFetch = serviceFetch,
): Promise<SnapshotResponse> {
  // 直接 INSERT storyflow_versions；不读 current state，不调 save_storyboard_state RPC。
  // entity_id 用 projectId:sourceUnitId 组合（不依赖 current state.id），保证与当前态解耦。
  const versions = await fetcher<Array<{ id: string }>>("/rest/v1/storyflow_versions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: ownerId,
      project_id: request.projectId,
      entity_type: "storyboard_state",
      entity_id: `${request.projectId}:${request.sourceUnitId}`,
      version_type: request.reason,
      source: request.reason === "before_reanalysis" ? "ai" : "manual",
      snapshot_json: {
        sourceUnitId: request.sourceUnitId,
        baseRevision: request.expectedRevision,
        reason: request.reason,
        createdAt: new Date().toISOString(),
        scenes: request.scenes,
        deletedSceneIds: request.deletedSceneIds,
        deletedShotIds: request.deletedShotIds,
      },
    }),
  });
  const version = versions[0];
  if (!version?.id) throw new Error("STORYBOARD_SNAPSHOT_WRITE_FAILED");
  // 返回的 revision 是"快照保留的本地基线 revision"，不是 current state 的 revision。
  return { snapshotId: version.id, revision: request.expectedRevision };
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
