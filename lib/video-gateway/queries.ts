/**
 * TRAE-V2-05 Video Model Gateway V1
 * Queries：generation_jobs 表读写 + 转存
 *
 * 复用现有 storyflow_generation_jobs 表（含 storage_path/idempotency_hash 列）
 * 复用 lib/ai/video/storage.ts 的转存逻辑
 * 复用 lib/supabase/server.ts 的 serviceFetch
 */

import { serviceFetch } from "@/lib/supabase/server";
import {
  uploadVideoArtifact,
  signStoredVideo,
} from "@/lib/ai/video/storage";
import type {
  VideoGatewayProviderName,
  VideoJobStatus,
  VideoJobSubStatus,
} from "./types";
import { VideoGatewayError } from "./types";
import {
  computeVideoJobIdempotencyHash,
  isInFlight,
} from "./lifecycle";

// ============================================================
// Types
// ============================================================

type JobRow = {
  id: string;
  owner_id: string;
  job_type: string;
  provider: string;
  model: string | null;
  provider_task_id: string | null;
  prompt: string;
  input_params: Record<string, unknown>;
  status: string;
  error: string | null;
  result_url: string | null;
  result_metadata: Record<string, unknown>;
  storage_path: string | null;
  idempotency_hash: string | null;
  target_type: string;
  target_id: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type CreateJobInput = {
  ownerId: string;
  projectId: string;
  sourceUnitId: string;
  shotId: string;
  prompt: string;
  firstframeUrl: string;
  duration: number;
  aspectRatio: string;
  provider: VideoGatewayProviderName;
  model: string;
  providerTaskId: string;
  /** 用户选择（用于幂等键） */
  providerChoice: VideoGatewayProviderName | "auto";
};

export type UpdateStatusInput = {
  status?: VideoJobStatus;
  subStatus?: VideoJobSubStatus;
  providerTaskId?: string;
  resultUrl?: string | null;
  storagePath?: string | null;
  error?: string | null;
  resultMetadata?: Record<string, unknown>;
  completedAt?: string | null;
};

// ============================================================
// Create
// ============================================================

const TARGET_TYPE = "storyboard_shot_video";

/**
 * 创建 video job。
 * 幂等：如果 (ownerId, idempotency_hash) 已存在且未终态，返回已存在的 job。
 */
export async function createVideoJob(
  input: CreateJobInput,
): Promise<{ job: JobRow; created: boolean }> {
  const idempotencyHash = computeVideoJobIdempotencyHash({
    ownerId: input.ownerId,
    projectId: input.projectId,
    shotId: input.shotId,
    prompt: input.prompt,
    firstframeUrl: input.firstframeUrl,
    duration: input.duration,
    provider: input.providerChoice,
  });

  // 1. 查询是否已有 in-flight job（同 idempotency_hash）
  const existing = await serviceFetch<JobRow[]>(
    `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(input.ownerId)}&idempotency_hash=eq.${encodeURIComponent(idempotencyHash)}&select=*&limit=1`,
  );
  if (existing[0]) {
    const row = existing[0];
    if (isInFlight(row.status as VideoJobStatus)) {
      return { job: row, created: false };
    }
    // 终态 job 不参与幂等（允许重试），继续创建新的
  }

  // 2. INSERT
  const insertPayload = {
    owner_id: input.ownerId,
    job_type: "video",
    provider: input.provider,
    model: input.model,
    provider_task_id: input.providerTaskId,
    prompt: input.prompt,
    input_params: {
      projectId: input.projectId,
      sourceUnitId: input.sourceUnitId,
      shotId: input.shotId,
      firstframeUrl: input.firstframeUrl,
      duration: input.duration,
      aspectRatio: input.aspectRatio,
    },
    status: "queued",
    error: null,
    result_url: null,
    result_metadata: { sub_status: "queued" },
    storage_path: null,
    idempotency_hash: idempotencyHash,
    target_type: TARGET_TYPE,
    target_id: input.shotId,
    project_id: input.projectId,
  };

  const inserted = await serviceFetch<JobRow[]>(
    "/rest/v1/storyflow_generation_jobs",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(insertPayload),
    },
  );
  if (!inserted[0]) {
    throw new VideoGatewayError(
      "PROVIDER_CALL_FAILED",
      "创建 video job 失败：数据库未返回记录。",
    );
  }
  return { job: inserted[0], created: true };
}

