/**
 * KIIKIS V2.2 shared navigation resolver.
 *
 * Dashboard, Task Center and KK all consume this module so they cannot
 * maintain contradictory fixture routes (PRD §6.3 K22-JOB-006).
 *
 * Only same-origin app paths are emitted for in-app navigation; external URLs
 * are rejected to prevent open redirect (PRD §6.1, project hard constraint:
 * "外部 URL 只用于'查看结果'，同源应用路由规范化，无开放重定向").
 */

import { isWorkType, type WorkType } from "../../../contracts/v2/work.ts";
import {
  buildUnifiedWorkbenchUrl,
  isUnifiedProductionStage,
  parseUnifiedWorkbenchQuery,
  type UnifiedProductionStage,
} from "../../../contracts/v2/unified-workbench.ts";

const WORKBENCH_ROUTES: Record<Exclude<WorkType, UnifiedProductionStage>, string> = {
  song: "/song-workbench",
  // Phase 0 reuses existing /casting for voice worktype; Phase 5 builds the
  // dedicated voice workbench and this mapping is updated then.
  voice: "/casting",
  editing: "/editor",
};

export interface WorkbenchRouteParams {
  projectId: string;
  workId?: string | null;
  unitId?: string | null;
}

export type ProjectWorkflowType = WorkType | "creation" | "continuation" | "viral";

/**
 * Returns `/<workbench>?projectId=...&workId=...` for a WorkType.
 * Ids are URL-encoded so crafted projectIds cannot inject extra query params.
 */
export function resolveWorkbenchRoute(
  workType: WorkType,
  params: WorkbenchRouteParams,
): string {
  if (workType === "script" || workType === "art" || workType === "storyboard" || workType === "video") {
    return buildUnifiedWorkbenchUrl({ ...params, tab: workType });
  }

  const base = WORKBENCH_ROUTES[workType];
  const sp = new URLSearchParams({ projectId: params.projectId });
  if (params.workId) sp.set("workId", params.workId);
  if (workType === "editing" && params.unitId) sp.set("sourceUnitId", params.unitId);
  return `${base}?${sp.toString()}`;
}

export function resolveProjectWorkbenchRoute(
  workflowType: ProjectWorkflowType | string,
  params: WorkbenchRouteParams,
): string {
  if (workflowType === "creation" || workflowType === "continuation") {
    return buildUnifiedWorkbenchUrl({ ...params, tab: "script" });
  }
  if (workflowType === "viral" || workflowType === "adaptation") {
    const projectId = encodeURIComponent(params.projectId);
    const viralProjectId = params.projectId.startsWith("viral-")
      ? params.projectId.slice("viral-".length)
      : params.projectId;
    return `/viral-workbench?projectId=${encodeURIComponent(viralProjectId)}&dashboardProjectId=${projectId}`;
  }
  if (workflowType === "dub") {
    return resolveWorkbenchRoute("voice", params);
  }
  if (workflowType === "edit") {
    return resolveWorkbenchRoute("editing", params);
  }
  if (isWorkType(workflowType)) {
    return resolveWorkbenchRoute(workflowType, params);
  }
  throw new Error(`Unsupported project workflow type: ${workflowType}`);
}

export type ArtWorkbenchEntry =
  | { kind: "standalone" }
  | {
      kind: "project";
      projectId: string;
      workId: string | null;
      unitId: string | null;
    };

export function resolveArtWorkbenchEntry(
  search: string | Pick<URLSearchParams, "get">,
): ArtWorkbenchEntry {
  const query = typeof search === "string" ? new URLSearchParams(search) : search;
  const projectId = query.get("projectId");
  if (!projectId) return { kind: "standalone" };
  return {
    kind: "project",
    projectId,
    workId: query.get("workId"),
    unitId: query.get("unitId") ?? query.get("sourceUnitId"),
  };
}

/**
 * Stable Job detail page (PRD §6.3 K22-JOB-001).
 */
export function resolveJobDetailUrl(jobId: string): string {
  if (!jobId) throw new Error("jobId is required for job detail url");
  return `/job-center/${encodeURIComponent(jobId)}`;
}

