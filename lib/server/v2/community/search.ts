import type { CommunityFeedProjection } from "../../../contracts/v2/community.ts";
import { parsePublication, toCommunityFeedProjection } from "../../../contracts/v2/community.ts";
import { CommunityServiceError, type CommunityFetcher } from "./publications.ts";
import type { CommunityFeedSection } from "./discovery.ts";
import {
  fetchCommunityPublicationRows,
  getCommunityRowContext,
  hydrateCommunityWorkIds,
} from "./context.ts";

export interface CommunityCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface CommunitySearchResult {
  readonly items: CommunityFeedProjection[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly degraded: boolean;
}

export async function searchCommunityFeed(
  fetcher: CommunityFetcher,
  options: {
    query?: string;
    section?: CommunityFeedSection;
    viewerId?: string | null;
    limit?: number;
    cursor?: string | null;
  } = {},
): Promise<CommunitySearchResult> {
  const query = options.query?.trim() || "";
  if (query.length > 120) {
    throw new CommunityServiceError("validation_failed", "query must be <= 120 characters", 400);
  }

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const cursor = options.cursor ? decodeCommunityCursor(options.cursor) : null;
  const params = new URLSearchParams();
  params.set("visibility", "eq.public");
  params.set("status", "eq.active");
  params.set("order", "created_at.desc,id.desc");
  params.set("limit", String(limit + 1));

  if (options.section === "universes") params.set("source_type", "eq.universe");
  if (options.section === "works") params.set("source_type", "in.(project,episode,scene)");
  if (options.section === "actors") params.set("source_type", "eq.actor");
  if (options.section === "assets") params.set("source_type", "eq.asset");

  const clauses: string[] = [];
  if (query) {
    const term = `*${escapeLike(query)}*`;
    clauses.push(
      `or=(title.ilike.${term},summary.ilike.${term},source_type.ilike.${term},source_version.ilike.${term},publisher_id.ilike.${term})`,
    );
  }
  if (cursor) {
    const createdAt = encodeURIComponent(cursor.createdAt);
    const id = encodeURIComponent(cursor.id);
    clauses.push(`or=(created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id}))`);
  }
  if (clauses.length) params.set("and", `(${clauses.join(",")})`);

  const rows = await fetchCommunityPublicationRows(
    fetcher,
    (select) => {
      params.set("select", select);
      return `/rest/v1/storyflow_publications?${params.toString()}`;
    },
    { headers: { Accept: "application/json" } },
    "failed to search community feed",
  );

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const hydratedRows = await hydrateCommunityWorkIds(fetcher, pageRows);
  const hydratedById = new Map(hydratedRows.map((row) => [row.id, row]));
  const items = pageRows.map((row) => {
    const hydratedRow = hydratedById.get(row.id) ?? row;
    return toCommunityFeedProjection(
      parsePublication(hydratedRow),
      options.viewerId ?? null,
      getCommunityRowContext(hydratedRow),
    );
  });
  const last = pageRows[pageRows.length - 1];

  return {
    items,
    nextCursor: hasMore && last ? encodeCommunityCursor({ createdAt: last.created_at, id: last.id }) : null,
    hasMore,
    degraded: false,
  };
}

export function encodeCommunityCursor(cursor: CommunityCursor): string {
  if (!isCursor(cursor)) {
    throw new CommunityServiceError("validation_failed", "Invalid community cursor", 400);
  }
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCommunityCursor(value: string): CommunityCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!isCursor(parsed)) throw new Error("invalid cursor shape");
    return parsed;
  } catch {
    throw new CommunityServiceError("validation_failed", "Invalid community cursor", 400);
  }
}

function isCursor(value: unknown): value is CommunityCursor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CommunityCursor>;
  return (
    typeof candidate.createdAt === "string" &&
    !Number.isNaN(Date.parse(candidate.createdAt)) &&
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    candidate.id.length <= 200
  );
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_*(),]/g, " ").replace(/\s+/g, " ").trim();
}
