import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CountRow = { universe_id: string };
type EntityRow = CountRow & { type: string };
type CanonRow = CountRow & { is_locked: boolean };
type InboxRow = CountRow & { status: string };
type LinkRow = CountRow & { project_role: string };
type SnapshotRow = CountRow & { state_json: Record<string, unknown> | null };

type UniverseSummary = {
  characterCount: number;
  locationCount: number;
  organizationCount: number;
  ruleCount: number;
  relationshipCount: number;
  canonCount: number;
  lockedCanonCount: number;
  pendingInbox: number;
  linkedProjects: number;
  linkedWorkflowCount: number;
  timelineCount: number;
  productionAssetCount: number;
  canonCheckCount: number;
};

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const memberships = await serviceFetch<Array<{ team_id: string }>>(
      `/rest/v1/storyflow_team_members?user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&select=team_id`,
    );
    const teamIds = memberships.map((row) => row.team_id).filter(Boolean);
    const accessFilter = teamIds.length
      ? `or=(user_id.eq.${encodeURIComponent(user.id)},team_id.in.(${teamIds.join(",")}))`
      : `user_id=eq.${encodeURIComponent(user.id)}`;
    const universes = await serviceFetch<Array<{ id: string }>>(
      `/rest/v1/storyflow_universes?${accessFilter}&select=id`,
    );

    const ids = universes.map((row) => row.id).filter(Boolean);
    if (!ids.length) return ok({ summaries: {} });
    const universeFilter = `universe_id=in.(${ids.join(",")})`;

    const [entities, relationships, timeline, canon, inbox, links, snapshots, reports] = await Promise.all([
      serviceFetch<EntityRow[]>(`/rest/v1/storyflow_universe_entities?${universeFilter}&select=universe_id,type`),
      serviceFetch<CountRow[]>(`/rest/v1/storyflow_universe_relationships?${universeFilter}&select=universe_id`),
      serviceFetch<CountRow[]>(`/rest/v1/storyflow_universe_timeline?${universeFilter}&select=universe_id`),
      serviceFetch<CanonRow[]>(`/rest/v1/storyflow_canon_facts?${universeFilter}&select=universe_id,is_locked`),
      serviceFetch<InboxRow[]>(`/rest/v1/storyflow_universe_inbox_items?${universeFilter}&select=universe_id,status`),
      serviceFetch<LinkRow[]>(`/rest/v1/storyflow_universe_project_links?${universeFilter}&select=universe_id,project_role`),
      serviceFetch<SnapshotRow[]>(`/rest/v1/storyflow_canon_state_snapshots?${universeFilter}&select=universe_id,state_json`),
      serviceFetch<CountRow[]>(`/rest/v1/storyflow_canon_check_reports?${universeFilter}&select=universe_id`),
    ]);

    const summaries = Object.fromEntries(ids.map((id) => [id, emptySummary()]));
    for (const row of entities) {
      const summary = summaries[row.universe_id];
      if (!summary) continue;
      if (row.type === "character") summary.characterCount += 1;
      else if (row.type === "location") summary.locationCount += 1;
      else if (row.type === "organization") summary.organizationCount += 1;
      else if (row.type === "rule" || row.type === "concept") summary.ruleCount += 1;
    }
    for (const row of relationships) increment(summaries, row.universe_id, "relationshipCount");
    for (const row of timeline) increment(summaries, row.universe_id, "timelineCount");
    for (const row of canon) {
      increment(summaries, row.universe_id, "canonCount");
      if (row.is_locked) increment(summaries, row.universe_id, "lockedCanonCount");
    }
    for (const row of inbox) if (row.status === "pending") increment(summaries, row.universe_id, "pendingInbox");
    const roles = new Map<string, Set<string>>();
    for (const row of links) {
      increment(summaries, row.universe_id, "linkedProjects");
      const set = roles.get(row.universe_id) || new Set<string>();
      set.add(row.project_role);
      roles.set(row.universe_id, set);
    }
    for (const [universeId, roleSet] of roles) summaries[universeId].linkedWorkflowCount = roleSet.size;
    for (const row of snapshots) {
      const state = row.state_json || {};
      const assets = Array.isArray(state.assets) ? state.assets.length : 0;
      const productionAssets = Array.isArray(state.production_assets) ? state.production_assets.length : 0;
      summaries[row.universe_id].productionAssetCount += assets + productionAssets;
    }
    for (const row of reports) increment(summaries, row.universe_id, "canonCheckCount");

    return ok({ summaries });
  } catch (error) {
    return apiError(error, "读取宇宙汇总失败。");
  }
}

function emptySummary(): UniverseSummary {
  return {
    characterCount: 0,
    locationCount: 0,
    organizationCount: 0,
    ruleCount: 0,
    relationshipCount: 0,
    canonCount: 0,
    lockedCanonCount: 0,
    pendingInbox: 0,
    linkedProjects: 0,
    linkedWorkflowCount: 0,
    timelineCount: 0,
    productionAssetCount: 0,
    canonCheckCount: 0,
  };
}

function increment(
  summaries: Record<string, UniverseSummary>,
  universeId: string,
  key: keyof UniverseSummary,
) {
  const summary = summaries[universeId];
  if (summary) summary[key] += 1;
}
