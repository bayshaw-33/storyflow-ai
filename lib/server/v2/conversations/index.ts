/**
 * KIIKIS V2.2 Conversation Ledger service — Phase 1 Task 1.3.
 *
 * Append-only conversation messages per Work thread. Messages are immutable
 * once persisted; clients may never modify or delete them. The "先保存输入,
 * 再生成" transaction boundary means generate/update requests must reference
 * already-persisted user messages — never React async state.
 */

import {
  type ConversationMessageV22,
  type ConversationRole,
  isConversationRole,
} from "../../../contracts/v2/work-history.ts";

export type ConversationsFetcher = <T = unknown>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

export class ConversationsServiceError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "conflict"
    | "validation_failed"
    | "service_unavailable";
  readonly correlationId?: string;

  constructor(
    code: ConversationsServiceError["code"],
    message: string,
    correlationId?: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "ConversationsServiceError";
    this.code = code;
    this.correlationId = correlationId;
  }
}

interface MessageRow {
  id: string;
  work_id: string;
  thread_id: string;
  role: string;
  content: string;
  base_version_id: string | null;
  idempotency_key: string;
  created_at: string;
}

function mapRowToV22(row: MessageRow): ConversationMessageV22 {
  return {
    id: row.id,
    workId: row.work_id,
    threadId: row.thread_id,
    role: row.role as ConversationRole,
    content: row.content,
    baseVersionId: row.base_version_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

export interface AppendConversationMessageInput {
  ownerId: string;
  workId: string;
  threadId: string;
  role: ConversationRole;
  content: string;
  baseVersionId?: string | null;
  idempotencyKey: string;
}

/**
 * Append a message to a conversation thread. Idempotent: replaying the same
 * (threadId, idempotencyKey) returns the original message.
 *
 * Messages are append-only — the guard trigger on the table forbids
 * UPDATE/DELETE.
 */
export async function appendConversationMessage(
  input: AppendConversationMessageInput,
  fetcher: ConversationsFetcher,
): Promise<ConversationMessageV22> {
  if (!input.ownerId) {
    throw new ConversationsServiceError("unauthenticated", "Owner id is required.");
  }
  if (!input.workId) {
    throw new ConversationsServiceError("validation_failed", "workId is required.");
  }
  if (!input.threadId) {
    throw new ConversationsServiceError("validation_failed", "threadId is required.");
  }
  if (!isConversationRole(input.role)) {
    throw new ConversationsServiceError("validation_failed", `Unsupported role: ${String(input.role)}`);
  }
  if (typeof input.content !== "string") {
    throw new ConversationsServiceError("validation_failed", "content must be a string.");
  }
  if (!input.idempotencyKey) {
    throw new ConversationsServiceError("validation_failed", "idempotencyKey is required.");
  }

  let row: MessageRow | null;
  try {
    // Insert with upsert-like idempotency: the unique index on (thread_id, idempotency_key)
    // ensures replaying the same key returns the original message.
    // We use Prefer: resolution=merge-duplicates to let PostgREST handle it.
    const rows = await fetcher<MessageRow[]>(
      `/rest/v1/storyflow_conversation_messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation,resolution=merge-duplicates",
        },
        body: JSON.stringify({
          work_id: input.workId,
          thread_id: input.threadId,
          role: input.role,
          content: input.content,
          base_version_id: input.baseVersionId || null,
          idempotency_key: input.idempotencyKey,
        }),
      },
    );
    row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("23505") || msg.includes("duplicate")) {
      // Idempotent replay: fetch the existing message.
      const existing = await fetcher<MessageRow[]>(
        `/rest/v1/storyflow_conversation_messages?thread_id=eq.${encodeURIComponent(input.threadId)}&idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}&select=*`,
      ).then((r) => (Array.isArray(r) ? r[0] : null) ?? null);
      if (existing) return mapRowToV22(existing);
    }
    throw new ConversationsServiceError(
      "service_unavailable",
      `Failed to append message: ${msg.slice(0, 200)}`,
    );
  }

  if (!row) {
    throw new ConversationsServiceError("service_unavailable", "Message insert returned no result.");
  }
  return mapRowToV22(row);
}

export interface ListConversationMessagesInput {
  ownerId: string;
  workId: string;
  threadId: string;
  limit?: number;
  offset?: number;
}

/**
 * List messages in a thread in chronological order. Supports pagination.
 */
export async function listConversationMessages(
  input: ListConversationMessagesInput,
  fetcher: ConversationsFetcher,
): Promise<ConversationMessageV22[]> {
  if (!input.ownerId) {
    throw new ConversationsServiceError("unauthenticated", "Owner id is required.");
  }
  if (!input.threadId) {
    throw new ConversationsServiceError("validation_failed", "threadId is required.");
  }

  let rows: MessageRow[];
  try {
    const limit = Math.min(input.limit ?? 100, 500);
    const offset = input.offset ?? 0;
    rows = await fetcher<MessageRow[]>(
      `/rest/v1/storyflow_conversation_messages?thread_id=eq.${encodeURIComponent(input.threadId)}&select=id,work_id,thread_id,role,content,base_version_id,idempotency_key,created_at&order=created_at.asc&limit=${limit}&offset=${offset}`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new ConversationsServiceError(
      "service_unavailable",
      `Failed to list messages: ${msg.slice(0, 200)}`,
    );
  }

  if (!Array.isArray(rows)) return [];
  return rows.map(mapRowToV22);
}

/**
 * Ensure a thread exists for a Work. If the thread already exists, this is a
 * no-op (idempotent). The thread is created with the owner_id derived from auth.
 */
export async function ensureThread(
  input: { ownerId: string; workId: string; threadId: string; title?: string },
  fetcher: ConversationsFetcher,
): Promise<{ threadId: string; created: boolean }> {
  if (!input.ownerId) {
    throw new ConversationsServiceError("unauthenticated", "Owner id is required.");
  }
  if (!input.threadId) {
    throw new ConversationsServiceError("validation_failed", "threadId is required.");
  }

  try {
    const rows = await fetcher<{ id: string }[]>(
      `/rest/v1/storyflow_conversation_threads?id=eq.${encodeURIComponent(input.threadId)}&select=id`,
    );
    if (Array.isArray(rows) && rows.length > 0) {
      return { threadId: input.threadId, created: false };
    }
    await fetcher(
      `/rest/v1/storyflow_conversation_threads`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          id: input.threadId,
          work_id: input.workId,
          owner_id: input.ownerId,
          title: input.title || null,
        }),
      },
    );
    return { threadId: input.threadId, created: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("23505") || msg.includes("duplicate")) {
      return { threadId: input.threadId, created: false };
    }
    throw new ConversationsServiceError(
      "service_unavailable",
      `Failed to ensure thread: ${msg.slice(0, 200)}`,
    );
  }
}
