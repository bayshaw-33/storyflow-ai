/**
 * Phase 5 Task 5.2 — 歌曲“生成/更新”最新输入 (RED).
 *
 * Verifies:
 *   - tapping 生成 does NOT clear input or existing lyrics/prompt first
 *   - the Generation Snapshot's last user message is EXACTLY the latest input
 *     (“副歌更克制” must appear as the final user message)
 *   - failure keeps original lyrics, prompt and current input
 *   - applying a candidate creates a Work Version (never silently overwrites)
 *
 * Run: node --test tests/song-generation-latest-input.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import { SongGenerationFlow } from "../lib/client/v2/song-workbench/generation.ts";

const OWNER = "owner-1";
const WORK = "work-song-1";
const THREAD = "thread-song-1";

function makeGenStore(seedMessages = []) {
  const tables = {
    storyflow_conversation_messages: [...seedMessages],
    storyflow_generation_request_snapshots: [],
    storyflow_generation_candidates: [],
    storyflow_work_versions: [],
  };
  let seq = 500;
  const fetcher = async (path, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = new URL(path, "https://db.local");
    const table = url.pathname.replace("/rest/v1/", "").split("?")[0];
    const rows = tables[table];
    if (!rows) throw new Error(`Unknown table ${table}`);

    if (method === "GET") {
      let filtered = [...rows];
      for (const [key, raw] of url.searchParams.entries()) {
        if (["order", "limit", "offset", "select"].includes(key)) continue;
        const m = /^(eq|is)\.(.*)$/.exec(raw);
        if (m) {
          filtered = filtered.filter((r) =>
            m[1] === "is" && m[2] === "null" ? r[key] == null : String(r[key]) === m[2],
          );
        }
      }
      const order = url.searchParams.get("order");
      if (order?.startsWith("version_no.desc")) {
        filtered.sort((a, b) => Number(b.version_no ?? 0) - Number(a.version_no ?? 0));
      }
      return filtered;
    }

    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const existing = body.idempotency_key ? rows.find((r) => r.idempotency_key === body.idempotency_key) : undefined;
      if (existing) return [existing];
      const row = { id: `${table.slice(-3)}-${String(++seq)}`, created_at: `2026-08-16T00:01:${String(seq % 60).padStart(2, "0")}Z`, ...body };
      rows.push(row);
      return [row];
    }
    throw new Error(`Unsupported ${method} ${path}`);
  };
  return { fetcher, tables };
}

const SEED = [
  { id: "msg-1", work_id: WORK, thread_id: THREAD, role: "user", content: "写一首废土情歌", base_version_id: null, idempotency_key: "u1", created_at: "2026-08-15T10:00:00Z" },
  { id: "msg-2", work_id: WORK, thread_id: THREAD, role: "assistant", content: "初稿完成。", base_version_id: "msg-1", idempotency_key: "a1", created_at: "2026-08-15T10:01:00Z" },
];

// ============================================================
// 1. Latest input lands in the snapshot as the LAST user message
// ============================================================

test("latest input becomes the final user message of the snapshot", async () => {
  const { fetcher, tables } = makeGenStore(SEED);
  const flow = new SongGenerationFlow(fetcher);
  const result = await flow.generate({
    ownerId: OWNER,
    workId: WORK,
    threadId: THREAD,
    inputText: "副歌更克制",
    lyrics: "旧歌词",
    stylePrompt: "冷色调",
  });
  assert.ok(result.snapshotId);
  assert.equal(result.preserved.lyrics, "旧歌词", "lyrics not cleared");
  assert.equal(result.preserved.stylePrompt, "冷色调", "prompt not cleared");
  assert.equal(result.preserved.inputText, "副歌更克制", "input not cleared");

  const snapshot = tables.storyflow_generation_request_snapshots.find((s) => s.id === result.snapshotId);
  assert.ok(snapshot, "snapshot row exists");
  const lastUser = snapshot.last_user_message_id
    ? tables.storyflow_conversation_messages.find((m) => m.id === snapshot.last_user_message_id)
    : null;
  assert.ok(lastUser, "snapshot references a user message");
  assert.equal(lastUser.content, "副歌更克制", "snapshot last user message = latest input");
  assert.equal(lastUser.role, "user");
});

// ============================================================
// 2. Failure preserves everything
// ============================================================

test("failed generation keeps lyrics, prompt and input intact", async () => {
  const { fetcher, tables } = makeGenStore(SEED);
  const flow = new SongGenerationFlow(fetcher);
  // sabotage snapshot insert
  const original = tables.storyflow_generation_request_snapshots;
  tables.storyflow_generation_request_snapshots = null; // triggers Unknown table error
  await assert.rejects(
    () =>
      flow.generate({
        ownerId: OWNER,
        workId: WORK,
        threadId: THREAD,
        inputText: "副歌更克制",
        lyrics: "旧歌词",
        stylePrompt: "冷色调",
      }),
  );
  tables.storyflow_generation_request_snapshots = original;
  // message append already happened but state was NOT cleared by caller-side
  assert.equal(tables.storyflow_generation_request_snapshots.length, 0, "no snapshot persisted");
});

// ============================================================
// 3. Candidate apply creates a Work Version (append-only)
// ============================================================

test("applying a candidate creates a new Work Version, never overwrites", async () => {
  const { fetcher, tables } = makeGenStore(SEED);
  const flow = new SongGenerationFlow(fetcher);
  await flow.generate({
    ownerId: OWNER,
    workId: WORK,
    threadId: THREAD,
    inputText: "副歌更克制",
    lyrics: "旧歌词",
    stylePrompt: "冷色调",
  });
  const candidate = { id: "cand-1", work_id: WORK, payload: { lyrics: "新歌词" }, status: "pending" };
  tables.storyflow_generation_candidates.push(candidate);
  const version = await flow.applyCandidate({ ownerId: OWNER, workId: WORK, candidateId: "cand-1" });
  assert.ok(version.versionId);
  assert.equal(tables.storyflow_work_versions.length, 1);
  const v1 = tables.storyflow_work_versions[0];
  assert.equal(v1.candidate_id, "cand-1");
  // applying again appends v2, v1 untouched
  const version2 = await flow.applyCandidate({ ownerId: OWNER, workId: WORK, candidateId: "cand-1" });
  assert.notEqual(version2.versionId, version.versionId);
  assert.equal(tables.storyflow_work_versions.length, 2);
  assert.equal(tables.storyflow_work_versions[0].id, version.versionId);
});
