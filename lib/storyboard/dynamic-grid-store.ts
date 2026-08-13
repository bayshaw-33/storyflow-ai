/**
 * KIIKIS 2.1 Phase 2 — 动态宫格分镜存储服务 (K21-SB-007, K21-SB-008)
 *
 * 业务模块通过此服务创建/读取/更新 storyboard，不直接 INSERT。
 * 写入通过 DB 端 RPC create_dynamic_storyboard_revision 在单一事务内完成:
 * - CAS 期望 revision 校验
 * - advisory lock 串行化并发写
 * - locked/userEdited frame 内容保留检查 (AI 自动重新生成时)
 * - is_current 维护
 *
 * 冲突返回结构化结果，由 API 层转换为 409 + 字段级 diff。
 */

import { createHash } from "node:crypto";
import {
  parseDynamicGridScene,
  type DynamicGridSceneV1,
  type DynamicGridSceneInput,
  DYNAMIC_GRID_SCHEMA_VERSION,
} from "./dynamic-grid-contract.ts";
import { diffStoryboards, type StoryboardDiff } from "./dynamic-grid-diff.ts";

/** PostgREST 风格 fetcher (与 screenplay-handoffs 一致)。 */
export type StoryboardFetcher = <T = unknown>(
  path: string,
  init?: RequestInit
) => Promise<T>;

export class DynamicGridStoreError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "validation_failed"
    | "conflict"
    | "locked_override"
    | "service_unavailable";

  constructor(code: DynamicGridStoreError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "DynamicGridStoreError";
    this.code = code;
  }
}

/** DB 行 (snake_case)。 */
type StoryboardRow = {
  id: string;
  owner_id: string;
  handoff_id: string;
  scene_id: string;
  schema_version: string;
  continuity_mode: "NEW" | "CONTINUOUS";
  grid_count: 4 | 6 | 9 | 12;
  grid_rationale: string;
  spatial_plan: {
    axis: string;
    entrances: string[];
    screenDirections: string[];
  };
  shared_cinematography: string;
  negative_prompt: string;
  frames_json: Array<Record<string, unknown>>;
  frames_hash: string;
  revision: number;
  parent_id: string | null;
  revision_source: "ai" | "user" | "system";
  is_current: boolean;
  created_by: string;
  created_at: string;
};

/** 创建/更新 storyboard 入参。 */
export type UpsertStoryboardInput = {
  handoffId: string;
  sceneId: string;
  continuityMode: "NEW" | "CONTINUOUS";
  gridCount: 4 | 6 | 9 | 12;
  gridRationale: string;
  spatialPlan: {
    axis: string;
    entrances: string[];
    screenDirections: string[];
  };
  sharedCinematography: string;
  negativePrompt: string;
  frames: DynamicGridSceneV1["frames"];
  revisionSource: "ai" | "user" | "system";
};

/** CAS 冲突详情。 */
export interface CasConflict {
  readonly kind: "cas_mismatch" | "locked_override" | "not_found";
  readonly currentRevision: number;
  readonly currentStoryboard: DynamicGridSceneV1;
  readonly attemptedStoryboard: DynamicGridSceneV1;
  readonly diff: StoryboardDiff;
  readonly message: string;
}

/** 成功结果。 */
export interface UpsertResult {
  readonly storyboard: DynamicGridSceneV1;
  /** 新行的 DB id (每个 revision 一个)。 */
  readonly rowId: string;
  /** 新 revision 号。 */
  readonly revision: number;
  /** 'created' (首个版本) | 'revision_added' (新版本) | 'idempotent_skip' (相同 frames_hash)。 */
  readonly status: "created" | "revision_added" | "idempotent_skip";
  /** 父版本 id (首个版本为 null)。 */
  readonly parentId: string | null;
}

function assertUser(userId: string | null | undefined): asserts userId is string {
  if (!userId || typeof userId !== "string") {
    throw new DynamicGridStoreError("unauthenticated", "Authentication is required.");
  }
}

