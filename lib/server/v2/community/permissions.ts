/**
 * KIIKIS 2.1 Phase 5 — 社区权限矩阵 (Task 5.3, CM-009)
 *
 * CM-009: 匿名/普通用户/被屏蔽用户/审核员权限矩阵自动化
 *   - 匿名用户: 只能浏览 public publication
 *   - 普通用户: 浏览 + 互动 (关注/反应/收藏/评论)
 *   - 被屏蔽用户: 看不到屏蔽者的内容 (双向不可见)
 *   - 审核员: 查看 moderation queue + 隐藏/恢复/驳回
 *
 * 实现: 纯函数权限判断 + DB 角色查询。RLS 兜底。
 */
import { isAdminRole, type AdminRole } from "../../../contracts/v2/moderation.ts";
import { CommunityServiceError, type CommunityFetcher } from "./publications.ts";

// ============================================================
// 权限类型
// ============================================================

export type ViewerRole = "anonymous" | "regular" | "moderator" | "admin";

export interface CommunityPermissions {
  /** 可浏览 publication */
  canView: boolean;
  /** 可关注 */
  canFollow: boolean;
  /** 可反应 */
  canReact: boolean;
  /** 可收藏 */
  canBookmark: boolean;
  /** 可评论 */
  canComment: boolean;
  /** 可举报 */
  canReport: boolean;
  /** 可屏蔽其他用户 */
  canBlock: boolean;
  /** 可申请使用 */
  canApplyUse: boolean;
  /** 可访问审核队列 */
  canViewModerationQueue: boolean;
  /** 可执行审核动作 (隐藏/恢复/驳回) */
  canModerate: boolean;
  /** 可处理申诉 */
  canReviewAppeals: boolean;
}

// ============================================================
// 角色查询
// ============================================================

/**
 * CM-009: 查询用户的社区角色
 * - admin 包含 moderator 权限
 * - 返回 "anonymous" | "regular" | "moderator" | "admin"
 */
export async function resolveViewerRole(
  fetcher: CommunityFetcher,
  userId: string | null,
): Promise<ViewerRole> {
  if (!userId) return "anonymous";

  const params = new URLSearchParams();
  params.set("user_id", `eq.${encodeURIComponent(userId)}`);
  params.set("select", "role");

  const rows = await fetcher<Array<{ role: AdminRole }>>(
    `/rest/v1/storyflow_admin_roles?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError(
      "service_unavailable",
      "failed to resolve viewer role",
      503,
      err,
    );
  });

  if (!rows || rows.length === 0) return "regular";
  const roles = rows.map((r) => r.role).filter(isAdminRole);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("moderator")) return "moderator";
  return "regular";
}

/**
 * CM-009: 检查用户是否具有指定 admin 角色 (moderator 或 admin)
 */
export async function hasModeratorRole(
  fetcher: CommunityFetcher,
  userId: string | null,
): Promise<boolean> {
  const role = await resolveViewerRole(fetcher, userId);
  return role === "moderator" || role === "admin";
}

/**
 * CM-009: 校验审核员权限, 否则抛 forbidden
 */
export async function requireModerator(
  fetcher: CommunityFetcher,
  userId: string | null,
): Promise<void> {
  const has = await hasModeratorRole(fetcher, userId);
  if (!has) {
    throw new CommunityServiceError(
      "forbidden",
      "moderator role required",
      403,
    );
  }
}

// ============================================================
// 屏蔽关系查询 (CM-009: 被屏蔽用户看不到屏蔽者内容)
// ============================================================

/**
 * CM-009: 检查双向屏蔽关系 (任一方向屏蔽都返回 true)
 * 屏蔽后双方互相不可见
 */
export async function isBlockedEitherDirection(
  fetcher: CommunityFetcher,
  userA: string,
  userB: string,
): Promise<boolean> {
  if (!userA || !userB || userA === userB) return false;

  const params = new URLSearchParams();
  params.set(
    "or",
    `(and(blocker_id.eq.${encodeURIComponent(userA)},blocked_id.eq.${encodeURIComponent(userB)}),and(blocker_id.eq.${encodeURIComponent(userB)},blocked_id.eq.${encodeURIComponent(userA)}))`,
  );
  params.set("limit", "1");
  params.set("select", "id");

  const rows = await fetcher<Array<{ id: string }>>(
    `/rest/v1/storyflow_blocks?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError(
      "service_unavailable",
      "failed to check block relationship",
      503,
      err,
    );
  });

  return Array.isArray(rows) && rows.length > 0;
}

// ============================================================
// 权限矩阵计算 (CM-009)
// ============================================================

/**
 * CM-009: 计算给定 viewer 对 publication 的权限矩阵
 *
 * @param role viewer 角色 (anonymous/regular/moderator/admin)
 * @param isBlocked 是否被屏蔽 (viewer 与 publication owner 之间)
 * @returns 权限矩阵
 */
export function computePermissions(
  role: ViewerRole,
  isBlocked: boolean,
): CommunityPermissions {
  // 被屏蔽用户看不到屏蔽者内容
  if (isBlocked) {
    return {
      canView: false,
      canFollow: false,
      canReact: false,
      canBookmark: false,
      canComment: false,
      canReport: false,
      canBlock: false,
      canApplyUse: false,
      canViewModerationQueue: false,
      canModerate: false,
      canReviewAppeals: false,
    };
  }

  switch (role) {
    case "anonymous":
      // 匿名用户: 只能浏览 public publication
      return {
        canView: true,
        canFollow: false,
        canReact: false,
        canBookmark: false,
        canComment: false,
        canReport: false,
        canBlock: false,
        canApplyUse: false,
        canViewModerationQueue: false,
        canModerate: false,
        canReviewAppeals: false,
      };
    case "regular":
      // 普通用户: 浏览 + 互动
      return {
        canView: true,
        canFollow: true,
        canReact: true,
        canBookmark: true,
        canComment: true,
        canReport: true,
        canBlock: true,
        canApplyUse: true,
        canViewModerationQueue: false,
        canModerate: false,
        canReviewAppeals: false,
      };
    case "moderator":
    case "admin":
      // 审核员: 普通用户全部权限 + 审核队列
      return {
        canView: true,
        canFollow: true,
        canReact: true,
        canBookmark: true,
        canComment: true,
        canReport: true,
        canBlock: true,
        canApplyUse: true,
        canViewModerationQueue: true,
        canModerate: true,
        canReviewAppeals: true,
      };
  }
}

/**
 * CM-009: 端到端权限解析 — 结合角色 + 屏蔽关系计算权限矩阵
 */
export async function resolvePermissions(
  fetcher: CommunityFetcher,
  viewerId: string | null,
  publicationOwnerId: string | null,
): Promise<{ role: ViewerRole; permissions: CommunityPermissions }> {
  const role = await resolveViewerRole(fetcher, viewerId);
  const isBlocked =
    viewerId !== null && publicationOwnerId !== null && viewerId !== publicationOwnerId
      ? await isBlockedEitherDirection(fetcher, viewerId, publicationOwnerId)
      : false;
  const permissions = computePermissions(role, isBlocked);
  return { role, permissions };
}
