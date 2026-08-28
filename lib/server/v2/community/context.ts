import { getPublicationContext, type PublicationRow } from "../../../contracts/v2/community.ts";
import { CommunityServiceError, isSchemaError, type CommunityFetcher } from "./publications.ts";

export const COMMUNITY_PUBLICATION_SELECT =
  "id,source_type,source_id,source_version,publisher_id,title,summary,cover_url,visibility,status,invite_token_hash,created_at,updated_at,idempotency_key,follow_count,reaction_count,bookmark_count,comment_count,subject_type,source_workbench,rights_summary,contribution_summary,work_id,universe_id";

export const LEGACY_COMMUNITY_PUBLICATION_SELECT =
  "id,source_type,source_id,source_version,publisher_id,title,summary,cover_url,visibility,status,invite_token_hash,created_at,updated_at,idempotency_key,follow_count,reaction_count,bookmark_count,comment_count";

/**
 * K22 卡片上下文是向前兼容的：生产库完成迁移后走 enriched projection，
 * 尚未迁移时回退到旧列，避免整个社区首页被一个新列拖成 503。
 */
export async function fetchCommunityPublicationRows(
  fetcher: CommunityFetcher,
  buildPath: (select: string) => string,
  init: RequestInit,
  errorMessage: string,
): Promise<PublicationRow[]> {
  try {
    return (await fetcher<PublicationRow[]>(buildPath(COMMUNITY_PUBLICATION_SELECT), init)) ?? [];
  } catch (cause) {
    if (!isSchemaError(cause)) {
      throw new CommunityServiceError("service_unavailable", errorMessage, 503, cause);
    }
    try {
      return (await fetcher<PublicationRow[]>(buildPath(LEGACY_COMMUNITY_PUBLICATION_SELECT), init)) ?? [];
    } catch (legacyCause) {
      throw new CommunityServiceError("service_unavailable", errorMessage, 503, legacyCause);
    }
  }
}

/**
 * 旧记录没有 work_id 时，从真实 episode/scene 关系补出所属 Work。
 * 只查询卡片确实需要的公开归属键，不读取章节/场景正文。
 */
export async function hydrateCommunityWorkIds(
  fetcher: CommunityFetcher,
  rows: PublicationRow[],
): Promise<PublicationRow[]> {
  const episodeIds = uniqueIds(rows.filter((row) => row.source_type === "episode" && !row.work_id));
  const sceneIds = uniqueIds(rows.filter((row) => row.source_type === "scene" && !row.work_id));
  if (!episodeIds.length && !sceneIds.length) return rows;

  const [episodeRows, sceneRows] = await Promise.all([
    episodeIds.length
      ? fetcher<Array<{ id: string; project_id: string }>>(
          `/rest/v1/storyflow_episodes?id=in.(${episodeIds.join(",")})&select=id,project_id`,
          { headers: { Accept: "application/json" } },
        )
      : Promise.resolve([]),
    sceneIds.length
      ? fetcher<Array<{ id: string; project_id: string }>>(
          `/rest/v1/storyflow_scenes?id=in.(${sceneIds.join(",")})&select=id,project_id`,
          { headers: { Accept: "application/json" } },
        )
      : Promise.resolve([]),
  ]).catch((cause: unknown) => {
    if (isSchemaError(cause)) return [[], []] as const;
    throw new CommunityServiceError("service_unavailable", "failed to resolve publication work", 503, cause);
  });

  const workIds = new Map<string, string>([
    ...episodeRows.map((row) => [row.id, row.project_id] as const),
    ...sceneRows.map((row) => [row.id, row.project_id] as const),
  ]);
  return rows.map((row) => ({
    ...row,
    work_id: row.work_id ?? workIds.get(row.source_id) ?? null,
  }));
}

export function getCommunityRowContext(row: PublicationRow) {
  return getPublicationContext(row);
}

function uniqueIds(rows: PublicationRow[]): string[] {
  return [...new Set(rows.map((row) => encodeURIComponent(row.source_id)).filter(Boolean))];
}
