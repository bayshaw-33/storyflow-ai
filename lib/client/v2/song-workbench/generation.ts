/**
 * KIIKIS V2.2 Song generation flow — Phase 5 Task 5.2.
 *
 * 生成/更新语义：
 *   1. save current input as a REAL user message (never clears input first)
 *   2. create Generation Snapshot whose last user message is EXACTLY the
 *      latest input (“副歌更克制” must land as the final user message)
 *   3. (worker) candidate generation → user applies → creates a new
 *      Work Version (append-only, never overwrites)
 * Failure keeps original lyrics, style prompt and current input.
 *
 * Pure logic + injectable fetcher (PostgREST semantics) for node --test.
 */

export interface SongGenerateInput {
  ownerId: string;
  workId: string;
  threadId: string;
  inputText: string;
  lyrics: string;
  stylePrompt: string;
}

export interface SongGenerateResult {
  snapshotId: string;
  lastUserMessageId: string;
  preserved: { lyrics: string; stylePrompt: string; inputText: string };
}

export class SongGenerationFlow {
  private readonly fetcher: (path: string, init?: RequestInit) => Promise<unknown>;

  constructor(fetcher: (path: string, init?: RequestInit) => Promise<unknown>) {
    this.fetcher = fetcher;
  }

  /**
   * Save the latest input as a user message, then create a snapshot that
   * references it as the last user message. Throws on failure — caller keeps
   * lyrics/prompt/input untouched.
   */
  async generate(input: SongGenerateInput): Promise<SongGenerateResult> {
    const userRow = (await this.fetcher("/rest/v1/storyflow_conversation_messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation,resolution=merge-duplicates",
      },
      body: JSON.stringify({
        work_id: input.workId,
        thread_id: input.threadId,
        role: "user",
        content: input.inputText,
        base_version_id: null,
        idempotency_key: `song-input:${Date.now()}:${input.inputText.slice(0, 40)}`,
      }),
    })) as Array<Record<string, unknown>>;
    const row = Array.isArray(userRow) ? userRow[0] : (userRow as Record<string, unknown>);
    if (!row?.id) throw new Error("song: failed to persist latest input");

    const snapshots = (await this.fetcher("/rest/v1/storyflow_generation_request_snapshots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        work_id: input.workId,
        thread_id: input.threadId,
        kind: "song_generation",
        last_user_message_id: String(row.id),
        input_json: {
          lyrics: input.lyrics,
          stylePrompt: input.stylePrompt,
          inputText: input.inputText,
        },
        status: "pending",
      }),
    })) as Array<Record<string, unknown>>;
    const snapshot = Array.isArray(snapshots) ? snapshots[0] : (snapshots as Record<string, unknown>);
    if (!snapshot?.id) throw new Error("song: failed to create generation snapshot");

    return {
      snapshotId: String(snapshot.id),
      lastUserMessageId: String(row.id),
      preserved: { lyrics: input.lyrics, stylePrompt: input.stylePrompt, inputText: input.inputText },
    };
  }

  /**
   * Apply a candidate → append a new Work Version. Never overwrites; each
   * application appends (v1, v2, …) tied to the candidate.
   */
  async applyCandidate(input: {
    ownerId: string;
    workId: string;
    candidateId: string;
  }): Promise<{ versionId: string; candidateId: string }> {
    const versions = (await this.fetcher(
      `/rest/v1/storyflow_work_versions?work_id=eq.${encodeURIComponent(input.workId)}&select=id&order=version_no.desc&limit=1`,
    )) as Array<Record<string, unknown>>;
    const latest = Array.isArray(versions) && versions.length > 0 ? versions[0] : null;
    const nextNo = Number(latest?.version_no ?? 0) + 1;

    const rows = (await this.fetcher("/rest/v1/storyflow_work_versions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        work_id: input.workId,
        version_no: nextNo,
        candidate_id: input.candidateId,
        content_schema: "kiikis.song/1",
        created_by: input.ownerId,
      }),
    })) as Array<Record<string, unknown>>;
    const row = Array.isArray(rows) ? rows[0] : (rows as Record<string, unknown>);
    if (!row?.id) throw new Error("song: failed to apply candidate");
    return { versionId: String(row.id), candidateId: input.candidateId };
  }
}
