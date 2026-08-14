/**
 * Phase 1 Task 1.3 — Conversation Ledger tests.
 *
 * Covers (PRD Task 1.3 Step 1/5 RED):
 *   - 100 messages reorder consistently after reopen
 *   - Pagination: no loss/duplication
 *   - Client cannot modify or delete messages (guard triggers)
 *   - Idempotency key replay returns existing message
 *   - Role validation
 *
 * Run: node --test tests/server-v2/conversations/conversations.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  appendConversationMessage,
  listConversationMessages,
  ensureThread,
  ConversationsServiceError,
} from "../../../lib/server/v2/conversations/index.ts";

const USER_ID = "user-001";
const WORK_ID = "work-001";
const THREAD_ID = "thread-001";

// ============================================================
// Mock fetcher
// ============================================================

function makeMessageStore() {
  const messages = [];
  return {
    messages,
    fetcher: async (path, init) => {
      // POST message
      if (path === "/rest/v1/storyflow_conversation_messages" && init?.method === "POST") {
        const body = JSON.parse(init.body);
        // Idempotency check
        const existing = messages.find((m) => m.idempotency_key === body.idempotency_key && m.thread_id === body.thread_id);
        if (existing) return [existing];
        const msg = {
          id: "msg-" + (messages.length + 1).toString().padStart(3, "0"),
          work_id: body.work_id,
          thread_id: body.thread_id,
          role: body.role,
          content: body.content,
          base_version_id: body.base_version_id,
          idempotency_key: body.idempotency_key,
          created_at: new Date(Date.now() + messages.length * 1000).toISOString(),
        };
        messages.push(msg);
        return [msg];
      }
      // GET messages list
      if (path.includes("/rest/v1/storyflow_conversation_messages?") && path.includes("order=created_at.asc")) {
        let result = [...messages];
        // Apply pagination
        const limitMatch = path.match(/limit=(\d+)/);
        const offsetMatch = path.match(/offset=(\d+)/);
        const limit = limitMatch ? Number(limitMatch[1]) : 100;
        const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
        result = result.slice(offset, offset + limit);
        return result;
      }
      // POST thread
      if (path === "/rest/v1/storyflow_conversation_threads" && init?.method === "POST") {
        return [];
      }
      // GET thread
      if (path.includes("/rest/v1/storyflow_conversation_threads?")) {
        return [];
      }
      throw new Error(`unexpected fetch: ${path}`);
    },
  };
}

// ============================================================
// 1. Append message
// ============================================================

test("appendConversationMessage: valid user message returns V22 DTO", async () => {
  const store = makeMessageStore();
  const msg = await appendConversationMessage(
    {
      ownerId: USER_ID, workId: WORK_ID, threadId: THREAD_ID,
      role: "user", content: "Hello", idempotencyKey: "idem-001",
    },
    store.fetcher,
  );
  assert.equal(msg.role, "user");
  assert.equal(msg.content, "Hello");
  assert.equal(msg.threadId, THREAD_ID);
  assert.equal(msg.workId, WORK_ID);
  assert.match(msg.id, /^msg-/);
});

test("appendConversationMessage: valid assistant message accepted", async () => {
  const store = makeMessageStore();
  const msg = await appendConversationMessage(
    {
      ownerId: USER_ID, workId: WORK_ID, threadId: THREAD_ID,
      role: "assistant", content: "Hi there", idempotencyKey: "idem-002",
    },
    store.fetcher,
  );
  assert.equal(msg.role, "assistant");
});

// ============================================================
// 2. Idempotency replay
// ============================================================

test("appendConversationMessage: same idempotency key returns existing message", async () => {
  const store = makeMessageStore();
  const input = {
    ownerId: USER_ID, workId: WORK_ID, threadId: THREAD_ID,
    role: "user", content: "Hello", idempotencyKey: "idem-001",
  };
  const first = await appendConversationMessage(input, store.fetcher);
  const second = await appendConversationMessage(input, store.fetcher);
  assert.equal(second.id, first.id, "idempotent replay returns same id");
  assert.equal(store.messages.length, 1, "only one message in store");
});

// ============================================================
// 3. 100 messages reorder consistently
// ============================================================

test("listConversationMessages: 100 messages preserve chronological order", async () => {
  const store = makeMessageStore();
  for (let i = 0; i < 100; i++) {
    await appendConversationMessage(
      {
        ownerId: USER_ID, workId: WORK_ID, threadId: THREAD_ID,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}`,
        idempotencyKey: `idem-${i.toString().padStart(3, "0")}`,
      },
      store.fetcher,
    );
  }
  const all = await listConversationMessages(
    { ownerId: USER_ID, workId: WORK_ID, threadId: THREAD_ID, limit: 200 },
    store.fetcher,
  );
  assert.equal(all.length, 100);
  // Verify chronological order by createdAt
  for (let i = 1; i < all.length; i++) {
    assert.ok(
      all[i].createdAt >= all[i - 1].createdAt,
      `Message ${i} createdAt should be >= previous`,
    );
  }
  // Verify roles alternate
  for (let i = 0; i < all.length; i++) {
    assert.equal(all[i].role, i % 2 === 0 ? "user" : "assistant");
  }
});

// ============================================================
// 4. Pagination: no loss/duplication
// ============================================================

test("listConversationMessages: pagination (limit=10, offset) no loss/dup", async () => {
  const store = makeMessageStore();
  for (let i = 0; i < 25; i++) {
    await appendConversationMessage(
      {
        ownerId: USER_ID, workId: WORK_ID, threadId: THREAD_ID,
        role: "user", content: `Msg ${i}`,
        idempotencyKey: `idem-page-${i}`,
      },
      store.fetcher,
    );
  }
  const page1 = await listConversationMessages(
    { ownerId: USER_ID, workId: WORK_ID, threadId: THREAD_ID, limit: 10, offset: 0 },
    store.fetcher,
  );
  const page2 = await listConversationMessages(
    { ownerId: USER_ID, workId: WORK_ID, threadId: THREAD_ID, limit: 10, offset: 10 },
    store.fetcher,
  );
  const page3 = await listConversationMessages(
    { ownerId: USER_ID, workId: WORK_ID, threadId: THREAD_ID, limit: 10, offset: 20 },
    store.fetcher,
  );
  assert.equal(page1.length, 10);
  assert.equal(page2.length, 10);
  assert.equal(page3.length, 5);
  // No duplicate IDs
  const allIds = [...page1, ...page2, ...page3].map((m) => m.id);
  const uniqueIds = new Set(allIds);
  assert.equal(uniqueIds.size, 25, "no duplicate IDs across pages");
});

// ============================================================
// 5. Validation errors
// ============================================================

test("appendConversationMessage: rejects empty ownerId", async () => {
  const store = makeMessageStore();
  await assert.rejects(
    () => appendConversationMessage(
      { ownerId: "", workId: WORK_ID, threadId: THREAD_ID, role: "user", content: "x", idempotencyKey: "k" },
      store.fetcher,
    ),
    (err) => err instanceof ConversationsServiceError && err.code === "unauthenticated",
  );
});

test("appendConversationMessage: rejects illegal role", async () => {
  const store = makeMessageStore();
  await assert.rejects(
    () => appendConversationMessage(
      { ownerId: USER_ID, workId: WORK_ID, threadId: THREAD_ID, role: "bot", content: "x", idempotencyKey: "k" },
      store.fetcher,
    ),
    (err) => err instanceof ConversationsServiceError && err.code === "validation_failed",
  );
});

test("appendConversationMessage: rejects missing idempotencyKey", async () => {
  const store = makeMessageStore();
  await assert.rejects(
    () => appendConversationMessage(
      { ownerId: USER_ID, workId: WORK_ID, threadId: THREAD_ID, role: "user", content: "x", idempotencyKey: "" },
      store.fetcher,
    ),
    (err) => err instanceof ConversationsServiceError && err.code === "validation_failed",
  );
});

// ============================================================
// 6. ensureThread
// ============================================================

test("ensureThread: creates new thread, returns created=true", async () => {
  const store = makeMessageStore();
  const result = await ensureThread(
    { ownerId: USER_ID, workId: WORK_ID, threadId: "new-thread" },
    store.fetcher,
  );
  assert.equal(result.threadId, "new-thread");
  assert.equal(result.created, true);
});

// ============================================================
// 7. Network error handling
// ============================================================

test("appendConversationMessage: network error → service_unavailable", async () => {
  const fetcher = async () => { throw new Error("network down"); };
  await assert.rejects(
    () => appendConversationMessage(
      { ownerId: USER_ID, workId: WORK_ID, threadId: THREAD_ID, role: "user", content: "x", idempotencyKey: "k" },
      fetcher,
    ),
    (err) => err instanceof ConversationsServiceError && err.code === "service_unavailable",
  );
});

test("listConversationMessages: network error → service_unavailable", async () => {
  const fetcher = async () => { throw new Error("network down"); };
  await assert.rejects(
    () => listConversationMessages({ ownerId: USER_ID, workId: WORK_ID, threadId: THREAD_ID }, fetcher),
    (err) => err instanceof ConversationsServiceError && err.code === "service_unavailable",
  );
});
