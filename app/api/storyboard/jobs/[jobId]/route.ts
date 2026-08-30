/**
 * GET /api/storyboard/jobs/:jobId
 *
 * 任务卡：KIIKIS-P3-TRAE-003 §1+§2 + PRD §9 TRAE-PW-P0-005（fail-closed 状态机）
 *
 * 返回 job 当前状态。视频 job 按以下状态机处理：
 *
 * 1. running + provider_task_id → poll provider once
 *    - done → download + upload + sign（PRD §9.1 完整链）
 *      - 全部成功 → status=completed + result_url=signedUrl + storage_path
 *      - download/upload 失败 → status=result_ingesting + result_url=null + storage_path=null
 *      - sign 失败（upload 已成功）→ status=partial_failure + result_url=null + storage_path=已上传
 *    - error → status=failed
 *    - still running → no update
 *
 * 2. result_ingesting + provider_task_id → retry-transfer（PRD §9.1 / §12.4）
 *    - 重新 poll provider 拿 videoUrl（不调 provider.submit，不重复计费）
 *    - 重新 download + upload + sign
 *    - 成功 → status=completed
 *    - 失败 → 保持 result_ingesting
 *
 * 3. partial_failure + storage_path → re-sign only（PRD §9.1）
 *    - 只调 signStoredVideo，不重新 download/upload
 *    - 成功 → status=completed + result_url=newSignedUrl
 *    - 失败 → 保持 partial_failure
 *
 * 4. completed + storage_path → re-sign result_url（PRD §9.2：signed URL 过期可重新播放）
 *
 * PRD §9.1：providerTempUrl 永远不入库；result_url 失败时为 null；不误用 completed。
 */

import { NextResponse } from "next/server";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import { resolveVideoProvider } from "@/lib/ai/video/provider";
import { uploadVideoArtifact, signStoredVideo } from "@/lib/ai/video/storage";
import { recordEvidenceEvent } from "@/lib/evidence/ledger";
import { completedGenerationEvidenceEvent } from "@/lib/evidence/hooks";
import { isEvidenceLedgerEnabled } from "@/lib/evidence/feature-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, error, code }, { status });
}

type VideoJobRow = {
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
  storage_path: string | null;
  result_metadata: Record<string, unknown>;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
  updated_at: string;
};

