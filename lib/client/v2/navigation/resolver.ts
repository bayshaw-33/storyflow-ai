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

import type { WorkType } from "../../../contracts/v2/work.ts";
import {
  buildUnifiedWorkbenchUrl,
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
}

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
  return `${base}?${sp.toString()}`;
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
      return isInternalAppRoute(input.resultUrl) ? input.resultUrl : null;
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
}): string | null {
  return isInternalAppRoute(input.resultUrl) ? input.resultUrl : null;
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
