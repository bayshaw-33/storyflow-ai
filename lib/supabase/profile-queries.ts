import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 用户资料与公开主页查询（社区系统阶段 A）。
 *
 * 所有函数接收一个服务端 SupabaseClient（service-role，绕过 RLS）。
 * 公开主页查询内部显式过滤 `profile_visibility = 'public'`，避免泄露私密用户。
 *
 * 设计文档 §3 / §3.5
 */

// ============================================================
// 类型
// ============================================================

export type ProfileVisibility = "public" | "private";

/** 公开主页可见的字段（私密字段如 email/plan/username_changed_at 不在此） */
export type PublicProfile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_asset_id: string | null;
  avatar_storage_path: string | null;
  location: string | null;
  pronouns: string | null;
  creative_tags: string[] | string[];
  social_links: Record<string, unknown>;
  profile_visibility: ProfileVisibility;
  language_preference: string | null;
  created_at: string;
};

/** 本人完整 profile（含 email/plan/timestamps 等私密字段） */
export type OwnProfile = PublicProfile & {
  email: string | null;
  plan: string | null;
  username_changed_at: string | null;
  username_set_at: string | null;
  updated_at?: string | null;
};

export type ProfileStats = {
  works_count: number;
  universes_count: number;
  actors_count: number;
  used_count: number;
  adapted_count: number;
};

export type UserBadge = {
  id: string;
  badge_id: string;
  awarded_at: string;
  trigger_metadata: Record<string, unknown>;
  badge: {
    id: string;
    badge_key: string;
    name_zh: string;
    name_en: string;
    description_zh: string | null;
    description_en: string | null;
    category: string | null;
    sort_order: number;
    icon_asset_id: string | null;
  };
};

export type UserWork = {
  id: string;
  title: string;
  status: string | null;
  genre: string | null;
  target_market: string | null;
  mode: string | null;
  project_group: string | null;
  workflow_type: string | null;
  created_at: string;
  updated_at: string;
};

export type UserUniverse = {
  id: string;
  name: string;
  description: string;
  genre: string;
  default_language: string;
  target_markets: string[];
  tone: string;
  status: string;
  access_level: string;
  created_at: string;
  updated_at: string;
};

export type UserActor = {
  id: string;
  name: string;
  bio: string;
  age_range: string;
  gender_expression: string;
  ethnicity_style: string;
  visibility: string;
  avatar_asset_id: string | null;
  avatar_storage_path: string | null;
  created_at: string;
  updated_at: string;
};

export type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

// ============================================================
// 公开 / 本人 profile 查询
// ============================================================

const PUBLIC_PROFILE_SELECT =
  "user_id, username, display_name, bio, avatar_asset_id, avatar_storage_path, location, pronouns, creative_tags, social_links, profile_visibility, language_preference, created_at";
const AVATAR_JOIN_SELECT = "avatar_asset:avatar_asset_id(storage_path)";

/**
 * 按用户名查公开 profile。
 * 仅返回 profile_visibility='public' 的记录；私密用户返回 null。
 */
export async function getProfileByUsername(
  serverClient: SupabaseClient,
  username: string,
): Promise<PublicProfile | null> {
  const { data, error } = await serverClient
    .from("storyflow_profiles")
    .select(`${PUBLIC_PROFILE_SELECT}, ${AVATAR_JOIN_SELECT}`)
    .eq("username", username)
    .eq("profile_visibility", "public")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return normalizePublicProfile(data);
}

/**
 * 按 user_id 查本人完整 profile（含私密字段）。
 *
 * 注意：不使用 PostgREST 的 `avatar_asset:avatar_asset_id(storage_path)` JOIN 语法，
 * 因为 storyflow_profiles.avatar_asset_id 到 storyflow_assets(id) 的外键关系
 * 在某些环境（migration 未完整应用）下可能缺失，会导致 PGRST200 错误。
 * 改成两步查询：先查 profile，再用 avatar_asset_id 单独查 storage_path。
 */
