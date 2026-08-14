/**
 * KIIKIS 2.1 Phase 1 — Creative Event 写入服务 (K21-EV-001..005, K21-EV-002)
 *
 * 业务模块通过此服务追加事件，不直接 INSERT。
 * 写入与幂等合并通过 DB 端窄 RPC append_creative_event 完成 (K21-EV-002)。
 */

import {
  parseCreativeEvent,
  type CreativeEventInput,
  type CreativeEventV1,
} from "../../../contracts/v2/creative-events.ts";

/** PostgREST 风格 fetcher，与 evidence/jobs 服务保持一致。 */
export type CreativeEventsFetcher = <T = unknown>(
  path: string,
  init?: RequestInit
) => Promise<T>;

export class CreativeEventsError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "validation_failed"
    | "service_unavailable";

  constructor(
    code: CreativeEventsError["code"],
    message: string
  ) {
    super(`${code}: ${message}`);
    this.name = "CreativeEventsError";
    this.code = code;
  }
}

/** 写入事件入参 (id 由服务端生成，不在入参中)。 */
export type AppendCreativeEventInput = Omit<
  CreativeEventInput,
  "id" | "sequence" | "createdAt"
> & {
  occurredAt?: string;
};

/** DB 行 (snake_case)。 */
type CreativeEventRow = {
  id: string;
  sequence: number;
  event_type: string;
  schema_version: number;
  actor_type: "user" | "system";
  actor_id: string | null;
  owner_id: string;
  resource_type: string;
  resource_id: string;
  resource_version: string | null;
  task_id: string | null;
  idempotency_key: string;
  visibility: "private" | "collaborators" | "public";
  payload: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
};

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

function assertUser(userId: string | null | undefined): asserts userId is string {
  if (!userId || typeof userId !== "string") {
    throw new CreativeEventsError("unauthenticated", "Authentication is required.");
  }
}

function rowToEvent(row: CreativeEventRow): CreativeEventV1 {
  const event = parseCreativeEvent({
    id: row.id,
    sequence: row.sequence,
    eventType: row.event_type,
    schemaVersion: row.schema_version,
    actorType: row.actor_type,
    actorId: row.actor_id,
    ownerId: row.owner_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceVersion: row.resource_version,
    taskId: row.task_id,
    idempotencyKey: row.idempotency_key,
    visibility: row.visibility,
    payload: row.payload ?? {},
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  });
  return event;
}

/**
 * 追加 Creative Event。
 * - 强制 ownerId = 调用者 userId (禁止伪造)
 * - actorType=user 时强制 actorId = userId
 * - 契约校验由 parseCreativeEvent 完成
 * - 写入与幂等合并由 DB RPC append_creative_event 在单一事务内完成
 */
export async function appendCreativeEvent(params: {
  fetcher: CreativeEventsFetcher;
  userId: string;
  input: AppendCreativeEventInput;
}): Promise<CreativeEventV1> {
  assertUser(params.userId);

  // owner 伪造防护：input.ownerId 必须等于调用者
  if (params.input.ownerId !== params.userId) {
    throw new CreativeEventsError(
      "forbidden",
      "owner_id must match the authenticated user."
    );
  }

  // actorType=user 时强制 actorId = userId
  let input = params.input;
  if (input.actorType === "user") {
    if (input.actorId && input.actorId !== params.userId) {
      throw new CreativeEventsError(
        "forbidden",
        "actor_id must match the authenticated user when actor_type=user."
      );
    }
    input = { ...input, actorId: params.userId };
  }

  // 契约校验：sequence/id 由 DB 生成，这里填占位仅用于校验其他字段。
  // 返回的 parsed 不使用其 sequence/id/createdAt；rowToEvent 会用 DB 真实值重新解析。
  let parsed: CreativeEventV1;
  try {
    parsed = parseCreativeEvent({
      id: crypto.randomUUID(),
      ...input,
      sequence: 1,
      createdAt: input.occurredAt ?? new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid creative event.";
    throw new CreativeEventsError("validation_failed", message);
  }

  // 调用 DB 端 RPC (K21-EV-002)
  const rpcBody = {
    p_event_type: parsed.eventType,
    p_schema_version: parsed.schemaVersion,
    p_actor_type: parsed.actorType,
    p_actor_id: parsed.actorId,
    p_owner_id: parsed.ownerId,
    p_resource_type: parsed.resourceType,
    p_resource_id: parsed.resourceId,
    p_resource_version: parsed.resourceVersion,
    p_task_id: parsed.taskId,
    p_idempotency_key: parsed.idempotencyKey,
    p_visibility: parsed.visibility,
    p_payload: parsed.payload,
    p_occurred_at: parsed.occurredAt,
  };

  let row: CreativeEventRow | null;
  try {
    row = await params.fetcher<CreativeEventRow | null>(
      "/rest/v1/rpc/append_creative_event",
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
    if (err instanceof CreativeEventsError) throw err;
    const message = err instanceof Error ? err.message : "Event append failed.";
    throw new CreativeEventsError("service_unavailable", message);
  }

  if (!row) {
    throw new CreativeEventsError(
      "service_unavailable",
      "RPC returned no row."
    );
  }

  return rowToEvent(row);
}

/**
 * 列出调用者自己的事件，支持断点补拉。
 * - afterSequence: 返回 sequence > afterSequence 的事件
 * - resourceType/resourceId: 资源过滤
 * - limit: 默认 200，上限 1000
 */
export async function listCreativeEvents(params: {
  fetcher: CreativeEventsFetcher;
  userId: string;
  afterSequence?: number | null;
  resourceType?: string | null;
  resourceId?: string | null;
  limit?: number | null;
}): Promise<{ items: CreativeEventV1[]; nextSequence: number | null }> {
  assertUser(params.userId);

  const filters: string[] = [`owner_id=eq.${encodeURIComponent(params.userId)}`];
  if (params.afterSequence !== null && params.afterSequence !== undefined) {
    filters.push(`sequence=gt.${encodeURIComponent(String(params.afterSequence))}`);
  }
  if (params.resourceType) {
    filters.push(`resource_type=eq.${encodeURIComponent(params.resourceType)}`);
  }
  if (params.resourceId) {
    filters.push(`resource_id=eq.${encodeURIComponent(params.resourceId)}`);
  }

  const requestedLimit = params.limit ?? DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(MAX_LIMIT, requestedLimit));

  const path = `/rest/v1/storyflow_creative_events?${filters.join(
    "&"
  )}&select=*&order=sequence.asc&limit=${limit}`;

  let rows: CreativeEventRow[];
  try {
    rows = (await params.fetcher<CreativeEventRow[]>(path)) ?? [];
  } catch (err) {
    if (err instanceof CreativeEventsError) throw err;
    const message = err instanceof Error ? err.message : "Event list failed.";
    throw new CreativeEventsError("service_unavailable", message);
  }

  const items = rows.map(rowToEvent);
  const nextSequence =
    items.length > 0 ? items[items.length - 1].sequence : null;
  return { items, nextSequence };
}
