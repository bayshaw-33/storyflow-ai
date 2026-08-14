/**
 * KIIKIS 2.1 Phase 5 — 安全与审核服务 (Task 5.3, CM-007~010)
 *
 * CM-007: 举报/屏蔽/moderation queue/隐藏/恢复/申诉同时上线
 *   - 举报: create_report RPC (服务端注入 reporter_id, 幂等)
 *   - 屏蔽: toggle_block RPC (幂等 toggle)
 *   - 审核操作: review_moderation RPC (hide/restore/dismiss)
 *   - 申诉: create_appeal / review_appeal RPC (approved 自动 restore)
 * CM-008: 隐藏 publication 不删除私有源 (由 hide_publication RPC 实现)
 * CM-009: 权限矩阵自动化 (moderator 角色由 RLS + 应用层校验双重保障)
 */
import {
  parseReport,
  parseBlock,
  parseModerationQueueItem,
  parseAppeal,
  validateCreateReport,
  validateReviewModeration,
  validateCreateAppeal,
  validateReviewAppeal,
  ModerationValidationError,
  type Report,
  type ReportRow,
  type Block,
  type BlockRow,
  type ModerationQueueItem,
  type ModerationQueueRow,
  type Appeal,
  type AppealRow,
  type CreateReportInput,
  type ReviewModerationInput,
  type CreateAppealInput,
  type ReviewAppealInput,
  type ReportTargetType,
  type ReportStatus,
  type ModerationStatus,
  type AppealStatus,
} from "../../../contracts/v2/moderation.ts";
import { CommunityServiceError, type CommunityFetcher } from "./publications.ts";

export { CommunityServiceError } from "./publications.ts";

// ============================================================
// Report (CM-007)
// ============================================================

/** CM-007: 创建举报 (服务端注入 reporterId, 幂等) */
export async function createReport(
  fetcher: CommunityFetcher,
  input: CreateReportInput,
): Promise<Report> {
  let validated: CreateReportInput;
  try {
    validated = validateCreateReport(input);
  } catch (err) {
    if (err instanceof ModerationValidationError) {
      throw new CommunityServiceError("validation_failed", err.message, 400);
    }
    throw err;
  }

  const row = await fetcher<ReportRow>(`/rest/v1/rpc/create_report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_target_type: validated.targetType,
      p_target_id: validated.targetId,
      p_reason_type: validated.reasonType,
      p_reason_description: validated.reasonDescription ?? null,
      p_idempotency_key: validated.idempotencyKey,
    }),
  }).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err) {
      const status = (err as { status: number }).status;
      if (status === 404) {
        throw new CommunityServiceError("not_found", "target not found", 404, err);
      }
      if (status === 403) {
        throw new CommunityServiceError("forbidden", "cannot report this target", 403, err);
      }
    }
    throw new CommunityServiceError("service_unavailable", "failed to create report", 503, err);
  });

  return parseReport(row);
}

/** CM-007: 列出用户的举报 (reporter 视角) */
export async function listReportsByReporter(
  fetcher: CommunityFetcher,
  reporterId: string,
  options: { status?: ReportStatus; limit?: number; offset?: number } = {},
): Promise<Report[]> {
  if (!reporterId) {
    throw new CommunityServiceError("unauthenticated", "reporterId is required", 401);
  }
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const params = new URLSearchParams();
  params.set("reporter_id", `eq.${encodeURIComponent(reporterId)}`);
  if (options.status) params.set("status", `eq.${options.status}`);
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const rows = await fetcher<ReportRow[]>(
    `/rest/v1/storyflow_reports?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to list reports", 503, err);
  });

  return (rows ?? []).map(parseReport);
}

// ============================================================
// Block (CM-007)
// ============================================================

/** CM-007: 切换屏蔽状态 (幂等 toggle) */
export async function toggleBlock(
  fetcher: CommunityFetcher,
  params: { blockerId: string; blockedId: string },
): Promise<{ blocking: boolean }> {
  const { blockerId, blockedId } = params;
  if (!blockerId) {
    throw new CommunityServiceError("unauthenticated", "blockerId is required", 401);
  }
  if (!blockedId) {
    throw new CommunityServiceError("validation_failed", "blockedId is required", 400);
  }
  if (blockerId === blockedId) {
    throw new CommunityServiceError(
      "validation_failed",
      "cannot block self",
      400,
    );
  }

  const blocking = await fetcher<boolean>(`/rest/v1/rpc/toggle_block`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_blocked_id: blockedId,
    }),
  }).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to toggle block", 503, err);
  });

  return { blocking: blocking === true };
}

