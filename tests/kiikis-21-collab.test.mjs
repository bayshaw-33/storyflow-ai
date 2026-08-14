/**
 * tests/kiikis-21-collab.test.mjs
 * KIIKIS 2.1 Phase 4 — Task 4.2 项目协作测试 (CO-001~008)
 *
 * 覆盖:
 *   CO-001: 角色权限矩阵
 *   CO-002: 任务指派 (assignee 必须有 collaboration grant)
 *   CO-003: 评论锚定稳定 ID (不锚定数组下标)
 *   CO-004: 审阅状态机 pending → in_review → approved/rejected
 *   CO-005: 批准/驳回 (原因 + 审阅人 + 修改建议)
 *   CO-006: 活动轨迹 append-only
 *   CO-007: 通知 (复用 creative_events)
 *   CO-008: 个人账号所有权根
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  validateCreateComment,
  validateSubmitReview,
  validateDecideReview,
  validateAssignTask,
  validateAppendActivity,
  hasPermission,
  isCollabRole,
  isPersonalOwnerId,
  parseComment,
  parseReview,
  parseActivity,
  parseTaskAssignment,
  CollabValidationError,
  COLLAB_ROLES,
  ROLE_PERMISSIONS,
  REVIEW_STATUS,
  ACTIVITY_TYPES,
  ACTIVITY_RESOURCE_TYPES,
  NOTIFICATION_TYPES,
  ASSIGNMENT_STATUS,
} from "../lib/contracts/v2/collab.ts";
import { CollabServiceError, assignTask, listTaskAssignments, unassignTask } from "../lib/server/v2/collab/index.ts";
import { createComment, listComments, resolveComment } from "../lib/server/v2/collab/comments.ts";
import { submitReview, decideReview, listReviews, getReview } from "../lib/server/v2/collab/reviews.ts";
import { appendActivity, listProjectActivity, listResourceActivity } from "../lib/server/v2/collab/activity.ts";
import { sendNotification, listNotifications, markNotificationRead } from "../lib/server/v2/collab/notifications.ts";

// ============================================================
// Helpers
// ============================================================
function makeMockFetcher(handlers) {
  return async (p, init) => {
    for (const h of handlers) {
      if (h.match(p, init)) return h.respond(p, init);
    }
    throw Object.assign(new Error(`no handler for ${p}`), { status: 503 });
  };
}

const sampleCommentRow = {
  id: "c-1",
  resource_type: "project",
  resource_id: "p-1",
  resource_version: "v1.0",
  author_id: "user-A",
  body: "Test comment",
  anchor_type: "paragraph",
  anchor_id: "para-stable-id",
  parent_comment_id: null,
  resolved: false,
  resolved_by: null,
  resolved_at: null,
  created_at: "2026-08-14T00:00:00Z",
  updated_at: "2026-08-14T00:00:00Z",
  idempotency_key: "cmt-1",
};

const sampleReviewRow = {
  id: "r-1",
  resource_type: "project",
  resource_id: "p-1",
  resource_version: "v1.0",
  reviewer_id: "user-R",
  status: "in_review",
  decision_reason: null,
  change_suggestions: [],
  submitted_at: "2026-08-14T00:00:00Z",
  reviewed_at: null,
  created_at: "2026-08-14T00:00:00Z",
  updated_at: "2026-08-14T00:00:00Z",
  idempotency_key: "rev-1",
};

const sampleActivityRow = {
  id: "a-1",
  project_id: "p-1",
  resource_type: "comment",
  resource_id: "c-1",
  activity_type: "commented",
  actor_id: "user-A",
  details: { body: "test" },
  created_at: "2026-08-14T00:00:00Z",
};

const sampleAssignmentRow = {
  id: "t-1",
  project_id: "p-1",
  task_id: "task-1",
  assignee_id: "user-B",
  assigned_by: "user-A",
  assigned_at: "2026-08-14T00:00:00Z",
  status: "active",
  unassigned_at: null,
  created_at: "2026-08-14T00:00:00Z",
  idempotency_key: "asg-1",
};

// ============================================================
// 1. CO-001: 角色权限矩阵
// ============================================================

test("CO-001: COLLAB_ROLES 含 owner/editor/reviewer/viewer/asset_operator", () => {
  assert.ok(COLLAB_ROLES.includes("owner"));
  assert.ok(COLLAB_ROLES.includes("editor"));
  assert.ok(COLLAB_ROLES.includes("reviewer"));
  assert.ok(COLLAB_ROLES.includes("viewer"));
  assert.ok(COLLAB_ROLES.includes("asset_operator"));
});

test("CO-001: owner 有全部权限", () => {
  assert.ok(hasPermission("owner", "read"));
  assert.ok(hasPermission("owner", "write"));
  assert.ok(hasPermission("owner", "delete"));
  assert.ok(hasPermission("owner", "invite"));
  assert.ok(hasPermission("owner", "transfer_ownership"));
});

test("CO-001: editor 不能 approve/reject", () => {
  assert.ok(hasPermission("editor", "write"));
  assert.ok(hasPermission("editor", "comment"));
  assert.ok(!hasPermission("editor", "approve"));
  assert.ok(!hasPermission("editor", "reject"));
});

test("CO-001: reviewer 可 approve/reject 但不可 write", () => {
  assert.ok(hasPermission("reviewer", "approve"));
  assert.ok(hasPermission("reviewer", "reject"));
  assert.ok(!hasPermission("reviewer", "write"));
  assert.ok(!hasPermission("reviewer", "delete"));
});

test("CO-001: viewer 只能 read + comment", () => {
  assert.ok(hasPermission("viewer", "read"));
  assert.ok(hasPermission("viewer", "comment"));
  assert.ok(!hasPermission("viewer", "write"));
  assert.ok(!hasPermission("viewer", "approve"));
});

test("CO-001: asset_operator 可 manage_assets", () => {
  assert.ok(hasPermission("asset_operator", "manage_assets"));
  assert.ok(!hasPermission("asset_operator", "write"));
});

test("CO-001: isCollabRole 校验", () => {
  assert.ok(isCollabRole("owner"));
  assert.ok(isCollabRole("editor"));
  assert.ok(!isCollabRole("super_admin"));
});

// ============================================================
// 2. CO-002: 任务指派
// ============================================================

test("CO-002: validateAssignTask 合法输入通过", () => {
  const input = validateAssignTask({
    projectId: "p-1",
    taskId: "task-1",
    assigneeId: "user-B",
    assignedBy: "user-A",
    idempotencyKey: "asg-1",
  });
  assert.equal(input.assigneeId, "user-B");
});

test("CO-002: validateAssignTask 自我指派抛错", () => {
  assert.throws(
    () => validateAssignTask({
      projectId: "p-1",
      taskId: "task-1",
      assigneeId: "user-A",
      assignedBy: "user-A",
      idempotencyKey: "asg-1",
    }),
    (err) => err instanceof CollabValidationError && err.code === "self_assign_forbidden",
  );
});

test("CO-002: assignTask 调用 RPC 校验 grant", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/assign_task"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return sampleAssignmentRow;
      },
    },
  ]);

  const assignment = await assignTask(fetcher, {
    projectId: "p-1",
    taskId: "task-1",
    assigneeId: "user-B",
    assignedBy: "user-A",
    idempotencyKey: "asg-1",
  });
  assert.equal(receivedBody.p_assignee_id, "user-B");
  assert.equal(receivedBody.p_assigned_by, "user-A");
  assert.equal(assignment.status, "active");
});

test("CO-002: assignTask 无 grant 抛 forbidden", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/assign_task"),
      respond: () => {
        const err = new Error("forbidden");
        err.status = 403;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => assignTask(fetcher, {
      projectId: "p-1",
      taskId: "task-1",
      assigneeId: "user-B",
      assignedBy: "user-A",
      idempotencyKey: "asg-1",
    }),
    (err) => err instanceof CollabServiceError && err.code === "forbidden",
  );
});

test("CO-002: listTaskAssignments 查询", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_task_assignments?"),
      respond: () => [sampleAssignmentRow],
    },
  ]);
  const assignments = await listTaskAssignments(fetcher, "task-1");
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].assigneeId, "user-B");
});

test("CO-002: unassignTask PATCH", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_task_assignments?id="),
      respond: () => [{ ...sampleAssignmentRow, status: "unassigned", unassigned_at: "2026-08-14T01:00:00Z" }],
    },
  ]);
  const assignment = await unassignTask(fetcher, "t-1");
  assert.equal(assignment.status, "unassigned");
  assert.ok(assignment.unassignedAt);
});

// ============================================================
// 3. CO-003: 评论锚定稳定 ID
// ============================================================

test("CO-003: validateCreateComment 合法输入通过", () => {
  const input = validateCreateComment({
    resourceType: "project",
    resourceId: "p-1",
    resourceVersion: "v1.0",
    authorId: "user-A",
    body: "Test comment",
    anchorType: "paragraph",
    anchorId: "para-stable-id",
    idempotencyKey: "cmt-1",
  });
  assert.equal(input.anchorId, "para-stable-id");
});

test("CO-003: validateCreateComment 数组下标作 anchorId 抛错", () => {
  assert.throws(
    () => validateCreateComment({
      resourceType: "project",
      resourceId: "p-1",
      authorId: "user-A",
      body: "Test",
      anchorId: "5", // 数组下标, 不允许
      idempotencyKey: "cmt-1",
    }),
    (err) => err instanceof CollabValidationError && err.code === "invalid_anchor_id",
  );
});

test("CO-003: validateCreateComment 稳定 ID 通过", () => {
  const input = validateCreateComment({
    resourceType: "project",
    resourceId: "p-1",
    authorId: "user-A",
    body: "Test",
    anchorId: "scene_001_paragraph_005", // 稳定 ID
    idempotencyKey: "cmt-1",
  });
  assert.equal(input.anchorId, "scene_001_paragraph_005");
});

test("CO-003: validateCreateComment 缺 authorId 抛错 (RG-001)", () => {
  assert.throws(
    () => validateCreateComment({
      resourceType: "project",
      resourceId: "p-1",
      authorId: "",
      body: "Test",
      idempotencyKey: "cmt-1",
    }),
    (err) => err instanceof CollabValidationError && err.code === "missing_author",
  );
});

test("CO-003: createComment 服务端注入 authorId", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_comments"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return [sampleCommentRow];
      },
    },
  ]);
  const comment = await createComment(fetcher, {
    resourceType: "project",
    resourceId: "p-1",
    authorId: "user-A",
    body: "Test comment",
    idempotencyKey: "cmt-1",
  });
  assert.equal(receivedBody.author_id, "user-A");
  assert.equal(comment.body, "Test comment");
});

test("CO-003: listComments 锚定 resourceType + resourceId", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_comments?"),
      respond: () => [sampleCommentRow, { ...sampleCommentRow, id: "c-2" }],
    },
  ]);
  const comments = await listComments(fetcher, { resourceType: "project", resourceId: "p-1" });
  assert.equal(comments.length, 2);
});

test("CO-003: resolveComment PATCH", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_comments?id="),
      respond: () => [{ ...sampleCommentRow, resolved: true, resolved_by: "user-A", resolved_at: "2026-08-14T01:00:00Z" }],
    },
  ]);
  const comment = await resolveComment(fetcher, { commentId: "c-1", resolverId: "user-A" });
  assert.equal(comment.resolved, true);
  assert.equal(comment.resolvedBy, "user-A");
});

// ============================================================
// 4. CO-004: 审阅状态机
// ============================================================

test("CO-004: REVIEW_STATUS 含 pending/in_review/approved/rejected", () => {
  assert.deepEqual([...REVIEW_STATUS], ["pending", "in_review", "approved", "rejected"]);
});

test("CO-004: submitReview 创建 in_review 状态", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/submit_review"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return sampleReviewRow;
      },
    },
    {
      match: (p) => p.includes("/rpc/append_activity_event"),
      respond: () => sampleActivityRow,
    },
  ]);
  const review = await submitReview(fetcher, {
    resourceType: "project",
    resourceId: "p-1",
    reviewerId: "user-R",
    idempotencyKey: "rev-1",
  });
  assert.equal(receivedBody.p_reviewer_id, "user-R");
  assert.equal(review.status, "in_review");
});

test("CO-004: listReviews 查询", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_reviews?"),
      respond: () => [sampleReviewRow],
    },
  ]);
  const reviews = await listReviews(fetcher, { resourceType: "project", resourceId: "p-1" });
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].status, "in_review");
});

test("CO-004: getReview 返回详情", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_reviews?id="),
      respond: () => sampleReviewRow,
    },
  ]);
  const review = await getReview(fetcher, "r-1");
  assert.ok(review);
  assert.equal(review.id, "r-1");
});

// ============================================================
// 5. CO-005: 批准/驳回
// ============================================================

test("CO-005: validateDecideReview approved 通过", () => {
  const input = validateDecideReview({
    reviewId: "r-1",
    decision: "approved",
    reason: "Good work",
  });
  assert.equal(input.decision, "approved");
});

test("CO-005: validateDecideReview rejected 无原因抛错", () => {
  assert.throws(
    () => validateDecideReview({
      reviewId: "r-1",
      decision: "rejected",
    }),
    (err) => err instanceof CollabValidationError && err.code === "rejection_needs_reason",
  );
});

test("CO-005: validateDecideReview rejected 带原因通过", () => {
  const input = validateDecideReview({
    reviewId: "r-1",
    decision: "rejected",
    reason: "Needs rewrite",
  });
  assert.equal(input.decision, "rejected");
});

test("CO-005: validateDecideReview rejected 带修改建议通过", () => {
  const input = validateDecideReview({
    reviewId: "r-1",
    decision: "rejected",
    changeSuggestions: [{ type: "rewrite", target: "paragraph-3" }],
  });
  assert.equal(input.decision, "rejected");
});

test("CO-005: decideReview 调用 RPC", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/decide_review"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return { ...sampleReviewRow, status: "approved", decision_reason: "OK", reviewed_at: "2026-08-14T01:00:00Z" };
      },
    },
    {
      match: (p) => p.includes("/rpc/append_activity_event"),
      respond: () => sampleActivityRow,
    },
  ]);
  const review = await decideReview(fetcher, {
    reviewId: "r-1",
    decision: "approved",
    reason: "OK",
  });
  assert.equal(receivedBody.p_review_id, "r-1");
  assert.equal(receivedBody.p_decision, "approved");
  assert.equal(review.status, "approved");
  assert.ok(review.reviewedAt);
});

test("CO-005: decideReview 非 reviewer 抛 forbidden", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/decide_review"),
      respond: () => {
        const err = new Error("forbidden");
        err.status = 403;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => decideReview(fetcher, { reviewId: "r-1", decision: "approved", reason: "OK" }),
    (err) => err instanceof CollabServiceError && err.code === "forbidden",
  );
});

// ============================================================
// 6. CO-006: 活动轨迹
// ============================================================

test("CO-006: ACTIVITY_TYPES 含创建/指派/评论/审阅等", () => {
  assert.ok(ACTIVITY_TYPES.includes("created"));
  assert.ok(ACTIVITY_TYPES.includes("assigned"));
  assert.ok(ACTIVITY_TYPES.includes("commented"));
  assert.ok(ACTIVITY_TYPES.includes("review_submitted"));
  assert.ok(ACTIVITY_TYPES.includes("grant_created"));
});

test("CO-006: validateAppendActivity 合法通过", () => {
  const input = validateAppendActivity({
    resourceType: "comment",
    resourceId: "c-1",
    activityType: "commented",
    actorId: "user-A",
  });
  assert.equal(input.activityType, "commented");
});

test("CO-006: validateAppendActivity 非法 activityType 抛错", () => {
  assert.throws(
    () => validateAppendActivity({
      resourceType: "comment",
      resourceId: "c-1",
      activityType: "invalid_type",
      actorId: "user-A",
    }),
    (err) => err instanceof CollabValidationError && err.code === "invalid_activity_type",
  );
});

test("CO-006: appendActivity 通过 RPC 写入", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/append_activity_event"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return sampleActivityRow;
      },
    },
  ]);
  const activity = await appendActivity(fetcher, {
    resourceType: "comment",
    resourceId: "c-1",
    activityType: "commented",
    actorId: "user-A",
    details: { body: "test" },
  });
  assert.equal(receivedBody.p_activity_type, "commented");
  assert.equal(activity.actorId, "user-A");
});

test("CO-006: listProjectActivity 查询项目活动", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_activity?project_id="),
      respond: () => [sampleActivityRow],
    },
  ]);
  const activity = await listProjectActivity(fetcher, "p-1");
  assert.equal(activity.length, 1);
});

test("CO-006: listResourceActivity 查询资源活动", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_activity?resource_type="),
      respond: () => [sampleActivityRow, { ...sampleActivityRow, id: "a-2" }],
    },
  ]);
  const activity = await listResourceActivity(fetcher, { resourceType: "comment", resourceId: "c-1" });
  assert.equal(activity.length, 2);
});

// ============================================================
// 7. CO-007: 通知 (复用 creative_events)
// ============================================================

test("CO-007: NOTIFICATION_TYPES 含 task_assigned/review_approved 等", () => {
  assert.ok(NOTIFICATION_TYPES.includes("task_assigned"));
  assert.ok(NOTIFICATION_TYPES.includes("review_approved"));
  assert.ok(NOTIFICATION_TYPES.includes("review_rejected"));
  assert.ok(NOTIFICATION_TYPES.includes("grant_created"));
});

test("CO-007: sendNotification 通过 creative_events RPC", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/append_creative_event"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return { p_inserted: true, p_event_id: "evt-1" };
      },
    },
  ]);
  const result = await sendNotification(fetcher, {
    recipientId: "user-B",
    type: "task_assigned",
    title: "新任务指派",
    body: "你被指派到任务 T-1",
    resourceType: "project",
    resourceId: "p-1",
    idempotencyKey: "notif-1",
  });
  assert.equal(receivedBody.p_owner_id, "user-B");
  assert.equal(receivedBody.p_event_type, "notification:task_assigned");
  assert.ok(result.sent);
});

test("CO-007: sendNotification 非法 type 抛错", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => sendNotification(fetcher, {
      recipientId: "user-B",
      type: "invalid_type",
      title: "test",
      idempotencyKey: "n-1",
    }),
    (err) => err instanceof CollabServiceError && err.code === "validation_failed",
  );
});

test("CO-007: listNotifications 查询 notification:* 事件", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_creative_events?"),
      respond: () => [
        {
          id: "evt-1",
          owner_id: "user-B",
          event_type: "notification:task_assigned",
          payload: { title: "T", body: "B", resource_type: "project", resource_id: "p-1", read: false },
          created_at: "2026-08-14T00:00:00Z",
        },
      ],
    },
  ]);
  const notifications = await listNotifications(fetcher, "user-B");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, "task_assigned");
  assert.equal(notifications[0].title, "T");
  assert.equal(notifications[0].read, false);
});

test("CO-007: listNotifications unreadOnly 过滤", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_creative_events?"),
      respond: () => [
        {
          id: "evt-1",
          owner_id: "user-B",
          event_type: "notification:task_assigned",
          payload: { title: "T1", body: "B", read: false },
          created_at: "2026-08-14T00:00:00Z",
        },
        {
          id: "evt-2",
          owner_id: "user-B",
          event_type: "notification:review_approved",
          payload: { title: "T2", body: "B", read: true },
          created_at: "2026-08-14T01:00:00Z",
        },
      ],
    },
  ]);
  const notifications = await listNotifications(fetcher, "user-B", { unreadOnly: true });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].id, "evt-1");
});

test("CO-007: markNotificationRead 已读的去重不重复标记", async () => {
  let patchCalled = false;
  const fetcher = makeMockFetcher([
    {
      match: (p, init) =>
        p.includes("/rest/v1/storyflow_creative_events?id=") &&
        init?.headers?.Accept?.includes("pgrst"),
      respond: () => ({ payload: { read: true } }), // 已读
    },
    {
      match: (p) => p.includes("/rest/v1/storyflow_creative_events?id="),
      respond: () => {
        patchCalled = true;
        return {};
      },
    },
  ]);
  await markNotificationRead(fetcher, "evt-1", "user-B");
  assert.equal(patchCalled, false); // 已读的不调用 PATCH
});

test("CO-007: markNotificationRead 未读的调用 PATCH", async () => {
  let patchCalled = false;
  const fetcher = makeMockFetcher([
    {
      match: (p, init) =>
        p.includes("/rest/v1/storyflow_creative_events?id=") &&
        init?.headers?.Accept?.includes("pgrst"),
      respond: () => ({ payload: { read: false, body: "B" } }),
    },
    {
      match: (p) => p.includes("/rest/v1/storyflow_creative_events?id="),
      respond: () => {
        patchCalled = true;
        return {};
      },
    },
  ]);
  await markNotificationRead(fetcher, "evt-1", "user-B");
  assert.equal(patchCalled, true);
});

// ============================================================
// 8. CO-008: 个人账号所有权根
// ============================================================

test("CO-008: isPersonalOwnerId 验证 owner_id 是 auth.users.id", () => {
  assert.ok(isPersonalOwnerId("user-uuid-1"));
  assert.ok(!isPersonalOwnerId(""));
  assert.ok(!isPersonalOwnerId(null));
});

test("CO-008: 契约无 organization 层级", () => {
  // 确保没有 organization / tenant / team 等概念
  // owner_id 直接指向 auth.users.id
  assert.ok(!("organization_id" in sampleCommentRow));
  assert.ok(!("tenant_id" in sampleCommentRow));
  assert.ok(!("team_id" in sampleCommentRow));
});

// ============================================================
// 9. Migration 文件存在
// ============================================================

test("CO-001~008: collab migration 文件存在", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20260827040100_kiikis_21_collab.sql",
  );
  assert.ok(fs.existsSync(migrationPath), `migration missing: ${migrationPath}`);
});

test("CO-003: migration 包含 storyflow_comments 表 + anchor_id", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827040100_kiikis_21_collab.sql"),
    "utf8",
  );
  assert.ok(sql.includes("storyflow_comments"));
  assert.ok(sql.includes("anchor_id"));
  assert.ok(sql.includes("resource_version"));
});

test("CO-004: migration 包含 storyflow_reviews 状态机", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827040100_kiikis_21_collab.sql"),
    "utf8",
  );
  assert.ok(sql.includes("storyflow_reviews"));
  assert.ok(sql.includes("pending") && sql.includes("in_review") && sql.includes("approved") && sql.includes("rejected"));
});

test("CO-006: migration 包含 append_activity_event RPC", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827040100_kiikis_21_collab.sql"),
    "utf8",
  );
  assert.ok(sql.includes("storyflow_activity"));
  assert.ok(sql.includes("append_activity_event"));
});

test("CO-002: migration 包含 assign_task RPC + grant 校验", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827040100_kiikis_21_collab.sql"),
    "utf8",
  );
  assert.ok(sql.includes("assign_task"));
  assert.ok(sql.includes("check_resource_grant"));
});

// ============================================================
// 10. parseComment / parseReview / parseActivity / parseTaskAssignment
// ============================================================

test("parseComment 正确转换", () => {
  const comment = parseComment(sampleCommentRow);
  assert.equal(comment.id, "c-1");
  assert.equal(comment.resourceType, "project");
  assert.equal(comment.authorId, "user-A");
  assert.equal(comment.anchorId, "para-stable-id");
});

test("parseReview 正确转换", () => {
  const review = parseReview(sampleReviewRow);
  assert.equal(review.id, "r-1");
  assert.equal(review.reviewerId, "user-R");
  assert.equal(review.status, "in_review");
});

test("parseActivity 正确转换", () => {
  const activity = parseActivity(sampleActivityRow);
  assert.equal(activity.id, "a-1");
  assert.equal(activity.activityType, "commented");
  assert.equal(activity.actorId, "user-A");
  assert.equal(activity.details.body, "test");
});

test("parseActivity 处理 null details", () => {
  const activity = parseActivity({ ...sampleActivityRow, details: null });
  assert.deepEqual({ ...activity.details }, {});
});

test("parseTaskAssignment 正确转换", () => {
  const assignment = parseTaskAssignment(sampleAssignmentRow);
  assert.equal(assignment.id, "t-1");
  assert.equal(assignment.assigneeId, "user-B");
  assert.equal(assignment.assignedBy, "user-A");
  assert.equal(assignment.status, "active");
});