/**
 * 规范化对象 key 顺序后做 SHA-256 hash (与 hash.ts 一致, 但不排除任何字段)。
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k]));
  return "{" + pairs.join(",") + "}";
}

/**
 * 计算 frames_json 的稳定 hash。
 * 相同 frames 内容 (忽略 key 顺序) → 相同 hash。
 */
export function hashFrames(frames: unknown): string {
  const canonical = canonicalize(frames);
  const hash = createHash("sha256").update(canonical).digest("hex");
  return `sha256:${hash}`;
}

/** DB row → DynamicGridSceneV1。 */
function rowToStoryboard(row: StoryboardRow): DynamicGridSceneV1 {
  const input: DynamicGridSceneInput = {
    schemaVersion: row.schema_version,
    handoffId: row.handoff_id,
    sceneId: row.scene_id,
    continuityMode: row.continuity_mode,
    gridCount: row.grid_count,
    gridRationale: row.grid_rationale,
    spatialPlan: row.spatial_plan,
    sharedCinematography: row.shared_cinematography,
    negativePrompt: row.negative_prompt,
    frames: row.frames_json,
  };
  return parseDynamicGridScene(input);
}

/** 从入参构造 DynamicGridSceneV1 (用于冲突响应)。 */
function buildSceneFromInput(input: UpsertStoryboardInput): DynamicGridSceneV1 {
  const sceneInput: DynamicGridSceneInput = {
    schemaVersion: DYNAMIC_GRID_SCHEMA_VERSION,
    handoffId: input.handoffId,
    sceneId: input.sceneId,
    continuityMode: input.continuityMode,
    gridCount: input.gridCount,
    gridRationale: input.gridRationale,
    spatialPlan: input.spatialPlan,
    sharedCinematography: input.sharedCinematography,
    negativePrompt: input.negativePrompt,
    frames: input.frames,
  };
  return parseDynamicGridScene(sceneInput);
}

/** 调用 RPC 的响应类型 (含 OUT 参数)。 */
type RpcResponse = {
  p_new_row: StoryboardRow | null;
  p_current_revision: number | null;
  p_conflict_kind: string | null;
};

/**
 * 创建或更新 storyboard (CAS)。
 *
 * @param params.expectedRevision 客户端读取时的当前 revision; 首次创建传 -1
 * @returns 成功返回 UpsertResult; 冲突返回 CasConflict (不抛异常, 由调用方决定如何响应)
 */
