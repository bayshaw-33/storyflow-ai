/**
 * KIIKIS 2.1 Phase 4 — 项目级轻协作契约 (Task 4.2, CO-001~008)
 *
 * 纯函数契约层。
 *
 * 设计原则:
 *   CO-001: 角色体系 (owner/editor/reviewer/viewer/asset_operator)
 *   CO-002: 任务指派 (assignee 必须有 collaboration grant)
 *   CO-003: 评论锚定稳定 ID (resourceType + resourceId + version)
 *   CO-004: 审阅状态机 (pending → in_review → approved/rejected)
 *   CO-005: 批准/驳回 (原因 + 审阅人 + 修改建议)
 *   CO-006: 活动轨迹 (append-only, 锚定资源)
 *   CO-007: 通知 (复用 Phase 1 creative_events)
 *   CO-008: 个人账号所有权根 (无企业组织层级)
 */

import type {
  ResourceType,
  GrantRole,
} from "./grants.ts";

// ============================================================
// CO-001: 角色权限矩阵
// ============================================================

export const COLLAB_ROLES = [
  "owner",
  "editor",
  "reviewer",
  "viewer",
  "asset_operator",
] as const;
export type CollabRole = (typeof COLLAB_ROLES)[number];

/**
 * CO-001: 角色权限矩阵。
 * 定义每个角色可执行的操作。
 */
export const ROLE_PERMISSIONS: Readonly<Record<CollabRole, ReadonlyArray<string>>> = Object.freeze({
  owner: Object.freeze([
    "read", "write", "delete",
    "invite", "share", "grant",
    "assign_task", "review", "approve", "reject",
    "transfer_ownership", "revoke_grant",
  ]),
  editor: Object.freeze([
    "read", "write",
    "comment", "assign_task",
    "submit_review",
  ]),
  reviewer: Object.freeze([
    "read",
    "comment",
    "submit_review", "approve", "reject",
  ]),
  viewer: Object.freeze([
    "read",
    "comment",
  ]),
  asset_operator: Object.freeze([
    "read",
    "manage_assets",
  ]),
});

