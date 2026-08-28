import { getPublicationContext, type PublicationRow } from "../../../contracts/v2/community.ts";
import { CommunityServiceError, isSchemaError, type CommunityFetcher } from "./publications.ts";

export const COMMUNITY_PUBLICATION_SELECT =
  "id,source_type,source_id,source_version,publisher_id,title,summary,cover_url,visibility,status,invite_token_hash,created_at,updated_at,idempotency_key,follow_count,reaction_count,bookmark_count,comment_count,subject_type,source_workbench,rights_summary,contribution_summary,project_id,work_id,work_type,universe_id";

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
  const workSourceRows = rows.filter((row) =>
    row.source_type === "project" || row.source_type === "episode" || row.source_type === "scene",
  );
  if (!workSourceRows.length) return rows;
  const episodeIds = uniqueIds(workSourceRows.filter((row) => row.source_type === "episode" && !row.project_id));
  const sceneIds = uniqueIds(workSourceRows.filter((row) => row.source_type === "scene" && !row.project_id));
  const episodeRows = await fetchRelationRows<{ id: string; project_id: string }>(
    fetcher,
    episodeIds,
    "storyflow_episodes",
  );
  const sceneRows = await fetchRelationRows<{ id: string; project_id: string }>(
    fetcher,
    sceneIds,
    "storyflow_scenes",
  );

  const projectBySourceId = new Map<string, string>([
    ...episodeRows.map((row) => [row.id, row.project_id] as const),
    ...sceneRows.map((row) => [row.id, row.project_id] as const),
  ]);
  const projectIds = uniqueIds(
    workSourceRows.map((row) => ({
      ...row,
      project_id:
        row.project_id ??
        (row.source_type === "project" ? row.source_id : projectBySourceId.get(row.source_id) ?? null),
    })),
  );
  const workRows = await fetchRelationRows<{ id: string; project_id: string; work_type: string }>(
    fetcher,
    projectIds,
    "storyflow_works",
  );
  const workByProject = new Map<string, { id: string; work_type: string }>();
  for (const work of workRows) {
    if (!workByProject.has(work.project_id)) workByProject.set(work.project_id, work);
  }

  return rows.map((row) => {
    const projectId =
      row.project_id ??
      (row.source_type === "project" ? row.source_id : projectBySourceId.get(row.source_id) ?? null);
    const work = projectId ? workByProject.get(projectId) : undefined;
    return {
      ...row,
      project_id: projectId,
      work_id: row.work_id ?? work?.id ?? null,
      work_type: row.work_type ?? work?.work_type ?? null,
    };
  });
}

export function getCommunityRowContext(row: PublicationRow) {
  return getPublicationContext(row);
}

function uniqueIds(rows: PublicationRow[]): string[] {
  return [...new Set(rows.map((row) => row.project_id ?? row.source_id).filter(Boolean))];
}

async function fetchRelationRows<T extends { id: string }>(
  fetcher: CommunityFetcher,
  ids: string[],
  table: string,
): Promise<T[]> {
  if (!ids.length) return [];
  const encodedIds = ids.map((id) => encodeURIComponent(id)).join(",");
  try {
    const rows = await fetcher<T[]>(
      `/rest/v1/${table}?${table === "storyflow_works" ? "project_id" : "id"}=in.(${encodedIds})&select=${table === "storyflow_works" ? "id,project_id,work_type" : "id,project_id"}`,
      { headers: { Accept: "application/json" } },
    );
    return Array.isArray(rows) ? rows : [];
  } catch (cause) {
    if (isSchemaError(cause)) return [];
    throw new CommunityServiceError("service_unavailable", "failed to resolve publication work", 503, cause);
  }
}
