/**
 * 宇宙分享相关 Supabase 查询（阶段 B）
 *
 * 所有函数接收服务端 SupabaseClient（service-role，绕过 RLS）。
 * share_password 哈希永远不通过本模块的访客查询返回给访客。
 *
 * 设计文档：docs/superpowers/specs/2026-07-25-universe-share-design.md §3
 *
 * sections → 实际表映射（基于 baseline + 后续 migration）：
 * - characters → storyflow_universe_entities WHERE type='character'
 * - scenes     → storyflow_universe_entities WHERE type='location'
 * - rules      → storyflow_universe_entities WHERE type='rule'
 * - actors     → storyflow_character_appearance_variants（universe_id）JOIN storyflow_actor_profiles
 * - chapters   → 无对应 universe 级别表，返回 null（占位，等后续阶段补表）
 * - timeline   → storyflow_universe_timeline_events
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashPassword } from "@/lib/universe-share/password";
import {
  validateSharePermissions,
  type SharePermissions,
} from "@/lib/universe-share/permissions";

// ============================================================
// 类型
// ============================================================

export type ShareStatus = "private" | "shared" | "removed";

/** 所有者视角的分享配置（不含密码哈希） */
export type ShareConfig = {
  share_status: ShareStatus | null;
  share_permissions: SharePermissions;
  has_password: boolean;
  share_updated_at: string | null;
};

/** 访客视角的宇宙基本信息（不含 share_password） */
export type SharedUniverse = {
  id: string;
  name: string;
  cover_url: string | null;
  tagline: string;
  description: string;
  share_status: ShareStatus;
  share_permissions: SharePermissions;
  share_updated_at: string | null;
  owner: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type SharedSections = {
  characters: unknown[] | null;
  scenes: unknown[] | null;
  rules: unknown[] | null;
  actors: unknown[] | null;
  chapters: unknown[] | null;
  timeline: unknown[] | null;
};

type UniverseRow = {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  card_summary: string | null;
  cover_asset_version_id: string | null;
  share_status: ShareStatus | null;
  share_password: string | null;
  share_permissions: Record<string, unknown> | null;
  share_updated_at: string | null;
};

type ProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_asset_id: string | null;
  avatar_asset: { storage_path: string | null }[] | null;
};

type AssetVersionRow = {
  id: string;
  storage_path: string | null;
};

// ============================================================
// 所有者查询
// ============================================================

/**
 * 服务端判断访问者是否为宇宙所有者，并返回 share_status。
 *
 * 用于解决客户端依赖浏览器 RLS 返回 user_id 不可靠的问题：
 * 当 RLS 策略不允许返回 user_id 列时，客户端 isOwner 判断会失效，
 * 导致所有者访问自己的宇宙被误判为访客显示“未分享”（TRAE-V2-00 P0 缺陷）。
 *
 * 本函数使用 service role 绕过 RLS，直接读取 user_id 与 share_status，
 * 是 P0 缺陷修复的服务端权威判断入口。
 *
 * 容错设计（TRAE-V2-00 临时修复）：
 * 生产 Supabase 的 storyflow_universes 表可能尚未运行 universe-share 阶段 B
 * 的 migration，缺少 share_status 列。此时查询会返回 42703 错误。
 * 本函数在 share_status 列缺失时 fallback 到只查 user_id，
 * 让所有者访问不再被阻塞（share_status 返回 null，访客分享功能在 schema 修复前不可用）。
 *
 * 返回值：
 * - { isOwner: true, shareStatus } — 访问者是所有者
 * - { isOwner: false, shareStatus } — 访问者不是所有者（或宇宙不存在），shareStatus 可能为 null
 *
 * 出于安全考虑，不区分“宇宙不存在”与“非所有者访问”，统一返回 isOwner=false。
 */
export async function getUniverseOwnership(
  serverClient: SupabaseClient,
  universeId: string,
  userId: string,
): Promise<{ isOwner: boolean; shareStatus: ShareStatus | null }> {
  // 先尝试完整查询（包含 share_status）
  const { data, error } = await serverClient
    .from("storyflow_universes")
    .select("id, user_id, share_status")
    .eq("id", universeId)
    .maybeSingle();

  // 容错：share_status 列不存在时，fallback 到只查 user_id
  if (error && isMissingColumnError(error)) {
    const fallback = await serverClient
      .from("storyflow_universes")
      .select("id, user_id")
      .eq("id", universeId)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    if (!fallback.data) {
      return { isOwner: false, shareStatus: null };
    }
    const fallbackRow = fallback.data as { id: string; user_id: string | null };
    return {
      isOwner: Boolean(fallbackRow.user_id && fallbackRow.user_id === userId),
      shareStatus: null,
    };
  }

  if (error) throw error;
  if (!data) {
    return { isOwner: false, shareStatus: null };
  }
  const row = data as UniverseRow;
  const isOwner = Boolean(row.user_id && row.user_id === userId);
  return {
    isOwner,
    shareStatus: row.share_status ?? null,
  };
}

