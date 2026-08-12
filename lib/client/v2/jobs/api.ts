/**
 * 任务中心 API 适配器。
 *
 * 默认 USE_FIXTURE=true 使用 fixture 演示数据；后端就绪后通过
 * NEXT_PUBLIC_USE_JOB_FIXTURE=false 切换到真实 API。
 *
 * 提供 fetchJobs / cancelJob / retryJob 三个接口，供 TaskCenter 组件调用。
 */
import { loadFixtureJobs, loadFixtureStats, fixtureContractVersion } from "./fixtures";
import { computeStats } from "./grouping";
import { CONTRACT_VERSION, type JobFilters, type JobStats, type UnifiedJob } from "./types";

/** 是否使用 fixture 演示数据（默认开启） */
export const USE_FIXTURE =
  process.env.NEXT_PUBLIC_USE_JOB_FIXTURE !== "false";

export interface JobsResult {
  jobs: UnifiedJob[];
  stats: JobStats;
  contractVersion: string;
  source: "fixture" | "api";
}

const API_BASE = "/api/production/jobs";

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

/**
 * 拉取任务列表。
 * fixture 模式不依赖 accessToken；真实模式需要有效 token。
 */
export async function fetchJobs(
  accessToken: string | null,
  filters?: JobFilters,
): Promise<JobsResult> {
  if (USE_FIXTURE) {
    // 模拟网络延迟，便于观察加载态
    await new Promise((resolve) => setTimeout(resolve, 120));
    const all = loadFixtureJobs();
    const filtered = applyFilters(all, filters);
    const version = fixtureContractVersion();
    if (version !== CONTRACT_VERSION) {
      throw new Error(`任务中心契约版本不匹配：fixture=${version}, client=${CONTRACT_VERSION}`);
    }
    return {
      jobs: filtered,
      stats: computeStats(filtered),
      contractVersion: version,
      source: "fixture",
    };
  }

  const response = await fetch(API_BASE, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify({ action: "list", ...(filters || {}) }),
  });
  const payload = (await parseJsonSafely(response)) as
    | { success?: boolean; jobs?: unknown[]; error?: string }
    | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "加载任务列表失败，请稍后再试。");
  }
  const jobs = (payload.jobs || []) as UnifiedJob[];
  return {
    jobs,
    stats: computeStats(jobs),
    contractVersion: CONTRACT_VERSION,
    source: "api",
  };
}

/** 取消任务 */
export async function cancelJob(jobId: string, accessToken?: string | null): Promise<void> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return;
  }
  const response = await fetch(API_BASE, {
    method: "POST",
    headers: buildHeaders(accessToken || null),
    body: JSON.stringify({ action: "cancel", jobId }),
  });
  const payload = (await parseJsonSafely(response)) as { success?: boolean; error?: string } | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "取消任务失败，请稍后再试。");
  }
}

/** 重试任务（失败 / 部分失败） */
export async function retryJob(jobId: string, accessToken?: string | null): Promise<void> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return;
  }
  const response = await fetch(API_BASE, {
    method: "POST",
    headers: buildHeaders(accessToken || null),
    body: JSON.stringify({ action: "retry", jobId }),
  });
  const payload = (await parseJsonSafely(response)) as { success?: boolean; error?: string } | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "重试任务失败，请稍后再试。");
  }
}
