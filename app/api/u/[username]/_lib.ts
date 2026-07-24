import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 公开主页路由共享工具。
 *
 * 注：此文件位于 `[username]/` 目录下，与各子路由同级，不会被 Next.js 路由器解析。
 */

export type ResolvedProfile = {
  user_id: string;
  username: string | null;
  profile_visibility: "public" | "private";
};

/**
 * 按 username 解析 profile，并应用可见性规则：
 * - public 用户：任何人可访问
 * - private 用户：仅本人可访问（currentUserId 命中 user_id 才放行）
 * - 不存在：返回 null（路由层返回 404）
 *
 * `currentUserId` 为 null 表示匿名访客。
 */
export async function resolveVisibleProfile(
  client: SupabaseClient,
  username: string,
  currentUserId: string | null,
): Promise<ResolvedProfile | null> {
  const normalized = decodeURIComponent(username).trim();
  if (!normalized) return null;

  const { data, error } = await client
    .from("storyflow_profiles")
    .select("user_id, username, profile_visibility")
    .eq("username", normalized)
    .maybeSingle();

  if (error || !data) return null;

  const visibility = (data.profile_visibility as string) ?? "public";
  const isOwner = currentUserId && currentUserId === data.user_id;
  if (visibility === "private" && !isOwner) {
    // 与聚合路由一致：private 且非本人 → 视为不存在
    return null;
  }

  return {
    user_id: data.user_id as string,
    username: (data.username as string) ?? null,
    profile_visibility: visibility as "public" | "private",
  };
}
