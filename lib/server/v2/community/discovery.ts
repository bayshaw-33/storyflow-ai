/**
 * KIIKIS 2.1 Phase 5 — 发现页投影查询 (Task 5.1, CM-002)
 *
 * CM-002: 发现页只读取允许公开/邀请访问的投影, 不查私有资源表。
 * 性能: §12.2 社区首屏不等待私有详情和计数全量聚合。
 */
import {
  parsePublication,
  toProjection,
  type Publication,
  type PublicationProjection,
  type PublicationRow,
} from "../../../contracts/v2/community.ts";
import { CommunityServiceError, type CommunityFetcher } from "./publications.ts";

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
  const row = await fetcher<PublicationRow | null>(
    `/rest/v1/storyflow_publications?id=eq.${encodeURIComponent(publicationId)}&limit=1`,
    { headers: { Accept: "application/vnd.pgrst.object+json" } },
  ).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err && err.status === 406) return null;
    throw new CommunityServiceError("service_unavailable", "failed to fetch publication", 503, err);
  });
  return row ? parsePublication(row) : null;
}
