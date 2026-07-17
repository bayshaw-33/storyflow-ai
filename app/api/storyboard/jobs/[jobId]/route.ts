/**
 * GET /api/storyboard/jobs/[jobId]
 *
 * Task card: KIIKIS-P2-TRAE-002 §1
 *
 * Returns the current state of a storyflow_generation_jobs row.
 * If the job is a video job and status=running, also polls the provider
 * (MiniMax) once to refresh the row before returning.
 *
 * Used by the ShotVideoPanel polling loop (every 5s).
 */

import { NextResponse } from "next/server";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import { getMiniMaxApiKey } from "@/lib/ai/providers/minimax";
import { resolveSavedApiConfig } from "@/lib/supabase/api-connections";
import {
  queryVideoTask,
  resolveMiniMaxVideoConfig,
} from "@/lib/ai/video/minimax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, error, code }, { status });
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
    job.provider === "minimax"
  ) {
    try {
      let apiKey = "";
      let model: string | undefined;
      let baseUrl: string | undefined;
      const saved = await resolveSavedApiConfig(userId, "minimax").catch(() => null);
      apiKey = saved?.minimaxApiKey || getMiniMaxApiKey();
      model = saved?.minimaxModel;
      baseUrl = saved?.minimaxBaseUrl;
      if (apiKey) {
        const config = resolveMiniMaxVideoConfig({ apiKey, model, baseUrl });
        const result = await queryVideoTask(job.provider_task_id, config);

        if (result.status === "done" && result.videoUrl) {
          // update job row to completed
          await serviceFetch(`/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "completed",
              result_url: result.videoUrl,
              result_metadata: {
                ...job.result_metadata,
                videoUrl: result.videoUrl,
                fileId: result.fileId,
                durationSeconds: (job.input_params as { duration?: number }).duration ?? 5,
                completedAt: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            }),
          });
          job = {
            ...job,
            status: "completed",
            result_url: result.videoUrl,
            result_metadata: {
              ...job.result_metadata,
              videoUrl: result.videoUrl,
              fileId: result.fileId,
              completedAt: new Date().toISOString(),
            },
          };
        } else if (result.status === "error") {
          await serviceFetch(`/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "failed",
              error: `MiniMax 视频生成失败 (raw: ${result.rawStatus})`,
              updated_at: new Date().toISOString(),
            }),
          });
          job = {
            ...job,
            status: "failed",
            error: `MiniMax 视频生成失败 (raw: ${result.rawStatus})`,
          };
        }
        // else: still running, no update
      }
    } catch (error) {
      // provider poll failure is non-fatal; return current DB state
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