// ============================================================
// Read
// ============================================================

export async function getVideoJob(
  ownerId: string,
  jobId: string,
): Promise<JobRow> {
  const rows = await serviceFetch<JobRow[]>(
    `/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}&owner_id=eq.${encodeURIComponent(ownerId)}&job_type=eq.video&select=*&limit=1`,
  );
  if (!rows[0]) {
    throw new VideoGatewayError("JOB_NOT_FOUND", `Job ${jobId} 不存在或无权访问。`);
  }
  return rows[0];
}

export async function findInFlightByShot(
  ownerId: string,
  shotId: string,
): Promise<JobRow | null> {
  const rows = await serviceFetch<JobRow[]>(
    `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(ownerId)}&target_type=eq.${TARGET_TYPE}&target_id=eq.${encodeURIComponent(shotId)}&status=in.(queued,running)&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

export async function listJobsByShot(
  ownerId: string,
  shotId: string,
): Promise<JobRow[]> {
  const rows = await serviceFetch<JobRow[]>(
    `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(ownerId)}&target_type=eq.${TARGET_TYPE}&target_id=eq.${encodeURIComponent(shotId)}&order=created_at.desc&limit=50&select=*`,
  );
  return rows ?? [];
}

// ============================================================
// Update
// ============================================================

export async function updateVideoJobStatus(
  ownerId: string,
  jobId: string,
  patch: UpdateStatusInput,
): Promise<JobRow> {
  const dbPatch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.providerTaskId !== undefined)
    dbPatch.provider_task_id = patch.providerTaskId;
  if (patch.resultUrl !== undefined) dbPatch.result_url = patch.resultUrl;
  if (patch.storagePath !== undefined) dbPatch.storage_path = patch.storagePath;
  if (patch.error !== undefined) dbPatch.error = patch.error;
  if (patch.completedAt !== undefined) dbPatch.completed_at = patch.completedAt;

  // sub_status 通过 result_metadata.sub_status 承载
  if (patch.subStatus !== undefined || patch.resultMetadata !== undefined) {
    const existing = await getVideoJob(ownerId, jobId);
    const existingMeta =
      (existing.result_metadata as Record<string, unknown>) || {};
    const newMeta = { ...existingMeta, ...(patch.resultMetadata || {}) };
    if (patch.subStatus !== undefined) {
      newMeta.sub_status = patch.subStatus;
    }
    dbPatch.result_metadata = newMeta;
  }

  const rows = await serviceFetch<JobRow[]>(
    `/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}&owner_id=eq.${encodeURIComponent(ownerId)}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(dbPatch) },
  );
  if (!rows[0]) {
    throw new VideoGatewayError(
      "JOB_NOT_FOUND",
      `Job ${jobId} 更新失败或无权访问。`,
    );
  }
  return rows[0];
}

// ============================================================
// Ingest：下载 + 转存 + 签名
// ============================================================

/**
 * PRD §9.1 fail-closed 状态机：
 *   - download 失败 → status=failed, sub_status=result_ingest_failed
 *   - upload 失败   → status=running, sub_status=result_ingesting, storage_path=null
 *   - sign 失败     → status=failed, sub_status=partial_failure, storage_path=已上传path
 *   - 全部成功       → status=completed, sub_status=completed, result_url=signedUrl, storage_path
 *
 * provider 临时 URL 永远不入库
 */