/** CM-007: 列出用户屏蔽的人 */
export async function listBlocks(
  fetcher: CommunityFetcher,
  blockerId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<Block[]> {
  if (!blockerId) {
    throw new CommunityServiceError("unauthenticated", "blockerId is required", 401);
  }
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const params = new URLSearchParams();
  params.set("blocker_id", `eq.${encodeURIComponent(blockerId)}`);
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const rows = await fetcher<BlockRow[]>(
    `/rest/v1/storyflow_blocks?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to list blocks", 503, err);
  });

  return (rows ?? []).map(parseBlock);
}

// ============================================================
// Moderation Queue (CM-007)
// ============================================================

/** CM-007: 列出审核队列 (审核员视角) */
export async function listModerationQueue(
  fetcher: CommunityFetcher,
  options: {
    status?: ModerationStatus;
    targetType?: ReportTargetType;
    limit?: number;
    offset?: number;
  } = {},
): Promise<ModerationQueueItem[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const params = new URLSearchParams();
  if (options.status) params.set("status", `eq.${options.status}`);
  if (options.targetType) params.set("target_type", `eq.${options.targetType}`);
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const rows = await fetcher<ModerationQueueRow[]>(
    `/rest/v1/storyflow_moderation_queue?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError(
      "service_unavailable",
      "failed to list moderation queue",
      503,
      err,
    );
  });

  return (rows ?? []).map(parseModerationQueueItem);
}

/** CM-007: 获取审核队列单条详情 */
export async function getModerationItem(
  fetcher: CommunityFetcher,
  moderationId: string,
): Promise<ModerationQueueItem | null> {
  if (!moderationId) {
    throw new CommunityServiceError("validation_failed", "moderationId is required", 400);
  }
  const params = new URLSearchParams();
  params.set("id", `eq.${encodeURIComponent(moderationId)}`);
  params.set("limit", "1");

  const rows = await fetcher<ModerationQueueRow[]>(
    `/rest/v1/storyflow_moderation_queue?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError(
      "service_unavailable",
      "failed to fetch moderation item",
      503,
      err,
    );
  });

  if (!rows || rows.length === 0) return null;
  return parseModerationQueueItem(rows[0]);
}

/** CM-007: 执行审核动作 (hide/restore/dismiss) */
export async function reviewModeration(
  fetcher: CommunityFetcher,
  input: ReviewModerationInput,
): Promise<ModerationQueueItem> {
  let validated: ReviewModerationInput;
  try {
    validated = validateReviewModeration(input);
  } catch (err) {
    if (err instanceof ModerationValidationError) {
      throw new CommunityServiceError("validation_failed", err.message, 400);
    }
    throw err;
  }

  const row = await fetcher<ModerationQueueRow>(`/rest/v1/rpc/review_moderation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_moderation_id: validated.moderationId,
      p_action: validated.action,
      p_reason: validated.reason ?? null,
    }),
  }).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err) {
      const status = (err as { status: number }).status;
      if (status === 404) {
        throw new CommunityServiceError(
          "not_found",
          "moderation item not found",
          404,
          err,
        );
      }
      if (status === 403) {
        throw new CommunityServiceError(
          "forbidden",
          "moderator role required",
          403,
          err,
        );
      }
    }
    throw new CommunityServiceError(
      "service_unavailable",
      "failed to review moderation",
      503,
      err,
    );
  });

  return parseModerationQueueItem(row);
}

// ============================================================
// Appeal (CM-007)
// ============================================================

