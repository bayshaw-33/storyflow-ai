/**
 * POST /api/storyboard/shots/[shotId]/generate-video
 *
 * Task card: KIIKIS-P2-TRAE-002 §1
 *
 * Flow:
 *   1. authenticate
 *   2. load persisted storyboard state (projectId + sourceUnitId)
 *   3. find shot by shotId → ensure shot.confirmed === true and shot has imagePrompt
 *      (前置条件: 已有已确认的分镜示意图作为首帧)
 *   4. idempotency check on storyflow_generation_jobs (target_type=storyboard_shot_video,
 *      input_params->>idempotencyKey)
 *   5. insert running job row → call MiniMax video_generation (image-to-video with
 *      firstframe imageUrl) → store provider_task_id
 *   6. return jobId + providerTaskId
 *
 * 单 Shot 失败不影响其他 Shot: 失败时 job status=failed + error, 不抛 500.
 */

import { NextResponse } from "next/server";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import { loadStoryboardState } from "@/lib/storyboard/state-api";
import { getMiniMaxApiKey } from "@/lib/ai/providers/minimax";
import { resolveSavedApiConfig } from "@/lib/supabase/api-connections";
import {
  createVideoTask,
  resolveMiniMaxVideoConfig,
} from "@/lib/ai/video/minimax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GenerateVideoBody = {
  projectId?: string;
  sourceUnitId?: string;
  idempotencyKey?: string;
  expectedRevision?: number;
  /** Optional override; defaults to shot.jimengVideoPrompt */
  promptOverride?: string;
  /** Optional firstframe override; defaults to last successful shot image */
  firstframeImageUrl?: string;
  duration?: number;
};

