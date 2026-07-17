/**
 * GET /api/storyboard/jobs/:jobId
 *
 * 任务卡：KIIKIS-P3-TRAE-003 §1+§2
 *
 * 返回 job 当前状态。如果 video job 处于 running 且有 provider_task_id：
 *   1. resolveVideoProvider().poll() 主动刷新 provider
 *   2. done 时：download bytes → persistVideoArtifact 转存到 Supabase Storage
 *      → PATCH job with status=completed + result_url=signedUrl + storage_path
 *      禁止直接绑 provider 临时 URL（Codex MUST FIX）
 *   3. error 时：PATCH job with status=failed
 * provider poll 失败不致命，返回当前 DB 状态 + warning。
 */

import { NextResponse } from "next/server";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import { resolveVideoProvider } from "@/lib/ai/video/provider";
import { persistVideoArtifact } from "@/lib/ai/video/storage";

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
  result_metadata: Record<string, unknown>;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
  updated_at: string;
};

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

  // 2. if video job + running + has provider_task_id, poll provider once
  if (
    job.job_type === "video" &&
    job.status === "running" &&
    job.provider_task_id &&
    (job.provider === "atlas" || job.provider === "minimax")
  ) {
    try {
      const provider = await resolveVideoProvider();
      // 确保切换器与 DB provider 一致（env 改了但 job 还是旧 provider 时，仍用 job.provider）
      const result = job.provider === provider.name
        ? await provider.poll(job.provider_task_id)
        : await pollByProviderName(job.provider, job.provider_task_id);

      if (result.status === "done" && result.videoUrl) {
        // 下载 + 转存到自有 Storage
        const shotId = (job.input_params as { shotId?: string }).shotId || job.target_id || job.id;
        const durationSeconds = (job.input_params as { duration?: number }).duration ?? 5;

        let finalVideoUrl = result.videoUrl;
        let storagePath: string | null = null;
        try {
          const downloaded = await provider.download(result.videoUrl);
          const persisted = await persistVideoArtifact({
            userId,
            jobId: job.id,
            shotId,
            bytes: downloaded.bytes,
            contentType: downloaded.contentType,
          });
          finalVideoUrl = persisted.signedUrl;
          storagePath = persisted.storagePath;
        } catch (downloadErr) {
          // 转存失败：保留 provider 临时 URL 但记录 warning，不阻塞 done 状态
          // caller 可以后续重试转存
          const msg = downloadErr instanceof Error ? downloadErr.message : String(downloadErr);
          await serviceFetch(`/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "completed",
              result_url: finalVideoUrl,
              result_metadata: {
                ...job.result_metadata,
                videoUrl: finalVideoUrl,
                providerTempUrl: result.videoUrl,
                storagePath: null,
                storageTransferError: msg,
                durationSeconds,
                completedAt: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            }),
          });
          job = {
            ...job,
            status: "completed",
            result_url: finalVideoUrl,
            result_metadata: {
              ...job.result_metadata,
              videoUrl: finalVideoUrl,
              providerTempUrl: result.videoUrl,
              storagePath: null,
              storageTransferError: msg,
              durationSeconds,
              completedAt: new Date().toISOString(),
            },
          };
          return NextResponse.json({
            success: true,
            job,
            warning: `video done but storage transfer failed: ${msg}`,
          });
        }

        // 转存成功：绑自有地址，不绑 provider 临时 URL
        // 同时写入 storage_path 列（migration 执行后）；未执行时忽略错误
        try {
          await serviceFetch(`/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "completed",
              result_url: finalVideoUrl,
              storage_path: storagePath,
              result_metadata: {
                ...job.result_metadata,
                videoUrl: finalVideoUrl,
                providerTempUrl: null, // 不保留临时 URL
                storagePath,
                durationSeconds,
                completedAt: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            }),
          });
        } catch {
          // storage_path 列可能不存在（migration 未执行），fallback 不带列
          await serviceFetch(`/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "completed",
              result_url: finalVideoUrl,
              result_metadata: {
                ...job.result_metadata,
                videoUrl: finalVideoUrl,
                providerTempUrl: null,
                storagePath,
                durationSeconds,
                completedAt: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            }),
          });
        }
        job = {
          ...job,
          status: "completed",
          result_url: finalVideoUrl,
          result_metadata: {
            ...job.result_metadata,
            videoUrl: finalVideoUrl,
            providerTempUrl: null,
            storagePath,
            durationSeconds,
            completedAt: new Date().toISOString(),
          },
        };
      } else if (result.status === "error") {
        await serviceFetch(`/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "failed",
            error: `${job.provider} 视频生成失败 (raw: ${result.rawStatus})`,
            updated_at: new Date().toISOString(),
          }),
        });
        job = {
          ...job,
          status: "failed",
          error: `${job.provider} 视频生成失败 (raw: ${result.rawStatus})`,
        };
      }
      // else: still running, no update
    } catch (error) {
      // provider poll failure is non-fatal; return current DB state + warning
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({
        success: true,
        job,
        warning: `provider poll failed: ${message}`,
      });
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