export async function ingestVideoResult(input: {
  ownerId: string;
  jobId: string;
  shotId: string;
  providerTempUrl: string;
}): Promise<{
  storagePath: string;
  signedUrl: string;
}> {
  // 1. 下载 provider 临时 URL
  let bytes: Uint8Array;
  let contentType: string;
  try {
    const response = await fetch(input.providerTempUrl, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new Error(`DOWNLOAD_HTTP_${response.status}`);
    }
    contentType = response.headers.get("content-type") || "video/mp4";
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (err) {
    await updateVideoJobStatus(input.ownerId, input.jobId, {
      status: "failed",
      subStatus: "failed",
      error: `DOWNLOAD_FAILED: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
      completedAt: new Date().toISOString(),
    });
    throw new VideoGatewayError(
      "RESULT_INGEST_FAILED",
      `下载 provider 视频失败。`,
      { detail: err instanceof Error ? err.message : String(err) },
    );
  }

  // 2. upload to Supabase Storage（校验 bytes + content-type）
  let storagePath: string;
  try {
    const result = await uploadVideoArtifact({
      userId: input.ownerId,
      jobId: input.jobId,
      shotId: input.shotId,
      bytes,
      contentType,
    });
    storagePath = result.storagePath;
  } catch (err) {
    // upload 失败 → status=running, sub=result_ingesting, storage_path=null（保留任务可重试）
    await updateVideoJobStatus(input.ownerId, input.jobId, {
      status: "running",
      subStatus: "result_ingesting",
      storagePath: null,
      error: `UPLOAD_FAILED: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
    });
    throw new VideoGatewayError(
      "RESULT_INGEST_FAILED",
      `转存视频到自有 Storage 失败（upload 步骤）。`,
      { detail: err instanceof Error ? err.message : String(err) },
    );
  }

  // 3. sign
  let signedUrl: string;
  try {
    const result = await signStoredVideo(storagePath);
    signedUrl = result.signedUrl;
  } catch (err) {
    // sign 失败 → status=failed, sub=partial_failure, storage_path=已上传path
    await updateVideoJobStatus(input.ownerId, input.jobId, {
      status: "failed",
      subStatus: "partial_failure",
      storagePath,
      error: `SIGN_FAILED: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
      completedAt: new Date().toISOString(),
    });
    throw new VideoGatewayError(
      "RESULT_INGEST_FAILED",
      `视频已转存但生成签名 URL 失败（partial_failure）。`,
      { detail: err instanceof Error ? err.message : String(err), storagePath },
    );
  }

  // 4. 全部成功 → status=completed
  await updateVideoJobStatus(input.ownerId, input.jobId, {
    status: "completed",
    subStatus: "completed",
    resultUrl: signedUrl,
    storagePath,
    error: null,
    completedAt: new Date().toISOString(),
  });

  return { storagePath, signedUrl };
}

// ============================================================
// Helpers
// ============================================================

export function parseJobRow(row: JobRow): {
  jobId: string;
  status: VideoJobStatus;
  subStatus: VideoJobSubStatus;
  signedUrl?: string;
  storagePath?: string;
  providerTaskId?: string;
  provider: VideoGatewayProviderName;
  model: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  projectId?: string;
  shotId?: string;
  sourceUnitId?: string;
} {
  const meta = (row.result_metadata || {}) as Record<string, unknown>;
  return {
    jobId: row.id,
    status: row.status as VideoJobStatus,
    subStatus: (meta.sub_status as VideoJobSubStatus) || "queued",
    signedUrl: row.result_url ?? undefined,
    storagePath: row.storage_path ?? undefined,
    providerTaskId: row.provider_task_id ?? undefined,
    provider: row.provider as VideoGatewayProviderName,
    model: row.model ?? "",
    errorCode: meta.error_code as string | undefined,
    errorMessage: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    projectId: row.project_id ?? undefined,
    shotId: (row.input_params as Record<string, unknown>)?.shotId as
      | string
      | undefined,
    sourceUnitId: (row.input_params as Record<string, unknown>)
      ?.sourceUnitId as string | undefined,
  };
}

/** 重签 completed job 的 result_url */
export async function resignJobResultUrl(
  ownerId: string,
  jobId: string,
): Promise<string | null> {
  const job = await getVideoJob(ownerId, jobId);
  if (job.status !== "completed" || !job.storage_path) {
    return job.result_url;
  }
  try {
    const { signedUrl } = await signStoredVideo(job.storage_path);
    await updateVideoJobStatus(ownerId, jobId, {
      resultUrl: signedUrl,
    });
    return signedUrl;
  } catch {
    // 重签失败保留旧 URL
    return job.result_url;
  }
}
