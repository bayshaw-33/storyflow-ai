import type { GenerationJob, GenerationJobStatus, JobAction, JobTiming } from "@/lib/contracts/v2";
import { isRetiredNovelRecord } from "../../../v2/retired-novel.ts";

/**
 * Fetcher for Supabase REST. The optional `init` makes the fetcher capable of
 * PATCH (used by transitionJob) while staying backward compatible with
 * GET-only callers (serviceFetch and existing mocks accept `(path)`).
 */
export type JobsFetcher = <T = unknown>(path: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => Promise<T>;

export class V2JobsError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "conflict" | "service_unavailable" | "validation_failed";

  constructor(code: V2JobsError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "V2JobsError";
    this.code = code;
  }
}

type LegacyJobRow = {
  id: string;
  owner_id?: string | null;
  user_id?: string | null;
  project_id?: string | null;
  job_type?: string | null;
  step_key?: string | null;
  export_type?: string | null;
  phase_key?: string | null;
  status?: string | null;
  error?: string | null;
  error_message?: string | null;
  result_metadata?: Record<string, unknown> | null;
  output_snapshot?: string | null;
  created_at: string;
  updated_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  latency_ms?: number | null;
};

type ProjectMarkerRow = { id: string; workflow_type?: string | null; mode?: string | null; data?: Record<string, unknown> | null };

export function mapLegacyJob(row: LegacyJobRow, now = new Date()): GenerationJob {
  const status = mapStatus(row.status);
  const metadata = row.result_metadata || {};
  const completed = numberValue(metadata.completedCount) ?? (status === "completed" ? 1 : 0);
  const total = numberValue(metadata.totalCount) ?? (status === "completed" ? 1 : 0);
  const resultReferences = Array.isArray(metadata.results) ? metadata.results.map(String).filter(Boolean) : [];
  const timing = buildTiming(row, metadata, now);
  const actions: JobAction[] = status === "failed" || status === "partial_failure" ? ["retry", "view_details"] : status === "completed" ? ["view_results", "view_details"] : status === "cancelled" ? ["view_details"] : ["cancel", "view_details"];
  return {
    id: row.id,
    projectId: row.project_id || null,
    jobType: mapJobType(row.job_type, row.step_key),
    status,
    phase: status,
    progress: { completed, total },
    timing,
    resultReferences,
    failedItemCount: status === "partial_failure" ? Math.max(0, total - completed) : 0,
    actions,
    createdAt: row.created_at,
    completedAt: row.completed_at || null,
  };
}

export async function listUnifiedJobs(params: { fetcher: JobsFetcher; userId: string; projectId?: string | null; jobType?: string | null; status?: string | null; now?: Date }) {
  if (!params.userId) throw new V2JobsError("unauthenticated", "Authentication is required.");
  const projectFilter = params.projectId ? `&project_id=eq.${encodeURIComponent(params.projectId)}` : "";
  const statusFilter = params.status ? `&status=eq.${encodeURIComponent(params.status)}` : "";
  try {
    const [textTasks, mediaJobs, exports] = await Promise.all([
      query<LegacyJobRow[]>(params.fetcher, `/rest/v1/storyflow_generation_tasks?user_id=eq.${encodeURIComponent(params.userId)}${projectFilter}${statusFilter}&select=id,user_id,project_id,step_key,phase_key,status,error_message,output_snapshot,created_at,started_at,completed_at,latency_ms&order=created_at.desc&limit=200`),
      query<LegacyJobRow[]>(params.fetcher, `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(params.userId)}${projectFilter}${statusFilter}&select=id,owner_id,project_id,job_type,status,error,result_metadata,created_at,updated_at,completed_at&order=created_at.desc&limit=200`),
      query<LegacyJobRow[]>(params.fetcher, `/rest/v1/storyflow_exports?user_id=eq.${encodeURIComponent(params.userId)}${projectFilter}${statusFilter}&select=id,user_id,project_id,export_type,status,created_at,updated_at,completed_at&order=created_at.desc&limit=200`),
    ]);
    const rawItems = [
      ...(textTasks || []).map((row) => mapLegacyJob({ ...row, job_type: "text" }, params.now)),
      ...(mediaJobs || []).map((row) => mapLegacyJob(row, params.now)),
      ...(exports || []).map((row) => mapLegacyJob({ ...row, job_type: "export" }, params.now)),
    ];
    const retiredProjectIds = await readRetiredProjectIds(params.fetcher, rawItems.map((job) => job.projectId));
    const items = rawItems
      .filter((job) => !job.projectId || !retiredProjectIds.has(job.projectId))
      .filter((job) => !params.jobType || job.jobType === params.jobType)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items, hasMore: false };
  } catch (error) {
    if (error instanceof V2JobsError) throw error;
    throw new V2JobsError("service_unavailable", error instanceof Error ? error.message : "Job service unavailable.");
  }
}

