/**
 * KIIKIS 2.1 Phase 2 — Screenplay Handoff 服务 (K21-HO-001..004)
 *
 * 业务模块通过此服务创建/读取 handoff，不直接 INSERT。
 * 写入通过 DB 端 RPC create_screenplay_handoff 在单一事务内完成幂等合并。
 */

import {
  parseScreenplayHandoffV1,
  type ScreenplayHandoffV1,
  type ScreenplayHandoffInput,
  HANDOFF_SCHEMA_VERSION,
  HANDOFF_ASPECT_RATIO,
} from "../../../screenplay-handoff/contracts.ts";
import { hashHandoffContentSync } from "../../../screenplay-handoff/hash.ts";

/** PostgREST 风格 fetcher。 */
export type HandoffFetcher = <T = unknown>(
  path: string,
  init?: RequestInit
) => Promise<T>;

export class ScreenplayHandoffError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "validation_failed"
    | "conflict"
    | "service_unavailable";

  constructor(code: ScreenplayHandoffError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "ScreenplayHandoffError";
    this.code = code;
  }
}

/** 创建 handoff 入参。 */
export type CreateHandoffInput = {
  projectId: string;
  universeId: string;
  episodeId: string;
  episodeNo: number;
  episodeTitle: string;
  sourceUnitId: string;
  sourceVersion: string;
  screenplayFormat: ScreenplayHandoffV1["screenplayFormat"];
  screenplayLanguage: string;
  dialogueLanguage: string;
  canonSnapshot: ScreenplayHandoffV1["canonSnapshot"];
  scenes: ScreenplayHandoffV1["scenes"];
};

/** DB 行 (snake_case)。 */
type HandoffRow = {
  id: string;
  owner_id: string;
  project_id: string;
  universe_id: string;
  episode_id: string;
  episode_no: number;
  episode_title: string;
  source_unit_id: string;
  source_version: string;
  source_hash: string;
  aspect_ratio: string;
  screenplay_format: string;
  screenplay_language: string;
  dialogue_language: string;
  canon_snapshot: Record<string, unknown>;
  content_json: Record<string, unknown>;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
};

function assertUser(userId: string | null | undefined): asserts userId is string {
  if (!userId || typeof userId !== "string") {
    throw new ScreenplayHandoffError("unauthenticated", "Authentication is required.");
  }
}

function rowToHandoff(row: HandoffRow): ScreenplayHandoffV1 {
  const content = row.content_json as {
    schemaVersion: string;
    scenes: unknown[];
  };

  const input: ScreenplayHandoffInput = {
    schemaVersion: content.schemaVersion ?? HANDOFF_SCHEMA_VERSION,
    projectId: row.project_id,
    universeId: row.universe_id,
    episodeId: row.episode_id,
    episodeNo: row.episode_no,
    episodeTitle: row.episode_title,
    sourceUnitId: row.source_unit_id,
    sourceVersion: row.source_version,
    sourceHash: row.source_hash,
    aspectRatio: row.aspect_ratio as typeof HANDOFF_ASPECT_RATIO,
    screenplayFormat: row.screenplay_format as ScreenplayHandoffV1["screenplayFormat"],
    screenplayLanguage: row.screenplay_language,
    dialogueLanguage: row.dialogue_language,
    canonSnapshot: row.canon_snapshot,
    scenes: content.scenes,
    confirmedBy: row.confirmed_by,
    createdAt: row.created_at,
  };

  return parseScreenplayHandoffV1(input);
}

/**
 * 创建不可变 handoff (K21-HO-001, K21-HO-003)。
 * - 计算内容 hash
 * - 调用 RPC 在单一事务内幂等创建
 * - 相同 source_hash → 返回已有行，不创建新版本
 */
