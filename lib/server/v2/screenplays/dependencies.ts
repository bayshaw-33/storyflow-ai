/**
 * KIIKIS V2.2 Screenplay dependency service — Phase 3 Task 3.2 Step 3.
 *
 * Stale semantics:
 *   - recomputeStale: when an upstream unit has a newer version than the one
 *     referenced by an edge, mark the edge `stale`. Downstream content is
 *     NEVER deleted; downstream readiness is never reset.
 *   - resolveStale: keep_old / regenerate / manual_revise / confirm_no_impact.
 *     Every action preserves the old downstream version and appends an
 *     evidence row to storyflow_stale_resolutions. Edges move to
 *     `acknowledged` (keep_old / confirm_no_impact) or are superseded by a new
 *     edge created by the next save (regenerate / manual_revise).
 */

export type DependenciesFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export class ScreenplayDependenciesError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "conflict" | "validation_failed" | "service_unavailable";

  constructor(code: ScreenplayDependenciesError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "ScreenplayDependenciesError";
    this.code = code;
  }
}

interface WorkRow { id: string; owner_id: string }
interface UnitRow { id: string; work_id: string; current_version_id: string | null }
interface EdgeRow {
  id: string;
  work_id: string;
  source_unit_id: string;
  source_unit_version_id: string;
  target_unit_id: string;
  target_unit_version_id: string;
  state: string;
}
interface VersionRow { id: string; unit_id: string; created_at: string }

export const STALE_RESOLUTION_ACTIONS = ["keep_old", "regenerate", "manual_revise", "confirm_no_impact"] as const;
export type StaleResolutionAction = (typeof STALE_RESOLUTION_ACTIONS)[number];

export class ScreenplayDependenciesService {
  private readonly fetcher: DependenciesFetcher;

  constructor(fetcher: DependenciesFetcher) {
    this.fetcher = fetcher;
  }

  /**
   * Recompute edge states for a work: an edge is stale when the source unit's
   * current version differs from the referenced source_unit_version_id.
   * Returns the number of edges flagged stale in this pass.
   */
  async recomputeStale(params: { ownerId: string; workId: string }): Promise<{ staleCount: number }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    const edges = await this.get<EdgeRow[]>(
      `/rest/v1/storyflow_screenplay_dependency_edges?work_id=eq.${encodeURIComponent(params.workId)}&state=in.(current,acknowledged,stale)&select=id,work_id,source_unit_id,source_unit_version_id,target_unit_id,target_unit_version_id,state&order=created_at.asc&limit=5000`,
    );
    const unitIds = [...new Set((edges ?? []).flatMap((e) => [e.source_unit_id, e.target_unit_id]))];
    const units = unitIds.length
      ? await this.get<UnitRow[]>(
          `/rest/v1/storyflow_screenplay_units?id=in.(${unitIds.map((id) => encodeURIComponent(id)).join(",")})&select=id,work_id,current_version_id&limit=${unitIds.length}`,
        )
      : [];
    const currentVersionByUnit = new Map((units ?? []).map((u) => [u.id, u.current_version_id]));