export async function readUnifiedJob(params: { fetcher: JobsFetcher; userId: string; jobId: string; now?: Date }) {
  if (!params.userId) throw new V2JobsError("unauthenticated", "Authentication is required.");
  if (!params.jobId) throw new V2JobsError("validation_failed", "Job id is required.");
  try {
    const sources = await Promise.all([
      query<LegacyJobRow[]>(params.fetcher, `/rest/v1/storyflow_generation_tasks?id=eq.${encodeURIComponent(params.jobId)}&user_id=eq.${encodeURIComponent(params.userId)}&select=id,user_id,project_id,step_key,phase_key,status,error_message,output_snapshot,created_at,started_at,completed_at,latency_ms&limit=1`),
      query<LegacyJobRow[]>(params.fetcher, `/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(params.jobId)}&owner_id=eq.${encodeURIComponent(params.userId)}&select=id,owner_id,project_id,job_type,status,error,result_metadata,created_at,updated_at,completed_at&limit=1`),
      query<LegacyJobRow[]>(params.fetcher, `/rest/v1/storyflow_exports?id=eq.${encodeURIComponent(params.jobId)}&user_id=eq.${encodeURIComponent(params.userId)}&select=id,user_id,project_id,export_type,status,created_at,updated_at,completed_at&limit=1`),
    ]);
    const row = sources[0][0] || sources[1][0] || sources[2][0];
    if (!row) throw new V2JobsError("not_found", "Job not found.");
    const retiredProjectIds = await readRetiredProjectIds(params.fetcher, [row.project_id]);
    if (row.project_id && retiredProjectIds.has(row.project_id)) throw new V2JobsError("not_found", "Job not found.");
    return { job: mapLegacyJob({ ...row, job_type: row.job_type || (row.export_type ? "export" : "text") }, params.now) };
  } catch (error) {
    if (error instanceof V2JobsError) throw error;
    throw new V2JobsError("service_unavailable", error instanceof Error ? error.message : "Job service unavailable.");
  }
}

function mapStatus(status: string | null | undefined): GenerationJobStatus {
  if (status === "draft" || status === "pending_confirm" || status === "queued" || status === "running" || status === "result_ingesting" || status === "completed" || status === "partial_failure" || status === "failed" || status === "cancelled") return status;
  if (status === "generating" || status === "streaming" || status === "retrying") return "running";
  if (status === "cancel_requested") return "queued";
  return "failed";
}

function mapJobType(jobType: string | null | undefined, stepKey?: string | null): GenerationJob["jobType"] {
  if (jobType === "image" || jobType === "video" || jobType === "audio" || jobType === "export" || jobType === "transfer" || jobType === "analysis") return jobType;
  if (stepKey?.includes("analysis")) return "analysis";
  return "text";
}

