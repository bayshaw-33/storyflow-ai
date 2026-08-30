/**
 * KIIKIS V2.2 WorkUsage service — Phase 5 Task 5.1.
 *
 * Append-only cross-workflow usage links:
 *   - createLink: ownership/grant gate → version integrity → cycle check →
 *     idempotency → insert (rightsSnapshotId = grant id when granted)
 *   - listLinks: incoming / outgoing for a work
 *   - auditOrphans: referential integrity report (work/version/grant)
 *
 * Non-owner sources MUST reference an Active Usage Grant; Revoked grants
 * block new links but never delete historical ones.
 */

import {
  isUsageRole,
  usageLinkFingerprint,
  wouldCreateCycle,
  WorkUsageContractError,
  type UsageRole,
  type WorkUsageLinkV1,
} from "../../../contracts/v2/work-usage.ts";

export type UsageFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export class WorkUsageError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "conflict" | "validation_failed" | "service_unavailable";
  constructor(code: WorkUsageError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "WorkUsageError";
    this.code = code;
  }
}

interface WorkRow {
  id: string;
  owner_id: string;
  project_id?: string | null;
}
interface VersionRow {
  id: string;
  work_id: string;
}
interface GrantRow {
  id: string;
  resource_type: string;
  resource_id: string;
  grantor_id: string;
  grantee_id: string;
  scope: string;
  terms: Record<string, unknown>;
  status: string;
}
interface UsageRow {
  id: string;
  source_work_id: string;
  source_work_version_id: string;
  target_project_id: string;
  target_work_id: string;
  target_work_version_id: string | null;
  target_entity_type: string | null;
  target_entity_id: string | null;
  usage_role: string;
  asset_version_id: string | null;
  rights_snapshot_id: string | null;
  created_at: string;
}

export interface CreateUsageLinkInput {
  ownerId: string;
  sourceWorkId: string;
  sourceWorkVersionId: string;
  targetProjectId: string;
  targetWorkId: string;
  targetWorkVersionId?: string | null;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
  usageRole: UsageRole;
  assetVersionId?: string | null;
  grantId?: string | null;
}

export interface UsageLinkResult extends WorkUsageLinkV1 {
  idempotent: boolean;
}

const ALLOWED_SCOPES = new Set(["use", "adaptation", "collaboration"]);

export class WorkUsageService {
  private readonly fetcher: UsageFetcher;

  constructor(fetcher: UsageFetcher) {
    this.fetcher = fetcher;
  }

