/**
 * KIIKIS 2.1 Phase 5 — 评论契约 (Task 5.2, CM-004)
 *
 * 纯函数契约层。
 *
 * 设计原则:
 *   CM-004: 评论支持回复、软删除、冻结和审核证据
 *     - 评论锚定 publication_id + parent_comment_id (回复层级)
 *     - 软删除: deleted_at 标记, 不物理删除
 *     - 冻结: frozen_by + frozen_reason (审核冻结)
 *     - 审核证据: moderation_id 关联 Phase 5.3 moderation queue
 *     - body 内容 append-only (创建后不可修改, 只能软删除)
 */

// ============================================================
// 常量
// ============================================================

export const COMMENT_BODY_MAX = 2000;

// ============================================================
// Comment (CM-004)
// ============================================================

export interface Comment {
  readonly id: string;
  readonly publicationId: string;
  readonly parentCommentId: string | null;
  readonly authorId: string;
  readonly body: string;
  readonly deletedAt: string | null;
  readonly deletedBy: string | null;
  readonly frozenAt: string | null;
  readonly frozenBy: string | null;
  readonly frozenReason: string | null;
  readonly moderationId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly idempotencyKey: string;
}

export interface CommentRow {
  readonly id: string;
  readonly publication_id: string;
  readonly parent_comment_id: string | null;
  readonly author_id: string;
  readonly body: string;
  readonly deleted_at: string | null;
  readonly deleted_by: string | null;
  readonly frozen_at: string | null;
  readonly frozen_by: string | null;
  readonly frozen_reason: string | null;
  readonly moderation_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly idempotency_key: string;
}

export interface CreateCommentInput {
  readonly publicationId: string;
  readonly parentCommentId?: string | null;
  readonly authorId: string;
  readonly body: string;
  readonly idempotencyKey: string;
}

/**
 * 评论投影 (CM-004: 不暴露 author 私有信息)
 * - 列表/树形结构用
 */
export interface CommentProjection {
  readonly id: string;
  readonly publicationId: string;
  readonly parentCommentId: string | null;
  readonly authorId: string;
  readonly body: string;
  readonly deleted: boolean;
  readonly frozen: boolean;
  readonly frozenReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ============================================================
// 通知 (CM-006, 复用 Phase 1 creative_events)
// ============================================================

export const COMMUNITY_NOTIFICATION_TYPES = [
  "follow",
  "comment",
  "reaction",
  "apply_use",
  "moderation_result",
  "moderation_freeze",
] as const;
export type CommunityNotificationType = (typeof COMMUNITY_NOTIFICATION_TYPES)[number];

export interface CommunityNotification {
  readonly id: string;
  readonly recipientId: string;
  readonly type: CommunityNotificationType;
  readonly actorId: string | null;
  readonly title: string;
  readonly body: string;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly linkUrl: string | null;
  readonly sourceUrl: string | null;
  readonly read: boolean;
  readonly readAt: string | null;
  readonly createdAt: string;
}

export interface CommunityNotificationRow {
  readonly id: string;
  readonly owner_id: string;
  readonly event_type: string;
  readonly actor_type: string;
  readonly actor_id: string | null;
  readonly payload: {
    readonly title?: string;
    readonly body?: string;
    readonly resource_type?: string | null;
    readonly resource_id?: string | null;
    readonly link_url?: string | null;
    readonly source_url?: string | null;
    readonly linkUrl?: string | null;
    readonly sourceUrl?: string | null;
    readonly [k: string]: unknown;
  } | null;
  readonly created_at: string;
  readonly read_at?: string | null;
}

// ============================================================
// 校验 (纯函数)
// ============================================================

export class CommentValidationError extends Error {
  readonly code: string;
  readonly field?: string;
  constructor(code: string, message: string, field?: string) {
    super(`${code}: ${message}`);
    this.name = "CommentValidationError";
    this.code = code;
    if (field) this.field = field;
  }
}

export function isCommunityNotificationType(v: string): v is CommunityNotificationType {
  return COMMUNITY_NOTIFICATION_TYPES.includes(v as CommunityNotificationType);
}

/** CM-004: 校验评论创建输入 */
export function validateCreateComment(input: CreateCommentInput): CreateCommentInput {
  if (!input.publicationId?.trim()) {
    throw new CommentValidationError(
      "missing_publication",
      "publicationId is required",
      "publicationId",
    );
  }
  if (!input.authorId?.trim()) {
    throw new CommentValidationError(
      "missing_author",
      "authorId is required (server-injected)",
      "authorId",
    );
  }
  if (!input.body?.trim()) {
    throw new CommentValidationError("missing_body", "body is required", "body");
  }
  if (input.body.length > COMMENT_BODY_MAX) {
    throw new CommentValidationError(
      "body_too_long",
      `body must be <= ${COMMENT_BODY_MAX} chars`,
      "body",
    );
  }
  if (!input.idempotencyKey?.trim()) {
    throw new CommentValidationError(
      "missing_idempotency_key",
      "idempotencyKey is required",
      "idempotencyKey",
    );
  }
  return Object.freeze({ ...input });
}

// ============================================================
// DB row → 实体
// ============================================================

export function parseComment(row: CommentRow): Comment {
  return Object.freeze({
    id: row.id,
    publicationId: row.publication_id,
    parentCommentId: row.parent_comment_id,
    authorId: row.author_id,
    body: row.body,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    frozenAt: row.frozen_at,
    frozenBy: row.frozen_by,
    frozenReason: row.frozen_reason,
    moderationId: row.moderation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    idempotencyKey: row.idempotency_key,
  });
}

/** CM-004: 转换为投影 (不暴露 deleted_by/frozen_by) */
export function toCommentProjection(c: Comment): CommentProjection {
  return Object.freeze({
    id: c.id,
    publicationId: c.publicationId,
    parentCommentId: c.parentCommentId,
    authorId: c.authorId,
    body: c.deletedAt ? "" : c.body, // CM-004: 软删除后不暴露 body
    deleted: c.deletedAt !== null,
    frozen: c.frozenAt !== null,
    frozenReason: c.frozenReason,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  });
}

/** CM-006: DB row → 通知 */
export function parseNotification(row: CommunityNotificationRow): CommunityNotification {
  const eventType = row.event_type;
  // event_type 形如 "notification_comment" / "notification_follow"
  const typeStr = eventType.startsWith("notification_")
    ? eventType.slice("notification_".length)
    : eventType;
  const type = isCommunityNotificationType(typeStr) ? typeStr : "comment";
  const resourceType = row.payload?.resource_type ?? null;
  const resourceId = row.payload?.resource_id ?? null;
  const linkUrl =
    row.payload?.link_url ??
    row.payload?.linkUrl ??
    (resourceType === "publication" && resourceId
      ? `/community/${encodeURIComponent(resourceId)}`
      : null);
  return Object.freeze({
    id: row.id,
    recipientId: row.owner_id,
    type,
    actorId: row.actor_id,
    title: row.payload?.title ?? "",
    body: row.payload?.body ?? "",
    resourceType,
    resourceId,
    linkUrl,
    sourceUrl: row.payload?.source_url ?? row.payload?.sourceUrl ?? null,
    read: row.read_at !== null && row.read_at !== undefined,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
  });
}
