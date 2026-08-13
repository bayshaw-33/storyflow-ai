/**
 * KIIKIS 2.1 Phase 5 — 关注/反应/收藏服务 (Task 5.1, CM-003)
 *
 * CM-003: 唯一约束 + 幂等 (重复操作不创建重复记录, 也不报错)
 */
import {
  parseFollow,
  parseReaction,
  parseBookmark,
  type Follow,
  type FollowRow,
  type Reaction,
  type ReactionRow,
  type Bookmark,
  type BookmarkRow,
  type FollowTargetType,
  type ReactionType,
} from "../../../contracts/v2/community.ts";
import { CommunityServiceError, type CommunityFetcher } from "./publications.ts";

// ============================================================
// Follow (CM-003)
// ============================================================

/**
 * CM-003: 切换关注状态 (幂等 toggle)
 * - 已关注 → 取消关注, 返回 false
 * - 未关注 → 关注, 返回 true
 */
export async function toggleFollow(
  fetcher: CommunityFetcher,
  params: { targetType: FollowTargetType; targetId: string; userId: string },
): Promise<{ following: boolean }> {
  const { targetType, targetId, userId } = params;
  if (!userId) {
    throw new CommunityServiceError("unauthenticated", "userId is required", 401);
  }
  if (!targetType || !targetId) {
    throw new CommunityServiceError("validation_failed", "targetType and targetId are required", 400);
  }

  const following = await fetcher<boolean>(
    `/rest/v1/rpc/toggle_follow`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_target_type: targetType,
        p_target_id: targetId,
      }),
    },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to toggle follow", 503, err);
  });

  return { following: following === true };
}

/** 列出用户的关注 */
export async function listFollows(
  fetcher: CommunityFetcher,
  followerId: string,
  options: { targetType?: FollowTargetType; limit?: number; offset?: number } = {},
): Promise<Follow[]> {
  if (!followerId) {
    throw new CommunityServiceError("unauthenticated", "followerId is required", 401);
  }
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const params = new URLSearchParams();
  params.set("follower_id", `eq.${encodeURIComponent(followerId)}`);
  if (options.targetType) params.set("target_type", `eq.${options.targetType}`);
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const rows = await fetcher<FollowRow[]>(
    `/rest/v1/storyflow_follows?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to list follows", 503, err);
  });

  return (rows ?? []).map(parseFollow);
}

/** 检查是否已关注 */
export async function isFollowing(
  fetcher: CommunityFetcher,
  params: { followerId: string; targetType: FollowTargetType; targetId: string },
): Promise<boolean> {
  const params_str = new URLSearchParams();
  params_str.set("follower_id", `eq.${encodeURIComponent(params.followerId)}`);
  params_str.set("target_type", `eq.${params.targetType}`);
  params_str.set("target_id", `eq.${encodeURIComponent(params.targetId)}`);
  params_str.set("limit", "1");

  const rows = await fetcher<FollowRow[]>(
    `/rest/v1/storyflow_follows?${params_str.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch(() => []);

  return (rows?.length ?? 0) > 0;
}

// ============================================================
// Reaction (CM-003)
// ============================================================

/**
 * CM-003: 切换反应状态 (幂等 toggle)
 */
export async function toggleReaction(
  fetcher: CommunityFetcher,
  params: { publicationId: string; reactionType: ReactionType; userId: string },
): Promise<{ reacted: boolean }> {
  const { publicationId, reactionType, userId } = params;
  if (!userId) {
    throw new CommunityServiceError("unauthenticated", "userId is required", 401);
  }
  if (!publicationId) {
    throw new CommunityServiceError("validation_failed", "publicationId is required", 400);
  }

  const reacted = await fetcher<boolean>(
    `/rest/v1/rpc/toggle_reaction`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_publication_id: publicationId,
        p_reaction_type: reactionType,
      }),
    },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to toggle reaction", 503, err);
  });

  return { reacted: reacted === true };
}

/** 列出 publication 的反应 */
export async function listReactions(
  fetcher: CommunityFetcher,
  publicationId: string,
  options: { reactionType?: ReactionType; limit?: number; offset?: number } = {},
): Promise<Reaction[]> {
  if (!publicationId) {
    throw new CommunityServiceError("validation_failed", "publicationId is required", 400);
  }
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const params = new URLSearchParams();
  params.set("publication_id", `eq.${encodeURIComponent(publicationId)}`);
  if (options.reactionType) params.set("reaction_type", `eq.${options.reactionType}`);
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const rows = await fetcher<ReactionRow[]>(
    `/rest/v1/storyflow_reactions?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to list reactions", 503, err);
  });

  return (rows ?? []).map(parseReaction);
}

// ============================================================
// Bookmark (CM-003)
// ============================================================

/**
 * CM-003: 切换收藏状态 (幂等 toggle)
 */
export async function toggleBookmark(
  fetcher: CommunityFetcher,
  params: { publicationId: string; userId: string },
): Promise<{ bookmarked: boolean }> {
  const { publicationId, userId } = params;
  if (!userId) {
    throw new CommunityServiceError("unauthenticated", "userId is required", 401);
  }
  if (!publicationId) {
    throw new CommunityServiceError("validation_failed", "publicationId is required", 400);
  }

  const bookmarked = await fetcher<boolean>(
    `/rest/v1/rpc/toggle_bookmark`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_publication_id: publicationId,
      }),
    },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to toggle bookmark", 503, err);
  });

  return { bookmarked: bookmarked === true };
}

/** 列出用户的收藏 */
export async function listBookmarks(
  fetcher: CommunityFetcher,
  userId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<Bookmark[]> {
  if (!userId) {
    throw new CommunityServiceError("unauthenticated", "userId is required", 401);
  }
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const rows = await fetcher<BookmarkRow[]>(
    `/rest/v1/storyflow_bookmarks?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=${limit}&offset=${offset}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to list bookmarks", 503, err);
  });

  return (rows ?? []).map(parseBookmark);
}