export async function upsertStoryboardWithCAS(params: {
  fetcher: StoryboardFetcher;
  userId: string;
  input: UpsertStoryboardInput;
  expectedRevision: number;
}): Promise<UpsertResult | CasConflict> {
  assertUser(params.userId);

  // 先校验契约 (在客户端就拒绝非法输入)
  let attemptedScene: DynamicGridSceneV1;
  try {
    attemptedScene = buildSceneFromInput(params.input);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid storyboard.";
    throw new DynamicGridStoreError("validation_failed", message);
  }

  const framesHash = hashFrames(params.input.frames);

  const rpcBody = {
    p_owner_id: params.userId,
    p_handoff_id: params.input.handoffId,
    p_scene_id: params.input.sceneId,
    p_expected_revision: params.expectedRevision,
    p_schema_version: DYNAMIC_GRID_SCHEMA_VERSION,
    p_continuity_mode: params.input.continuityMode,
    p_grid_count: params.input.gridCount,
    p_grid_rationale: params.input.gridRationale,
    p_spatial_plan: params.input.spatialPlan,
    p_shared_cinematography: params.input.sharedCinematography,
    p_negative_prompt: params.input.negativePrompt,
    p_frames_json: params.input.frames,
    p_frames_hash: framesHash,
    p_revision_source: params.input.revisionSource,
    p_created_by: params.userId,
  };

  let resp: RpcResponse;
  try {
    resp = await params.fetcher<RpcResponse>(
      "/rest/v1/rpc/create_dynamic_storyboard_revision",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(rpcBody),
      }
    );
  } catch (err) {
    if (err instanceof DynamicGridStoreError) throw err;
    const message = err instanceof Error ? err.message : "Storyboard upsert failed.";
    throw new DynamicGridStoreError("service_unavailable", message);
  }

  const conflictKind = resp.p_conflict_kind;
  const currentRevision = resp.p_current_revision ?? -1;

  // 成功路径
  if (resp.p_new_row) {
    const row = resp.p_new_row;
    const scene = rowToStoryboard(row);
    const status: UpsertResult["status"] =
      conflictKind === "idempotent_skip"
        ? "idempotent_skip"
        : params.expectedRevision === -1
          ? "created"
          : "revision_added";

    return {
      storyboard: scene,
      rowId: row.id,
      revision: row.revision,
      status,
      parentId: row.parent_id,
    };
  }

  // 冲突路径
  const kind: CasConflict["kind"] =
    conflictKind === "cas_mismatch"
      ? "cas_mismatch"
      : conflictKind === "locked_override"
        ? "locked_override"
        : conflictKind === "not_found"
          ? "not_found"
          : "cas_mismatch";

  // 读取当前 storyboard 用于 diff
  let currentScene: DynamicGridSceneV1;
  try {
    const current = await getCurrentStoryboard({
      fetcher: params.fetcher,
      userId: params.userId,
      handoffId: params.input.handoffId,
      sceneId: params.input.sceneId,
    });
    currentScene = current.storyboard;
  } catch {
    // not_found 路径: 构造空 current (实际不应到这里, 因为 RPC 已返回 not_found)
    throw new DynamicGridStoreError(
      "not_found",
      `Storyboard not found for handoff=${params.input.handoffId} scene=${params.input.sceneId}`,
    );
  }

  const diff = diffStoryboards(currentScene, attemptedScene);

  const message =
    kind === "cas_mismatch"
      ? `CAS conflict: expected revision ${params.expectedRevision}, current is ${currentRevision}`
      : kind === "locked_override"
        ? `Locked/user-edited frame would be overridden by AI revision`
        : `Storyboard not found (expected revision ${params.expectedRevision})`;

  return {
    kind,
    currentRevision,
    currentStoryboard: currentScene,
    attemptedStoryboard: attemptedScene,
    diff,
    message,
  };
}

/** 当前版本查询结果。 */
export interface CurrentStoryboardResult {
  storyboard: DynamicGridSceneV1;
  rowId: string;
  revision: number;
  parentId: string | null;
  createdAt: string;
}

/** 获取指定 (handoff, scene) 的当前版本。 */
export async function getCurrentStoryboard(params: {
  fetcher: StoryboardFetcher;
  userId: string;
  handoffId: string;
  sceneId: string;
}): Promise<CurrentStoryboardResult> {
  assertUser(params.userId);

  const rpcBody = {
    p_owner_id: params.userId,
    p_handoff_id: params.handoffId,
    p_scene_id: params.sceneId,
  };

  let row: StoryboardRow | null;
  try {
    row = await params.fetcher<StoryboardRow | null>(
      "/rest/v1/rpc/get_current_dynamic_storyboard",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(rpcBody),
      }
    );
  } catch (err) {
    if (err instanceof DynamicGridStoreError) throw err;
    throw new DynamicGridStoreError("service_unavailable", err instanceof Error ? err.message : "Fetch failed.");
  }

  if (!row) {
    throw new DynamicGridStoreError(
      "not_found",
      `Storyboard not found for handoff=${params.handoffId} scene=${params.sceneId}`,
    );
  }

  return {
    storyboard: rowToStoryboard(row),
    rowId: row.id,
    revision: row.revision,
    parentId: row.parent_id,
    createdAt: row.created_at,
  };
}

