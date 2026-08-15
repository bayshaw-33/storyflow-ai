/**
 * 任务中心 API 适配器。
 *
 * 默认不使用 fixture；仅显式 NEXT_PUBLIC_USE_JOB_FIXTURE=true 时加载演示数据。
 *
 * 真实模式对接 Codex 的 GET /api/v2/jobs（统一任务列表），
 * Codex GenerationJob DTO 在此映射为 TRAE UnifiedJob。
 *
 * 写操作（cancel/retry）：Codex v2 暂未提供 POST 端点，
 * - cancel 复用 1.0 POST /api/production/jobs action=cancel；
 * - retry 抛 not_implemented，待 Codex 提供 POST /api/v2/jobs/[id]/retry 后接入。
 *
 * 错误处理：解析 Codex 的 { success:false, error, code }，
 * 抛出带 code 的 JobsApiError，便于 UI 区分 401/503 等场景。
 */
import { computeStats } from "./grouping.ts";
import { CONTRACT_VERSION, type JobAction, type JobFilters, type JobStats, type UnifiedJob } from "./types.ts";

/** 是否使用 fixture 演示数据（生产环境 fail-closed） */
export const USE_FIXTURE =
  process.env.NEXT_PUBLIC_USE_JOB_FIXTURE === "true";

export interface JobsResult {
  jobs: UnifiedJob[];
  stats: JobStats;
  contractVersion: string;
  source: "fixture" | "api";
}

/** Codex v2 任务列表 / 详情 API（GET） */
const API_BASE = "/api/v2/jobs";
/** 1.0 任务写操作 API（cancel 复用，POST action 模式） */
const LEGACY_WRITE_API = "/api/production/jobs";

// ============ Codex GenerationJob DTO（contracts/v2 镜像，仅用于 API 响应解析） ============

type CodexJobType = "text" | "image" | "video" | "audio" | "export" | "transfer" | "analysis";
type CodexJobStatus =
  | "draft"
  | "pending_confirm"
  | "queued"
  | "running"
  | "result_ingesting"
  | "completed"
  | "partial_failure"
  | "failed"
  | "cancelled";
type CodexJobAction = "retry" | "cancel" | "view_details" | "view_results";
type CodexErrorCode = "unauthenticated" | "forbidden" | "not_found" | "validation_failed" | "service_unavailable";

interface CodexJobTiming {
  elapsedSeconds: number;
  estimatedSecondsMin?: number | null;
  estimatedSecondsMax?: number | null;
  estimateConfidence?: "low" | "medium" | "high" | null;
}

interface CodexGenerationJob {
  id: string;
  projectId: string | null;
  jobType: CodexJobType;
  status: CodexJobStatus;
  phase: CodexJobStatus;
  progress: { completed: number; total: number };
  timing?: CodexJobTiming;
  resultReferences?: string[];
  failedItemCount?: number;
  actions?: CodexJobAction[];
  createdAt: string;
  completedAt?: string | null;
}

interface CodexJobsResponse {
  success: true;
  contractVersion: string;
  items: CodexGenerationJob[];
  hasMore: boolean;
}

interface CodexErrorResponse {
  success: false;
  error: string;
  code: CodexErrorCode;
}

// ============ 错误类型 ============

/** 带 Codex 错误 code 的 Error，便于 UI 区分 401/503 等场景并相应展示 */
export class JobsApiError extends Error {
  readonly code: CodexErrorCode | "network_error" | "unknown";
  readonly httpStatus?: number;

