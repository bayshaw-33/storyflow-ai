/**
 * KIIKIS 2.1 Phase 4 — 审阅服务 (Task 4.2, CO-004/005)
 *
 * CO-004: 状态机 pending → in_review → approved/rejected
 * CO-005: 批准/驳回记录原因和审阅人, 驳回可附带修改建议
 */
import {
  parseReview,
  validateSubmitReview,
  validateDecideReview,
  CollabValidationError,
  type SubmitReviewInput,
  type DecideReviewInput,
  type Review,
  type ReviewRow,
} from "../../../contracts/v2/collab.ts";
import { CollabServiceError, appendActivity } from "./index.ts";
import type { CollabFetcher } from "./comments.ts";

/** 提交审阅 (CO-004: pending → in_review) */
export async function submitReview(
  fetcher: CollabFetcher,
  input: SubmitReviewInput,
): Promise<Review> {
  let validated: SubmitReviewInput;
  try {
    validated = validateSubmitReview(input);
  } catch (err) {
    if (err instanceof CollabValidationError) {
      throw new CollabServiceError("validation_failed", err.message, 400);
    }
    throw err;
  }

  const row = await fetcher<ReviewRow>(
    `/rest/v1/rpc/submit_review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_resource_type: validated.resourceType,
        p_resource_id: validated.resourceId,
        p_resource_version: validated.resourceVersion ?? null,
        p_reviewer_id: validated.reviewerId,
        p_idempotency_key: validated.idempotencyKey,
      }),
    },
  ).catch((err: unknown) => {
    throw new CollabServiceError("service_unavailable", "failed to submit review", 503, err);
  });

  // CO-006: 记录活动
  try {
    await appendActivity(fetcher, {
      resourceType: "review",
      resourceId: row.id,
      activityType: "review_submitted",
      actorId: validated.reviewerId,
      details: { resource_type: validated.resourceType, resource_id: validated.resourceId },
    });
  } catch {
    // 活动记录失败不影响审阅流程
  }

  return parseReview(row);
}

/** 决策审阅 (CO-005: 批准/驳回 + 原因) */
export async function decideReview(
  fetcher: CollabFetcher,
  input: DecideReviewInput,
): Promise<Review> {
  let validated: DecideReviewInput;
  try {
    validated = validateDecideReview(input);
  } catch (err) {
    if (err instanceof CollabValidationError) {
      throw new CollabServiceError("validation_failed", err.message, 400);
    }
    throw err;
  }

  const row = await fetcher<ReviewRow>(
    `/rest/v1/rpc/decide_review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_review_id: validated.reviewId,
        p_decision: validated.decision,
        p_reason: validated.reason ?? null,
        p_change_suggestions: validated.changeSuggestions ?? [],
      }),
    },
  ).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err && err.status === 403) {
      throw new CollabServiceError("forbidden", "only reviewer can decide", 403, err);
    }
    if (err && typeof err === "object" && "status" in err && err.status === 404) {
      throw new CollabServiceError("not_found", `review ${validated.reviewId} not found`, 404, err);
    }
    throw new CollabServiceError("service_unavailable", "failed to decide review", 503, err);
  });

  const parsed = parseReview(row);

  // CO-006: 记录活动
  try {
    await appendActivity(fetcher, {
      resourceType: "review",
      resourceId: parsed.id,
      activityType: validated.decision === "approved" ? "review_approved" : "review_rejected",
      actorId: parsed.reviewerId,
      details: { resource_type: parsed.resourceType, resource_id: parsed.resourceId, reason: parsed.decisionReason },
    });
  } catch {
    // 活动记录失败不影响审阅流程
  }

  return parsed;
}

/** 列出资源的审阅 */
export async function listReviews(
  fetcher: CollabFetcher,
  params: { resourceType: string; resourceId: string; status?: string },
): Promise<Review[]> {
  const p = new URLSearchParams();
  p.set("resource_type", `eq.${params.resourceType}`);
  p.set("resource_id", `eq.${encodeURIComponent(params.resourceId)}`);
  if (params.status) p.set("status", `eq.${params.status}`);
  p.set("order", "created_at.desc");

  const rows = await fetcher<ReviewRow[]>(
    `/rest/v1/storyflow_reviews?${p.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CollabServiceError("service_unavailable", "failed to list reviews", 503, err);
  });

  return (rows ?? []).map(parseReview);
}

/** 获取单个审阅详情 */
export async function getReview(
  fetcher: CollabFetcher,
  reviewId: string,
): Promise<Review | null> {
  if (!reviewId) throw new CollabServiceError("validation_failed", "reviewId is required", 400);

  const row = await fetcher<ReviewRow | null>(
    `/rest/v1/storyflow_reviews?id=eq.${encodeURIComponent(reviewId)}&limit=1`,
    { headers: { Accept: "application/vnd.pgrst.object+json" } },
  ).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err && err.status === 406) return null;
    throw new CollabServiceError("service_unavailable", "failed to fetch review", 503, err);
  });

  return row ? parseReview(row) : null;
}
