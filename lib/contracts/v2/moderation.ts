/**
 * KIIKIS 2.1 Phase 5 — 安全与审核契约 (Task 5.3, CM-007~010)
 *
 * 纯函数契约层。
 *
 * 设计原则:
 *   CM-007: 举报/屏蔽/moderation queue/隐藏/恢复/申诉同时上线
 *     - 举报: user → publication/comment/user, 记录原因类型 + 描述
 *     - 屏蔽: user → user, 屏蔽后双向不可见
 *     - moderation queue: 审核员查看/操作 (隐藏/恢复/驳回)
 *     - 隐藏 publication: 只改 visibility, 不删除私有源 (CM-008)
 *     - 申诉: 被处罚用户提交, 审核员处理 (approved/rejected)
 *   CM-008: 隐藏 publication 不删除私有源 (由 hide_publication/restore_publication RPC 实现)
 *   CM-009: 匿名/普通用户/被屏蔽用户/审核员权限矩阵自动化 (RLS + 应用层校验)
 *   CM-010: /community 受 feature flag 保护 (应用层实现)
 */

// ============================================================
// 常量
// ============================================================

export const REPORT_TARGET_TYPES = ["publication", "comment", "user"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASON_TYPES = [
  "spam",
  "harassment",
  "hate_speech",
  "violence",
  "sexual_content",
  "misinformation",
  "copyright",
  "impersonation",
  "other",
] as const;
export type ReportReasonType = (typeof REPORT_REASON_TYPES)[number];

export const REPORT_STATUS = [
  "pending",
  "reviewing",
  "actioned_hide",
  "actioned_restore",
  "dismissed",
] as const;
export type ReportStatus = (typeof REPORT_STATUS)[number];

export const MODERATION_STATUS = [
  "pending",
  "reviewing",
  "hidden",
  "restored",
  "dismissed",
] as const;
export type ModerationStatus = (typeof MODERATION_STATUS)[number];

export const MODERATION_ACTION = ["hide", "restore", "freeze_comment", "dismiss"] as const;
export type ModerationAction = (typeof MODERATION_ACTION)[number];

export const APPEAL_STATUS = ["pending", "approved", "rejected"] as const;
export type AppealStatus = (typeof APPEAL_STATUS)[number];

export const ADMIN_ROLES = ["admin", "moderator", "auditor"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const REPORT_DESCRIPTION_MAX = 2000;
export const APPEAL_TEXT_MAX = 5000;
export const APPEAL_TEXT_MIN = 1;
export const ACTION_REASON_MAX = 2000;

// ============================================================
// Report (CM-007)
// ============================================================

export interface Report {
  readonly id: string;
  readonly reporterId: string;
  readonly targetType: ReportTargetType;
  readonly targetId: string;
  readonly reasonType: ReportReasonType;
  readonly reasonDescription: string | null;
  readonly status: ReportStatus;
  readonly moderationId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
  readonly resolvedBy: string | null;
  readonly idempotencyKey: string;
}

export interface ReportRow {
  readonly id: string;
  readonly reporter_id: string;
  readonly target_type: ReportTargetType;
  readonly target_id: string;
  readonly reason_type: ReportReasonType;
  readonly reason_description: string | null;
  readonly status: ReportStatus;
  readonly moderation_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly resolved_at: string | null;
  readonly resolved_by: string | null;
  readonly idempotency_key: string;
}

export interface CreateReportInput {
  readonly reporterId: string;
  readonly targetType: ReportTargetType;
  readonly targetId: string;
  readonly reasonType: ReportReasonType;
  readonly reasonDescription?: string | null;
  readonly idempotencyKey: string;
}

// ============================================================
// Block (CM-007)
// ============================================================

export interface Block {
  readonly id: string;
  readonly blockerId: string;
  readonly blockedId: string;
  readonly createdAt: string;
}

export interface BlockRow {
  readonly id: string;
  readonly blocker_id: string;
  readonly blocked_id: string;
  readonly created_at: string;
}

// ============================================================
// ModerationQueue (CM-007)
// ============================================================

export interface ModerationQueueItem {
  readonly id: string;
  readonly reportId: string | null;
  readonly targetType: ReportTargetType;
  readonly targetId: string;
  readonly status: ModerationStatus;
  readonly moderatorId: string | null;
  readonly actionTaken: ModerationAction | null;
  readonly actionReason: string | null;
  readonly actionAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ModerationQueueRow {
  readonly id: string;
  readonly report_id: string | null;
  readonly target_type: ReportTargetType;
  readonly target_id: string;
  readonly status: ModerationStatus;
  readonly moderator_id: string | null;
  readonly action_taken: ModerationAction | null;
  readonly action_reason: string | null;
  readonly action_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ReviewModerationInput {
  readonly moderationId: string;
  readonly action: ModerationAction;
  readonly reason?: string | null;
}

// ============================================================
// Appeal (CM-007)
// ============================================================

export interface Appeal {
  readonly id: string;
  readonly appellantId: string;
  readonly moderationId: string;
  readonly appealText: string;
  readonly status: AppealStatus;
  readonly reviewerId: string | null;
  readonly reviewNotes: string | null;
  readonly reviewedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly idempotencyKey: string;
}

export interface AppealRow {
  readonly id: string;
  readonly appellant_id: string;
  readonly moderation_id: string;
  readonly appeal_text: string;
  readonly status: AppealStatus;
  readonly reviewer_id: string | null;
  readonly review_notes: string | null;
  readonly reviewed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly idempotency_key: string;
}

export interface CreateAppealInput {
  readonly appellantId: string;
  readonly moderationId: string;
  readonly appealText: string;
  readonly idempotencyKey: string;
}

export interface ReviewAppealInput {
  readonly appealId: string;
  readonly decision: "approved" | "rejected";
  readonly reviewNotes?: string | null;
}

// ============================================================
// AdminRole (CM-009)
// ============================================================

export interface AdminRoleRow {
  readonly id: string;
  readonly user_id: string;
  readonly role: AdminRole;
  readonly created_at: string;
  readonly created_by: string | null;
}

// ============================================================
// 校验 (纯函数)
// ============================================================

export class ModerationValidationError extends Error {
  readonly code: string;
  readonly field?: string;
  constructor(code: string, message: string, field?: string) {
    super(`${code}: ${message}`);
    this.name = "ModerationValidationError";
    this.code = code;
    if (field) this.field = field;
  }
}

export function isReportTargetType(v: string): v is ReportTargetType {
  return REPORT_TARGET_TYPES.includes(v as ReportTargetType);
}

export function isReportStatus(v: string): v is ReportStatus {
  return REPORT_STATUS.includes(v as ReportStatus);
}

export function isModerationStatus(v: string): v is ModerationStatus {
  return MODERATION_STATUS.includes(v as ModerationStatus);
}

export function isAppealStatus(v: string): v is AppealStatus {
  return APPEAL_STATUS.includes(v as AppealStatus);
}

export function isReportReasonType(v: string): v is ReportReasonType {
  return REPORT_REASON_TYPES.includes(v as ReportReasonType);
}

export function isModerationAction(v: string): v is ModerationAction {
  return MODERATION_ACTION.includes(v as ModerationAction);
}

export function isAdminRole(v: string): v is AdminRole {
  return ADMIN_ROLES.includes(v as AdminRole);
}

/** CM-007: 校验举报创建输入 */
export function validateCreateReport(input: CreateReportInput): CreateReportInput {
  if (!input.reporterId?.trim()) {
    throw new ModerationValidationError(
      "missing_reporter",
      "reporterId is required (server-injected)",
      "reporterId",
    );
  }
  if (!isReportTargetType(input.targetType)) {
    throw new ModerationValidationError(
      "invalid_target_type",
      `targetType must be one of ${REPORT_TARGET_TYPES.join(", ")}`,
      "targetType",
    );
  }
  if (!input.targetId?.trim()) {
    throw new ModerationValidationError("missing_target_id", "targetId is required", "targetId");
  }
  if (!isReportReasonType(input.reasonType)) {
    throw new ModerationValidationError(
      "invalid_reason_type",
      `reasonType must be one of ${REPORT_REASON_TYPES.join(", ")}`,
      "reasonType",
    );
  }
  if (
    input.reasonDescription !== null &&
    input.reasonDescription !== undefined &&
    input.reasonDescription.length > REPORT_DESCRIPTION_MAX
  ) {
    throw new ModerationValidationError(
      "description_too_long",
      `reasonDescription must be <= ${REPORT_DESCRIPTION_MAX} chars`,
      "reasonDescription",
    );
  }
  if (!input.idempotencyKey?.trim()) {
    throw new ModerationValidationError(
      "missing_idempotency_key",
      "idempotencyKey is required",
      "idempotencyKey",
    );
  }
  return Object.freeze({ ...input });
}

/** CM-007: 校验审核操作输入 */
export function validateReviewModeration(input: ReviewModerationInput): ReviewModerationInput {
  if (!input.moderationId?.trim()) {
    throw new ModerationValidationError(
      "missing_moderation_id",
      "moderationId is required",
      "moderationId",
    );
  }
  if (!isModerationAction(input.action)) {
    throw new ModerationValidationError(
      "invalid_action",
      `action must be one of ${MODERATION_ACTION.join(", ")}`,
      "action",
    );
  }
  if (
    input.reason !== null &&
    input.reason !== undefined &&
    input.reason.length > ACTION_REASON_MAX
  ) {
    throw new ModerationValidationError(
      "reason_too_long",
      `reason must be <= ${ACTION_REASON_MAX} chars`,
      "reason",
    );
  }
  return Object.freeze({ ...input });
}

/** CM-007: 校验申诉创建输入 */
export function validateCreateAppeal(input: CreateAppealInput): CreateAppealInput {
  if (!input.appellantId?.trim()) {
    throw new ModerationValidationError(
      "missing_appellant",
      "appellantId is required (server-injected)",
      "appellantId",
    );
  }
  if (!input.moderationId?.trim()) {
    throw new ModerationValidationError(
      "missing_moderation_id",
      "moderationId is required",
      "moderationId",
    );
  }
  const text = input.appealText?.trim() ?? "";
  if (text.length < APPEAL_TEXT_MIN) {
    throw new ModerationValidationError(
      "appeal_text_empty",
      "appealText must not be empty",
      "appealText",
    );
  }
  if (input.appealText.length > APPEAL_TEXT_MAX) {
    throw new ModerationValidationError(
      "appeal_text_too_long",
      `appealText must be <= ${APPEAL_TEXT_MAX} chars`,
      "appealText",
    );
  }
  if (!input.idempotencyKey?.trim()) {
    throw new ModerationValidationError(
      "missing_idempotency_key",
      "idempotencyKey is required",
      "idempotencyKey",
    );
  }
  return Object.freeze({ ...input });
}

/** CM-007: 校验申诉处理输入 */
export function validateReviewAppeal(input: ReviewAppealInput): ReviewAppealInput {
  if (!input.appealId?.trim()) {
    throw new ModerationValidationError("missing_appeal_id", "appealId is required", "appealId");
  }
  if (input.decision !== "approved" && input.decision !== "rejected") {
    throw new ModerationValidationError(
      "invalid_decision",
      "decision must be approved or rejected",
      "decision",
    );
  }
  if (
    input.reviewNotes !== null &&
    input.reviewNotes !== undefined &&
    input.reviewNotes.length > ACTION_REASON_MAX
  ) {
    throw new ModerationValidationError(
      "review_notes_too_long",
      `reviewNotes must be <= ${ACTION_REASON_MAX} chars`,
      "reviewNotes",
    );
  }
  return Object.freeze({ ...input });
}

// ============================================================
// DB row → 实体
// ============================================================

export function parseReport(row: ReportRow): Report {
  return Object.freeze({
    id: row.id,
    reporterId: row.reporter_id,
    targetType: row.target_type,
    targetId: row.target_id,
    reasonType: row.reason_type,
    reasonDescription: row.reason_description,
    status: row.status,
    moderationId: row.moderation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    idempotencyKey: row.idempotency_key,
  });
}

export function parseBlock(row: BlockRow): Block {
  return Object.freeze({
    id: row.id,
    blockerId: row.blocker_id,
    blockedId: row.blocked_id,
    createdAt: row.created_at,
  });
}

export function parseModerationQueueItem(row: ModerationQueueRow): ModerationQueueItem {
  return Object.freeze({
    id: row.id,
    reportId: row.report_id,
    targetType: row.target_type,
    targetId: row.target_id,
    status: row.status,
    moderatorId: row.moderator_id,
    actionTaken: row.action_taken,
    actionReason: row.action_reason,
    actionAt: row.action_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function parseAppeal(row: AppealRow): Appeal {
  return Object.freeze({
    id: row.id,
    appellantId: row.appellant_id,
    moderationId: row.moderation_id,
    appealText: row.appeal_text,
    status: row.status,
    reviewerId: row.reviewer_id,
    reviewNotes: row.review_notes,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    idempotencyKey: row.idempotency_key,
  });
}
