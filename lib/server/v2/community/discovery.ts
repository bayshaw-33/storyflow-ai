/**
 * KIIKIS 2.1 Phase 5 — 发现页投影查询 (Task 5.1, CM-002)
 *
 * CM-002: 发现页只读取允许公开/邀请访问的投影, 不查私有资源表。
 * 性能: §12.2 社区首屏不等待私有详情和计数全量聚合。
 */
import {
  parsePublication,
  toCommunityFeedProjection,
  toProjection,
  type Publication,
  type CommunityFeedProjection,
  type CommunityPublicationContext,
  type PublicationProjection,
  type PublicationRow,
} from "../../../contracts/v2/community.ts";
import { CommunityServiceError, type CommunityFetcher } from "./publications.ts";
import {
  fetchCommunityPublicationRows,
  getCommunityRowContext,
  hydrateCommunityWorkIds,
} from "./context.ts";
import { resolvePublicationReuseCapabilities } from "./reuse.ts";

/**
 * CM-002: 发现页查询 publication 投影
 * - 只返回 visibility=public (匿名) 或 public+invite_only (认证用户)
 * - 不查私有资源表, 直接读 publication 缓存字段
 */
export async function listDiscoveryFeed(
  fetcher: CommunityFetcher,
  options: {
    viewerId?: string | null;
    limit?: number;
    offset?: number;
    cursor?: string;
  } = {},
): Promise<PublicationProjection[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  // CM-002: 只查 public (隐藏/removed 不显示)
  // 认证用户也能看 public, invite_only 通过单独 API 查询
  const params = new URLSearchParams();
  params.set("visibility", "eq.public");
  params.set("status", "eq.active");
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  // CM-002: 只选投影字段 (不选 source_*, invite_token_hash 等敏感字段)
  params.set(
    "select",
    "id,publisher_id,title,summary,cover_url,visibility,created_at,follow_count,reaction_count,bookmark_count,comment_count",
  );

  const rows = await fetcher<PublicationRow[]>(
    `/rest/v1/storyflow_publications?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to fetch discovery feed", 503, err);
  });

  return (rows ?? []).map((r) => toProjection(parsePublication(r)));
}

export type CommunityFeedSection = "recommended" | "universes" | "works" | "actors" | "assets";

/**
 * C0：社区体验 Feed。
 *
 * 与旧 discover 接口并行，避免破坏 CM-002 的 legacy projection 契约；新
 * 页面需要的 source context 只通过这个明确的公开卡片投影返回。
 */
export async function listCommunityFeed(
  fetcher: CommunityFetcher,
  options: {
    section?: CommunityFeedSection;
    viewerId?: string | null;
    limit?: number;
    offset?: number;
  } = {},
): Promise<CommunityFeedProjection[]> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const params = new URLSearchParams();
  params.set("visibility", "eq.public");
  params.set("status", "eq.active");
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  if (options.section === "universes") params.set("source_type", "eq.universe");
  if (options.section === "works") params.set("source_type", "in.(project,episode,scene)");
  if (options.section === "actors") params.set("source_type", "eq.actor");
  if (options.section === "assets") params.set("source_type", "eq.asset");

  const rows = await fetchCommunityPublicationRows(
    fetcher,
    (select) => {
      params.set("select", select);
      return `/rest/v1/storyflow_publications?${params.toString()}`;
    },
    { headers: { Accept: "application/json" } },
    "failed to fetch community feed",
  );
  const hydratedRows = await hydrateCommunityWorkIds(fetcher, rows);
  const reuseCapabilities = await resolvePublicationReuseCapabilities(fetcher, hydratedRows, options.viewerId ?? null);

  return hydratedRows.map((row) =>
    toCommunityFeedProjection(parsePublication(row), options.viewerId ?? null, getCommunityRowContext(row), reuseCapabilities.get(row.id)),
  );
}

/**
 * CM-002: 按发布者查询 publications
 */
export async function listByPublisher(
  fetcher: CommunityFetcher,
  publisherId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<PublicationProjection[]> {
  if (!publisherId) {
    throw new CommunityServiceError("validation_failed", "publisherId is required", 400);
  }
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const params = new URLSearchParams();
  params.set("publisher_id", `eq.${encodeURIComponent(publisherId)}`);
  params.set("status", "eq.active");
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  params.set(
    "select",
    "id,publisher_id,title,summary,cover_url,visibility,created_at,follow_count,reaction_count,bookmark_count,comment_count",
  );

  const rows = await fetcher<PublicationRow[]>(
    `/rest/v1/storyflow_publications?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to fetch publications", 503, err);
  });

  return (rows ?? []).map((r) => toProjection(parsePublication(r)));
}

/**
 * 获取 publication 详情用于对象页 (CM-005)
 */
export async function getPublicationDetail(
  fetcher: CommunityFetcher,
  publicationId: string,
): Promise<Publication | null> {
  if (!publicationId) {
    throw new CommunityServiceError("validation_failed", "publicationId is required", 400);
  }
  const row = await fetchPublicationRow(fetcher, publicationId);
  return row ? parsePublication(row) : null;
}

export interface CommunityPublicationDetail {
  readonly publication: Publication;
  readonly context: CommunityPublicationContext;
}

/** C0 card context for the publication detail page, including semantic subject type. */
export async function getCommunityPublicationDetail(
  fetcher: CommunityFetcher,
  publicationId: string,
): Promise<CommunityPublicationDetail | null> {
  if (!publicationId) {
    throw new CommunityServiceError("validation_failed", "publicationId is required", 400);
  }
  const row = await fetchPublicationRow(fetcher, publicationId);
  if (!row) return null;
  const [hydratedRow] = await hydrateCommunityWorkIds(fetcher, [row]);
  return { publication: parsePublication(hydratedRow), context: getCommunityRowContext(hydratedRow) };
}

async function fetchPublicationRow(
  fetcher: CommunityFetcher,
  publicationId: string,
): Promise<PublicationRow | null> {
  return fetcher<PublicationRow | null>(
    `/rest/v1/storyflow_publications?id=eq.${encodeURIComponent(publicationId)}&limit=1`,
    { headers: { Accept: "application/vnd.pgrst.object+json" } },
  ).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err && err.status === 406) return null;
    throw new CommunityServiceError("service_unavailable", "failed to fetch publication", 503, err);
  });
}
