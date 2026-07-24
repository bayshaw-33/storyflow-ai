import { notFound } from "next/navigation";
import {
  getSupabaseServerClient,
  getViewerFromCookies,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import {
  getProfileStats,
  getUserBadges,
  getUserWorks,
  type PublicProfile,
  type UserBadge,
  type UserWork,
} from "@/lib/supabase/profile-queries";
import { getAvatarUrl } from "@/lib/profile/avatar-url";
import { UserProfileClient, type InitialProfilePayload } from "./UserProfileClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { username: string };

/**
 * /u/[username]
 * 公开主页（SSR）：服务端一次性返回 profile + stats + badges + works 首屏 12 条，
 * 其余 Tab（universes / actors）由客户端切 Tab 时按需 fetch /api/u/[username]/<tab>。
 *
 * 可见性：
 * - public 用户：任何人可访问
 * - private 用户：仅本人可访问（其他访客触发 notFound()）
 * - 不存在的 username：notFound()
 */
export default async function PublicProfilePage({ params }: { params: Promise<Params> }) {
  if (!hasServiceRoleConfig()) {
    notFound();
  }
  const client = getSupabaseServerClient();
  if (!client) {
    notFound();
  }

  const { username: rawUsername } = await params;
  const username = decodeURIComponent(rawUsername).trim();
  if (!username) notFound();

  // 当前访客（可选；未登录返回 null）
  const viewer = await getViewerFromCookies();
  const currentUserId = viewer?.id ?? null;

  // 查 profile + avatar_storage_path（service role 绕过 RLS，需手动应用可见性规则）
  const { data: rawProfile, error: pErr } = await client
    .from("storyflow_profiles")
    .select(
      "user_id, username, display_name, bio, avatar_asset_id, location, pronouns, creative_tags, social_links, profile_visibility, language_preference, plan, created_at, avatar_asset:avatar_asset_id(storage_path)",
    )
    .eq("username", username)
    .maybeSingle();

  if (pErr || !rawProfile) {
    notFound();
  }

  const visibility = (rawProfile.profile_visibility as string) ?? "public";
  const isOwner = Boolean(currentUserId) && currentUserId === rawProfile.user_id;
  if (visibility === "private" && !isOwner) {
    // 与聚合 API 一致：private 且非本人 → 视为不存在
    notFound();
  }

  const profile = normalizeProfile(rawProfile);
  const targetUserId = profile.user_id;

  // 并发拉取 stats + badges + works 首屏（任一失败不阻塞整页）
  const [stats, badges, works] = await Promise.all([
    getProfileStats(client, targetUserId).catch(() => ({
      works_count: 0,
      universes_count: 0,
      actors_count: 0,
      used_count: 0,
      adapted_count: 0,
    })),
    getUserBadges(client, targetUserId).catch(() => [] as UserBadge[]),
    getUserWorks(client, targetUserId, null, 12).catch(() => ({
      items: [] as UserWork[],
      nextCursor: null,
      hasMore: false,
    })),
  ]);

  const payload: InitialProfilePayload = {
    profile: {
      user_id: profile.user_id,
      username: profile.username,
      display_name: profile.display_name,
      bio: profile.bio,
      avatar_url: getAvatarUrl(profile),
      avatar_asset_id: profile.avatar_asset_id,
      creative_tags: profile.creative_tags,
      social_links: profile.social_links as Record<string, unknown> as never,
      location: profile.location,
      language_preference: profile.language_preference ?? "en-US",
      pronouns: profile.pronouns,
      profile_visibility: profile.profile_visibility,
      plan: profile.plan ?? null,
      username_changed_at: null,
      username_set_at: null,
      is_owner: isOwner,
    },
    stats,
    badges: badges.map(mapBadge),
    initialWorks: {
      items: works.items.map(mapWork),
      nextCursor: works.nextCursor,
      hasMore: works.hasMore,
    },
  };

  return <UserProfileClient initial={payload} />;
}

function normalizeProfile(row: Record<string, unknown>): PublicProfile & { plan?: string | null } {
  const avatar = row.avatar_asset as { storage_path?: string } | null;
  return {
    user_id: row.user_id as string,
    username: (row.username as string) ?? null,
    display_name: (row.display_name as string) ?? null,
    bio: (row.bio as string) ?? null,
    avatar_asset_id: (row.avatar_asset_id as string) ?? null,
    avatar_storage_path: avatar?.storage_path ?? null,
    location: (row.location as string) ?? null,
    pronouns: (row.pronouns as string) ?? null,
    creative_tags: (row.creative_tags as string[]) ?? [],
    social_links: (row.social_links as Record<string, unknown>) ?? {},
    profile_visibility: (row.profile_visibility as "public" | "private") ?? "public",
    language_preference: (row.language_preference as string) ?? null,
    created_at: row.created_at as string,
    plan: (row.plan as string | null | undefined) ?? null,
  };
}

function mapBadge(b: UserBadge): InitialProfilePayload["badges"][number] {
  const inner = b.badge;
  return {
    id: inner?.id ?? b.badge_id,
    badge_key: inner?.badge_key ?? "",
    name_zh: inner?.name_zh ?? "",
    name_en: inner?.name_en ?? "",
    description_zh: inner?.description_zh ?? null,
    description_en: inner?.description_en ?? null,
    category: inner?.category ?? null,
    sort_order: inner?.sort_order ?? 0,
    awarded_at: b.awarded_at,
    locked: false,
  };
}

function mapWork(w: UserWork): InitialProfilePayload["initialWorks"]["items"][number] {
  return {
    id: w.id,
    title: w.title,
    cover_url: null,
    status: w.status ?? "draft",
    updated_at: w.updated_at ?? w.created_at,
  };
}
