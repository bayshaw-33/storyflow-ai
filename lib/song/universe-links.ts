/**
 * Kiikis 歌曲创作工作台优化方案 V1.0 §7
 * 歌曲-Universe 关联关系 CRUD。
 *
 * Universe 是歌曲归属、继承和正式发布的唯一入口。
 * - draft: 草稿关联（可继续编辑）
 * - published: 已发布到 Universe（冻结正式版本）
 * - deprecated: 已被新发布取代（历史记录）
 *
 * 关键规则：
 * - 一首歌曲在一个 Universe 下只能有一条 draft 或 published 记录（DB 层 UNIQUE 约束）
 * - 重新发布时：旧 published → deprecated，新建 published 记录
 * - published 状态下 frozen_version_id 冻结当前正式版本，不被后续草稿静默覆盖
 */

import type { SupabaseOptions } from "@/lib/universe";

// 相对路径导入：保证 node:test 的 .mjs 测试可以直接 import 本模块（Node 不解析 "@/" 别名）。
// 但本模块依赖 @/lib/universe 的 SupabaseOptions 类型，编译期用 alias，运行时由 webpack/node 解析。

const SONG_UNIVERSE_LINKS_TABLE = "storyflow_song_universe_links";

export type SongUniverseRole =
  | "theme_song"
  | "ending_song"
  | "character_song"
  | "insert_song"
  | "bgm"
  | "promo_song";

export type SongUniverseLinkStatus = "draft" | "published" | "deprecated";

export type SongInheritanceScope = {
  characters?: string[];
  locations?: string[];
  canon_facts?: string[];
  timeline?: boolean;
  relationships?: boolean;
  style_guide?: boolean;
};

export type SongUniverseLink = {
  id: string;
  universe_id: string;
  song_project_id: string;
  user_id?: string | null;
  team_id?: string | null;
  song_role: SongUniverseRole;
  source_project_id?: string | null;
  source_entity_id?: string | null;
  inheritance_scope: SongInheritanceScope;
  status: SongUniverseLinkStatus;
  frozen_version_id?: string | null;
  canon_snapshot?: Record<string, unknown> | null;
  delivery_package_sha256?: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type CreateSongUniverseLinkInput = {
  universe_id: string;
  song_project_id: string;
  song_role: SongUniverseRole;
  source_project_id?: string | null;
  source_entity_id?: string | null;
  inheritance_scope?: SongInheritanceScope;
  notes?: string;
};

export type PublishSongUniverseLinkInput = {
  linkId: string;
  frozenVersionId: string;
  canonSnapshot?: Record<string, unknown> | null;
  deliveryPackageSha256?: string | null;
  notes?: string;
};

function getSupabaseUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
}

function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
}

function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

function tableUrl(table: string) {
  return `${getSupabaseUrl()}/rest/v1/${table}`;
}

