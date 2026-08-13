/**
 * tests/kiikis-21-community-comments.test.mjs
 * KIIKIS 2.1 Phase 5 — Task 5.2 评论与通知测试 (CM-004, CM-006)
 *
 * 覆盖:
 *   CM-004: 评论支持回复、软删除、冻结和审核证据
 *   CM-006: 通知由 creative_events 生成 (复用 Phase 1 EV 架构)
 *
 * 测试策略:
 *   - 契约校验 (validateCreateComment / parseComment / toCommentProjection)
 *   - 服务层 mock fetcher (CM-004 author 服务端注入 + 软删除 + 冻结)
 *   - 通知生成/去重 (CM-006)
 *   - migration 文件存在 + RLS + RPC
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  validateCreateComment,
  parseComment,
  toCommentProjection,
  parseNotification,
  isCommunityNotificationType,
  CommentValidationError,
  COMMENT_BODY_MAX,
  COMMUNITY_NOTIFICATION_TYPES,
} from "../lib/contracts/v2/comments.ts";
import {
  createComment,
  listComments,
  getComment,
  softDeleteComment,
  freezeComment,
  unfreezeComment,
} from "../lib/server/v2/community/comments.ts";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  sendNotification,
} from "../lib/server/v2/community/notifications.ts";
import { CommunityServiceError } from "../lib/server/v2/community/publications.ts";

// ============================================================
// Helpers — Mock fetcher
// ============================================================

function makeMockFetcher(handlers) {
  return async (url, init) => {
    for (const h of handlers) {
      if (h.match(url, init)) {
        return h.respond(url, init);
      }
    }
    throw Object.assign(new Error(`no handler for ${url}`), { status: 503 });
  };
}

const sampleCommentRow = {
  id: "c-1",
  publication_id: "pub-1",
  parent_comment_id: null,
  author_id: "user-A",
  body: "Great publication!",
  deleted_at: null,
  deleted_by: null,
  frozen_at: null,
  frozen_by: null,
  frozen_reason: null,
  moderation_id: null,
  created_at: "2026-08-14T00:00:00Z",
  updated_at: "2026-08-14T00:00:00Z",
  idempotency_key: "comment:user-A:pub-1:root:1",
};

const sampleReplyRow = {
  ...sampleCommentRow,
  id: "c-2",
  parent_comment_id: "c-1",
  body: "Thanks!",
  idempotency_key: "comment:user-A:pub-1:c-1:2",
};

const sampleDeletedCommentRow = {
  ...sampleCommentRow,
  deleted_at: "2026-08-14T01:00:00Z",
  deleted_by: "user-A",
};

const sampleFrozenCommentRow = {
  ...sampleCommentRow,
  frozen_at: "2026-08-14T02:00:00Z",
  frozen_by: "user-moderator",
  frozen_reason: "violates guidelines",
  moderation_id: "mod-1",
};

const sampleNotificationRow = {
  id: "ev-1",
  owner_id: "user-A",
  event_type: "notification_comment",
  actor_type: "user",
  actor_id: "user-B",
  payload: {
    title: "New comment",
    body: "Someone commented on your publication",
    resource_type: "publication",
    resource_id: "pub-1",
    commentId: "c-1",
  },
  created_at: "2026-08-14T00:00:00Z",
};

// ============================================================
// 1. 契约常量 (CM-004, CM-006)
// ============================================================

test("CM-004: COMMENT_BODY_MAX 为 2000", () => {
  assert.equal(COMMENT_BODY_MAX, 2000);
});

test("CM-006: COMMUNITY_NOTIFICATION_TYPES 含 follow/comment/reaction/apply_use/moderation_result/moderation_freeze", () => {
  assert.ok(COMMUNITY_NOTIFICATION_TYPES.includes("follow"));
  assert.ok(COMMUNITY_NOTIFICATION_TYPES.includes("comment"));
  assert.ok(COMMUNITY_NOTIFICATION_TYPES.includes("reaction"));
  assert.ok(COMMUNITY_NOTIFICATION_TYPES.includes("apply_use"));
  assert.ok(COMMUNITY_NOTIFICATION_TYPES.includes("moderation_result"));
  assert.ok(COMMUNITY_NOTIFICATION_TYPES.includes("moderation_freeze"));
});

// ============================================================
// 2. validateCreateComment (CM-004: authorId 必填)
// ============================================================

test("CM-004: validateCreateComment 合法输入通过", () => {
  const input = validateCreateComment({
    publicationId: "pub-1",
    authorId: "user-A",
    body: "Great!",
    idempotencyKey: "idem-1",
  });
  assert.equal(input.publicationId, "pub-1");
  assert.equal(input.authorId, "user-A");
  assert.equal(input.body, "Great!");
  assert.ok(Object.isFrozen(input));
});

test("CM-004: validateCreateComment 缺 publicationId 抛错", () => {
  assert.throws(
    () =>
      validateCreateComment({
        publicationId: "",
        authorId: "user-A",
        body: "Hi",
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommentValidationError && err.code === "missing_publication",
  );
});

test("CM-004: validateCreateComment 缺 authorId 抛错 (服务端注入)", () => {
  assert.throws(
    () =>
      validateCreateComment({
        publicationId: "pub-1",
        authorId: "",
        body: "Hi",
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommentValidationError && err.code === "missing_author",
  );
});

test("CM-004: validateCreateComment 缺 body 抛错", () => {
  assert.throws(
    () =>
      validateCreateComment({
        publicationId: "pub-1",
        authorId: "user-A",
        body: "",
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommentValidationError && err.code === "missing_body",
  );
});

test("CM-004: validateCreateComment body 过长抛错 (>2000)", () => {
  assert.throws(
    () =>
      validateCreateComment({
        publicationId: "pub-1",
        authorId: "user-A",
        body: "x".repeat(COMMENT_BODY_MAX + 1),
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommentValidationError && err.code === "body_too_long",
  );
});

test("CM-004: validateCreateComment 缺 idempotencyKey 抛错", () => {
  assert.throws(
    () =>
      validateCreateComment({
        publicationId: "pub-1",
        authorId: "user-A",
        body: "Hi",
        idempotencyKey: "",
      }),
    (err) => err instanceof CommentValidationError && err.code === "missing_idempotency_key",
  );
});

test("CM-004: validateCreateComment 支持 parentCommentId 回复", () => {
  const input = validateCreateComment({
    publicationId: "pub-1",
    parentCommentId: "c-1",
    authorId: "user-A",
    body: "reply",
    idempotencyKey: "idem-2",
  });
  assert.equal(input.parentCommentId, "c-1");
});

// ============================================================
// 3. parseComment — CM-004
// ============================================================

test("CM-004: parseComment 保留所有字段", () => {
  const c = parseComment(sampleCommentRow);
  assert.equal(c.id, "c-1");
  assert.equal(c.publicationId, "pub-1");
  assert.equal(c.parentCommentId, null);
  assert.equal(c.authorId, "user-A");
  assert.equal(c.body, "Great publication!");
  assert.equal(c.deletedAt, null);
  assert.equal(c.frozenAt, null);
  assert.ok(Object.isFrozen(c));
});

test("CM-004: parseComment 解析回复评论", () => {
  const c = parseComment(sampleReplyRow);
  assert.equal(c.parentCommentId, "c-1");
  assert.equal(c.body, "Thanks!");
});

test("CM-004: parseComment 解析软删除评论", () => {
  const c = parseComment(sampleDeletedCommentRow);
  assert.equal(c.deletedAt, "2026-08-14T01:00:00Z");
  assert.equal(c.deletedBy, "user-A");
});

test("CM-004: parseComment 解析冻结评论", () => {
  const c = parseComment(sampleFrozenCommentRow);
  assert.equal(c.frozenAt, "2026-08-14T02:00:00Z");
  assert.equal(c.frozenBy, "user-moderator");
  assert.equal(c.frozenReason, "violates guidelines");
  assert.equal(c.moderationId, "mod-1");
});

// ============================================================
// 4. toCommentProjection — CM-004 (不暴露 deleted_by/frozen_by)
// ============================================================

test("CM-004: toCommentProjection 不暴露 deleted_by/frozen_by/moderation_id", () => {
  const c = parseComment(sampleFrozenCommentRow);
  const proj = toCommentProjection(c);
  assert.ok(!("deletedBy" in proj));
  assert.ok(!("frozenBy" in proj));
  assert.ok(!("moderationId" in proj));
  assert.ok(!("idempotencyKey" in proj));
  assert.equal(proj.frozen, true);
  assert.equal(proj.frozenReason, "violates guidelines");
});

test("CM-004: toCommentProjection 软删除后不暴露 body", () => {
  const c = parseComment(sampleDeletedCommentRow);
  const proj = toCommentProjection(c);
  assert.equal(proj.deleted, true);
  assert.equal(proj.body, ""); // CM-004: 软删除后 body 为空
});

test("CM-004: toCommentProjection 正常评论保留 body", () => {
  const c = parseComment(sampleCommentRow);
  const proj = toCommentProjection(c);
  assert.equal(proj.deleted, false);
  assert.equal(proj.body, "Great publication!");
});

test("CM-004: toCommentProjection 返回冻结对象", () => {
  const c = parseComment(sampleFrozenCommentRow);
  const proj = toCommentProjection(c);
  assert.equal(proj.frozen, true);
  assert.equal(proj.frozenReason, "violates guidelines");
  assert.ok(Object.isFrozen(proj));
});

// ============================================================
// 5. createComment (CM-004: authorId 服务端注入)
// ============================================================

test("CM-004: createComment 调用 RPC 并返回 Comment", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_comment"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return { ...sampleCommentRow, idempotency_key: receivedBody.p_idempotency_key };
      },
    },
  ]);
  const c = await createComment(fetcher, {
    publicationId: "pub-1",
    authorId: "user-A",
    body: "Great!",
    idempotencyKey: "idem-1",
  });
  // CM-004: RPC 参数正确
  assert.equal(receivedBody.p_publication_id, "pub-1");
  assert.equal(receivedBody.p_body, "Great!");
  assert.equal(receivedBody.p_idempotency_key, "idem-1");
  assert.equal(receivedBody.p_parent_comment_id, null);
  // 返回解析后的 Comment
  assert.equal(c.id, "c-1");
  assert.equal(c.authorId, "user-A");
});

test("CM-004: createComment 支持 parentCommentId 回复", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_comment"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return { ...sampleReplyRow, idempotency_key: receivedBody.p_idempotency_key };
      },
    },
  ]);
  await createComment(fetcher, {
    publicationId: "pub-1",
    parentCommentId: "c-1",
    authorId: "user-A",
    body: "reply",
    idempotencyKey: "idem-2",
  });
  assert.equal(receivedBody.p_parent_comment_id, "c-1");
});

test("CM-004: createComment 校验失败抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      createComment(fetcher, {
        publicationId: "pub-1",
        authorId: "user-A",
        body: "",
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

test("CM-004: createComment publication 不存在抛 not_found", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_comment"),
      respond: () => {
        const err = new Error("not found");
        err.status = 404;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () =>
      createComment(fetcher, {
        publicationId: "unknown",
        authorId: "user-A",
        body: "Hi",
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommunityServiceError && err.code === "not_found",
  );
});

test("CM-004: createComment publication 非活跃抛 forbidden", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_comment"),
      respond: () => {
        const err = new Error("forbidden");
        err.status = 403;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () =>
      createComment(fetcher, {
        publicationId: "pub-1",
        authorId: "user-A",
        body: "Hi",
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommunityServiceError && err.code === "forbidden",
  );
});

// ============================================================
// 6. listComments / getComment
// ============================================================

test("CM-004: listComments 按 publication 查询", async () => {
  let receivedUrl = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => {
        receivedUrl = p;
        return p.includes("/rest/v1/storyflow_comments?publication_id=eq.");
      },
      respond: () => [sampleCommentRow, sampleReplyRow],
    },
  ]);
  const items = await listComments(fetcher, "pub-1");
  assert.equal(items.length, 2);
  assert.ok(receivedUrl.includes("publication_id=eq.pub-1"));
  assert.ok(receivedUrl.includes("order=created_at.asc"));
});

test("CM-004: listComments 缺 publicationId 抛错", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => listComments(fetcher, ""),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

test("CM-004: listComments 返回投影不暴露 deleted_by", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_comments?publication_id=eq."),
      respond: () => [sampleDeletedCommentRow, sampleFrozenCommentRow],
    },
  ]);
  const items = await listComments(fetcher, "pub-1");
  assert.equal(items.length, 2);
  // 投影字段
  assert.ok(!("deletedBy" in items[0]));
  assert.ok(!("frozenBy" in items[1]));
  assert.equal(items[0].deleted, true);
  assert.equal(items[0].body, ""); // 软删除后 body 清空
  assert.equal(items[1].frozen, true);
});

test("CM-004: getComment 返回评论详情", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_comments?id=eq."),
      respond: () => sampleCommentRow,
    },
  ]);
  const c = await getComment(fetcher, "c-1");
  assert.equal(c?.id, "c-1");
});

test("CM-004: getComment 不存在返回 null", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_comments?id=eq."),
      respond: () => {
        const err = new Error("not found");
        err.status = 406;
        throw err;
      },
    },
  ]);
  const c = await getComment(fetcher, "unknown");
  assert.equal(c, null);
});

// ============================================================
// 7. softDeleteComment (CM-004: 软删除, 不物理删除)
// ============================================================

test("CM-004: softDeleteComment 调用 RPC 标记 deleted_at", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/soft_delete_comment"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return { ...sampleCommentRow, deleted_at: "2026-08-14T01:00:00Z", deleted_by: "user-A" };
      },
    },
  ]);
  const c = await softDeleteComment(fetcher, "c-1", "user requested");
  assert.equal(receivedBody.p_comment_id, "c-1");
  assert.equal(receivedBody.p_reason, "user requested");
  // CM-004: 软删除, 不物理删除
  assert.equal(c.deletedAt, "2026-08-14T01:00:00Z");
  assert.equal(c.body, "Great publication!"); // body 仍在 (历史保留)
});

test("CM-004: softDeleteComment 评论不存在抛 not_found", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/soft_delete_comment"),
      respond: () => {
        const err = new Error("not found");
        err.status = 404;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => softDeleteComment(fetcher, "unknown"),
    (err) => err instanceof CommunityServiceError && err.code === "not_found",
  );
});

test("CM-004: softDeleteComment 非作者抛 forbidden", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/soft_delete_comment"),
      respond: () => {
        const err = new Error("forbidden");
        err.status = 403;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => softDeleteComment(fetcher, "c-1"),
    (err) => err instanceof CommunityServiceError && err.code === "forbidden",
  );
});

// ============================================================
// 8. freezeComment / unfreezeComment (CM-004: 审核冻结)
// ============================================================

test("CM-004: freezeComment 调用 RPC 标记 frozen_at + frozen_reason", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/freeze_comment"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return { ...sampleCommentRow, frozen_at: "2026-08-14T02:00:00Z", frozen_by: "user-mod", frozen_reason: receivedBody.p_reason, moderation_id: receivedBody.p_moderation_id };
      },
    },
  ]);
  const c = await freezeComment(fetcher, {
    commentId: "c-1",
    reason: "spam",
    moderatorId: "user-mod",
    moderationId: "mod-1",
  });
  assert.equal(receivedBody.p_comment_id, "c-1");
  assert.equal(receivedBody.p_reason, "spam");
  assert.equal(receivedBody.p_moderator_id, "user-mod");
  assert.equal(receivedBody.p_moderation_id, "mod-1");
  assert.equal(c.frozenAt, "2026-08-14T02:00:00Z");
  assert.equal(c.frozenReason, "spam");
  assert.equal(c.moderationId, "mod-1");
});

test("CM-004: freezeComment 缺 reason 抛错", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      freezeComment(fetcher, {
        commentId: "c-1",
        reason: "",
      }),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

test("CM-004: unfreezeComment 清除 frozen 字段", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/unfreeze_comment"),
      respond: () => ({
        ...sampleCommentRow,
        frozen_at: null,
        frozen_by: null,
        frozen_reason: null,
      }),
    },
  ]);
  const c = await unfreezeComment(fetcher, "c-1", "appeal approved");
  assert.equal(c.frozenAt, null);
  assert.equal(c.frozenBy, null);
  assert.equal(c.frozenReason, null);
});

// ============================================================
// 9. Migration 文件 (CM-004, CM-006)
// ============================================================

test("CM-004: migration 文件存在", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20260827050100_kiikis_21_comments.sql",
  );
  assert.ok(fs.existsSync(migrationPath), `migration file missing: ${migrationPath}`);
});

test("CM-004: migration 包含 storyflow_comments 表 + parent_comment_id 回复", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827050100_kiikis_21_comments.sql"),
    "utf8",
  );
  assert.ok(sql.includes("CREATE TABLE") && sql.includes("storyflow_comments"));
  // CM-004: 回复字段
  assert.ok(sql.includes("parent_comment_id"));
  // CM-004: 软删除
  assert.ok(sql.includes("deleted_at"));
  assert.ok(sql.includes("deleted_by"));
  // CM-004: 冻结
  assert.ok(sql.includes("frozen_at"));
  assert.ok(sql.includes("frozen_by"));
  assert.ok(sql.includes("frozen_reason"));
  // CM-004: 审核证据
  assert.ok(sql.includes("moderation_id"));
});

test("CM-004: migration 包含 body append-only guard trigger", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827050100_kiikis_21_comments.sql"),
    "utf8",
  );
  assert.ok(sql.includes("storyflow_comments_body_immutable_guard"));
  assert.ok(sql.includes("append-only"));
});

test("CM-004: migration 包含 create_comment / soft_delete_comment / freeze_comment / unfreeze_comment RPC", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827050100_kiikis_21_comments.sql"),
    "utf8",
  );
  assert.ok(sql.includes("create_comment"));
  assert.ok(sql.includes("soft_delete_comment"));
  assert.ok(sql.includes("freeze_comment"));
  assert.ok(sql.includes("unfreeze_comment"));
  // CM-004: parent_comment_id 校验同 publication
  assert.ok(sql.includes("parent comment does not belong to publication"));
  // CM-004: 冻结/删除的 parent 不可回复
  assert.ok(sql.includes("parent comment is deleted"));
  assert.ok(sql.includes("parent comment is frozen"));
});

test("CM-006: migration 包含 storyflow_notification_reads 表 (read 状态)", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827050100_kiikis_21_comments.sql"),
    "utf8",
  );
  assert.ok(sql.includes("storyflow_notification_reads"));
  assert.ok(sql.includes("mark_notification_read"));
});

test("CM-006: migration 包含 notification_comment 通知写入 (creative_events)", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827050100_kiikis_21_comments.sql"),
    "utf8",
  );
  assert.ok(sql.includes("notification_comment"));
  assert.ok(sql.includes("storyflow_creative_events"));
  // CM-006: 通知去重 (ON CONFLICT DO NOTHING)
  assert.ok(sql.includes("ON CONFLICT") && sql.includes("DO NOTHING"));
  // CM-006: 只在评论者 != publication 作者时通知
  assert.ok(sql.includes("v_pub.publisher_id <> v_author"));
});

// ============================================================
// 10. 通知 (CM-006)
// ============================================================

test("CM-006: isCommunityNotificationType 校验", () => {
  assert.ok(isCommunityNotificationType("comment"));
  assert.ok(isCommunityNotificationType("follow"));
  assert.ok(isCommunityNotificationType("reaction"));
  assert.ok(!isCommunityNotificationType("invalid"));
});

test("CM-006: parseNotification 解析 comment 通知", () => {
  const n = parseNotification(sampleNotificationRow);
  assert.equal(n.id, "ev-1");
  assert.equal(n.recipientId, "user-A");
  assert.equal(n.type, "comment");
  assert.equal(n.actorId, "user-B");
  assert.equal(n.title, "New comment");
  assert.equal(n.read, false); // read_at null
  assert.ok(Object.isFrozen(n));
});

test("CM-006: parseNotification 解析已读通知 (read_at 存在)", () => {
  const n = parseNotification({
    ...sampleNotificationRow,
    read_at: "2026-08-14T03:00:00Z",
  });
  assert.equal(n.read, true);
  assert.equal(n.readAt, "2026-08-14T03:00:00Z");
});

test("CM-006: parseNotification 处理未知 event_type (回退 comment)", () => {
  const n = parseNotification({
    ...sampleNotificationRow,
    event_type: "notification_unknown_type",
  });
  assert.equal(n.type, "comment"); // 未知类型回退
});

test("CM-006: listNotifications 查询 creative_events + 合并 read 状态", async () => {
  let receivedUrl = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => {
        if (p.includes("/rest/v1/storyflow_creative_events")) {
          receivedUrl = p;
          return true;
        }
        return false;
      },
      respond: () => [sampleNotificationRow],
    },
    {
      match: (p) => p.includes("/rest/v1/storyflow_notification_reads"),
      respond: () => [{ event_id: "ev-1", read_at: "2026-08-14T03:00:00Z" }],
    },
  ]);
  const items = await listNotifications(fetcher, "user-A");
  assert.equal(items.length, 1);
  assert.equal(items[0].read, true);
  // URLSearchParams 将 * 编码为 %2A, 用 decodeURIComponent 比较
  assert.ok(decodeURIComponent(receivedUrl).includes("event_type=like(notification_*)"));
  assert.ok(receivedUrl.includes("owner_id=eq.user-A"));
});

test("CM-006: listNotifications unreadOnly 过滤已读", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_creative_events"),
      respond: () => [
        sampleNotificationRow,
        { ...sampleNotificationRow, id: "ev-2" },
      ],
    },
    {
      match: (p) => p.includes("/rest/v1/storyflow_notification_reads"),
      respond: () => [{ event_id: "ev-1", read_at: "2026-08-14T03:00:00Z" }],
    },
  ]);
  const items = await listNotifications(fetcher, "user-A", { unreadOnly: true });
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "ev-2"); // ev-1 已读, 过滤掉
});

test("CM-006: listNotifications 缺 recipientId 抛 unauthenticated", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => listNotifications(fetcher, ""),
    (err) => err instanceof CommunityServiceError && err.code === "unauthenticated",
  );
});

test("CM-006: markNotificationRead 写入 read 表 (幂等)", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_notification_reads"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return null;
      },
    },
  ]);
  await markNotificationRead(fetcher, "ev-1", "user-A");
  assert.equal(receivedBody.user_id, "user-A");
  assert.equal(receivedBody.event_id, "ev-1");
});

test("CM-006: markNotificationRead 409 已读幂等成功", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_notification_reads"),
      respond: () => {
        const err = new Error("conflict");
        err.status = 409;
        throw err;
      },
    },
  ]);
  // 不应抛错 (幂等)
  await markNotificationRead(fetcher, "ev-1", "user-A");
});

test("CM-006: markAllNotificationsRead 批量标记已读", async () => {
  const calls = [];
  const fetcher = makeMockFetcher([
    {
      match: (p) =>
        p.includes("/rest/v1/storyflow_creative_events") && !p.includes("notification_reads"),
      respond: () => [{ id: "ev-1" }, { id: "ev-2" }, { id: "ev-3" }],
    },
    {
      match: (p) => p.includes("/rest/v1/storyflow_notification_reads"),
      respond: (p, init) => {
        if (init?.method === "POST") {
          calls.push(JSON.parse(init.body));
        }
        return [];
      },
    },
  ]);
  const result = await markAllNotificationsRead(fetcher, "user-A");
  assert.equal(result.marked, 3); // 3 条未读全部标记
  assert.equal(calls.length, 1); // 一次批量 POST
});

test("CM-006: markAllNotificationsRead 跳过已读", async () => {
  let postBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) =>
        p.includes("/rest/v1/storyflow_creative_events") && !p.includes("notification_reads"),
      respond: () => [{ id: "ev-1" }, { id: "ev-2" }],
    },
    {
      match: (p) => p.includes("/rest/v1/storyflow_notification_reads"),
      respond: (p, init) => {
        if (init?.method === "POST") {
          postBody = JSON.parse(init.body);
        }
        return [{ event_id: "ev-1" }]; // ev-1 已读
      },
    },
  ]);
  const result = await markAllNotificationsRead(fetcher, "user-A");
  assert.equal(result.marked, 1); // ev-2 未读
  assert.ok(Array.isArray(postBody));
  assert.equal(postBody.length, 1);
  assert.equal(postBody[0].event_id, "ev-2");
});

test("CM-006: sendNotification 通过 creative_events 写入", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_creative_events"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return { id: "ev-new" };
      },
    },
  ]);
  const result = await sendNotification(fetcher, {
    recipientId: "user-A",
    type: "reaction",
    actorId: "user-B",
    title: "New reaction",
    body: "user-B reacted to your publication",
    resourceType: "publication",
    resourceId: "pub-1",
    idempotencyKey: "notify:reaction:pub-1:user-B",
  });
  assert.equal(result.sent, true);
  assert.equal(result.eventId, "ev-new");
  // event_type 为 notification_<type>
  assert.equal(receivedBody.event_type, "notification_reaction");
  assert.equal(receivedBody.owner_id, "user-A");
  assert.equal(receivedBody.actor_id, "user-B");
  assert.equal(receivedBody.visibility, "private");
  assert.equal(receivedBody.idempotency_key, "notify:reaction:pub-1:user-B");
});

test("CM-006: sendNotification 缺 recipientId 抛错", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      sendNotification(fetcher, {
        recipientId: "",
        type: "comment",
        actorId: "user-B",
        title: "Hi",
        body: "body",
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

test("CM-006: sendNotification 非法 type 抛错", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      sendNotification(fetcher, {
        recipientId: "user-A",
        type: "invalid",
        actorId: "user-B",
        title: "Hi",
        body: "body",
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

// ============================================================
// 11. 通知去重 (CM-006)
// ============================================================

test("CM-006: sendNotification 幂等键去重 (ON CONFLICT)", async () => {
  // 第一次成功插入, 第二次返回 null (ON CONFLICT DO NOTHING)
  let callCount = 0;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_creative_events"),
      respond: () => {
        callCount += 1;
        return callCount === 1 ? { id: "ev-1" } : null;
      },
    },
  ]);
  const r1 = await sendNotification(fetcher, {
    recipientId: "user-A",
    type: "follow",
    actorId: "user-B",
    title: "New follow",
    body: "user-B followed you",
    idempotencyKey: "notify:follow:user-A:user-B",
  });
  const r2 = await sendNotification(fetcher, {
    recipientId: "user-A",
    type: "follow",
    actorId: "user-B",
    title: "New follow",
    body: "user-B followed you",
    idempotencyKey: "notify:follow:user-A:user-B", // 同 idempotencyKey
  });
  assert.equal(r1.sent, true);
  // 第二次返回 null (已存在), 但不报错 (幂等)
  assert.equal(r2.sent, false);
  assert.equal(r2.eventId, null);
});

// ============================================================
// 12. CM-006 通知由 RPC 内部生成 (评论创建时)
// ============================================================

test("CM-006: 评论创建时 RPC 内部自动写入通知 (CM-006)", () => {
  // 这部分由 DB 端 RPC create_comment 内部完成 (migration 中实现)
  // 这里只验证 migration 包含通知逻辑
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827050100_kiikis_21_comments.sql"),
    "utf8",
  );
  // create_comment RPC 内部写入 notification_comment 事件
  assert.ok(sql.includes("'notification_comment'"));
  assert.ok(sql.includes("notification_comment"));
});