/** CM-007: 创建申诉 (被处罚用户提交, 幂等) */
export async function createAppeal(
  fetcher: CommunityFetcher,
  input: CreateAppealInput,
): Promise<Appeal> {
  let validated: CreateAppealInput;
  try {
    validated = validateCreateAppeal(input);
  } catch (err) {
    if (err instanceof ModerationValidationError) {
      throw new CommunityServiceError("validation_failed", err.message, 400);
    }
    throw err;
  }

  const row = await fetcher<AppealRow>(`/rest/v1/rpc/create_appeal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_moderation_id: validated.moderationId,
      p_appeal_text: validated.appealText,
      p_idempotency_key: validated.idempotencyKey,
    }),
  }).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err) {
      const status = (err as { status: number }).status;
      if (status === 404) {
        throw new CommunityServiceError(
          "not_found",
          "moderation item not found",
          404,
          err,
        );
      }
      if (status === 403) {
        throw new CommunityServiceError(
          "forbidden",
          "only affected user can appeal",
          403,
          err,
        );
      }
    }
    throw new CommunityServiceError("service_unavailable", "failed to create appeal", 503, err);
  });

  return parseAppeal(row);
}

/** CM-007: 列出申诉 (appellant 视角, 审核员可看所有)
 *   - 默认列出 viewer 自己的申诉 (appellantId 默认 = viewerId)
 *   - 审核员传 all=true 可看所有申诉 (RLS 兜底)
 *   - 显式传 appellantId 可指定过滤特定用户
 */
export async function listAppeals(
  fetcher: CommunityFetcher,
  viewerId: string,
  options: {
    appellantId?: string | null;
    status?: AppealStatus;
    all?: boolean;
    limit?: number;
    offset?: number;
  } = {},
): Promise<Appeal[]> {
  if (!viewerId) {
    throw new CommunityServiceError("unauthenticated", "viewerId is required", 401);
  }
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const params = new URLSearchParams();
  // CM-009: all=true → 不过滤 (审核员看所有); 否则按 appellantId 过滤
  if (!options.all) {
    const effectiveAppellantId = options.appellantId ?? viewerId;
    if (effectiveAppellantId) {
      params.set("appellant_id", `eq.${encodeURIComponent(effectiveAppellantId)}`);
    }
  }
  if (options.status) params.set("status", `eq.${options.status}`);
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const rows = await fetcher<AppealRow[]>(
    `/rest/v1/storyflow_appeals?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to list appeals", 503, err);
  });

  return (rows ?? []).map(parseAppeal);
}

/** CM-007: 获取申诉详情 */
export async function getAppeal(
  fetcher: CommunityFetcher,
  appealId: string,
): Promise<Appeal | null> {
  if (!appealId) {
    throw new CommunityServiceError("validation_failed", "appealId is required", 400);
  }
  const params = new URLSearchParams();
  params.set("id", `eq.${encodeURIComponent(appealId)}`);
  params.set("limit", "1");

  const rows = await fetcher<AppealRow[]>(
    `/rest/v1/storyflow_appeals?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to fetch appeal", 503, err);
  });

  if (!rows || rows.length === 0) return null;
  return parseAppeal(rows[0]);
}

/** CM-007: 审核员处理申诉 (approved 自动 restore publication) */
export async function reviewAppeal(
  fetcher: CommunityFetcher,
  input: ReviewAppealInput,
): Promise<Appeal> {
  let validated: ReviewAppealInput;
  try {
    validated = validateReviewAppeal(input);
  } catch (err) {
    if (err instanceof ModerationValidationError) {
      throw new CommunityServiceError("validation_failed", err.message, 400);
    }
    throw err;
  }

  const row = await fetcher<AppealRow>(`/rest/v1/rpc/review_appeal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_appeal_id: validated.appealId,
      p_decision: validated.decision,
      p_review_notes: validated.reviewNotes ?? null,
    }),
  }).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err) {
      const status = (err as { status: number }).status;
      if (status === 404) {
        throw new CommunityServiceError("not_found", "appeal not found", 404, err);
      }
      if (status === 403) {
        throw new CommunityServiceError(
          "forbidden",
          "moderator role required",
          403,
          err,
        );
      }
    }
    throw new CommunityServiceError("service_unavailable", "failed to review appeal", 503, err);
  });

  return parseAppeal(row);
}

// Re-export for convenience (consumers can import from either location)
export type { ReportStatus } from "../../../contracts/v2/moderation.ts";