function errorResponse(status: number, code: string, error: string, details?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, code, ...(details ? { details } : {}) }, { status });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request, context: { params: Promise<{ shotId: string }> }) {
  const { shotId } = await context.params;
  if (!isNonEmptyString(shotId)) {
    return errorResponse(422, "MISSING_FIELD", "缺少 shotId", { fields: ["shotId"] });
  }

  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return errorResponse(401, "UNAUTHORIZED", "请先登录。");
  }

  let body: GenerateVideoBody;
  try {
    body = (await request.json()) as GenerateVideoBody;
  } catch {
    return errorResponse(422, "INVALID_JSON", "请求体不是合法 JSON。");
  }

  if (!isNonEmptyString(body.projectId) || !isNonEmptyString(body.sourceUnitId) || !isNonEmptyString(body.idempotencyKey)) {
    return errorResponse(422, "MISSING_FIELD", "缺少 projectId / sourceUnitId / idempotencyKey", {
      fields: ["projectId", "sourceUnitId", "idempotencyKey"],
    });
  }

  // 1. load persisted state to find shot + firstframe
  let shotPrompt = body.promptOverride?.trim() || "";
  let firstframeUrl = body.firstframeImageUrl?.trim() || "";
  let shotFound = false;
  let shotConfirmed = false;
  let shotHasImage = false;

  try {
    const state = await loadStoryboardState(userId, body.projectId, body.sourceUnitId);
    if (state) {
      for (const scene of state.scenes) {
        for (const shot of scene.shots) {
          const id = shot.id ?? shot.clientId ?? "";
          if (id === shotId) {
            shotFound = true;
            shotConfirmed = Boolean(shot.confirmed);
            if (!shotPrompt && shot.jimengPromptZh) shotPrompt = shot.jimengPromptZh;
            // firstframe = last successful image job for this shot
            if (!firstframeUrl) {
              const imageJobs = await serviceFetch<Array<{ result_url: string | null; status: string }>>(
                `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(userId)}&job_type=eq.image&target_type=eq.storyboard_shot&target_id=eq.${encodeURIComponent(shotId)}&status=eq.completed&order=created_at.desc&limit=1&select=result_url,status`,
              );
              if (imageJobs?.[0]?.result_url) {
                firstframeUrl = imageJobs[0].result_url;
                shotHasImage = true;
              }
            } else {
              shotHasImage = true;
            }
            break;
          }
        }
        if (shotFound) break;
      }
    }
  } catch {
    // state load failure is non-fatal if caller supplied both prompt + firstframe
  }

  if (!shotFound) {
    return errorResponse(404, "SHOT_NOT_FOUND", `未找到 shot ${shotId}，请先保存分镜表。`);
  }
  if (!shotConfirmed) {
    return errorResponse(409, "SHOT_NOT_CONFIRMED", "该 Shot 未确认分镜示意图，无法生成视频。请先在「分镜图」tab 确认。");
  }
  if (!shotHasImage || !firstframeUrl) {
    return errorResponse(409, "NO_FIRSTFRAME", "该 Shot 没有已生成的分镜示意图，无法作为首帧。请先生成分镜图。");
  }
  if (!shotPrompt) {
    return errorResponse(422, "NO_PROMPT", "该 Shot 没有即梦视频提示词。请先生成提示词。");
  }

  // 2. idempotency check
  try {
    const existing = await serviceFetch<Array<{ id: string; status: string; result_metadata: Record<string, unknown> }>>(
      `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(userId)}&job_type=eq.video&target_type=eq.storyboard_shot_video&target_id=eq.${encodeURIComponent(shotId)}&input_params-%3E%3EidempotencyKey=eq.${encodeURIComponent(body.idempotencyKey)}&status=not.eq.failed&limit=1&select=id,status,result_metadata`,
    );
    if (existing?.[0]) {
      return NextResponse.json({
        success: true,
        jobId: existing[0].id,
        reused: true,
        status: existing[0].status,
      });
    }
  } catch {
    // non-fatal
  }

  // 3. resolve MiniMax config
  let apiKey = "";
  let model: string | undefined;
  let baseUrl: string | undefined;
  try {
    const saved = await resolveSavedApiConfig(userId, "minimax").catch(() => null);
    apiKey = saved?.minimaxApiKey || getMiniMaxApiKey();
    model = saved?.minimaxModel || process.env.MINIMAX_VIDEO_MODEL;
    baseUrl = saved?.minimaxBaseUrl;
  } catch {
    // ignore
  }
  if (!apiKey) {
    return errorResponse(500, "MISSING_MINIMAX_API_KEY", "MiniMax API key 未配置。");
  }

  const config = resolveMiniMaxVideoConfig({ apiKey, model, baseUrl });

  // 4. insert running job row first (so job exists even if provider call fails)
  const jobId = crypto.randomUUID();
  try {
    await serviceFetch("/rest/v1/storyflow_generation_jobs", {
      method: "POST",
      body: JSON.stringify({
        id: jobId,
        owner_id: userId,
        job_type: "video",
        provider: "minimax",
        model: config.videoModel || null,
        provider_task_id: null,
        prompt: shotPrompt,
        input_params: {
          idempotencyKey: body.idempotencyKey,
          shotId,
          projectId: body.projectId,
          sourceUnitId: body.sourceUnitId,
          firstframeImageUrl: firstframeUrl,
          duration: body.duration ?? 5,
          expectedRevision: body.expectedRevision ?? null,
        },
        status: "queued",
        target_type: "storyboard_shot_video",
        target_id: shotId,
        project_id: body.projectId,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(500, "JOB_INSERT_FAILED", `创建 job 记录失败: ${message}`);
  }

  // 5. call MiniMax createVideoTask (image-to-video)
  try {
    const result = await createVideoTask(
      {
        prompt: shotPrompt,
        imageUrl: firstframeUrl,
        duration: body.duration ?? 5,
      },
      config,
    );

    // update job with provider_task_id and status=running
    await serviceFetch(`/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        provider_task_id: result.taskId,
        status: "running",
        updated_at: new Date().toISOString(),
      }),
    });

    return NextResponse.json({
      success: true,
      jobId,
      providerTaskId: result.taskId,
      reused: false,
      status: "running",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // mark job as failed but do NOT throw — caller can retry
    await serviceFetch(`/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "failed",
        error: message,
        updated_at: new Date().toISOString(),
      }),
    }).catch(() => {});

    return NextResponse.json({
      success: false,
      jobId,
      error: message,
      code: "VIDEO_CREATE_FAILED",
    }, { status: 502 });
  }
}