/**
 * 判断 Supabase 错误是否为“列不存在”（42703 / PGRST204）。
 * 用于 share_status 列缺失时的容错判断。
 */
function isMissingColumnError(error: unknown): boolean {
  const msg = (error as { message?: string } | Error)?.message || "";
  return (
    msg.includes("42703") ||
    msg.includes("PGRST204") ||
    msg.includes("Could not find the column") ||
    msg.includes("column") && msg.includes("does not exist")
  );
}

/**
 * 获取本人宇宙的分享配置（所有者校验）。
 * 不返回 share_password 哈希，仅返回 has_password 布尔。
 */
export async function getShareConfig(
  serverClient: SupabaseClient,
  universeId: string,
  ownerId: string,
): Promise<ShareConfig | null> {
  const { data, error } = await serverClient
    .from("storyflow_universes")
    .select("id, user_id, share_status, share_password, share_permissions, share_updated_at")
    .eq("id", universeId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const row = data as UniverseRow;
  if (row.user_id !== ownerId) return null;

  return {
    share_status: row.share_status ?? "private",
    share_permissions: validateSharePermissions(row.share_permissions),
    has_password: Boolean(row.share_password),
    share_updated_at: row.share_updated_at ?? null,
  };
}

/**
 * 更新分享配置。
 *
 * password 语义：
 * - 非空字符串：哈希后存
 * - 空字符串 ""：清除密码（设为 null）
 * - null / undefined：不修改密码
 *
 * 始终更新 share_updated_at = now()（用于 JWT 失效）。
 */
export async function updateShareConfig(
  serverClient: SupabaseClient,
  universeId: string,
  ownerId: string,
  params: {
    share_status: ShareStatus;
    password?: string | null;
    permissions: SharePermissions;
  },
): Promise<ShareConfig | null> {
  // 先校验所有者
  const { data: existing, error: fetchErr } = await serverClient
    .from("storyflow_universes")
    .select("id, user_id")
    .eq("id", universeId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!existing) return null;
  if (existing.user_id !== ownerId) return null;

  const patch: Record<string, unknown> = {
    share_status: params.share_status,
    share_permissions: params.permissions,
    share_updated_at: new Date().toISOString(),
  };

  if (typeof params.password === "string") {
    if (params.password === "") {
      patch.share_password = null;
    } else {
      patch.share_password = await hashPassword(params.password);
    }
  }

  const { error: updateErr } = await serverClient
    .from("storyflow_universes")
    .update(patch)
    .eq("id", universeId);

  if (updateErr) throw updateErr;

  // 返回更新后的配置（复用 getShareConfig 避免重复逻辑）
  return getShareConfig(serverClient, universeId, ownerId);
}

// ============================================================
// 访客查询
// ============================================================

/**
 * 访客获取宇宙基本信息（不含 share_password）。
 * 仅返回 share_status='shared' 的宇宙。
 */
export async function getUniverseForShare(
  serverClient: SupabaseClient,
  universeId: string,
): Promise<SharedUniverse | null> {
  const { data, error } = await serverClient
    .from("storyflow_universes")
    .select(
      "id, user_id, name, description, card_summary, cover_asset_version_id, share_status, share_permissions, share_updated_at",
    )
    .eq("id", universeId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const row = data as UniverseRow;
  if (row.share_status !== "shared") return null;

  // 并发拉取 owner profile 和 cover storage_path
  const [owner, coverUrl] = await Promise.all([
    row.user_id ? fetchOwnerProfile(serverClient, row.user_id) : Promise.resolve(null),
    row.cover_asset_version_id
      ? fetchAssetStoragePath(serverClient, row.cover_asset_version_id)
      : Promise.resolve(null),
  ]);

  return {
    id: row.id,
    name: row.name,
    cover_url: coverUrl,
    tagline: row.card_summary ?? "",
    description: row.description ?? "",
    share_status: row.share_status,
    share_permissions: validateSharePermissions(row.share_permissions),
    share_updated_at: row.share_updated_at ?? null,
    owner,
  };
}

/**
 * 根据权限获取各 section 内容。
 * 仅当 permissions.sections[key]=true 时查询，否则返回 null。
 */
export async function getSharedUniverseSections(
  serverClient: SupabaseClient,
  universeId: string,
  permissions: SharePermissions,
): Promise<SharedSections> {
  const sections = permissions.sections;

  const [characters, scenes, rules, actors, timeline] = await Promise.all([
    sections.characters
      ? fetchEntitiesByType(serverClient, universeId, "character")
      : Promise.resolve(null),
    sections.scenes
      ? fetchEntitiesByType(serverClient, universeId, "location")
      : Promise.resolve(null),
    sections.rules
      ? fetchEntitiesByType(serverClient, universeId, "rule")
      : Promise.resolve(null),
    sections.actors ? fetchUniverseActors(serverClient, universeId) : Promise.resolve(null),
    sections.timeline ? fetchTimelineEvents(serverClient, universeId) : Promise.resolve(null),
  ]);

  // chapters 无对应 universe 级别表，本期返回 null（占位，等后续阶段补表）
  return {
    characters,
    scenes,
    rules,
    actors,
    chapters: null,
    timeline,
  };
}

/**
 * 检查宇宙是否可分享访问（share_status='shared'）。
 * 用于 verify 路由快速判断。
 */
export async function verifyShareAccess(
  serverClient: SupabaseClient,
  universeId: string,
): Promise<boolean> {
  const { data, error } = await serverClient
    .from("storyflow_universes")
    .select("share_status")
    .eq("id", universeId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return false;
  return (data.share_status as ShareStatus | null) === "shared";
}

/**
 * 获取宇宙（含 share_status / share_password / share_updated_at）。
 * 用于 verify 路由读取密码哈希与 share_updated_at。
 */
export async function getUniverseById(
  serverClient: SupabaseClient,
  universeId: string,
): Promise<UniverseRow | null> {
  const { data, error } = await serverClient
    .from("storyflow_universes")
    .select(
      "id, user_id, name, description, card_summary, cover_asset_version_id, share_status, share_password, share_permissions, share_updated_at",
    )
    .eq("id", universeId)
    .maybeSingle();

  if (error) throw error;
  return (data as UniverseRow | null) ?? null;
}

// ============================================================
// 内部辅助
// ============================================================

async function fetchOwnerProfile(
  serverClient: SupabaseClient,
  userId: string,
): Promise<SharedUniverse["owner"]> {
  const { data, error } = await serverClient
    .from("storyflow_profiles")
    .select("user_id, username, display_name, avatar_asset_id, avatar_asset:avatar_asset_id(storage_path)")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const row = data as ProfileRow;
  const avatarStoragePath = row.avatar_asset?.[0]?.storage_path ?? null;
  return {
    username: row.username,
    display_name: row.display_name,
    avatar_url: avatarStoragePath,
  };
}

async function fetchAssetStoragePath(
  serverClient: SupabaseClient,
  assetVersionId: string,
): Promise<string | null> {
  const { data, error } = await serverClient
    .from("storyflow_art_asset_versions")
    .select("id, storage_path")
    .eq("id", assetVersionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return (data as AssetVersionRow).storage_path ?? null;
}

async function fetchEntitiesByType(
  serverClient: SupabaseClient,
  universeId: string,
  type: string,
): Promise<unknown[]> {
  const { data, error } = await serverClient
    .from("storyflow_universe_entities")
    .select("id, type, name, summary, details_json, status, tags, updated_at")
    .eq("universe_id", universeId)
    .eq("type", type)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data as unknown[]) ?? [];
}

async function fetchUniverseActors(
  serverClient: SupabaseClient,
  universeId: string,
): Promise<unknown[]> {
  // storyflow_character_appearance_variants.actor_id → storyflow_actor_profiles(id) FK 存在
  // 用 join 拉取关联到该宇宙的演员（按 actor_id 去重）
  const { data, error } = await serverClient
    .from("storyflow_character_appearance_variants")
    .select(
      "actor_id, actor:actor_id(id, name, bio, age_range, gender_expression, ethnicity_style, avatar_asset_id, status)",
    )
    .eq("universe_id", universeId)
    .not("actor_id", "is", null);

  if (error) throw error;
  if (!data) return [];

  // 去重 actor_id，保留第一个出现的 actor
  const seen = new Set<string>();
  const actors: unknown[] = [];
  for (const row of data as Array<{ actor_id: string; actor: unknown }>) {
    if (!row.actor_id || seen.has(row.actor_id)) continue;
    seen.add(row.actor_id);
    actors.push(row.actor);
  }
  return actors;
}

async function fetchTimelineEvents(
  serverClient: SupabaseClient,
  universeId: string,
): Promise<unknown[]> {
  const { data, error } = await serverClient
    .from("storyflow_universe_timeline_events")
    .select(
      "id, title, description, date_label, season_number, episode_number, order_index, related_entity_ids, is_canon, status, updated_at",
    )
    .eq("universe_id", universeId)
    .order("order_index", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data as unknown[]) ?? [];
}
