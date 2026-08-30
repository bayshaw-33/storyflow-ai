import {
  NO_COMMUNITY_REUSE,
  type CommunityReuseCapability,
  type PublicationRow,
} from "../../../contracts/v2/community.ts";
import type { CommunityFetcher } from "./publications.ts";

type GrantRow = { id: string; resource_id: string; scope: string; status: string };
type VersionRow = { id: string; work_id: string };
type OfferRow = { id: string; asset_id: string; status: string };
type TargetWorkRow = { id: string; project_id: string; work_type: string; title: string; status: string };

export interface CommunityReuseTarget {
  readonly workId: string;
  readonly projectId: string;
  readonly workType: string;
  readonly title: string;
  readonly status: string;
}

const NONE = NO_COMMUNITY_REUSE;

/**
 * Resolve community reuse from durable rights facts only. Publication copy and
 * client actions are deliberately ignored: ownership, active grants, immutable
 * Work versions, and active asset offers are the only accepted inputs.
 */
export async function resolvePublicationReuseCapabilities(
  fetcher: CommunityFetcher,
  rows: Array<Pick<PublicationRow, "id" | "source_type" | "source_id" | "publisher_id" | "work_id">>,
  viewerId: string | null,
): Promise<Map<string, CommunityReuseCapability>> {
  const result = new Map(rows.map((row) => [row.id, NONE]));
  if (!viewerId || rows.length === 0) return result;

  const workRows = rows.filter((row) => isWorkSource(row.source_type) && Boolean(row.work_id));
  const workIds = unique(workRows.map((row) => row.work_id).filter((id): id is string => Boolean(id)));
  const assetRows = rows.filter((row) => row.source_type === "asset");
  const assetIds = unique(assetRows.map((row) => row.source_id));

  const [versions, grants, offers] = await Promise.all([
    workIds.length
      ? fetcher<VersionRow[]>(`/rest/v1/storyflow_work_versions?work_id=in.(${encodeIds(workIds)})&select=id,work_id&order=version_no.desc,created_at.desc&limit=${Math.min(workIds.length * 10, 1000)}`)
      : Promise.resolve([]),
    workIds.length
      ? fetcher<GrantRow[]>(`/rest/v1/storyflow_resource_grants?grantee_id=eq.${encodeURIComponent(viewerId)}&resource_id=in.(${encodeIds(workIds)})&status=eq.active&scope=in.(use,adaptation,collaboration)&select=id,resource_id,scope,status&order=created_at.desc&limit=1000`)
      : Promise.resolve([]),
    assetIds.length
      ? fetcher<OfferRow[]>(`/rest/v1/storyflow_v2_license_offers?asset_id=in.(${encodeIds(assetIds)})&status=eq.active&select=id,asset_id,status&order=created_at.desc&limit=1000`)
      : Promise.resolve([]),
  ]);

  const versionByWork = firstBy(versions ?? [], (row) => row.work_id);
  const grantByWork = firstBy(grants ?? [], (row) => row.resource_id);
  const offerByAsset = firstBy(offers ?? [], (row) => row.asset_id);

  for (const row of rows) {
    if (row.source_type === "asset") {
      if (row.publisher_id === viewerId) continue;
      const offer = offerByAsset.get(row.source_id);
      if (offer) {
        result.set(row.id, { ...NONE, mode: "offer", offerId: offer.id, reason: "An active License Offer is available." });
      }
      continue;
    }

    if (!isWorkSource(row.source_type) || !row.work_id) continue;
    const version = versionByWork.get(row.work_id);
    if (!version) continue;
    if (row.publisher_id === viewerId) {
      result.set(row.id, {
        mode: "owned",
        sourceWorkId: row.work_id,
        sourceWorkVersionId: version.id,
        grantId: null,
        offerId: null,
        reason: "Source Work is owned by the viewer.",
      });
      continue;
    }
    const grant = grantByWork.get(row.work_id);
    if (grant) {
      result.set(row.id, {
        mode: "granted",
        sourceWorkId: row.work_id,
        sourceWorkVersionId: version.id,
        grantId: grant.id,
        offerId: null,
        reason: `Active ${grant.scope} grant verified.`,
      });
    }
  }

  return result;
}

export async function listCommunityReuseTargets(
  fetcher: CommunityFetcher,
  viewerId: string,
  excludeWorkId?: string | null,
): Promise<CommunityReuseTarget[]> {
  if (!viewerId) return [];
  const rows = await fetcher<TargetWorkRow[]>(
    `/rest/v1/storyflow_works?owner_id=eq.${encodeURIComponent(viewerId)}&status=not.eq.archived&select=id,project_id,work_type,title,status&order=updated_at.desc&limit=200`,
  );
  return (rows ?? [])
    .filter((row) => row.id !== excludeWorkId)
    .map((row) => ({ workId: row.id, projectId: row.project_id, workType: row.work_type, title: row.title, status: row.status }));
}

function isWorkSource(sourceType: string): boolean {
  return sourceType === "project" || sourceType === "episode" || sourceType === "scene";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function encodeIds(ids: string[]): string {
  return ids.map(encodeURIComponent).join(",");
}

function firstBy<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) if (!result.has(key(row))) result.set(key(row), row);
  return result;
}