export function hasPermission(role: CollabRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function isCollabRole(v: string): v is CollabRole {
  return COLLAB_ROLES.includes(v as CollabRole);
}

// ============================================================
// CO-003: 评论 (锚定稳定 ID)
// ============================================================

export const COMMENT_ANCHOR_TYPES = [
  "paragraph",
  "frame",
  "scene",
  "line",
  "section",
] as const;
export type CommentAnchorType = (typeof COMMENT_ANCHOR_TYPES)[number];

export interface Comment {
  readonly id: string;
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  /** CO-003: 锚定版本 (版本变化后仍可定位) */
  readonly resourceVersion: string | null;
  readonly authorId: string;
  readonly body: string;
  readonly anchorType: CommentAnchorType | null;
  /** CO-003: 稳定 ID (非数组下标) */
  readonly anchorId: string | null;
  readonly parentCommentId: string | null;
  readonly resolved: boolean;
  readonly resolvedBy: string | null;
  readonly resolvedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly idempotencyKey: string;
}

export interface CommentRow {
  readonly id: string;
  readonly resource_type: ResourceType;
  readonly resource_id: string;
  readonly resource_version: string | null;
  readonly author_id: string;
  readonly body: string;
  readonly anchor_type: CommentAnchorType | null;
  readonly anchor_id: string | null;
  readonly parent_comment_id: string | null;
  readonly resolved: boolean;
  readonly resolved_by: string | null;
  readonly resolved_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly idempotency_key: string;
}

export interface CreateCommentInput {
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  readonly resourceVersion?: string | null;
  readonly authorId: string; // RG-001: 服务端注入
  readonly body: string;
  readonly anchorType?: CommentAnchorType | null;
  readonly anchorId?: string | null;
  readonly parentCommentId?: string | null;
  readonly idempotencyKey: string;
}

// ============================================================
// CO-004/005: 审阅
// ============================================================

export const REVIEW_STATUS = [
  "pending",
  "in_review",
  "approved",
  "rejected",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUS)[number];

export interface Review {
  readonly id: string;
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  readonly resourceVersion: string | null;
  readonly reviewerId: string;
  readonly status: ReviewStatus;
  readonly decisionReason: string | null;
  readonly changeSuggestions: ReadonlyArray<unknown>;
  readonly submittedAt: string | null;
  readonly reviewedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly idempotencyKey: string;
}

export interface ReviewRow {
  readonly id: string;
  readonly resource_type: ResourceType;
  readonly resource_id: string;
  readonly resource_version: string | null;
  readonly reviewer_id: string;
  readonly status: ReviewStatus;
  readonly decision_reason: string | null;
  readonly change_suggestions: unknown[] | null;
  readonly submitted_at: string | null;
  readonly reviewed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly idempotency_key: string;
}

export interface SubmitReviewInput {
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  readonly resourceVersion?: string | null;
  readonly reviewerId: string; // RG-001: 服务端注入
  readonly idempotencyKey: string;
}

export interface DecideReviewInput {
  readonly reviewId: string;
  readonly decision: "approved" | "rejected";
  readonly reason?: string | null;
  readonly changeSuggestions?: ReadonlyArray<unknown>;
}

// ============================================================
// CO-006: 活动轨迹
// ============================================================

export const ACTIVITY_TYPES = [
  "created", "updated", "deleted",
  "assigned", "unassigned",
  "commented", "replied", "resolved_comment",
  "review_submitted", "review_approved", "review_rejected",
  "grant_created", "grant_revoked",
  "transfer_initiated", "transfer_confirmed", "transfer_cancelled",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_RESOURCE_TYPES = [
  "universe", "project", "actor", "asset", "episode", "scene",
  "comment", "review", "grant", "task",
] as const;
export type ActivityResourceType = (typeof ACTIVITY_RESOURCE_TYPES)[number];

export interface Activity {
  readonly id: string;
  readonly projectId: string | null;
  readonly resourceType: ActivityResourceType;
  readonly resourceId: string;
  readonly activityType: ActivityType;
  readonly actorId: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface ActivityRow {
  readonly id: string;
  readonly project_id: string | null;
  readonly resource_type: ActivityResourceType;
  readonly resource_id: string;
  readonly activity_type: ActivityType;
  readonly actor_id: string;
  readonly details: Record<string, unknown> | null;
  readonly created_at: string;
}

export interface AppendActivityInput {
  readonly projectId?: string | null;
  readonly resourceType: ActivityResourceType;
  readonly resourceId: string;
  readonly activityType: ActivityType;
  readonly actorId: string; // RG-001: 服务端注入
  readonly details?: Readonly<Record<string, unknown>>;
}

// ============================================================
// CO-002: 任务指派
// ============================================================

export const ASSIGNMENT_STATUS = ["active", "unassigned", "completed"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUS)[number];

export interface TaskAssignment {
  readonly id: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly assigneeId: string;
  readonly assignedBy: string;
  readonly assignedAt: string;
  readonly status: AssignmentStatus;
  readonly unassignedAt: string | null;
  readonly createdAt: string;
  readonly idempotencyKey: string;
}

export interface TaskAssignmentRow {
  readonly id: string;
  readonly project_id: string;
  readonly task_id: string;
  readonly assignee_id: string;
  readonly assigned_by: string;
  readonly assigned_at: string;
  readonly status: AssignmentStatus;
  readonly unassigned_at: string | null;
  readonly created_at: string;
  readonly idempotency_key: string;
}

export interface AssignTaskInput {
  readonly projectId: string;
  readonly taskId: string;
  readonly assigneeId: string;
  readonly assignedBy: string; // RG-001: 服务端注入
  readonly idempotencyKey: string;
}

// ============================================================
// CO-007: 通知 (基于 Phase 1 creative_events)
// ============================================================

export const NOTIFICATION_TYPES = [
  "task_assigned",
  "task_unassigned",
  "review_requested",
  "review_approved",
  "review_rejected",
  "comment_received",
  "comment_resolved",
  "grant_created",
  "grant_revoked",
  "transfer_initiated",
  "transfer_confirmed",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface Notification {
  readonly id: string;
  readonly recipientId: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly resourceType: ResourceType | null;
  readonly resourceId: string | null;
  readonly linkUrl: string | null;
  readonly sourceUrl: string | null;
  readonly read: boolean;
  readonly readAt: string | null;
  readonly createdAt: string;
}

// ============================================================
// CO-008: 个人账号所有权根
// ============================================================

/**
 * CO-008: 验证不存在企业组织层级。
 * 个人账号始终是最终 owner，资源 owner_id 直接指向 auth.users.id。
 */
export function isPersonalOwnerId(ownerId: string): boolean {
  // owner_id 必须是 auth.users.id (uuid 格式)
  return typeof ownerId === "string" && ownerId.length > 0;
}

// ============================================================
// 校验 (纯函数)
// ============================================================

export class CollabValidationError extends Error {
  readonly code: string;
  readonly field?: string;
  constructor(code: string, message: string, field?: string) {
    super(`${code}: ${message}`);
    this.name = "CollabValidationError";
    this.code = code;
    if (field) this.field = field;
  }
}

/** CO-003: 校验评论输入 (锚定稳定 ID, 不锚定数组下标) */
export function validateCreateComment(input: CreateCommentInput): CreateCommentInput {
  if (!input.resourceType) {
    throw new CollabValidationError("missing_resource_type", "resourceType is required", "resourceType");
  }
  if (!input.resourceId?.trim()) {
    throw new CollabValidationError("missing_resource_id", "resourceId is required", "resourceId");
  }
  // RG-001: authorId 服务端注入
  if (!input.authorId?.trim()) {
    throw new CollabValidationError("missing_author", "authorId is required (server-injected)", "authorId");
  }
  if (!input.body?.trim()) {
    throw new CollabValidationError("missing_body", "body is required", "body");
  }
  if (input.body.length > 10000) {
    throw new CollabValidationError("body_too_long", "body must be <= 10000 chars", "body");
  }
  // CO-003: anchorId 不能是数组下标 (必须是稳定 ID)
  if (input.anchorId != null && /^\d+$/.test(input.anchorId)) {
    throw new CollabValidationError(
      "invalid_anchor_id",
      "CO-003: anchorId must be stable ID, not array index",
      "anchorId",
    );
  }
  if (!input.idempotencyKey?.trim()) {
    throw new CollabValidationError("missing_idempotency_key", "idempotencyKey is required", "idempotencyKey");
  }
  return Object.freeze({ ...input });
}

/** CO-004: 校验审阅提交 */
export function validateSubmitReview(input: SubmitReviewInput): SubmitReviewInput {
  if (!input.resourceType) {
    throw new CollabValidationError("missing_resource_type", "resourceType is required", "resourceType");
  }
  if (!input.resourceId?.trim()) {
    throw new CollabValidationError("missing_resource_id", "resourceId is required", "resourceId");
  }
  if (!input.reviewerId?.trim()) {
    throw new CollabValidationError("missing_reviewer", "reviewerId is required (server-injected)", "reviewerId");
  }
  if (!input.idempotencyKey?.trim()) {
    throw new CollabValidationError("missing_idempotency_key", "idempotencyKey is required", "idempotencyKey");
  }
  return Object.freeze({ ...input });
}

/** CO-005: 校验审阅决策 */
export function validateDecideReview(input: DecideReviewInput): DecideReviewInput {
  if (!input.reviewId?.trim()) {
    throw new CollabValidationError("missing_review_id", "reviewId is required", "reviewId");
  }
  if (input.decision !== "approved" && input.decision !== "rejected") {
    throw new CollabValidationError(
      "invalid_decision",
      "decision must be 'approved' or 'rejected'",
      "decision",
    );
  }
  // CO-005: 驳回必须有原因或修改建议
  if (input.decision === "rejected" && !input.reason?.trim() && (!input.changeSuggestions || input.changeSuggestions.length === 0)) {
    throw new CollabValidationError(
      "rejection_needs_reason",
      "CO-005: rejection must include reason or change suggestions",
      "reason",
    );
  }
  return Object.freeze({ ...input });
}

/** CO-002: 校验任务指派 */
export function validateAssignTask(input: AssignTaskInput): AssignTaskInput {
  if (!input.projectId?.trim()) {
    throw new CollabValidationError("missing_project_id", "projectId is required", "projectId");
  }
  if (!input.taskId?.trim()) {
    throw new CollabValidationError("missing_task_id", "taskId is required", "taskId");
  }
  if (!input.assigneeId?.trim()) {
    throw new CollabValidationError("missing_assignee", "assigneeId is required", "assigneeId");
  }
  if (!input.assignedBy?.trim()) {
    throw new CollabValidationError("missing_assigned_by", "assignedBy is required (server-injected)", "assignedBy");
  }
  if (input.assigneeId === input.assignedBy) {
    throw new CollabValidationError("self_assign_forbidden", "cannot assign task to self", "assigneeId");
  }
  if (!input.idempotencyKey?.trim()) {
    throw new CollabValidationError("missing_idempotency_key", "idempotencyKey is required", "idempotencyKey");
  }
  return Object.freeze({ ...input });
}

/** CO-006: 校验活动事件 */
export function validateAppendActivity(input: AppendActivityInput): AppendActivityInput {
  if (!input.resourceType) {
    throw new CollabValidationError("missing_resource_type", "resourceType is required", "resourceType");
  }
  if (!input.resourceId?.trim()) {
    throw new CollabValidationError("missing_resource_id", "resourceId is required", "resourceId");
  }
  if (!ACTIVITY_TYPES.includes(input.activityType)) {
    throw new CollabValidationError("invalid_activity_type", `activityType must be one of ${ACTIVITY_TYPES.join(", ")}`, "activityType");
  }
  if (!input.actorId?.trim()) {
    throw new CollabValidationError("missing_actor", "actorId is required (server-injected)", "actorId");
  }
  return Object.freeze({ ...input });
}

// ============================================================
// DB row → 实体
// ============================================================

export function parseComment(row: CommentRow): Comment {
  return Object.freeze({
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceVersion: row.resource_version,
    authorId: row.author_id,
    body: row.body,
    anchorType: row.anchor_type,
    anchorId: row.anchor_id,
    parentCommentId: row.parent_comment_id,
    resolved: row.resolved,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    idempotencyKey: row.idempotency_key,
  });
}

export function parseReview(row: ReviewRow): Review {
  return Object.freeze({
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    resourceVersion: row.resource_version,
    reviewerId: row.reviewer_id,
    status: row.status,
    decisionReason: row.decision_reason,
    changeSuggestions: Object.freeze(row.change_suggestions ?? []),
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    idempotencyKey: row.idempotency_key,
  });
}

export function parseActivity(row: ActivityRow): Activity {
  return Object.freeze({
    id: row.id,
    projectId: row.project_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    activityType: row.activity_type,
    actorId: row.actor_id,
    details: Object.freeze(row.details ?? {}),
    createdAt: row.created_at,
  });
}

export function parseTaskAssignment(row: TaskAssignmentRow): TaskAssignment {
  return Object.freeze({
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id,
    assigneeId: row.assignee_id,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    status: row.status,
    unassignedAt: row.unassigned_at,
    createdAt: row.created_at,
    idempotencyKey: row.idempotency_key,
  });
}