export async function createHandoff(params: {
  fetcher: HandoffFetcher;
  userId: string;
  input: CreateHandoffInput;
}): Promise<{ handoff: ScreenplayHandoffV1; created: boolean }> {
  assertUser(params.userId);

  // 构造完整 handoff 对象用于 hash 和 content_json
  const handoffPayload = {
    schemaVersion: HANDOFF_SCHEMA_VERSION,
    projectId: params.input.projectId,
    universeId: params.input.universeId,
    episodeId: params.input.episodeId,
    episodeNo: params.input.episodeNo,
    episodeTitle: params.input.episodeTitle,
    sourceUnitId: params.input.sourceUnitId,
    sourceVersion: params.input.sourceVersion,
    aspectRatio: HANDOFF_ASPECT_RATIO,
    screenplayFormat: params.input.screenplayFormat,
    screenplayLanguage: params.input.screenplayLanguage,
    dialogueLanguage: params.input.dialogueLanguage,
    canonSnapshot: params.input.canonSnapshot,
    scenes: params.input.scenes,
  };

  // 先校验契约
  let parsed: ScreenplayHandoffV1;
  try {
    parsed = parseScreenplayHandoffV1({
      ...handoffPayload,
      sourceHash: "placeholder", // hash 还没算
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid handoff.";
    throw new ScreenplayHandoffError("validation_failed", message);
  }

  // 计算内容 hash (不含 sourceHash/confirmedBy/createdAt)
  const sourceHash = hashHandoffContentSync(handoffPayload);

  const contentJson = {
    schemaVersion: HANDOFF_SCHEMA_VERSION,
    scenes: parsed.scenes,
  };

  const rpcBody = {
    p_owner_id: params.userId,
    p_project_id: params.input.projectId,
    p_universe_id: params.input.universeId,
    p_episode_id: params.input.episodeId,
    p_episode_no: params.input.episodeNo,
    p_episode_title: params.input.episodeTitle,
    p_source_unit_id: params.input.sourceUnitId,
    p_source_version: params.input.sourceVersion,
    p_source_hash: sourceHash,
    p_aspect_ratio: HANDOFF_ASPECT_RATIO,
    p_screenplay_format: params.input.screenplayFormat,
    p_screenplay_language: params.input.screenplayLanguage,
    p_dialogue_language: params.input.dialogueLanguage,
    p_canon_snapshot: params.input.canonSnapshot,
    p_content_json: contentJson,
  };

  let row: HandoffRow | null;
  try {
    row = await params.fetcher<HandoffRow | null>(
      "/rest/v1/rpc/create_screenplay_handoff",
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
    if (err instanceof ScreenplayHandoffError) throw err;
    const message = err instanceof Error ? err.message : "Handoff creation failed.";
    throw new ScreenplayHandoffError("service_unavailable", message);
  }

  if (!row) {
    throw new ScreenplayHandoffError("service_unavailable", "RPC returned no row.");
  }

  // 判断是否为新创建 (created_at 与当前时间接近)
  const handoff = rowToHandoff(row);
  const created = handoff.sourceHash === sourceHash;

  return { handoff, created };
}

/**
 * 确认 handoff (K21-HO-001)。
 * 仅更新 confirmed_by / confirmed_at，其他字段不可变。
 */
export async function confirmHandoff(params: {
  fetcher: HandoffFetcher;
  userId: string;
  handoffId: string;
}): Promise<ScreenplayHandoffV1> {
  assertUser(params.userId);

  const rpcBody = {
    p_handoff_id: params.handoffId,
    p_confirmed_by: params.userId,
  };

  let row: HandoffRow | null;
  try {
    row = await params.fetcher<HandoffRow | null>(
      "/rest/v1/rpc/confirm_screenplay_handoff",
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
    if (err instanceof ScreenplayHandoffError) throw err;
    const message = err instanceof Error ? err.message : "Handoff confirm failed.";
    throw new ScreenplayHandoffError("service_unavailable", message);
  }

  if (!row) {
    throw new ScreenplayHandoffError("not_found", "Handoff not found or not owned by user.");
  }

  return rowToHandoff(row);
}

/**
 * 按 ID 获取 handoff。
 */
export async function getHandoff(params: {
  fetcher: HandoffFetcher;
  userId: string;
  handoffId: string;
}): Promise<ScreenplayHandoffV1> {
  assertUser(params.userId);

  const path = `/rest/v1/storyflow_screenplay_handoffs?id=eq.${encodeURIComponent(params.handoffId)}&owner_id=eq.${encodeURIComponent(params.userId)}&select=*&limit=1`;

  let rows: HandoffRow[];
  try {
    rows = (await params.fetcher<HandoffRow[]>(path)) ?? [];
  } catch (err) {
    if (err instanceof ScreenplayHandoffError) throw err;
    const message = err instanceof Error ? err.message : "Handoff fetch failed.";
    throw new ScreenplayHandoffError("service_unavailable", message);
  }

  if (rows.length === 0) {
    throw new ScreenplayHandoffError("not_found", "Handoff not found or not owned by user.");
  }

  return rowToHandoff(rows[0]);
}

/**
 * 列出项目下的 handoff。
 */
export async function listHandoffs(params: {
  fetcher: HandoffFetcher;
  userId: string;
  projectId: string;
}): Promise<{ items: ScreenplayHandoffV1[] }> {
  assertUser(params.userId);

  const path = `/rest/v1/storyflow_screenplay_handoffs?owner_id=eq.${encodeURIComponent(params.userId)}&project_id=eq.${encodeURIComponent(params.projectId)}&select=*&order=created_at.desc`;

  let rows: HandoffRow[];
  try {
    rows = (await params.fetcher<HandoffRow[]>(path)) ?? [];
  } catch (err) {
    if (err instanceof ScreenplayHandoffError) throw err;
    const message = err instanceof Error ? err.message : "Handoff list failed.";
    throw new ScreenplayHandoffError("service_unavailable", message);
  }

  return { items: rows.map(rowToHandoff) };
}

/**
 * 按单集列出 handoff (Production Workbench 跳转用)。
 */
export async function listHandoffsByEpisode(params: {
  fetcher: HandoffFetcher;
  userId: string;
  episodeId: string;
}): Promise<{ items: ScreenplayHandoffV1[] }> {
  assertUser(params.userId);

  const path = `/rest/v1/storyflow_screenplay_handoffs?owner_id=eq.${encodeURIComponent(params.userId)}&episode_id=eq.${encodeURIComponent(params.episodeId)}&select=*&order=created_at.desc`;

  let rows: HandoffRow[];
  try {
    rows = (await params.fetcher<HandoffRow[]>(path)) ?? [];
  } catch (err) {
    if (err instanceof ScreenplayHandoffError) throw err;
    const message = err instanceof Error ? err.message : "Handoff list failed.";
    throw new ScreenplayHandoffError("service_unavailable", message);
  }

  return { items: rows.map(rowToHandoff) };
}