  async createLink(input: CreateUsageLinkInput): Promise<UsageLinkResult> {
    if (!isUsageRole(input.usageRole)) {
      throw new WorkUsageError("validation_failed", `Unknown usage role: ${String(input.usageRole)}.`);
    }

    // 1. source work must exist
    const works = await this.query<WorkRow>(
      "storyflow_works",
      { id: input.sourceWorkId },
      "id,owner_id,project_id",
      1,
    );
    const sourceWork = works[0];
    if (!sourceWork) throw new WorkUsageError("not_found", "Source work not found.");

    // 2. ownership or active grant
    let grantId: string | null = input.grantId ?? null;
    if (sourceWork.owner_id !== input.ownerId) {
      const grant = await this.resolveActiveGrant({
        grantId: input.grantId,
        granteeId: input.ownerId,
        resourceId: input.sourceWorkId,
      });
      if (!grant) throw new WorkUsageError("forbidden", "Source work is not owned and no active usage grant covers it.");
      grantId = grant.id;
    }

    // 3. target Work and Project must belong to the caller. The client may
    // choose a target but cannot forge another creator's Work or Project.
    const targetWorks = await this.query<WorkRow>(
      "storyflow_works",
      { id: input.targetWorkId },
      "id,owner_id,project_id",
      1,
    );
    const targetWork = targetWorks[0];
    if (!targetWork) throw new WorkUsageError("not_found", "Target work not found.");
    if (targetWork.owner_id !== input.ownerId) throw new WorkUsageError("forbidden", "Target work access denied.");
    if (targetWork.project_id && targetWork.project_id !== input.targetProjectId) {
      throw new WorkUsageError("validation_failed", "Target project does not match the target work.");
    }

    // 4. source version must belong to source work
    const versions = await this.query<VersionRow>(
      "storyflow_work_versions",
      { id: input.sourceWorkVersionId },
      "id,work_id",
      1,
    );
    const version = versions[0];
    if (!version || version.work_id !== input.sourceWorkId) {
      throw new WorkUsageError("validation_failed", "Source version does not belong to the source work.");
    }

    // 5. cycle protection
    const links = await this.query<UsageRow>("storyflow_work_usage_links", {}, "source_work_id,target_work_id");
    const cycle = wouldCreateCycle(
      links.map((l) => ({ sourceWorkId: l.source_work_id, targetWorkId: l.target_work_id })),
      input.sourceWorkId,
      input.targetWorkId,
    );
    if (cycle) {
      throw new WorkUsageError("conflict", `Linking ${input.sourceWorkId} → ${input.targetWorkId} would create a usage cycle.`);
    }

    // 6. idempotency
    const fingerprint = usageLinkFingerprint({
      sourceWorkId: input.sourceWorkId,
      sourceWorkVersionId: input.sourceWorkVersionId,
      targetWorkId: input.targetWorkId,
      targetEntityType: input.targetEntityType ?? null,
      targetEntityId: input.targetEntityId ?? null,
      usageRole: input.usageRole,
    });
    const existing = await this.query<UsageRow>(
      "storyflow_work_usage_links",
      {},
      "id,source_work_id,source_work_version_id,target_project_id,target_work_id,target_work_version_id,target_entity_type,target_entity_id,usage_role,asset_version_id,rights_snapshot_id,created_at",
      undefined,
      [{ column: "created_at", direction: "desc" }],
    );
    const hit = existing.find((l) =>
      usageLinkFingerprint({
        sourceWorkId: l.source_work_id,
        sourceWorkVersionId: l.source_work_version_id,
        targetWorkId: l.target_work_id,
        targetEntityType: l.target_entity_type,
        targetEntityId: l.target_entity_id,
        usageRole: l.usage_role as UsageRole,
      }) === fingerprint,
    );
    if (hit) return { ...this.toDto(hit), idempotent: true };

    // 7. insert (append-only)
    const body: Record<string, unknown> = {
      source_work_id: input.sourceWorkId,
      source_work_version_id: input.sourceWorkVersionId,
      target_project_id: input.targetProjectId,
      target_work_id: input.targetWorkId,
      target_work_version_id: input.targetWorkVersionId ?? null,
      target_entity_type: input.targetEntityType ?? null,
      target_entity_id: input.targetEntityId ?? null,
      usage_role: input.usageRole,
      asset_version_id: input.assetVersionId ?? null,
      rights_snapshot_id: grantId,
    };
    let rows: UsageRow[] = [];
    try {
      rows = await this.fetcher<UsageRow[]>("/rest/v1/storyflow_work_usage_links", {
        method: "POST",
        headers: { Prefer: "return=representation", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new WorkUsageError("service_unavailable", `Usage link insert failed: ${(error as Error).message}`);
    }
    const row = rows?.[0];
    if (!row) throw new WorkUsageError("service_unavailable", "Usage link insert returned no row.");
    return { ...this.toDto(row), idempotent: false };
  }

  async listLinks(params: {
    ownerId: string;
    workId: string;
    direction: "incoming" | "outgoing" | "both";
  }): Promise<WorkUsageLinkV1[]> {
    const works = await this.query<WorkRow>("storyflow_works", { id: params.workId }, "id,owner_id", 1);
    if (!works[0]) throw new WorkUsageError("not_found", "Work not found.");
    if (works[0].owner_id !== params.ownerId) {
      const grant = await this.resolveActiveGrant({ granteeId: params.ownerId, resourceId: params.workId });
      if (!grant) throw new WorkUsageError("forbidden", "No access to this work's usage links.");
    }
    const filter: Record<string, string> = {};
    if (params.direction === "incoming") filter.target_work_id = params.workId;
    else if (params.direction === "outgoing") filter.source_work_id = params.workId;
    else filter.target_work_id = params.workId; // both → union below
    const incoming = params.direction === "both"
      ? await this.query<UsageRow>("storyflow_work_usage_links", { target_work_id: params.workId }, "*")
      : params.direction === "incoming"
        ? await this.query<UsageRow>("storyflow_work_usage_links", filter, "*")
        : [];
    const outgoing = params.direction === "both"
      ? await this.query<UsageRow>("storyflow_work_usage_links", { source_work_id: params.workId }, "*")
      : params.direction === "outgoing"
        ? await this.query<UsageRow>("storyflow_work_usage_links", filter, "*")
        : [];
    return [...incoming, ...outgoing].map((l) => this.toDto(l));
  }

  async getLink(params: { ownerId: string; usageId: string }): Promise<WorkUsageLinkV1> {
    const rows = await this.query<UsageRow>(
      "storyflow_work_usage_links",
      { id: params.usageId },
      "id,source_work_id,source_work_version_id,target_project_id,target_work_id,target_work_version_id,target_entity_type,target_entity_id,usage_role,asset_version_id,rights_snapshot_id,created_at",
      1,
    );
    const row = rows[0];
    if (!row) throw new WorkUsageError("not_found", "Usage link not found.");
    const works = await this.query<WorkRow>(
      "storyflow_works",
      { id: row.target_work_id },
      "id,owner_id",
      1,
    );
    if (works[0]?.owner_id !== params.ownerId) {
      const source = await this.query<WorkRow>(
        "storyflow_works",
        { id: row.source_work_id },
        "id,owner_id",
        1,
      );
      const grant = await this.resolveActiveGrant({
        granteeId: params.ownerId,
        resourceId: row.target_work_id,
      });
      if (source[0]?.owner_id !== params.ownerId && !grant) {
        throw new WorkUsageError("forbidden", "No access to this usage link.");
      }
    }
    return this.toDto(row);
  }

  async auditOrphans(): Promise<Array<{ linkId: string; reason: string }>> {
    const links = await this.query<UsageRow>("storyflow_work_usage_links", {}, "*");
    const orphans: Array<{ linkId: string; reason: string }> = [];
    const workIds = new Set((await this.query<WorkRow>("storyflow_works", {}, "id")).map((w) => w.id));
    const versionIds = new Set((await this.query<VersionRow>("storyflow_work_versions", {}, "id")).map((v) => v.id));
    const grantIds = new Set((await this.query<GrantRow>("storyflow_resource_grants", {}, "id")).map((g) => g.id));
    for (const link of links) {
      if (!workIds.has(link.source_work_id)) orphans.push({ linkId: link.id, reason: "missing_source_work" });
      if (!versionIds.has(link.source_work_version_id)) orphans.push({ linkId: link.id, reason: "missing_source_version" });
      if (!workIds.has(link.target_work_id)) orphans.push({ linkId: link.id, reason: "missing_target_work" });
      if (link.rights_snapshot_id && !grantIds.has(link.rights_snapshot_id)) orphans.push({ linkId: link.id, reason: "missing_grant" });
    }
    return orphans;
  }

  // -------------------------------------------------------------------------

  private async resolveActiveGrant(params: {
    grantId?: string | null;
    granteeId: string;
    resourceId: string;
  }): Promise<GrantRow | null> {
    const select = "id,resource_type,resource_id,grantor_id,grantee_id,scope,terms,status";
    let rows: GrantRow[];
    if (params.grantId) {
      rows = await this.query<GrantRow>("storyflow_resource_grants", { id: params.grantId }, select, 1);
    } else {
      rows = await this.query<GrantRow>(
        "storyflow_resource_grants",
        { grantee_id: params.granteeId, resource_id: params.resourceId, status: "active" },
        select,
        50,
      );
    }
    const grant = rows[0];
    if (!grant || grant.status !== "active") return null;
    if (!ALLOWED_SCOPES.has(grant.scope)) return null;
    if (grant.resource_id !== params.resourceId) return null;
    return grant;
  }

  private async query<T>(
    table: string,
    filter: Record<string, string>,
    select: string,
    limit?: number,
    order?: Array<{ column: string; direction: "asc" | "desc" }>,
  ): Promise<T[]> {
    const params = new URLSearchParams();
    if (select) params.set("select", select);
    for (const [key, value] of Object.entries(filter)) {
      if (value === "") continue;
      params.append(key, `eq.${value}`);
    }
    if (order) {
      params.set("order", order.map((o) => `${o.column}.${o.direction}`).join(","));
    }
    if (limit !== undefined) params.set("limit", String(limit));
    const path = `/rest/v1/${table}?${params.toString()}`;
    try {
      return await this.fetcher<T[]>(path);
    } catch (error) {
      throw new WorkUsageError("service_unavailable", `Query ${table} failed: ${(error as Error).message}`);
    }
  }

  private toDto(row: UsageRow): WorkUsageLinkV1 {
    return {
      id: row.id,
      sourceWorkId: row.source_work_id,
      sourceWorkVersionId: row.source_work_version_id,
      targetProjectId: row.target_project_id,
      targetWorkId: row.target_work_id,
      targetWorkVersionId: row.target_work_version_id,
      targetEntityType: row.target_entity_type,
      targetEntityId: row.target_entity_id,
      usageRole: row.usage_role as UsageRole,
      assetVersionId: row.asset_version_id,
      rightsSnapshotId: row.rights_snapshot_id,
      createdAt: row.created_at,
    };
  }
}