export async function getProfileByUserId(
  serverClient: SupabaseClient,
  userId: string,
): Promise<OwnProfile | null> {
  const { data, error } = await serverClient
    .from("storyflow_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // 单独查 avatar storage_path（如果有 avatar_asset_id）
  const row = data as Record<string, unknown>;
  const avatarAssetId = row.avatar_asset_id as string | null;
  let avatarStoragePath: string | null = null;
  if (avatarAssetId) {
    const { data: assetRow, error: assetErr } = await serverClient
      .from("storyflow_assets")
      .select("storage_path")
      .eq("id", avatarAssetId)
      .maybeSingle();
    if (assetErr) throw assetErr;
    avatarStoragePath = (assetRow as { storage_path?: string } | null)?.storage_path ?? null;
  }

  return normalizeOwnProfile({ ...row, avatar_storage_path: avatarStoragePath });
}

/**
 * 按 user_id 查公开 profile（用于"本人访问自己公开主页"或他人快速校验）。
 * 不强制 visibility，调用方自行判断。
 */
export async function getProfileByUserIdPublic(
  serverClient: SupabaseClient,
  userId: string,
): Promise<PublicProfile | null> {
  const { data, error } = await serverClient
    .from("storyflow_profiles")
    .select(`${PUBLIC_PROFILE_SELECT}, ${AVATAR_JOIN_SELECT}`)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return normalizePublicProfile(data);
}

// ============================================================
// 统计数字（§3.5）
// ============================================================

export async function getProfileStats(
  serverClient: SupabaseClient,
  userId: string,
): Promise<ProfileStats> {
  // 并发执行 4 个简单 count + 1 个需两步的 adapted_count
  const [works, universes, actors, used, adapted] = await Promise.all([
    countWorks(serverClient, userId),
    countUniverses(serverClient, userId),
    countActors(serverClient, userId),
    countUsed(serverClient, userId),
    countAdapted(serverClient, userId),
  ]);

  return {
    works_count: works,
    universes_count: universes,
    actors_count: actors,
    used_count: used,
    adapted_count: adapted,
  };
}

async function countWorks(c: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await c
    .from("storyflow_projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

async function countUniverses(c: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await c
    .from("storyflow_universes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("status", "archived");
  if (error) throw error;
  return count ?? 0;
}

async function countActors(c: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await c
    .from("storyflow_actor_profiles")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .neq("status", "archived");
  if (error) throw error;
  return count ?? 0;
}

async function countUsed(c: SupabaseClient, userId: string): Promise<number> {
  // storyflow_actor_usages 直接有 actor_owner_id 列，无需 JOIN
  const { count, error } = await c
    .from("storyflow_actor_usages")
    .select("id", { count: "exact", head: true })
    .eq("actor_owner_id", userId)
    .neq("consumer_id", userId)
    .is("revoked_at", null);
  if (error) throw error;
  return count ?? 0;
}

async function countAdapted(c: SupabaseClient, userId: string): Promise<number> {
  // 两步：先取本人 universe IDs，再数 link 中 universe_id IN (...) 且 link.user_id != userId 且 project_role='adaptation'
  const { data: universeRows, error: uErr } = await c
    .from("storyflow_universes")
    .select("id")
    .eq("user_id", userId);
  if (uErr) throw uErr;
  if (!universeRows || universeRows.length === 0) return 0;

  const universeIds = universeRows.map((r) => r.id);
  const { count, error } = await c
    .from("storyflow_universe_project_links")
    .select("id", { count: "exact", head: true })
    .in("universe_id", universeIds)
    .neq("user_id", userId)
    .eq("project_role", "adaptation");
  if (error) throw error;
  return count ?? 0;
}

// ============================================================
// 徽章
// ============================================================

export async function getUserBadges(
  serverClient: SupabaseClient,
  userId: string,
): Promise<UserBadge[]> {
  const { data, error } = await serverClient
    .from("storyflow_user_badge_awards")
    .select(
      "id, badge_id, awarded_at, trigger_metadata, badge:badge_id(id, badge_key, name_zh, name_en, description_zh, description_en, category, sort_order, icon_asset_id)",
    )
    .eq("user_id", userId)
    .order("awarded_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as UserBadge[];
}

// ============================================================
// 作品 / 宇宙 / 演员 分页
// ============================================================

const WORKS_SELECT =
  "id, title, status, genre, target_market, mode, project_group, workflow_type, created_at, updated_at";
const UNIVERSES_SELECT =
  "id, name, description, genre, default_language, target_markets, tone, status, access_level, created_at, updated_at";
const ACTORS_SELECT =
  "id, name, bio, age_range, gender_expression, ethnicity_style, visibility, avatar_asset_id, avatar_storage_path, created_at, updated_at";

export async function getUserWorks(
  serverClient: SupabaseClient,
  userId: string,
  cursor?: string | null,
  limit = 12,
): Promise<Paginated<UserWork>> {
  let q = serverClient
    .from("storyflow_projects")
    .select(WORKS_SELECT)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) q = q.lt("created_at", cursor);

  const { data, error } = await q;
  if (error) throw error;
  return paginate((data ?? []) as UserWork[], limit);
}

export async function getUserUniverses(
  serverClient: SupabaseClient,
  userId: string,
  cursor?: string | null,
  limit = 12,
): Promise<Paginated<UserUniverse>> {
  let q = serverClient
    .from("storyflow_universes")
    .select(UNIVERSES_SELECT)
    .eq("user_id", userId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) q = q.lt("created_at", cursor);

  const { data, error } = await q;
  if (error) throw error;
  return paginate((data ?? []) as UserUniverse[], limit);
}

export async function getUserActors(
  serverClient: SupabaseClient,
  userId: string,
  cursor?: string | null,
  limit = 12,
): Promise<Paginated<UserActor>> {
  let q = serverClient
    .from("storyflow_actor_profiles")
    .select(`${ACTORS_SELECT}, ${AVATAR_JOIN_SELECT}`)
    .eq("owner_id", userId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) q = q.lt("created_at", cursor);

  const { data, error } = await q;
  if (error) throw error;
  // 拍平 avatar_asset:avatar_asset_id(storage_path) → avatar_storage_path
  const items = (data ?? []).map((row: Record<string, unknown>) => {
    const avatar = row.avatar_asset as { storage_path?: string } | null;
    return {
      ...(row as unknown as UserActor),
      avatar_storage_path: avatar?.storage_path ?? null,
    } as UserActor;
  });
  return paginate(items, limit);
}

// ============================================================
// 内部工具
// ============================================================

function paginate<T extends { created_at: string }>(items: T[], limit: number): Paginated<T> {
  const hasMore = items.length === limit;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null;
  return { items, nextCursor, hasMore };
}

function normalizePublicProfile(row: Record<string, unknown>): PublicProfile {
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
    profile_visibility: (row.profile_visibility as ProfileVisibility) ?? "public",
    language_preference: (row.language_preference as string) ?? null,
    created_at: row.created_at as string,
  };
}

function normalizeOwnProfile(row: Record<string, unknown>): OwnProfile {
  return {
    ...normalizePublicProfile(row),
    email: (row.email as string) ?? null,
    plan: (row.plan as string) ?? null,
    username_changed_at: (row.username_changed_at as string) ?? null,
    username_set_at: (row.username_set_at as string) ?? null,
    updated_at: (row.updated_at as string) ?? null,
  };
}