export type JobActionKind =
  | "view_details"
  | "view_results"
  | "cancel"
  | "retry";

export interface ActionTargetInput {
  jobId?: string;
  resultUrl?: string | null;
  projectId?: string | null;
  workId?: string | null;
  workbenchType?: string | null;
}

/**
 * Returns the in-app URL for an action, or null when the action must be
 * disabled (PRD §6.1: "卡片无合法目标时必须禁用并解释，不能表现为可点击").
 *
 * - view_details → /job-center/:jobId (always available when jobId exists)
 * - view_results → internal resultUrl only; external → null (disabled)
 * - cancel/retry → POST /api/v2/jobs/:id (server action, not a page route)
 */
export function resolveActionTarget(
  action: { kind: JobActionKind },
  input: ActionTargetInput,
): string | null {
  switch (action.kind) {
    case "view_details":
      return input.jobId ? resolveJobDetailUrl(input.jobId) : null;
    case "view_results":
      return resolveJobResultUrl(input);
    case "cancel":
    case "retry":
      return input.jobId
        ? `/api/v2/jobs/${encodeURIComponent(input.jobId)}`
        : null;
    default:
      return null;
  }
}

/**
 * Returns the in-app result URL for a completed Job, or null when absent or
 * external. Used by Dashboard "查看结果" and KK completion jumps.
 */
export function resolveJobResultUrl(input: {
  resultUrl?: string | null;
  projectId?: string | null;
  workId?: string | null;
  workbenchType?: string | null;
}): string | null {
  if (!isInternalAppRoute(input.resultUrl)) return null;

  const resultUrl = input.resultUrl;
  const url = new URL(resultUrl, "https://kiikis.local");
  const professionalPaths = new Set([
    "/song-workbench",
    "/casting",
    "/editor",
    "/viral-workbench",
  ]);
  if (professionalPaths.has(url.pathname)) return resultUrl;

  const projectId = input.projectId || url.searchParams.get("projectId");
  if (!projectId) return resultUrl;

  const legacyStages: Record<string, UnifiedProductionStage> = {
    "/script-workbench": "script",
    "/art-workbench": "art",
    "/storyboard-workbench": "storyboard",
    "/video-workbench": "video",
  };
  const isProductionRoute = url.pathname === "/production" || url.pathname === "/production-workbench";
  if (!(url.pathname in legacyStages) && !isProductionRoute) return resultUrl;

  if (input.workbenchType && !isUnifiedProductionStage(input.workbenchType)) {
    if (["song", "voice", "editing", "viral", "adaptation", "dub", "edit"].includes(input.workbenchType)) {
      return resolveProjectWorkbenchRoute(input.workbenchType, {
        projectId,
        workId: input.workId || url.searchParams.get("workId"),
        unitId: url.searchParams.get("unitId") ?? url.searchParams.get("sourceUnitId"),
      });
    }
  }

  const explicitStage = input.workbenchType && isUnifiedProductionStage(input.workbenchType)
    ? input.workbenchType
    : null;
  const routeStage = legacyStages[url.pathname]
    ?? (url.pathname === "/production-workbench" && !url.searchParams.has("tab") && !url.searchParams.has("mode")
      ? "storyboard"
      : parseUnifiedWorkbenchQuery(url.searchParams).tab);
  const query = new URLSearchParams(url.searchParams);
  const workId = input.workId || query.get("workId");
  const unitId = query.get("unitId") ?? query.get("sourceUnitId");

  query.set("projectId", projectId);
  if (workId) query.set("workId", workId);
  query.set("tab", explicitStage ?? routeStage);
  if (unitId) query.set("unitId", unitId);
  query.delete("mode");
  query.delete("sourceUnitId");
  return `/production?${query.toString()}${url.hash}`;
}

/**
 * True only for same-origin app paths ("/foo", "/foo?bar=1").
 * Rejects protocol-relative ("//evil"), absolute URLs, and empty values.
 */
export function isInternalAppRoute(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0) return false;
  if (url.startsWith("//")) return false;
  if (!url.startsWith("/")) return false;
  return true;
}
