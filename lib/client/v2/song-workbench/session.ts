/**
 * KIIKIS V2.2 Song workbench session ledger — Phase 5 Task 5.2.
 *
 * Restores the song conversation from the Phase 1 Conversation Ledger in
 * REAL order (user/assistant alternating, versions tied via baseVersionId),
 * never flattened into a single notes blob. Legacy `songDevelopmentNotes`
 * import exactly once, marked `legacy_import`.
 *
 * This module is pure logic + injectable fetcher (PostgREST semantics),
 * so it stays testable in node --test.
 */

export type SongLedgerRole = "user" | "assistant";

export interface SongLedgerMessage {
  id: string;
  role: SongLedgerRole;
  content: string;
  baseVersionId: string | null;
  createdAt: string;
}

export interface RestoreResult {
  messages: SongLedgerMessage[];
  legacyImported: boolean;
}

const LEGACY_KEY_PREFIX = "song-legacy-import:";

export function legacyImportIdempotencyKey(threadId: string): string {
  return `${LEGACY_KEY_PREFIX}${threadId}`;
}

export class SongSessionLedger {
  private readonly fetcher: (path: string, init?: RequestInit) => Promise<unknown>;

  constructor(fetcher: (path: string, init?: RequestInit) => Promise<unknown>) {
    this.fetcher = fetcher;
  }

  /**
   * Restore the thread's messages in real order. When legacyNotes exist and
   * no legacy_import row is present yet, imports them as ONE marked user
   * message (idempotent across reopens).
   */
  async restore(params: {
    ownerId: string;
    workId: string;
    threadId: string;
    legacyNotes?: string | null;
  }): Promise<RestoreResult> {
    await this.ensureThread({ ownerId: params.ownerId, workId: params.workId, threadId: params.threadId });
    const messages = await this.listMessages({ ownerId: params.ownerId, threadId: params.threadId });

    let legacyImported = false;
    if (params.legacyNotes?.trim() && !messages.some((m) => m.content.startsWith("【legacy_import】"))) {
      const legacyMessage = await this.appendUserMessage({
        ownerId: params.ownerId,
        workId: params.workId,
        threadId: params.threadId,
        content: `【legacy_import】${params.legacyNotes.trim()}`,
        idempotencyKey: legacyImportIdempotencyKey(params.threadId),
      });
      legacyImported = Boolean(legacyMessage);
      if (legacyMessage) messages.push(legacyMessage);
    }
    return { messages, legacyImported };
  }

  async appendUserMessage(params: {
    ownerId: string;
    workId: string;
    threadId: string;
    content: string;
    idempotencyKey?: string;
  }): Promise<SongLedgerMessage> {
    return this.appendMessage({
      ownerId: params.ownerId,
      workId: params.workId,
      threadId: params.threadId,
      role: "user",
      content: params.content,
      idempotencyKey: params.idempotencyKey ?? `song-input:${Date.now()}`,
    });
  }

  async appendMessage(params: {
    ownerId: string;
    workId: string;
    threadId: string;
    role: SongLedgerRole;
    content: string;
    baseVersionId?: string | null;
    idempotencyKey: string;
  }): Promise<SongLedgerMessage> {
    const rows = (await this.fetcher("/rest/v1/storyflow_conversation_messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation,resolution=merge-duplicates",
      },
      body: JSON.stringify({
        work_id: params.workId,
        thread_id: params.threadId,
        role: params.role,
        content: params.content,
        base_version_id: params.baseVersionId ?? null,
        idempotency_key: params.idempotencyKey,
      }),
    })) as SongLedgerMessage[];
    const row = Array.isArray(rows) ? rows[0] : (rows as SongLedgerMessage);
    return this.mapRow(row);
  }

  private async ensureThread(params: { ownerId: string; workId: string; threadId: string }) {
    try {
      await this.fetcher("/rest/v1/storyflow_conversation_threads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal,resolution=merge-duplicates",
        },
        body: JSON.stringify({
          id: params.threadId,
          work_id: params.workId,
          owner_id: params.ownerId,
          title: "歌曲创作对话",
        }),
      });
    } catch {
      // thread likely already exists — listing below is authoritative
    }
  }

  private async listMessages(params: { ownerId: string; threadId: string }): Promise<SongLedgerMessage[]> {
    const rows = (await this.fetcher(
      `/rest/v1/storyflow_conversation_messages?thread_id=eq.${encodeURIComponent(params.threadId)}&select=id,work_id,thread_id,role,content,base_version_id,idempotency_key,created_at&order=created_at.asc&limit=500`,
    )) as SongLedgerMessage[];
    return (Array.isArray(rows) ? rows : []).map((r) => this.mapRow(r));
  }

  private mapRow(row: Record<string, unknown> | SongLedgerMessage): SongLedgerMessage {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      role: r.role === "assistant" ? "assistant" : "user",
      content: String(r.content ?? ""),
      baseVersionId: r.base_version_id ? String(r.base_version_id) : null,
      createdAt: String(r.created_at ?? ""),
    };
  }
}
