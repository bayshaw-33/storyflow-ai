import type { GenerationJob, GenerationJobStatus, JobAction, JobTiming } from "@/lib/contracts/v2";

export type JobsFetcher = <T = unknown>(path: string) => Promise<T>;

export class V2JobsError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "service_unavailable" | "validation_failed";

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
    const items = [
      ...(textTasks || []).map((row) => mapLegacyJob({ ...row, job_type: "text" }, params.now)),
      ...(mediaJobs || []).map((row) => mapLegacyJob(row, params.now)),
      ...(exports || []).map((row) => mapLegacyJob({ ...row, job_type: "export" }, params.now)),
    ].filter((job) => !params.jobType || job.jobType === params.jobType).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
