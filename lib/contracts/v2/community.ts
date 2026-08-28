/**
 * KIIKIS 2.1 Phase 5 — IP 资产社区契约 (Task 5.1, CM-001~003, CM-005)
 *
 * 纯函数契约层。
 *
 * 设计原则:
 *   CM-001: publication 与源资源分离 (保存快照, 隐藏不删除源)
 *   CM-002: 发现页只读取允许公开/邀请访问的投影
 *   CM-003: 关注/反应/收藏唯一且幂等
 *   CM-005: 对象页明确来源/owner/许可状态/允许动作
 */

// ============================================================
// 常量
// ============================================================

export const PUBLICATION_SOURCE_TYPES = [
  "universe",
  "project",
  "actor",
  "asset",
  "episode",
  "scene",
] as const;
export type PublicationSourceType = (typeof PUBLICATION_SOURCE_TYPES)[number];

/**
 * 产品层的公开内容分类。它和数据库 source_type 有意分离：
 * project/episode/scene 都是真实的作品来源，而 milestone/kk_showcase
 * 是发布投影的语义分类，不应被伪装成数据库资源类型。
 */
export const PUBLICATION_SUBJECT_TYPES = [
  "work",
  "universe",
  "actor",
  "asset",
  "milestone",
  "kk_showcase",
] as const;
export type PublicationSubject = (typeof PUBLICATION_SUBJECT_TYPES)[number];

export const VISIBILITY = ["public", "invite_only", "hidden"] as const;
export type Visibility = (typeof VISIBILITY)[number];

export const PUBLICATION_STATUS = ["active", "hidden_by_moderator", "removed"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUS)[number];

export const FOLLOW_TARGET_TYPES = ["user", "universe", "publication"] as const;
export type FollowTargetType = (typeof FOLLOW_TARGET_TYPES)[number];

