/**
 * Phase 5 Task 5.2 — 歌曲会话 Ledger (RED).
 *
 * Verifies:
 *   - restore: user/assistant messages come back in real order, NOT flattened
 *     into one assistant notes blob; lyrics/prompt/message versions stay tied
 *   - legacy notes import exactly once (idempotent across reopens)
 *   - assistant replies reference the user message version they answer
 *
 * Run: node --test tests/song-conversation-ledger.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import { SongSessionLedger } from "../lib/client/v2/song-workbench/session.ts";

const OWNER = "owner-1";
const WORK = "work-song-1";
const THREAD = "thread-song-1";

function makeLedgerStore(seedMessages = [], seedNotes = null) {
  const tables = {
    storyflow_conversation_threads: [{ id: THREAD, work_id: WORK, owner_id: OWNER }],
    storyflow_conversation_messages: [...seedMessages],
    legacyNotes: seedNotes,
  };
  let seq = 100;
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
      if (order?.startsWith("created_at.asc")) {
        filtered.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      }
      return filtered;
    }

    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const existing = rows.find((r) => r.idempotency_key === body.idempotency_key);
      if (existing) return [existing]; // merge-duplicates idempotency
      const row = {
        id: `msg-${String(++seq)}`,
        created_at: `2026-08-16T00:00:${String(50 + (seq % 10)).padStart(2, "0")}Z`,
        ...body,
      };
      rows.push(row);
      return [row];
    }
    throw new Error(`Unsupported ${method} ${path}`);
  };
  return { fetcher, tables };
}

const SEED = [
  { id: "msg-1", work_id: WORK, thread_id: THREAD, role: "user", content: "写一首关于废土的歌", base_version_id: null, idempotency_key: "u1", created_at: "2026-08-15T10:00:00Z" },
  { id: "msg-2", work_id: WORK, thread_id: THREAD, role: "assistant", content: "好的，主歌用冷色调意象。", base_version_id: "msg-1", idempotency_key: "a1", created_at: "2026-08-15T10:01:00Z" },
  { id: "msg-3", work_id: WORK, thread_id: THREAD, role: "user", content: "副歌更克制", base_version_id: null, idempotency_key: "u2", created_at: "2026-08-15T10:02:00Z" },
  { id: "msg-4", work_id: WORK, thread_id: THREAD, role: "assistant", content: "收到，副歌将减少堆叠。", base_version_id: "msg-3", idempotency_key: "a2", created_at: "2026-08-15T10:03:00Z" },
];

// ============================================================
// 1. Real-order restore (not flattened)
// ============================================================

test("restore returns every message in real order with roles preserved", async () => {
  const { fetcher } = makeLedgerStore(SEED);
  const ledger = new SongSessionLedger(fetcher);
  const { messages, legacyImported } = await ledger.restore({ ownerId: OWNER, workId: WORK, threadId: THREAD });
  assert.equal(legacyImported, false);
  assert.deepEqual(
    messages.map((m) => [m.role, m.content]),
    [
      ["user", "写一首关于废土的歌"],
      ["assistant", "好的，主歌用冷色调意象。"],
      ["user", "副歌更克制"],
      ["assistant", "收到，副歌将减少堆叠。"],
    ],
  );
  assert.equal(messages.length, 4, "never flattened into a single notes blob");
});

test("assistant messages keep the user version they answer (baseVersionId)", async () => {
  const { fetcher } = makeLedgerStore(SEED);
  const ledger = new SongSessionLedger(fetcher);
  const { messages } = await ledger.restore({ ownerId: OWNER, workId: WORK, threadId: THREAD });
  const assistant2 = messages.find((m) => m.content === "收到，副歌将减少堆叠。");
  assert.equal(assistant2?.baseVersionId, "msg-3");
});

// ============================================================
// 2. Legacy notes single import
// ============================================================

test("legacy notes import as one marked source message, once", async () => {
  const { fetcher, tables } = makeLedgerStore([], "旧版创作沟通记录：副歌想更克制。");
  const ledger = new SongSessionLedger(fetcher);
  const first = await ledger.restore({ ownerId: OWNER, workId: WORK, threadId: THREAD, legacyNotes: "旧版创作沟通记录：副歌想更克制。" });
  assert.equal(first.legacyImported, true);
  const legacyMsg = tables.storyflow_conversation_messages.find((m) => m.idempotency_key.includes("legacy"));
  assert.ok(legacyMsg, "legacy import row exists");
  assert.ok(legacyMsg.content.includes("旧版创作沟通记录"));
  assert.equal(legacyMsg.role, "user");

  // reopening does not import again
  const second = await ledger.restore({ ownerId: OWNER, workId: WORK, threadId: THREAD, legacyNotes: "旧版创作沟通记录：副歌想更克制。" });
  assert.equal(second.legacyImported, false);
  const legacyCount = tables.storyflow_conversation_messages.filter((m) => m.idempotency_key.includes("legacy")).length;
  assert.equal(legacyCount, 1, "duplicate import prevented");
});

test("no legacy notes → no import row", async () => {
  const { fetcher, tables } = makeLedgerStore([]);
  const ledger = new SongSessionLedger(fetcher);
  const { legacyImported } = await ledger.restore({ ownerId: OWNER, workId: WORK, threadId: THREAD });
  assert.equal(legacyImported, false);
  assert.equal(tables.storyflow_conversation_messages.length, 0);
});

// ============================================================
// 3. Ledger append keeps association
// ============================================================

test("appendUserMessage stores input as a real user message, idempotent per key", async () => {
  const { fetcher, tables } = makeLedgerStore(SEED);
  const ledger = new SongSessionLedger(fetcher);
  const first = await ledger.appendUserMessage({ ownerId: OWNER, workId: WORK, threadId: THREAD, content: "加一段桥" });
  const second = await ledger.appendUserMessage({ ownerId: OWNER, workId: WORK, threadId: THREAD, content: "加一段桥" });
  assert.equal(first.id, second.id, "same idempotency key → same message");
  const count = tables.storyflow_conversation_messages.filter((m) => m.content === "加一段桥").length;
  assert.equal(count, 1);
});