  constructor(
    message: string,
    code: CodexErrorCode | "network_error" | "unknown",
    httpStatus?: number,
  ) {
    super(message);
    this.name = "JobsApiError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// ============ 内部工具 ============

function buildHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function applyFilters(jobs: UnifiedJob[], filters?: JobFilters): UnifiedJob[] {
  if (!filters) return jobs;
  return jobs.filter((job) => {
    if (filters.stage && job.stage !== filters.stage) return false;
    if (filters.type && job.type !== filters.type) return false;
    if (filters.projectId && job.projectId !== filters.projectId) return false;
    if (filters.workbenchType && job.workbenchType !== filters.workbenchType) return false;
    return true;
  });
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Codex estimateConfidence 字符串 → TRAE 置信度 0-1 数值 */
function mapConfidence(c?: "low" | "medium" | "high" | null): number | undefined {
  if (c === "high") return 0.9;
  if (c === "medium") return 0.7;
  if (c === "low") return 0.5;
  return undefined;
}

/** Codex jobType → TRAE workbenchType 粗粒度映射（Codex 不提供精确 workbenchType） */
function inferWorkbenchType(jobType: CodexJobType): string {
  switch (jobType) {
    case "image":
      return "art";
    case "video":
      return "video";
    case "audio":
      return "song";
    case "export":
    case "transfer":
      return "production";
    case "analysis":
      return "analysis";
    case "text":
    default:
      return "text";
  }
}

/** Codex actions 字符串数组 → TRAE JobAction（带中文 label） */
function mapActions(actions: CodexJobAction[] | undefined): JobAction[] {
  if (!actions || !Array.isArray(actions)) return [];
  const result: JobAction[] = [];
  for (const a of actions) {
    if (a === "retry") result.push({ type: "retry", label: "重试" });
    else if (a === "cancel") result.push({ type: "cancel", label: "取消" });
    else if (a === "view_details") result.push({ type: "view_detail", label: "查看详情" });
    else if (a === "view_results") result.push({ type: "view_detail", label: "查看结果" });
  }
  return result;
}

/** 失败项计数 → 中文失败原因（Codex 无 failureReason 字段，需构造） */
function buildFailureReason(
  failedItemCount: number | undefined,
  status: CodexJobStatus,
): string | undefined {
  if (status === "partial_failure" && failedItemCount && failedItemCount > 0) {
    return `部分失败，${failedItemCount} 项未完成`;
  }
  if (status === "failed") {
    return failedItemCount && failedItemCount > 0
      ? `${failedItemCount} 项全部失败`
      : "任务失败";
  }
  return undefined;
}

/** Codex jobType 中文标签（用于降级构造 name） */
const JOB_TYPE_LABEL_ZH: Record<CodexJobType, string> = {
  text: "文本",
  image: "图像",
  video: "视频",
  audio: "声音",
  export: "导出",
  transfer: "转存",
  analysis: "分析",
};

/**
 * Codex GenerationJob → TRAE UnifiedJob。
 *
 * Codex 不提供 name / projectName / resultUrl，在此降级：
 * - name：jobType 中文 + id 前 6 位（避免空字符串，UI 仍可显示）
 * - projectName：固定"未知项目"（避免在适配器层 N+1 查询 project）
 * - resultUrl：从 resultReferences 派生（首项若为 URL 或路径）
 */
function mapGenerationJobToUnifiedJob(codex: CodexGenerationJob): UnifiedJob {
  const elapsedMs =
    codex.timing?.elapsedSeconds != null ? codex.timing.elapsedSeconds * 1000 : 0;

  let estimatedRangeMs: UnifiedJob["estimatedRangeMs"];
  if (
    codex.timing &&
    codex.timing.estimatedSecondsMin != null &&
    codex.timing.estimatedSecondsMax != null
  ) {
    const confidence = mapConfidence(codex.timing.estimateConfidence);
    if (confidence != null) {
      estimatedRangeMs = {
        min: codex.timing.estimatedSecondsMin * 1000,
        max: codex.timing.estimatedSecondsMax * 1000,
        confidence,
      };
    }
  }

  const refs = codex.resultReferences || [];
  const currentResult = refs.length > 0 ? refs.join("、") : undefined;
  const resultUrl = refs.find((r) => /^https?:\/\//.test(r) || r.startsWith("/"));

  const shortId = codex.id.length > 6 ? codex.id.slice(0, 6) : codex.id;

  return {
    id: codex.id,
    name: `${JOB_TYPE_LABEL_ZH[codex.jobType]}任务 · ${shortId}`,
    type: codex.jobType,
    projectName: "未知项目",
    projectId: codex.projectId || "",
    workbenchType: inferWorkbenchType(codex.jobType),
    stage: codex.status,
    completed: codex.progress?.completed ?? 0,
    total: codex.progress?.total ?? 0,
    elapsedMs,
    estimatedRangeMs,
    currentResult,
    failureReason: buildFailureReason(codex.failedItemCount, codex.status),
    actions: mapActions(codex.actions),
    createdAt: codex.createdAt,
    resultUrl,
  };
}

/**
 * fixture 模块懒加载。
 * USE_FIXTURE=false 时不加载 fixtures.ts，避免在 Node 测试环境中解析 @/ 别名。
 */
let fixtureModulePromise: Promise<typeof import("./fixtures.ts")> | null = null;
function getFixtureModule(): Promise<typeof import("./fixtures.ts")> {
  if (!fixtureModulePromise) fixtureModulePromise = import("./fixtures.ts");
  return fixtureModulePromise;
}

/** 从 Codex 错误响应构造 JobsApiError（含 HTTP 状态码回退） */
function buildApiError(
  payload: unknown,
  httpStatus: number,
  fallbackMessage: string,
): JobsApiError {
  const errPayload = payload as CodexErrorResponse | null;
  const code: CodexErrorCode =
    errPayload?.code ||
    (httpStatus === 401
      ? "unauthenticated"
      : httpStatus === 403
        ? "forbidden"
        : httpStatus === 404
          ? "not_found"
          : httpStatus === 422
            ? "validation_failed"
            : "service_unavailable");
  const message = errPayload?.error || fallbackMessage;
  return new JobsApiError(message, code, httpStatus);
}

// ============ 公共 API ============

/**
 * 拉取任务列表。
 * fixture 模式不依赖 accessToken；真实模式需要有效 token。
 */
export async function fetchJobs(
  accessToken: string | null,
  filters?: JobFilters,
): Promise<JobsResult> {
  if (USE_FIXTURE) {
    const { loadFixtureJobs, fixtureContractVersion } = await getFixtureModule();
    // 模拟网络延迟，便于观察加载态
    await new Promise((resolve) => setTimeout(resolve, 120));
    const all = loadFixtureJobs();
    const filtered = applyFilters(all, filters);
    const version = fixtureContractVersion();
    if (version !== CONTRACT_VERSION) {
      throw new JobsApiError(
        `任务中心契约版本不匹配：fixture=${version}, client=${CONTRACT_VERSION}`,
        "unknown",
      );
    }
    return {
      jobs: filtered,
      stats: computeStats(filtered),
      contractVersion: version,
      source: "fixture",
    };
  }

  // 真实模式：GET /api/v2/jobs?projectId=&jobType=&status=
  const search = new URLSearchParams();
  if (filters?.projectId) search.set("projectId", filters.projectId);
  if (filters?.type) search.set("jobType", filters.type);
  if (filters?.stage) search.set("status", filters.stage);
  const qs = search.toString();
  const url = qs ? `${API_BASE}?${qs}` : API_BASE;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: buildHeaders(accessToken),
    });
  } catch (err) {
    throw new JobsApiError(
      err instanceof Error ? `网络错误：${err.message}` : "加载任务列表失败，网络异常。",
      "network_error",
    );
  }

  const payload = (await parseJsonSafely(response)) as
    | CodexJobsResponse
    | CodexErrorResponse
    | null;

  if (!response.ok || !payload || payload.success === false) {
    throw buildApiError(
      payload,
      response.status,
      response.status === 401
        ? "请先登录后查看任务。"
        : "加载任务列表失败，请稍后再试。",
    );
  }

  const ok = payload as CodexJobsResponse;
  const jobs = (ok.items || []).map(mapGenerationJobToUnifiedJob);
  return {
    jobs,
    stats: computeStats(jobs),
    contractVersion: ok.contractVersion || CONTRACT_VERSION,
    source: "api",
  };
}

/**
 * 取消任务。
 * Codex v2 暂无 POST 端点，复用 1.0 POST /api/production/jobs action=cancel。
 * 1.0 仅能取消 storyflow_generation_jobs 表的行（media 类），
 * text/export 类任务的取消可能不生效，由后端返回 not_found 时 UI 提示。
 */
export async function cancelJob(
  jobId: string,
  accessToken?: string | null,
): Promise<void> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return;
  }
  let response: Response;
  try {
    response = await fetch(LEGACY_WRITE_API, {
      method: "POST",
      headers: buildHeaders(accessToken || null),
      body: JSON.stringify({ action: "cancel", jobId }),
    });
  } catch (err) {
    throw new JobsApiError(
      err instanceof Error ? `网络错误：${err.message}` : "取消任务失败，网络异常。",
      "network_error",
    );
  }
  const payload = (await parseJsonSafely(response)) as
    | { success?: boolean; error?: string }
    | null;
  if (!response.ok || !payload?.success) {
    throw buildApiError(
      payload,
      response.status,
      "取消任务失败，请稍后再试。",
    );
  }
}

/**
 * 重试任务（失败 / 部分失败）。
 * Codex v2 与 1.0 均未提供 retry 写端点，当前抛 not_implemented，
 * UI 会显示该错误；待 Codex 提供 POST /api/v2/jobs/[id]/retry 后接入。
 */
export async function retryJob(
  jobId: string,
  accessToken?: string | null,
): Promise<void> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return;
  }
  // 预留：未来接入 Codex POST /api/v2/jobs/[id]/retry
  void jobId;
  void accessToken;
  throw new JobsApiError(
    "重试任务尚未实现，请在原工作台重新发起。",
    "service_unavailable",
  );
}
