import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseComment, parseNotification, toCommentProjection } from "../lib/contracts/v2/comments.ts";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("C2 notification route exposes authenticated list and idempotent read actions", async () => {
  const source = await read("app/api/v2/community/notifications/route.ts");
  assert.match(source, /authenticateRequest/);
  assert.match(source, /listNotifications/);
  assert.match(source, /markNotificationRead/);
  assert.match(source, /markAllNotificationsRead/);
});

test("C2 deleted comment projection keeps the row but hides its body", () => {
  const projection = toCommentProjection(parseComment({
    id: "comment-1", publication_id: "pub-1", parent_comment_id: null,
    author_id: "user-1", body: "private body", deleted_at: "2026-08-28T00:00:00Z",
    deleted_by: "user-1", frozen_at: null, frozen_by: null, frozen_reason: null,
    moderation_id: null, created_at: "2026-08-28T00:00:00Z",
    updated_at: "2026-08-28T00:00:00Z", idempotency_key: "comment-1",
  }));
  assert.equal(projection.deleted, true);
  assert.equal(projection.body, "");
});

test("C2 notification parser preserves a real publication link", () => {
  const notification = parseNotification({
    id: "event-1", owner_id: "user-1", event_type: "notification_comment",
    actor_type: "user", actor_id: "user-2", created_at: "2026-08-28T00:00:00Z",
    payload: { title: "有人评论了你的作品", body: "打开查看", resource_type: "publication", resource_id: "pub-1" },
  });
  assert.equal(notification.linkUrl, "/community/pub-1");
});

test("C2 comment route keeps client idempotency key instead of generating a retry-unsafe timestamp key", async () => {
  const source = await read("app/api/v2/community/publications/[id]/comments/route.ts");
  assert.match(source, /body\.idempotencyKey/);
  assert.doesNotMatch(source, /Date\.now\(\)/);
});