function buildTiming(row: LegacyJobRow, metadata: Record<string, unknown>, now: Date): JobTiming {
  const start = new Date(row.started_at || row.created_at).getTime();
  const end = row.completed_at ? new Date(row.completed_at).getTime() : now.getTime();
  const elapsedSeconds = Math.max(0, Math.round((end - start) / 1000));
  const history = Array.isArray(metadata.historySeconds) ? metadata.historySeconds.map(Number).filter(Number.isFinite) : [];
  const min = history.length ? Math.min(...history) : null;
  const max = history.length ? Math.max(...history) : null;
  return { elapsedSeconds, estimatedSecondsMin: min, estimatedSecondsMax: max, estimateConfidence: history.length >= 5 ? "high" : history.length ? "medium" : "low" };
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function query<T>(fetcher: JobsFetcher, path: string): Promise<T> {
  try { return await fetcher<T>(path); }
  catch (error) { if (error instanceof V2JobsError) throw error; throw new V2JobsError("service_unavailable", error instanceof Error ? error.message : "Job service unavailable."); }
}

async function readRetiredProjectIds(fetcher: JobsFetcher, projectIds: Array<string | null | undefined>): Promise<Set<string>> {
  const ids = Array.from(new Set(projectIds.filter((id): id is string => Boolean(id))));
  if (!ids.length) return new Set();
  const rows = await query<ProjectMarkerRow[]>(fetcher, `/rest/v1/storyflow_projects?id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,workflow_type,mode,data`);
  return new Set((rows || []).filter(isRetiredNovelRecord).map((row) => row.id));
}

/**
 * Compute the actions available for a job status (PRD §6.3).
 * Extracted so transitionJob can recompute after a state change without a
 * second read.
 */
function actionsForStatus(status: GenerationJobStatus): JobAction[] {
  if (status === "failed" || status === "partial_failure") return ["retry", "view_details"];
  if (status === "completed") return ["view_results", "view_details"];
  if (status === "cancelled") return ["view_details"];
  return ["cancel", "view_details"];
}

/**
 * Transition a job's state via cancel or retry (PRD §6.3 K22-JOB-004).
 *
 * State machine:
 * - cancel: only queued/running/result_ingesting → cancelled. Records
 *   cancelRequested in metadata so provider cancellation is tracked even when
 *   the provider task can't be truly stopped. completed/failed/cancelled are
 *   not cancellable.
 * - retry: only failed/partial_failure → queued (error cleared).
 *   completed/cancelled/queued/running are not retryable.
 *
 * Owner is validated by readUnifiedJob (queries filter by user_id/owner_id, so
 * a mismatch yields not_found). The PATCH is sent to all three legacy tables;
 * only the table that actually holds the row will update.
 */
export async function transitionJob(params: {
  fetcher: JobsFetcher;
  userId: string;
  jobId: string;
  action: "cancel" | "retry";
  now?: Date;
}): Promise<{ job: GenerationJob }> {
  if (!params.userId) throw new V2JobsError("unauthenticated", "Authentication is required.");
  if (!params.jobId) throw new V2JobsError("validation_failed", "Job id is required.");

  // Read current job — validates owner (filtered by user_id/owner_id) and existence.
  const { job } = await readUnifiedJob({
    fetcher: params.fetcher,
    userId: params.userId,
    jobId: params.jobId,
    now: params.now,
  });

  const nowIso = (params.now || new Date()).toISOString();
  const encJobId = encodeURIComponent(params.jobId);
  const encUserId = encodeURIComponent(params.userId);

  if (params.action === "cancel") {
    if (job.status !== "queued" && job.status !== "running" && job.status !== "result_ingesting") {
      throw new V2JobsError(
        "validation_failed",
        `Cannot cancel job in status "${job.status}". Only queued, running, or result_ingesting jobs can be cancelled.`,
      );
    }
    // PATCH all three legacy tables; only the one holding the row updates.
    // jobs table also records cancelRequested in result_metadata.
    const taskBody = JSON.stringify({ status: "cancelled", completed_at: nowIso });
    const jobBody = JSON.stringify({ status: "cancelled", completed_at: nowIso, result_metadata: { cancelRequested: true } });
    const exportBody = JSON.stringify({ status: "cancelled", completed_at: nowIso });
    await Promise.all([
      patchRow(params.fetcher, `/rest/v1/storyflow_generation_tasks?id=eq.${encJobId}&user_id=eq.${encUserId}`, taskBody),
      patchRow(params.fetcher, `/rest/v1/storyflow_generation_jobs?id=eq.${encJobId}&owner_id=eq.${encUserId}`, jobBody),
      patchRow(params.fetcher, `/rest/v1/storyflow_exports?id=eq.${encJobId}&user_id=eq.${encUserId}`, exportBody),
    ]);
    const nextStatus: GenerationJobStatus = "cancelled";
    return { job: { ...job, status: nextStatus, phase: nextStatus, completedAt: nowIso, actions: actionsForStatus(nextStatus) } };
  }

  if (params.action === "retry") {
    if (job.status !== "failed" && job.status !== "partial_failure") {
      throw new V2JobsError(
        "validation_failed",
        `Cannot retry job in status "${job.status}". Only failed or partial_failure jobs can be retried.`,
      );
    }
    const taskBody = JSON.stringify({ status: "queued", error_message: null, completed_at: null });
    const jobBody = JSON.stringify({ status: "queued", error: null, completed_at: null });
    const exportBody = JSON.stringify({ status: "queued", completed_at: null });
    await Promise.all([
      patchRow(params.fetcher, `/rest/v1/storyflow_generation_tasks?id=eq.${encJobId}&user_id=eq.${encUserId}`, taskBody),
      patchRow(params.fetcher, `/rest/v1/storyflow_generation_jobs?id=eq.${encJobId}&owner_id=eq.${encUserId}`, jobBody),
      patchRow(params.fetcher, `/rest/v1/storyflow_exports?id=eq.${encJobId}&user_id=eq.${encUserId}`, exportBody),
    ]);
    const nextStatus: GenerationJobStatus = "queued";
    return { job: { ...job, status: nextStatus, phase: nextStatus, completedAt: null, failedItemCount: 0, actions: actionsForStatus(nextStatus) } };
  }

  throw new V2JobsError("validation_failed", `Unknown action "${params.action}". Use "cancel" or "retry".`);
}

/** PATCH helper that wraps the fetcher and converts errors to V2JobsError. */
async function patchRow(fetcher: JobsFetcher, path: string, body: string): Promise<void> {
  try {
    await fetcher(path, { method: "PATCH", body, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    if (error instanceof V2JobsError) throw error;
    throw new V2JobsError("service_unavailable", error instanceof Error ? error.message : "Job service unavailable.");
  }
}
