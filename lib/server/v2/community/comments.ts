/**
 * KIIKIS 2.1 Phase 5 — 评论服务 (Task 5.2, CM-004)
 *
 * CM-004: 评论支持回复、软删除、冻结和审核证据
 *   - 创建评论: 服务端注入 authorId (CM-004 + RG-001 一致)
 *   - 软删除: deleted_at 标记, 不物理删除
 *   - 冻结: 审核员通过 freeze_comment RPC (Phase 5.3 调用)
 *   - body 内容 append-only (DB guard trigger 防御)
 *   - 幂等: idempotency_key 唯一约束
 */
import {
  parseComment,
  toCommentProjection,
  validateCreateComment,
  CommentValidationError,
  type Comment,
  type CommentProjection,
  type CommentRow,
  type CreateCommentInput,
} from "../../../contracts/v2/comments.ts";
import { CommunityServiceError, type CommunityFetcher } from "./publications.ts";

export { CommunityServiceError } from "./publications.ts";

/**
 * CM-004: 创建评论 (服务端注入 authorId)
 */
export async function createComment(
  fetcher: CommunityFetcher,
  input: CreateCommentInput,
): Promise<Comment> {
  let validated: CreateCommentInput;
  try {
    validated = validateCreateComment(input);
  } catch (err) {
    if (err instanceof CommentValidationError) {
      throw new CommunityServiceError("validation_failed", err.message, 400);
    }
    throw err;
  }

  const row = await fetcher<CommentRow>(`/rest/v1/rpc/create_comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_publication_id: validated.publicationId,
      p_parent_comment_id: validated.parentCommentId ?? null,
      p_body: validated.body,
      p_idempotency_key: validated.idempotencyKey,
    }),
  }).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err) {
      const status = (err as { status: number }).status;
      if (status === 404) {
        throw new CommunityServiceError("not_found", "publication not found", 404, err);
      }
      if (status === 403) {
        throw new CommunityServiceError("forbidden", "publication is not active", 403, err);
      }
    }
    throw new CommunityServiceError("service_unavailable", "failed to create comment", 503, err);
  });

  return parseComment(row);
}

/**
 * 列出 publication 的评论 (CM-004)
 * - 按 created_at 升序返回 (便于构建回复树)
 * - 包含已删除的 (deleted=true) 但 body 不暴露 (toCommentProjection 处理)
 */
export async function listComments(
  fetcher: CommunityFetcher,
  publicationId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<CommentProjection[]> {
  if (!publicationId) {
    throw new CommunityServiceError("validation_failed", "publicationId is required", 400);
  }
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);

  const params = new URLSearchParams();
  params.set("publication_id", `eq.${encodeURIComponent(publicationId)}`);
  params.set("order", "created_at.asc");
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const rows = await fetcher<CommentRow[]>(
    `/rest/v1/storyflow_comments?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to list comments", 503, err);
  });

  return (rows ?? []).map((r) => toCommentProjection(parseComment(r)));
}

/**
 * 获取单条评论 (CM-004)
 */
export async function getComment(
  fetcher: CommunityFetcher,
  commentId: string,
): Promise<Comment | null> {
  if (!commentId) {
    throw new CommunityServiceError("validation_failed", "commentId is required", 400);
  }
  const row = await fetcher<CommentRow | null>(
    `/rest/v1/storyflow_comments?id=eq.${encodeURIComponent(commentId)}&limit=1`,
    { headers: { Accept: "application/vnd.pgrst.object+json" } },
  ).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err && err.status === 406) return null;
    throw new CommunityServiceError("service_unavailable", "failed to fetch comment", 503, err);
  });
  return row ? parseComment(row) : null;
}

/**
 * CM-004: 软删除评论 (只能 author 自己删除)
 * - 不物理删除, 标记 deleted_at
 * - 调用 RPC soft_delete_comment
 */
export async function softDeleteComment(
  fetcher: CommunityFetcher,
  commentId: string,
  reason?: string,
): Promise<Comment> {
  if (!commentId) {
    throw new CommunityServiceError("validation_failed", "commentId is required", 400);
  }
  const row = await fetcher<CommentRow>(`/rest/v1/rpc/soft_delete_comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_comment_id: commentId,
      p_reason: reason ?? null,
    }),
  }).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err) {
      const status = (err as { status: number }).status;
      if (status === 404) {
        throw new CommunityServiceError("not_found", `comment ${commentId} not found`, 404, err);
      }
      if (status === 403) {
        throw new CommunityServiceError(
          "forbidden",
          "only author can soft delete comment",
          403,
          err,
        );
      }
    }
    throw new CommunityServiceError("service_unavailable", "failed to soft delete comment", 503, err);
  });
  return parseComment(row);
}

/**
 * CM-004: 冻结评论 (审核员, Phase 5.3 moderation 服务调用)
 * - 标记 frozen_at + frozen_by + frozen_reason + moderation_id
 * - 调用 RPC freeze_comment
 */
export async function freezeComment(
  fetcher: CommunityFetcher,
  params: {
    commentId: string;
    reason: string;
    moderatorId?: string | null;
    moderationId?: string | null;
  },
): Promise<Comment> {
  if (!params.commentId) {
    throw new CommunityServiceError("validation_failed", "commentId is required", 400);
  }
  if (!params.reason?.trim()) {
    throw new CommunityServiceError("validation_failed", "reason is required", 400);
  }
  const row = await fetcher<CommentRow>(`/rest/v1/rpc/freeze_comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_comment_id: params.commentId,
      p_reason: params.reason,
      p_moderator_id: params.moderatorId ?? null,
      p_moderation_id: params.moderationId ?? null,
    }),
  }).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err) {
      const status = (err as { status: number }).status;
      if (status === 404) {
        throw new CommunityServiceError("not_found", `comment ${params.commentId} not found`, 404, err);
      }
    }
    throw new CommunityServiceError("service_unavailable", "failed to freeze comment", 503, err);
  });
  return parseComment(row);
}

/**
 * CM-004: 解冻评论 (Phase 5.3 moderation 服务调用)
 */
export async function unfreezeComment(
  fetcher: CommunityFetcher,
  commentId: string,
  reason?: string,
): Promise<Comment> {
  if (!commentId) {
    throw new CommunityServiceError("validation_failed", "commentId is required", 400);
  }
  const row = await fetcher<CommentRow>(`/rest/v1/rpc/unfreeze_comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_comment_id: commentId,
      p_reason: reason ?? null,
    }),
  }).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to unfreeze comment", 503, err);
  });
  return parseComment(row);
}