/** 列出 handoff 下所有场景的当前版本。 */
export async function listStoryboardsForHandoff(params: {
  fetcher: StoryboardFetcher;
  userId: string;
  handoffId: string;
}): Promise<{
  items: Array<{
    storyboard: DynamicGridSceneV1;
    rowId: string;
    revision: number;
    sceneId: string;
    createdAt: string;
  }>;
}> {
  assertUser(params.userId);

  const rpcBody = {
    p_owner_id: params.userId,
    p_handoff_id: params.handoffId,
  };

  let rows: StoryboardRow[];
  try {
    rows = (await params.fetcher<StoryboardRow[]>(
      "/rest/v1/rpc/list_dynamic_storyboards_for_handoff",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(rpcBody),
      }
    )) ?? [];
  } catch (err) {
    if (err instanceof DynamicGridStoreError) throw err;
    throw new DynamicGridStoreError("service_unavailable", err instanceof Error ? err.message : "List failed.");
  }

  return {
    items: rows.map((row) => ({
      storyboard: rowToStoryboard(row),
      rowId: row.id,
      revision: row.revision,
      sceneId: row.scene_id,
      createdAt: row.created_at,
    })),
  };
}

/** 历史版本查询结果。 */
export interface StoryboardHistoryEntry {
  storyboard: DynamicGridSceneV1;
  rowId: string;
  revision: number;
  parentId: string | null;
  revisionSource: "ai" | "user" | "system";
  createdAt: string;
}

/** 列出指定 (handoff, scene) 的历史版本。 */
export async function getStoryboardHistory(params: {
  fetcher: StoryboardFetcher;
  userId: string;
  handoffId: string;
  sceneId: string;
  limit?: number;
}): Promise<{ items: StoryboardHistoryEntry[] }> {
  assertUser(params.userId);

  const rpcBody = {
    p_owner_id: params.userId,
    p_handoff_id: params.handoffId,
    p_scene_id: params.sceneId,
    p_limit: params.limit ?? 50,
  };

  let rows: StoryboardRow[];
  try {
    rows = (await params.fetcher<StoryboardRow[]>(
      "/rest/v1/rpc/list_dynamic_storyboard_history",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(rpcBody),
      }
    )) ?? [];
  } catch (err) {
    if (err instanceof DynamicGridStoreError) throw err;
    throw new DynamicGridStoreError("service_unavailable", err instanceof Error ? err.message : "History failed.");
  }

  return {
    items: rows.map((row) => ({
      storyboard: rowToStoryboard(row),
      rowId: row.id,
      revision: row.revision,
      parentId: row.parent_id,
      revisionSource: row.revision_source,
      createdAt: row.created_at,
    })),
  };
}

/** 按行 ID 获取单个版本 (用于 diff dialog 查询旧版本)。 */
export async function getStoryboardById(params: {
  fetcher: StoryboardFetcher;
  userId: string;
  rowId: string;
}): Promise<StoryboardHistoryEntry> {
  assertUser(params.userId);

  const path = `/rest/v1/storyflow_dynamic_storyboards?id=eq.${encodeURIComponent(params.rowId)}&owner_id=eq.${encodeURIComponent(params.userId)}&select=*&limit=1`;

  let rows: StoryboardRow[];
  try {
    rows = (await params.fetcher<StoryboardRow[]>(path)) ?? [];
  } catch (err) {
    if (err instanceof DynamicGridStoreError) throw err;
    throw new DynamicGridStoreError("service_unavailable", err instanceof Error ? err.message : "Fetch failed.");
  }

  if (rows.length === 0) {
    throw new DynamicGridStoreError("not_found", `Storyboard row ${params.rowId} not found.`);
  }

  const row = rows[0];
  return {
    storyboard: rowToStoryboard(row),
    rowId: row.id,
    revision: row.revision,
    parentId: row.parent_id,
    revisionSource: row.revision_source,
    createdAt: row.created_at,
  };
}

/**
 * 辅助: 判断 upsert 结果是否为冲突。
 */
export function isCasConflict(result: UpsertResult | CasConflict): result is CasConflict {
  return (result as CasConflict).kind !== undefined;
}

/**
 * 辅助: 判断 upsert 结果是否为成功。
 */
export function isUpsertSuccess(result: UpsertResult | CasConflict): result is UpsertResult {
  return (result as UpsertResult).storyboard !== undefined && (result as CasConflict).kind === undefined;
}
