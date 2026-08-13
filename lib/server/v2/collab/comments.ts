/**
 * KIIKIS 2.1 Phase 4 — 评论服务 (Task 4.2, CO-003)
 *
 * CO-003: 评论锚定 resourceType + resourceId + version, 不锚定数组下标。
 */
import {
  parseComment,
  validateCreateComment,
  CollabValidationError,
  type CreateCommentInput,
  type Comment,
  type CommentRow,
} from "../../../contracts/v2/collab.ts";
import { CollabServiceError } from "./index.ts";

export type CollabFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

/** 创建评论 (CO-003: 锚定稳定 ID) */
export async function createComment(
  fetcher: CollabFetcher,
  input: CreateCommentInput,
): Promise<Comment> {
  let validated: CreateCommentInput;
  try {
    validated = validateCreateComment(input);
  } catch (err) {
    if (err instanceof CollabValidationError) {
      throw new CollabServiceError("validation_failed", err.message, 400);
    }
    throw err;
  }

  const rows = await fetcher<CommentRow[]>(
    `/rest/v1/storyflow_comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        resource_type: validated.resourceType,
        resource_id: validated.resourceId,
        resource_version: validated.resourceVersion ?? null,
        author_id: validated.authorId,
        body: validated.body,
        anchor_type: validated.anchorType ?? null,
        anchor_id: validated.anchorId ?? null,
        parent_comment_id: validated.parentCommentId ?? null,
        resolved: false,
        idempotency_key: validated.idempotencyKey,
      }),
    },
  ).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err && err.status === 409) {
      throw new CollabServiceError("idempotent_skip", "comment already exists", 409, err);
    }
    throw new CollabServiceError("service_unavailable", "failed to create comment", 503, err);
  });

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) {
    throw new CollabServiceError("service_unavailable", "comment creation returned no row", 503);
  }
  return parseComment(row);
}

/** 列出资源的评论 (CO-003: 锚定 resourceType + resourceId) */
export async function listComments(
  fetcher: CollabFetcher,
  params: { resourceType: string; resourceId: string; resourceVersion?: string },
): Promise<Comment[]> {
  const p = new URLSearchParams();
  p.set("resource_type", `eq.${params.resourceType}`);
  p.set("resource_id", `eq.${encodeURIComponent(params.resourceId)}`);
  if (params.resourceVersion) p.set("resource_version", `eq.${encodeURIComponent(params.resourceVersion)}`);
  p.set("order", "created_at.asc");

  const rows = await fetcher<CommentRow[]>(
    `/rest/v1/storyflow_comments?${p.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CollabServiceError("service_unavailable", "failed to list comments", 503, err);
  });

  return (rows ?? []).map(parseComment);
}

/** 解决评论 (审阅完成后可标记) */
export async function resolveComment(
  fetcher: CollabFetcher,
  params: { commentId: string; resolverId: string },
): Promise<Comment> {
  if (!params.commentId) throw new CollabServiceError("validation_failed", "commentId is required", 400);

  const rows = await fetcher<CommentRow[]>(
    `/rest/v1/storyflow_comments?id=eq.${encodeURIComponent(params.commentId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        resolved: true,
        resolved_by: params.resolverId,
        resolved_at: new Date().toISOString(),
      }),
    },
  ).catch((err: unknown) => {
    throw new CollabServiceError("service_unavailable", "failed to resolve comment", 503, err);
  });

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new CollabServiceError("not_found", `comment ${params.commentId} not found`, 404);
  return parseComment(row);
}