export const REACTION_TYPES = ["like", "love", "wow", "haha", "sad", "angry"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

// ============================================================
// Publication (CM-001/002/005)
// ============================================================

/**
 * 发布。CM-001: 保存源资源快照, 不等于源资源。
 * CM-008: 隐藏只改 visibility, 源资源不受影响。
 */
export interface Publication {
  readonly id: string;
  readonly sourceType: PublicationSourceType;
  readonly sourceId: string;
  readonly sourceVersion: string | null;
  readonly publisherId: string;
  readonly title: string;
  readonly summary: string;
  readonly coverUrl: string | null;
  readonly visibility: Visibility;
  readonly status: PublicationStatus;
  readonly inviteTokenHash: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly idempotencyKey: string;
  readonly followCount: number;
  readonly reactionCount: number;
  readonly bookmarkCount: number;
  readonly commentCount: number;
}

export interface PublicationRow {
  readonly id: string;
  readonly source_type: PublicationSourceType;
  readonly source_id: string;
  readonly source_version: string | null;
  readonly publisher_id: string;
  readonly title: string;
  readonly summary: string | null;
  readonly cover_url: string | null;
  readonly visibility: Visibility;
  readonly status: PublicationStatus;
  readonly invite_token_hash: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly idempotency_key: string;
  readonly follow_count: number;
  readonly reaction_count: number;
  readonly bookmark_count: number;
  readonly comment_count: number;
  /** K22 card context; optional for rows created before the context migration. */
  readonly subject_type?: PublicationSubject | string | null;
  readonly source_workbench?: string | null;
  readonly rights_summary?: string | null;
  readonly contribution_summary?: string | null;
  readonly project_id?: string | null;
  readonly work_id?: string | null;
  readonly work_type?: string | null;
  readonly universe_id?: string | null;
}

export interface CreatePublicationInput {
  readonly sourceType: PublicationSourceType;
  readonly sourceId: string;
  readonly sourceVersion?: string | null;
  /** RG-001: publisherId 由服务端认证填入 */
  readonly publisherId: string;
  readonly title: string;
  readonly summary?: string;
  readonly coverUrl?: string | null;
  readonly visibility?: Visibility;
  readonly inviteTokenHash?: string | null;
  readonly subjectType?: PublicationSubject | null;
  readonly sourceWorkbench?: string | null;
  readonly rightsSummary?: string | null;
  readonly contributionSummary?: string | null;
  readonly workId?: string | null;
  readonly projectId?: string | null;
  readonly workType?: string | null;
  readonly universeId?: string | null;
  readonly idempotencyKey: string;
}

/**
 * CM-002: 发现页投影 (只读字段, 不查私有资源表)
 */
export interface PublicationProjection {
  readonly id: string;
  readonly publisherId: string;
  readonly title: string;
  readonly summary: string;
  readonly coverUrl: string | null;
  readonly visibility: Visibility;
  readonly createdAt: string;
  readonly followCount: number;
  readonly reactionCount: number;
  readonly bookmarkCount: number;
  readonly commentCount: number;
}

/**
 * C0 社区卡片投影：保留 discovery projection 的公开字段，并增加可用于
 * 对象识别和真实跳转的源引用。这里不包含 storage path、invite token 或
 * moderation 私有字段。
 */
export type CommunityContentKind = PublicationSubject;

export interface CommunityFeedProjection extends PublicationProjection {
  readonly sourceType: PublicationSourceType;
  readonly sourceId: string;
  readonly sourceVersion: string | null;
  readonly contentKind: CommunityContentKind;
  readonly subjectType: PublicationSubject;
  readonly sourceWorkbench: string;
  readonly rightsSummary: string;
  readonly contributionSummary: string;
  readonly projectId: string | null;
  readonly workId: string | null;
  readonly workType: string | null;
  readonly universeId: string | null;
  readonly allowedActions: ReadonlyArray<string>;
}

export interface CommunityPublicationContext {
  readonly subjectType: PublicationSubject;
  readonly sourceWorkbench: string;
  readonly rightsSummary: string;
  readonly contributionSummary: string;
  readonly projectId: string | null;
  readonly workId: string | null;
  readonly workType: string | null;
  readonly universeId: string | null;
}

// ============================================================
// Follow (CM-003)
// ============================================================

export interface Follow {
  readonly id: string;
  readonly followerId: string;
  readonly targetType: FollowTargetType;
  readonly targetId: string;
  readonly createdAt: string;
}

export interface FollowRow {
  readonly id: string;
  readonly follower_id: string;
  readonly target_type: FollowTargetType;
  readonly target_id: string;
  readonly created_at: string;
}

// ============================================================
// Reaction (CM-003)
// ============================================================

export interface Reaction {
  readonly id: string;
  readonly userId: string;
  readonly publicationId: string;
  readonly reactionType: ReactionType;
  readonly createdAt: string;
}

export interface ReactionRow {
  readonly id: string;
  readonly user_id: string;
  readonly publication_id: string;
  readonly reaction_type: ReactionType;
  readonly created_at: string;
}

// ============================================================
// Bookmark (CM-003)
// ============================================================

export interface Bookmark {
  readonly id: string;
  readonly userId: string;
  readonly publicationId: string;
  readonly createdAt: string;
}

export interface BookmarkRow {
  readonly id: string;
  readonly user_id: string;
  readonly publication_id: string;
  readonly created_at: string;
}

// ============================================================
// 校验 (纯函数)
// ============================================================

export class CommunityValidationError extends Error {
  readonly code: string;
  readonly field?: string;
  constructor(code: string, message: string, field?: string) {
    super(`${code}: ${message}`);
    this.name = "CommunityValidationError";
    this.code = code;
    if (field) this.field = field;
  }
}

export function isPublicationSourceType(v: string): v is PublicationSourceType {
  return PUBLICATION_SOURCE_TYPES.includes(v as PublicationSourceType);
}

export function isPublicationSubject(v: string): v is PublicationSubject {
  return PUBLICATION_SUBJECT_TYPES.includes(v as PublicationSubject);
}

export function isVisibility(v: string): v is Visibility {
  return VISIBILITY.includes(v as Visibility);
}

export function isFollowTargetType(v: string): v is FollowTargetType {
  return FOLLOW_TARGET_TYPES.includes(v as FollowTargetType);
}

export function isReactionType(v: string): v is ReactionType {
  return REACTION_TYPES.includes(v as ReactionType);
}

/** CM-001: 校验 publication 创建输入 */
export function validateCreatePublication(input: CreatePublicationInput): CreatePublicationInput {
  if (!isPublicationSourceType(input.sourceType)) {
    throw new CommunityValidationError(
      "invalid_source_type",
      `sourceType must be one of ${PUBLICATION_SOURCE_TYPES.join(", ")}`,
      "sourceType",
    );
  }
  if (!input.sourceId?.trim()) {
    throw new CommunityValidationError("missing_source_id", "sourceId is required", "sourceId");
  }
  // RG-001: publisherId 服务端注入
  if (!input.publisherId?.trim()) {
    throw new CommunityValidationError(
      "missing_publisher",
      "publisherId is required (server-injected)",
      "publisherId",
    );
  }
  if (!input.title?.trim()) {
    throw new CommunityValidationError("missing_title", "title is required", "title");
  }
  if (input.title.length > 200) {
    throw new CommunityValidationError("title_too_long", "title must be <= 200 chars", "title");
  }
  if (input.summary && input.summary.length > 2000) {
    throw new CommunityValidationError("summary_too_long", "summary must be <= 2000 chars", "summary");
  }
  if (input.subjectType && !isPublicationSubject(input.subjectType)) {
    throw new CommunityValidationError(
      "invalid_subject_type",
      `subjectType must be one of ${PUBLICATION_SUBJECT_TYPES.join(", ")}`,
      "subjectType",
    );
  }
  if (input.visibility && !isVisibility(input.visibility)) {
    throw new CommunityValidationError(
      "invalid_visibility",
      `visibility must be one of ${VISIBILITY.join(", ")}`,
      "visibility",
    );
  }
  // invite_only 必须有 invite_token_hash
  if (input.visibility === "invite_only" && !input.inviteTokenHash) {
    throw new CommunityValidationError(
      "missing_invite_token",
      "invite_only visibility requires inviteTokenHash",
      "inviteTokenHash",
    );
  }
  if (!input.idempotencyKey?.trim()) {
    throw new CommunityValidationError("missing_idempotency_key", "idempotencyKey is required", "idempotencyKey");
  }
  return Object.freeze({ ...input });
}

// ============================================================
// DB row → 实体
// ============================================================

export function parsePublication(row: PublicationRow): Publication {
  return Object.freeze({
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceVersion: row.source_version,
    publisherId: row.publisher_id,
    title: row.title,
    summary: row.summary ?? "",
    coverUrl: row.cover_url,
    visibility: row.visibility,
    status: row.status,
    inviteTokenHash: row.invite_token_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    idempotencyKey: row.idempotency_key,
    followCount: row.follow_count,
    reactionCount: row.reaction_count,
    bookmarkCount: row.bookmark_count,
    commentCount: row.comment_count,
  });
}

export function parseFollow(row: FollowRow): Follow {
  return Object.freeze({
    id: row.id,
    followerId: row.follower_id,
    targetType: row.target_type,
    targetId: row.target_id,
    createdAt: row.created_at,
  });
}

export function parseReaction(row: ReactionRow): Reaction {
  return Object.freeze({
    id: row.id,
    userId: row.user_id,
    publicationId: row.publication_id,
    reactionType: row.reaction_type,
    createdAt: row.created_at,
  });
}

export function parseBookmark(row: BookmarkRow): Bookmark {
  return Object.freeze({
    id: row.id,
    userId: row.user_id,
    publicationId: row.publication_id,
    createdAt: row.created_at,
  });
}

/**
 * CM-002: 转换为发现页投影 (只保留公开字段, 不含 source_*)
 */
export function toProjection(pub: Publication): PublicationProjection {
  return Object.freeze({
    id: pub.id,
    publisherId: pub.publisherId,
    title: pub.title,
    summary: pub.summary,
    coverUrl: pub.coverUrl,
    visibility: pub.visibility,
    createdAt: pub.createdAt,
    followCount: pub.followCount,
    reactionCount: pub.reactionCount,
    bookmarkCount: pub.bookmarkCount,
    commentCount: pub.commentCount,
  });
}

/**
 * CM-005: 判断用户可执行的允许动作 (不暴露私有 path)
 */
export function computeAllowedActions(
  pub: Publication,
  viewerId: string | null,
  options: { hasFollow?: boolean; hasBookmarked?: boolean; hasReacted?: boolean } = {},
): ReadonlyArray<string> {
  const actions: string[] = [];
  const isOwner = viewerId === pub.publisherId;

  // 所有人可浏览 public
  if (pub.visibility === "public" && pub.status === "active") {
    actions.push("view");

    // 认证用户可互动
    if (viewerId) {
      actions.push(options.hasFollow ? "unfollow" : "follow");
      actions.push("react");
      actions.push(options.hasBookmarked ? "remove_bookmark" : "bookmark");
      actions.push("comment");
      actions.push("apply_use"); // 申请使用
    }
  }

  // invite_only 需 token, 简化: 认证用户可申请
  if (pub.visibility === "invite_only" && pub.status === "active" && viewerId) {
    actions.push("view");
    actions.push("request_invite");
  }

  // owner 额外动作
  if (isOwner) {
    actions.push("edit");
    actions.push("hide");
    actions.push("delete");
  }

  return Object.freeze(actions);
}

export function getPublicationContentKind(sourceType: PublicationSourceType): CommunityContentKind {
  if (sourceType === "universe") return "universe";
  if (sourceType === "actor") return "actor";
  if (sourceType === "asset") return "asset";
  return "work";
}

export function getPublicationSubjectType(sourceType: PublicationSourceType): PublicationSubject {
  return getPublicationContentKind(sourceType);
}

/**
 * 将旧发布记录和新上下文记录统一成公开卡片需要的语义上下文。
 * 缺失的权利/贡献信息使用明确的未声明/无记录文案，避免把空白误认为已授权。
 */
export function getPublicationContext(
  row: Pick<PublicationRow, "source_type"> &
    Partial<
      Pick<
        PublicationRow,
        "source_id" | "subject_type" | "source_workbench" | "rights_summary" | "contribution_summary" | "project_id" | "work_id" | "work_type" | "universe_id"
      >
    >,
): CommunityPublicationContext {
  const sourceType = row.source_type;
  const subjectType = isPublicationSubject(String(row.subject_type ?? ""))
    ? (row.subject_type as PublicationSubject)
    : getPublicationSubjectType(sourceType);
  const projectId = nonEmpty(row.project_id) ?? (sourceType === "project" ? nonEmpty(row.source_id) : null);

  return Object.freeze({
    subjectType,
    sourceWorkbench: nonEmpty(row.source_workbench) ?? defaultSourceWorkbench(sourceType, row.work_type),
    rightsSummary: nonEmpty(row.rights_summary) ?? "权利状态未声明",
    contributionSummary: nonEmpty(row.contribution_summary) ?? "暂无贡献记录",
    projectId,
    workId: nonEmpty(row.work_id),
    workType: nonEmpty(row.work_type),
    universeId: nonEmpty(row.universe_id),
  });
}

function nonEmpty(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function defaultSourceWorkbench(sourceType: PublicationSourceType, workType?: string | null): string {
  if (sourceType === "universe") return "Universe 工作台";
  if (sourceType === "actor") return "演员市场";
  if (sourceType === "asset") return "素材市场";
  if (workType === "script") return "剧本工作台";
  if (workType === "song") return "歌曲工作台";
  if (workType === "art") return "美术工作台";
  if (workType === "storyboard") return "分镜工作台";
  if (workType === "video") return "视频工作台";
  if (workType === "voice") return "配音工作台";
  if (workType === "editing") return "剪辑工作台";
  return "作品工作台";
}

/** C0：Feed 卡片使用的公开对象上下文投影。 */
export function toCommunityFeedProjection(
  pub: Publication,
  viewerId: string | null = null,
  context: CommunityPublicationContext = getPublicationContext({ source_type: pub.sourceType, source_id: pub.sourceId }),
): CommunityFeedProjection {
  const projection = toProjection(pub);
  return Object.freeze({
    ...projection,
    sourceType: pub.sourceType,
    sourceId: pub.sourceId,
    sourceVersion: pub.sourceVersion,
    contentKind: context.subjectType,
    subjectType: context.subjectType,
    sourceWorkbench: context.sourceWorkbench,
    rightsSummary: context.rightsSummary,
    contributionSummary: context.contributionSummary,
    projectId: context.projectId,
    workId: context.workId,
    workType: context.workType,
    universeId: context.universeId,
    allowedActions: computeAllowedActions(pub, viewerId),
  });
}