async function supabaseFetch<T = unknown>(
  url: string,
  init: RequestInit = {},
  options: SupabaseOptions = {},
): Promise<T> {
  const authToken = options.accessToken || getSupabaseAnonKey();
  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase request failed: ${response.status}${text ? ` ${text.slice(0, 180)}` : ""}`);
  }

  if (response.status === 204) return null as T;
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (null as T);
}

/**
 * 查询某首歌曲的活跃关联（draft 或 published）。
 * 一首歌曲在一个 Universe 下只能有一条活跃记录。
 */
export async function getSongUniverseLink(
  songProjectId: string,
  options: SupabaseOptions = {},
): Promise<SongUniverseLink | null> {
  if (!isSupabaseConfigured() || !options.accessToken) return null;

  const rows = await supabaseFetch<SongUniverseLink[]>(
    `${tableUrl(SONG_UNIVERSE_LINKS_TABLE)}?song_project_id=eq.${encodeURIComponent(songProjectId)}&status=in.(draft,published)&order=updated_at.desc&limit=1`,
    {},
    options,
  );
  return rows?.[0] || null;
}

/**
 * 查询某个 Universe 下所有已发布的歌曲。
 */
export async function listPublishedSongsByUniverse(
  universeId: string,
  options: SupabaseOptions = {},
): Promise<SongUniverseLink[]> {
  if (!isSupabaseConfigured() || !options.accessToken) return [];

  const rows = await supabaseFetch<SongUniverseLink[]>(
    `${tableUrl(SONG_UNIVERSE_LINKS_TABLE)}?universe_id=eq.${encodeURIComponent(universeId)}&status=eq.published&order=updated_at.desc`,
    {},
    options,
  );
  return rows || [];
}

/**
 * 查询某个 Universe 下所有歌曲（含草稿+已发布，不含 deprecated 历史）。
 */
export async function listActiveSongsByUniverse(
  universeId: string,
  options: SupabaseOptions = {},
): Promise<SongUniverseLink[]> {
  if (!isSupabaseConfigured() || !options.accessToken) return [];

  const rows = await supabaseFetch<SongUniverseLink[]>(
    `${tableUrl(SONG_UNIVERSE_LINKS_TABLE)}?universe_id=eq.${encodeURIComponent(universeId)}&status=in.(draft,published)&order=updated_at.desc`,
    {},
    options,
  );
  return rows || [];
}

/**
 * §7.2 路径二/三：创建歌曲-Universe 关联（草稿状态）。
 *
 * 如果该歌曲在此 Universe 下已有 draft 记录，返回已存在的（幂等）。
 * 如果已有 published 记录，返回错误（已发布不能新建草稿，应先取消发布或新建版本）。
 */
export async function createSongUniverseLink(
  input: CreateSongUniverseLinkInput,
  options: SupabaseOptions = {},
): Promise<SongUniverseLink> {
  if (!isSupabaseConfigured() || !options.accessToken) {
    throw new Error("Supabase 未配置或未登录");
  }

  // 幂等检查：已有活跃记录
  const existing = await getSongUniverseLink(input.song_project_id, options);
  if (existing) {
    if (existing.universe_id !== input.universe_id) {
      throw new Error("该歌曲已关联到其他 Universe，请先取消关联");
    }
    if (existing.status === "published") {
      throw new Error("该歌曲已发布到 Universe，不能新建草稿关联");
    }
    // 已有 draft 且同 Universe：返回已存在的（幂等）
    return existing;
  }

  const newRow: Omit<SongUniverseLink, "id" | "created_at" | "updated_at"> = {
    universe_id: input.universe_id,
    song_project_id: input.song_project_id,
    song_role: input.song_role,
    source_project_id: input.source_project_id || null,
    source_entity_id: input.source_entity_id || null,
    inheritance_scope: input.inheritance_scope || {},
    status: "draft",
    frozen_version_id: null,
    canon_snapshot: null,
    delivery_package_sha256: null,
    notes: input.notes || "",
  };

  const inserted = await supabaseFetch<SongUniverseLink[]>(
    tableUrl(SONG_UNIVERSE_LINKS_TABLE),
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(newRow),
    },
    options,
  );

  const link = inserted?.[0];
  if (!link) throw new Error("创建关联失败：服务端未返回记录");
  return link;
}

/**
 * §7.3 发布到 Universe：冻结当前正式版本。
 *
 * 流程：
 * 1. 把该歌曲在此 Universe 下的旧 published 记录改为 deprecated
 * 2. 把当前 draft 记录改为 published，写入 frozen_version_id 和 canon_snapshot
 *
 * 已发布版本不被后续草稿静默覆盖——重新发布会新建 published 记录，旧的变 deprecated。
 */
export async function publishSongToUniverse(
  input: PublishSongUniverseLinkInput,
  options: SupabaseOptions = {},
): Promise<SongUniverseLink> {
  if (!isSupabaseConfigured() || !options.accessToken) {
    throw new Error("Supabase 未配置或未登录");
  }

  // 1. 读取当前 link
  const linkUrl = `${tableUrl(SONG_UNIVERSE_LINKS_TABLE)}?id=eq.${encodeURIComponent(input.linkId)}&select=*&limit=1`;
  const existingRows = await supabaseFetch<SongUniverseLink[]>(linkUrl, {}, options);
  const link = existingRows?.[0];
  if (!link) throw new Error("关联记录不存在或无权访问");
  if (link.status === "deprecated") throw new Error("已废弃的关联不能发布");

  // 2. 把同歌曲同 Universe 下的旧 published 改为 deprecated
  const oldPublishedUrl = `${tableUrl(SONG_UNIVERSE_LINKS_TABLE)}?song_project_id=eq.${encodeURIComponent(link.song_project_id)}&universe_id=eq.${encodeURIComponent(link.universe_id)}&status=eq.published`;
  await supabaseFetch(
    oldPublishedUrl,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "deprecated" }),
    },
    options,
  );

  // 3. 把当前 draft 改为 published
  const updatePayload: Partial<SongUniverseLink> = {
    status: "published",
    frozen_version_id: input.frozenVersionId,
    canon_snapshot: input.canonSnapshot || null,
    delivery_package_sha256: input.deliveryPackageSha256 || null,
  };
  if (input.notes !== undefined) updatePayload.notes = input.notes;

  const updatedUrl = `${tableUrl(SONG_UNIVERSE_LINKS_TABLE)}?id=eq.${encodeURIComponent(input.linkId)}`;
  const updated = await supabaseFetch<SongUniverseLink[]>(
    updatedUrl,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(updatePayload),
    },
    options,
  );

  const published = updated?.[0];
  if (!published) throw new Error("发布失败：服务端未返回更新后的记录");
  return published;
}

/**
 * §7.3 取消发布：把 published 改回 draft（解冻）。
 * 注意：取消发布不会删除 frozen_version_id，保留发布历史可追溯。
 */
export async function unpublishSongFromUniverse(
  linkId: string,
  options: SupabaseOptions = {},
): Promise<SongUniverseLink> {
  if (!isSupabaseConfigured() || !options.accessToken) {
    throw new Error("Supabase 未配置或未登录");
  }

  const url = `${tableUrl(SONG_UNIVERSE_LINKS_TABLE)}?id=eq.${encodeURIComponent(linkId)}`;
  const updated = await supabaseFetch<SongUniverseLink[]>(
    url,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "draft" }),
    },
    options,
  );

  const link = updated?.[0];
  if (!link) throw new Error("取消发布失败：服务端未返回更新后的记录");
  return link;
}

/**
 * 更新关联元信息（角色、来源项目、继承范围等）。仅 draft 状态可更新。
 */
export async function updateSongUniverseLink(
  linkId: string,
  patch: Partial<Pick<SongUniverseLink, "song_role" | "source_project_id" | "source_entity_id" | "inheritance_scope" | "notes">>,
  options: SupabaseOptions = {},
): Promise<SongUniverseLink> {
  if (!isSupabaseConfigured() || !options.accessToken) {
    throw new Error("Supabase 未配置或未登录");
  }

  const url = `${tableUrl(SONG_UNIVERSE_LINKS_TABLE)}?id=eq.${encodeURIComponent(linkId)}&status=eq.draft`;
  const updated = await supabaseFetch<SongUniverseLink[]>(
    url,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    },
    options,
  );

  const link = updated?.[0];
  if (!link) throw new Error("更新失败：记录不存在或非草稿状态（已发布不能修改元信息）");
  return link;
}

/**
 * 删除关联（一般用 deprecated 软删除，但保留物理删除能力）。
 */
export async function deleteSongUniverseLink(
  linkId: string,
  options: SupabaseOptions = {},
): Promise<void> {
  if (!isSupabaseConfigured() || !options.accessToken) return;

  const url = `${tableUrl(SONG_UNIVERSE_LINKS_TABLE)}?id=eq.${encodeURIComponent(linkId)}`;
  await supabaseFetch(
    url,
    {
      method: "DELETE",
    },
    options,
  );
}

/**
 * 查询某首歌曲的所有历史关联（含 deprecated），用于审计追溯。
 */
export async function listSongUniverseHistory(
  songProjectId: string,
  options: SupabaseOptions = {},
): Promise<SongUniverseLink[]> {
  if (!isSupabaseConfigured() || !options.accessToken) return [];

  const rows = await supabaseFetch<SongUniverseLink[]>(
    `${tableUrl(SONG_UNIVERSE_LINKS_TABLE)}?song_project_id=eq.${encodeURIComponent(songProjectId)}&order=updated_at.desc`,
    {},
    options,
  );
  return rows || [];
}

/**
 * KIIKIS V2.2 歌曲显式关联 — Phase 5 Task 5.2.
 * 歌曲 Work 显式关联 Universe/角色/作品/集/场景，生成 WorkUsageLink 输入
 * （对应 Task 5.1 的 usage roles：diegetic_song / character_theme /
 * episode_theme / scene_cue）。歌曲流程与现有创作界面不重做。
 */
import type { UsageRole } from "@/lib/contracts/v2/work-usage";

export interface SongUsageLinkInput {
  ownerId: string;
  sourceWorkId: string;
  sourceWorkVersionId: string;
  targetProjectId: string;
  targetWorkId: string;
  characterId?: string | null;
  episodeId?: string | null;
  sceneId?: string | null;
}

export interface SongUsageLinkDraft {
  sourceWorkId: string;
  sourceWorkVersionId: string;
  targetProjectId: string;
  targetWorkId: string;
  usageRole: UsageRole;
  targetEntityType: string | null;
  targetEntityId: string | null;
}

/**
 * 由歌曲 Work 构建显式 usage 链接草稿：
 * - diegetic_song：歌曲是剧内歌曲（绑定 target Work）
 * - character_theme：绑定角色
 * - episode_theme：绑定集
 * - scene_cue：绑定场景
 */
export function buildSongUsageLinks(input: SongUsageLinkInput): SongUsageLinkDraft[] {
  const links: SongUsageLinkDraft[] = [
    {
      sourceWorkId: input.sourceWorkId,
      sourceWorkVersionId: input.sourceWorkVersionId,
      targetProjectId: input.targetProjectId,
      targetWorkId: input.targetWorkId,
      usageRole: "diegetic_song",
      targetEntityType: null,
      targetEntityId: null,
    },
  ];
  if (input.characterId) {
    links.push({
      sourceWorkId: input.sourceWorkId,
      sourceWorkVersionId: input.sourceWorkVersionId,
      targetProjectId: input.targetProjectId,
      targetWorkId: input.targetWorkId,
      usageRole: "character_theme",
      targetEntityType: "character",
      targetEntityId: input.characterId,
    });
  }
  if (input.episodeId) {
    links.push({
      sourceWorkId: input.sourceWorkId,
      sourceWorkVersionId: input.sourceWorkVersionId,
      targetProjectId: input.targetProjectId,
      targetWorkId: input.targetWorkId,
      usageRole: "episode_theme",
      targetEntityType: "episode",
      targetEntityId: input.episodeId,
    });
  }
  if (input.sceneId) {
    links.push({
      sourceWorkId: input.sourceWorkId,
      sourceWorkVersionId: input.sourceWorkVersionId,
      targetProjectId: input.targetProjectId,
      targetWorkId: input.targetWorkId,
      usageRole: "scene_cue",
      targetEntityType: "scene",
      targetEntityId: input.sceneId,
    });
  }
  return links;
}