/** PATCH job 的 DRY helper。status/error/result_url/storage_path/result_metadata 可选。 */
async function patchJob(jobId: string, patch: {
  status: string;
  result_url?: string | null;
  storage_path?: string | null;
  error?: string | null;
  result_metadata?: Record<string, unknown>;
}): Promise<void> {
  const body: Record<string, unknown> = {
    status: patch.status,
    updated_at: new Date().toISOString(),
  };
  if (patch.result_url !== undefined) body.result_url = patch.result_url;
  if (patch.storage_path !== undefined) body.storage_path = patch.storage_path;
  if (patch.error !== undefined) body.error = patch.error;
  if (patch.result_metadata !== undefined) body.result_metadata = patch.result_metadata;

  // A failed state transition must be visible to the caller. Retrying without
  // storage_path would claim completion while losing the durable artifact
  // binding, and swallowing other PATCH failures leaves the UI ahead of DB.
  await serviceFetch(`/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * PRD §9.1 完整转存链：download → upload → sign。
 * 返回 tagged union 让 caller 精确区分失败阶段，写正确的 fail-closed 状态。
 */
type TransferResult =
  | { kind: "success"; signedUrl: string; storagePath: string }
  | { kind: "ingesting_error"; error: string }
  | { kind: "partial_error"; storagePath: string; error: string };

async function downloadAndTransfer(
  provider: { download: (url: string) => Promise<{ bytes: Uint8Array; contentType: string }> },
  providerVideoUrl: string,
  ctx: { userId: string; jobId: string; shotId: string },
): Promise<TransferResult> {
  let downloaded: { bytes: Uint8Array; contentType: string };
  try {
    downloaded = await provider.download(providerVideoUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: "ingesting_error", error: `视频下载失败，可重试转存：${msg}` };
  }

  let storagePath: string;
  try {
    const uploaded = await uploadVideoArtifact({
      userId: ctx.userId,
      jobId: ctx.jobId,
      shotId: ctx.shotId,
      bytes: downloaded.bytes,
      contentType: downloaded.contentType,
    });
    storagePath = uploaded.storagePath;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // PRD §9.1：校验失败（空 bytes / 不支持的 contentType）也归为 ingesting_error
    return { kind: "ingesting_error", error: `视频存储失败，可重试转存：${msg}` };
  }

  try {
    const { signedUrl } = await signStoredVideo(storagePath);
    return { kind: "success", signedUrl, storagePath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // upload 已成功但 sign 失败 → partial_failure，保留 storage_path 供单独重签
    return { kind: "partial_error", storagePath, error: `视频签名失败，可重签：${msg}` };
  }
}

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!jobId || typeof jobId !== "string") {
    return errorResponse(422, "MISSING_FIELD", "缺少 jobId");
  }

  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return errorResponse(401, "UNAUTHORIZED", "请先登录。");
  }

  // 1. load job row
  let job: VideoJobRow | null = null;

  try {
    const rows = await serviceFetch<VideoJobRow[]>(
      `/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}&owner_id=eq.${encodeURIComponent(userId)}&limit=1&select=*`,
    );
    job = rows?.[0] ?? null;
  } catch {
    return errorResponse(500, "JOB_QUERY_FAILED", "查询 job 失败。");
  }

  if (!job) {
    return errorResponse(404, "JOB_NOT_FOUND", "任务不存在或无权访问。");
  }

  const shotId = (job.input_params as { shotId?: string }).shotId || job.target_id || job.id;
  const durationSeconds = (job.input_params as { duration?: number }).duration ?? 5;
  const scopedInput = job.input_params as { projectId?: unknown; sourceUnitId?: unknown };
  const hasEvidenceScope = typeof scopedInput.projectId === "string" && Boolean(scopedInput.projectId)
    && typeof scopedInput.sourceUnitId === "string" && Boolean(scopedInput.sourceUnitId);

  // 2. running + provider_task_id → poll provider + attempt transfer
  if (
    job.job_type === "video" &&
    job.status === "running" &&
    job.provider_task_id &&
    (job.provider === "atlas" || job.provider === "minimax")
  ) {
    try {
      const provider = await resolveVideoProvider();
      const result = job.provider === provider.name
        ? await provider.poll(job.provider_task_id)
        : await pollByProviderName(job.provider, job.provider_task_id);

      if (result.status === "done" && result.videoUrl) {
        await patchJob(jobId, {
          status: "result_ingesting",
          result_metadata: { ...job.result_metadata, sub_status: "result_ingesting" },
        });
        job = { ...job, status: "result_ingesting", result_metadata: { ...job.result_metadata, sub_status: "result_ingesting" } };
        const transfer = await downloadAndTransfer(provider, result.videoUrl, { userId, jobId: job.id, shotId });

        if (transfer.kind === "success") {
          // PRD §9.1：全部成功 → completed + result_url=signedUrl + storage_path
          await patchJob(jobId, {
            status: "completed",
            result_url: transfer.signedUrl,
            storage_path: transfer.storagePath,
            error: null,
            result_metadata: {
              ...job.result_metadata,
              videoUrl: transfer.signedUrl,
              providerTempUrl: null, // PRD §9.1：不保留临时 URL
              storagePath: transfer.storagePath,
              durationSeconds,
              completedAt: new Date().toISOString(),
              sub_status: "completed",
            },
          });
          job = {
            ...job,
            status: "completed",
            result_url: transfer.signedUrl,
            storage_path: transfer.storagePath,
            error: null,
            result_metadata: {
              ...job.result_metadata,
              videoUrl: transfer.signedUrl,
              providerTempUrl: null,
              storagePath: transfer.storagePath,
              durationSeconds,
              completedAt: new Date().toISOString(),
              sub_status: "completed",
            },
          };
          // Evidence event
          if (isEvidenceLedgerEnabled() && hasEvidenceScope) {
            await recordEvidenceEvent(completedGenerationEvidenceEvent({
              ownerId: userId,
              projectId: scopedInput.projectId as string,
              sourceUnitId: scopedInput.sourceUnitId as string,
              jobId: job.id,
              jobType: "video",
              targetId: job.target_id || job.id,
              provider: job.provider,
              durationSeconds,
            }));
          }
        } else if (transfer.kind === "ingesting_error") {
          // PRD §9.1：download/upload/校验失败 → result_ingesting + result_url=null + storage_path=null
          await patchJob(jobId, {
            status: "result_ingesting",
            result_url: null,
            storage_path: null,
            error: transfer.error,
            result_metadata: {
              ...job.result_metadata,
              videoUrl: null,
              providerTempUrl: null, // 不保存临时 URL
              storagePath: null,
              storageTransferError: transfer.error,
              durationSeconds,
              sub_status: "result_ingesting",
            },
          });
          job = {
            ...job,
            status: "result_ingesting",
            result_url: null,
            storage_path: null,
            error: transfer.error,
            result_metadata: {
              ...job.result_metadata,
              videoUrl: null,
              providerTempUrl: null,
              storagePath: null,
              storageTransferError: transfer.error,
              durationSeconds,
              sub_status: "result_ingesting",
            },
          };
          return NextResponse.json({
            success: true,
            job,
            warning: transfer.error,
          });
        } else {
          // transfer.kind === "partial_error"：upload 成功但 sign 失败
          // PRD §9.1：partial_failure + result_url=null + storage_path=已上传
          await patchJob(jobId, {
            status: "partial_failure",
            result_url: null,
            storage_path: transfer.storagePath,
            error: transfer.error,
            result_metadata: {
              ...job.result_metadata,
              videoUrl: null,
              providerTempUrl: null,
              storagePath: transfer.storagePath,
              storageTransferError: transfer.error,
              durationSeconds,
              sub_status: "result_ingesting",
            },
          });
          job = {
            ...job,
            status: "partial_failure",
            result_url: null,
            storage_path: transfer.storagePath,
            error: transfer.error,
            result_metadata: {
              ...job.result_metadata,
              videoUrl: null,
              providerTempUrl: null,
              storagePath: transfer.storagePath,
              storageTransferError: transfer.error,
              durationSeconds,
              sub_status: "result_ingesting",
            },
          };
          return NextResponse.json({
            success: true,
            job,
            warning: transfer.error,
          });
        }
      } else if (result.status === "error") {
        await patchJob(jobId, {
          status: "failed",
          error: `${job.provider} 视频生成失败 (raw: ${result.rawStatus})`,
          result_metadata: { ...job.result_metadata, sub_status: "failed" },
        });
        job = {
          ...job,
          status: "failed",
          error: `${job.provider} 视频生成失败 (raw: ${result.rawStatus})`,
          result_metadata: { ...job.result_metadata, sub_status: "failed" },
        };
      } else {
        await patchJob(jobId, {
          status: "running",
          result_metadata: { ...job.result_metadata, sub_status: "generating" },
        });
        job = { ...job, result_metadata: { ...job.result_metadata, sub_status: "generating" } };
      }
    } catch (error) {
      // provider poll failure is non-fatal; return current DB state + warning
      const message = error instanceof Error ? error.message : String(error);
      if (/timeout|abort/i.test(message)) {
        await patchJob(jobId, {
          status: "running",
          result_metadata: { ...job.result_metadata, sub_status: "provider_timeout" },
        }).catch(() => {});
        job = { ...job, result_metadata: { ...job.result_metadata, sub_status: "provider_timeout" } };
      }
      return NextResponse.json({
        success: true,
        job,
        warning: `provider poll failed: ${message}`,
      });
    }
  }

  // 3. PRD §9.1 / §12.4：result_ingesting + provider_task_id → retry-transfer
  //    重新 poll provider 拿 videoUrl（不调 provider.submit，不重复计费），再 download + upload + sign
  if (
    job.job_type === "video" &&
    job.status === "result_ingesting" &&
    job.provider_task_id &&
    (job.provider === "atlas" || job.provider === "minimax")
  ) {
    try {
      const provider = await resolveVideoProvider();
      const result = job.provider === provider.name
        ? await provider.poll(job.provider_task_id)
        : await pollByProviderName(job.provider, job.provider_task_id);

      if (result.status === "done" && result.videoUrl) {
        const transfer = await downloadAndTransfer(provider, result.videoUrl, { userId, jobId: job.id, shotId });

        if (transfer.kind === "success") {
          await patchJob(jobId, {
            status: "completed",
            result_url: transfer.signedUrl,
            storage_path: transfer.storagePath,
            error: null,
            result_metadata: {
              ...job.result_metadata,
              videoUrl: transfer.signedUrl,
              providerTempUrl: null,
              storagePath: transfer.storagePath,
              storageTransferError: null,
              durationSeconds,
              completedAt: new Date().toISOString(),
              sub_status: "completed",
            },
          });
          job = {
            ...job,
            status: "completed",
            result_url: transfer.signedUrl,
            storage_path: transfer.storagePath,
            error: null,
            result_metadata: {
              ...job.result_metadata,
              videoUrl: transfer.signedUrl,
              providerTempUrl: null,
              storagePath: transfer.storagePath,
              storageTransferError: null,
              durationSeconds,
              completedAt: new Date().toISOString(),
              sub_status: "completed",
            },
          };
          if (isEvidenceLedgerEnabled() && hasEvidenceScope) {
            await recordEvidenceEvent(completedGenerationEvidenceEvent({
              ownerId: userId,
              projectId: scopedInput.projectId as string,
              sourceUnitId: scopedInput.sourceUnitId as string,
              jobId: job.id,
              jobType: "video",
              targetId: job.target_id || job.id,
              provider: job.provider,
              durationSeconds,
            }));
          }
        } else if (transfer.kind === "ingesting_error") {
          // 保持 result_ingesting，更新 error
          await patchJob(jobId, {
            status: "result_ingesting",
            result_url: null,
            storage_path: null,
            error: transfer.error,
            result_metadata: { ...job.result_metadata, sub_status: "result_ingesting" },
          });
          job = { ...job, status: "result_ingesting", result_url: null, storage_path: null, error: transfer.error, result_metadata: { ...job.result_metadata, sub_status: "result_ingesting" } };
          return NextResponse.json({ success: true, job, warning: transfer.error });
        } else {
          // partial_error：upload 成功但 sign 失败 → 升级为 partial_failure
          await patchJob(jobId, {
            status: "partial_failure",
            result_url: null,
            storage_path: transfer.storagePath,
            error: transfer.error,
            result_metadata: { ...job.result_metadata, sub_status: "result_ingesting" },
          });
          job = { ...job, status: "partial_failure", result_url: null, storage_path: transfer.storagePath, error: transfer.error, result_metadata: { ...job.result_metadata, sub_status: "result_ingesting" } };
          return NextResponse.json({ success: true, job, warning: transfer.error });
        }
      }
      // else: provider 还在 running 或已 error，不改 status（result_ingesting 保持）
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ success: true, job, warning: `retry-transfer poll failed: ${message}` });
    }
  }

  // 4. PRD §9.1：partial_failure + storage_path → re-sign only（不重新 download/upload）
  if (
    job.job_type === "video" &&
    job.status === "partial_failure" &&
    job.storage_path
  ) {
    try {
      const { signedUrl } = await signStoredVideo(job.storage_path);
      await patchJob(jobId, {
        status: "completed",
        result_url: signedUrl,
        error: null,
        result_metadata: {
          ...job.result_metadata,
          videoUrl: signedUrl,
          providerTempUrl: null,
          storagePath: job.storage_path,
          storageTransferError: null,
          durationSeconds,
          completedAt: new Date().toISOString(),
          sub_status: "completed",
        },
      });
      job = {
        ...job,
        status: "completed",
        result_url: signedUrl,
        error: null,
        result_metadata: {
          ...job.result_metadata,
          videoUrl: signedUrl,
          providerTempUrl: null,
          storagePath: job.storage_path,
          storageTransferError: null,
          durationSeconds,
          completedAt: new Date().toISOString(),
          sub_status: "completed",
        },
      };
      if (isEvidenceLedgerEnabled() && hasEvidenceScope) {
        await recordEvidenceEvent(completedGenerationEvidenceEvent({
          ownerId: userId,
          projectId: scopedInput.projectId as string,
          sourceUnitId: scopedInput.sourceUnitId as string,
          jobId: job.id,
          jobType: "video",
          targetId: job.target_id || job.id,
          provider: job.provider,
          durationSeconds,
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // re-sign 失败，保持 partial_failure
      return NextResponse.json({ success: true, job, warning: `re-sign failed: ${message}` });
    }
  }

  // 5. PRD §9.2：completed + storage_path → re-sign result_url（signed URL 过期可重新播放）
  if (
    job.job_type === "video" &&
    job.status === "completed" &&
    job.storage_path
  ) {
    try {
      const { signedUrl } = await signStoredVideo(job.storage_path);
      if (signedUrl !== job.result_url) {
        // 只在 URL 变化时写库（避免无谓写入）
        await patchJob(jobId, {
          status: "completed",
          result_url: signedUrl,
        });
        job = { ...job, result_url: signedUrl };
      }
    } catch {
      // re-sign 失败不降级 job 状态（PRD §9.2：过期 signed URL 不得让 job 变成失败）
      // 返回当前 job（result_url 可能是旧签名）
    }
  }

  return NextResponse.json({ success: true, job });
}

/**
 * 按 DB 中的 provider 名称轮询（env VIDEO_PROVIDER 切换后旧 job 仍能 poll）。
 * 用 dynamic import() + @/ alias，避免 webpack build 时路径解析问题。
 */
async function pollByProviderName(providerName: string, providerTaskId: string) {
  if (providerName === "minimax") {
    const mod = await import("@/lib/ai/video/minimax-adapter");
    return mod.createMiniMaxProvider().poll(providerTaskId);
  }
  // atlas (default)
  const mod = await import("@/lib/ai/video/atlas");
  return mod.createAtlasProvider().poll(providerTaskId);
}