    let staleCount = 0;
    for (const edge of edges ?? []) {
      const upstreamCurrent = currentVersionByUnit.get(edge.source_unit_id) ?? null;
      const isStale = upstreamCurrent !== null && upstreamCurrent !== edge.source_unit_version_id;
      const nextState = isStale ? "stale" : edge.state === "stale" ? "current" : edge.state;
      if (nextState !== edge.state) {
        await this.fetcher(`/rest/v1/storyflow_screenplay_dependency_edges?id=eq.${encodeURIComponent(edge.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal", "Content-Type": "application/json" },
          body: JSON.stringify({ state: nextState }),
        });
        if (nextState === "stale") staleCount += 1;
      } else if (isStale && edge.state !== "stale") {
        staleCount += 1;
      }
    }
    return { staleCount };
  }

  /**
   * Resolve a stale edge pair (upstream → downstream). All four actions
   * preserve the downstream unit version; each appends evidence.
   */
  async resolveStale(params: {
    ownerId: string;
    workId: string;
    upstreamUnitId: string;
    downstreamUnitId: string;
    action: string;
    note?: string;
  }): Promise<{ resolved: true; action: StaleResolutionAction }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    const action = params.action as StaleResolutionAction;
    if (!(STALE_RESOLUTION_ACTIONS as readonly string[]).includes(action)) {
      throw new ScreenplayDependenciesError("validation_failed", `Unknown stale action: ${params.action}.`);
    }

    // Verify the stale pair exists.
    const edges = await this.get<EdgeRow[]>(
      `/rest/v1/storyflow_screenplay_dependency_edges?work_id=eq.${encodeURIComponent(params.workId)}&source_unit_id=eq.${encodeURIComponent(params.upstreamUnitId)}&target_unit_id=eq.${encodeURIComponent(params.downstreamUnitId)}&state=eq.stale&select=id,state&limit=1`,
    );
    if (!edges?.length) {
      throw new ScreenplayDependenciesError("not_found", "No stale edge between these units.");
    }

    // Evidence trail (append-only).
    await this.fetcher("/rest/v1/storyflow_stale_resolutions", {
      method: "POST",
      headers: { Prefer: "return=minimal", "Content-Type": "application/json" },
      body: JSON.stringify({
        work_id: params.workId,
        upstream_unit_id: params.upstreamUnitId,
        downstream_unit_id: params.downstreamUnitId,
        action,
        note: params.note ?? "",
        resolved_by: params.ownerId,
      }),
    });

    // keep_old / confirm_no_impact: acknowledge the edge (no content change).
    // regenerate / manual_revise: also acknowledge; the next saveUnitContent
    // creates a new edge referencing the new upstream version.
    for (const edge of edges) {
      await this.fetcher(`/rest/v1/storyflow_screenplay_dependency_edges?id=eq.${encodeURIComponent(edge.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal", "Content-Type": "application/json" },
        body: JSON.stringify({ state: "acknowledged" }),
      });
    }

    return { resolved: true, action };
  }

  /** List stale edges with upstream/downstream titles for UI panels. */
  async listStale(params: { ownerId: string; workId: string }): Promise<{
    stale: Array<{ edgeId: string; upstreamUnitId: string; downstreamUnitId: string; referencedVersionId: string }>;
  }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    const edges = await this.get<EdgeRow[]>(
      `/rest/v1/storyflow_screenplay_dependency_edges?work_id=eq.${encodeURIComponent(params.workId)}&state=eq.stale&select=id,source_unit_id,source_unit_version_id,target_unit_id&order=created_at.asc&limit=500`,
    );
    return {
      stale: (edges ?? []).map((e) => ({
        edgeId: e.id,
        upstreamUnitId: e.source_unit_id,
        downstreamUnitId: e.target_unit_id,
        referencedVersionId: e.source_unit_version_id,
      })),
    };
  }

  private async assertWorkOwner(ownerId: string, workId: string): Promise<WorkRow> {
    if (!ownerId) throw new ScreenplayDependenciesError("unauthenticated", "Authentication is required.");
    if (!workId) throw new ScreenplayDependenciesError("validation_failed", "workId is required.");
    const rows = await this.get<WorkRow[]>(
      `/rest/v1/storyflow_works?id=eq.${encodeURIComponent(workId)}&select=id,owner_id&limit=1`,
    );
    const work = rows?.[0];
    if (!work) throw new ScreenplayDependenciesError("not_found", "Work not found.");
    if (work.owner_id !== ownerId) throw new ScreenplayDependenciesError("forbidden", "Work access denied.");
    return work;
  }

  private async get<T>(path: string): Promise<T> {
    return this.fetcher<T>(path);
  }
}
