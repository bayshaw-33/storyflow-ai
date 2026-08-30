/**
 * POST /api/storyboard/shots/:shotId/generate-video
 *
 * 任务卡：KIIKIS-P3-TRAE-003 §1+§2
 *
 * 流程：
 *   1. authenticate
 *   2. loadStoryboardState 找 shot + 校验 confirmed
 *   3. 服务端解析 firstframe（最近 completed image job 的 result_url），禁止浏览器传 URL
 *   4. 服务端解析 prompt（shot.jimengPromptZh），promptOverride 允许但仅限文本
 *   5. 计算 idempotencyHash = sha256(shotId + prompt + firstframeUrl + duration)
 *   6. read-before-insert 幂等检查（用 hash）；命中返回 reused
 *      migration 执行后 DB 唯一约束做并发硬保险
 *   7. insert job row (status=queued, provider=atlas|minimax)
 *   8. resolveVideoProvider().submit() → providerTaskId
 *   9. PATCH job with provider_task_id + status=running
 *
 * 单 Shot 失败不影响其他 Shot: 失败时 job status=failed + error, 不抛 500.
 *
 * 安全：firstframe 必须服务端解析（Codex MUST FIX）；API key 只走 env。
 */

import { NextResponse } from "next/server";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import { loadStoryboardState } from "@/lib/storyboard/state-api";
import { resolveVideoProvider, computeVideoIdempotencyHash } from "@/lib/ai/video/provider";
import { readPrevisVersion, resolveExactFirstframeJob } from "@/lib/server/previs-versions";
import {
  buildVideoJobMetadata,
  isAmbiguousVideoSubmissionError,
  type VideoPrevisProvenance,
} from "@/lib/storyboard/video-submission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GenerateVideoBody = {
  projectId?: string;
  sourceUnitId?: string;
  /** 兼容字段，服务端忽略；幂等由 idempotencyHash 强制 */
  idempotencyKey?: string;
  expectedRevision?: number;
  /** 允许文本覆盖；默认 shot.jimengPromptZh */
  promptOverride?: string;
  duration?: number;
  /** 画幅，如 "16:9"；前端可选传 */
  aspectRatio?: string;
  /** 已采用的不可变白模版本；存在时服务端忽略 promptOverride/duration/aspectRatio。 */
  previsVersionId?: string;
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

  if (!isNonEmptyString(body.projectId) || !isNonEmptyString(body.sourceUnitId)) {
    return errorResponse(422, "MISSING_FIELD", "缺少 projectId / sourceUnitId", {
      fields: ["projectId", "sourceUnitId"],
    });
  }

  let duration = body.duration === 10 ? 10 : 5;
  let aspectRatio = body.aspectRatio || "16:9";

  // 1. load persisted state to find shot + 服务端解析 firstframe
  let shotPrompt = body.promptOverride?.trim() || "";
  let firstframeUrl = "";
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
            // firstframe = 最近 completed image job 的 result_url（服务端解析，禁止浏览器传）
            if (!body.previsVersionId) {
              const imageJobs = await serviceFetch<Array<{ result_url: string | null; status: string }>>(
                `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(userId)}&project_id=eq.${encodeURIComponent(body.projectId)}&job_type=eq.image&target_type=eq.storyboard_shot&target_id=eq.${encodeURIComponent(shotId)}&status=eq.completed&input_params-%3E%3EsourceUnitId=eq.${encodeURIComponent(body.sourceUnitId)}&order=created_at.desc&limit=1&select=result_url,status`,
              );
              if (imageJobs?.[0]?.result_url) {
                firstframeUrl = imageJobs[0].result_url as string;
                shotHasImage = true;
              }
            }
            break;
          }
        }
        if (shotFound) break;
      }
    }
  } catch {
    // state load failure is non-fatal if caller supplied prompt
  }

  if (!shotFound) {
    return errorResponse(404, "SHOT_NOT_FOUND", `未找到 shot ${shotId}，请先保存分镜表。`);
  }
  if (!shotConfirmed) {
    return errorResponse(409, "SHOT_NOT_CONFIRMED", "该 Shot 未确认分镜示意图，无法生成视频。请先在「分镜图」tab 确认。");
  }

  let provenance: Partial<VideoPrevisProvenance> = {};
  if (body.previsVersionId) {
    try {
      const adopted = await readPrevisVersion({
        userId,
        projectId: body.projectId,
        sourceUnitId: body.sourceUnitId,
        shotId,
        versionId: body.previsVersionId,
      });
      if (!adopted) return errorResponse(404, "PREVIS_VERSION_NOT_FOUND", "采用的白模版本不存在或无权访问。");
      const exactFrame = await resolveExactFirstframeJob({
        userId,
        projectId: body.projectId,
        sourceUnitId: body.sourceUnitId,
        shotId,
        jobId: adopted.snapshot.adoptedInput.firstframeJobId,
      });
      if (exactFrame.result_url !== adopted.snapshot.adoptedInput.firstframeUrlAtSave) {
        return errorResponse(409, "PREVIS_FIRSTFRAME_CHANGED", "白模版本对应的首帧结果已变化，请重新保存白模版本。");
      }
      shotPrompt = adopted.snapshot.adoptedInput.prompt;
      firstframeUrl = exactFrame.result_url;
      shotHasImage = true;
      duration = adopted.snapshot.adoptedInput.durationSeconds;
      aspectRatio = adopted.snapshot.adoptedInput.aspectRatio;
      provenance = {
        previsVersionId: adopted.id,
        previsSnapshotHash: adopted.snapshot.snapshotHash,
        firstframeJobId: adopted.snapshot.adoptedInput.firstframeJobId,
        capabilityTranslation: adopted.snapshot.capabilityTranslation,
        adoptedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResponse(409, "PREVIS_VERSION_INVALID", message);
    }
  }
  if (!shotHasImage || !firstframeUrl) {
    return errorResponse(409, "NO_FIRSTFRAME", "该 Shot 没有已生成的分镜示意图，无法作为首帧。请先生成分镜图。");
  }
  if (!shotPrompt) {
    return errorResponse(422, "NO_PROMPT", "该 Shot 没有即梦视频提示词。请先生成提示词。");
  }

  // 2. 计算 idempotencyHash（DB 唯一约束由 migration 添加，应用层 read-before-insert 双保险）
  const idempotencyHash = computeVideoIdempotencyHash({
    shotId,
    prompt: shotPrompt,
    firstframeUrl,
    duration,
    provenanceHash: provenance.previsSnapshotHash,
  });

  // 3. read-before-insert 幂等检查（用 hash）
  try {
    const existing = await serviceFetch<Array<{ id: string; status: string }>>(
      `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(userId)}&job_type=eq.video&target_type=eq.storyboard_shot_video&target_id=eq.${encodeURIComponent(shotId)}&input_params-%3E%3EidempotencyHash=eq.${encodeURIComponent(idempotencyHash)}&status=not.eq.failed&limit=1&select=id,status`,
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

  // 4. resolve provider（env VIDEO_PROVIDER=atlas|minimax，默认 atlas）
  const provider = await resolveVideoProvider();

  // 5. insert queued job row first（provider 调用失败时 job 仍存在可查）
  //    同时写入 idempotency_hash 列（migration 执行后参与唯一约束）；
  //    migration 未执行时字段不存在，Postgres 报错 → fallback 到不带列重试
  const jobId = crypto.randomUUID();
  const baseRow = {
    id: jobId,
    owner_id: userId,
    job_type: "video",
    provider: provider.name,
    model: null,
    provider_task_id: null,
    prompt: shotPrompt,
    input_params: {
      idempotencyKey: body.idempotencyKey || null, // 兼容字段
      idempotencyHash, // 真正的幂等键（应用层 read-before-insert 用）
      shotId,
      projectId: body.projectId,
      sourceUnitId: body.sourceUnitId,
      firstframeImageUrl: firstframeUrl,
      duration,
      aspectRatio,
      expectedRevision: body.expectedRevision ?? null,
      previsVersionId: provenance.previsVersionId ?? null,
      previsSnapshotHash: provenance.previsSnapshotHash ?? null,
      firstframeJobId: provenance.firstframeJobId ?? null,
      capabilityTranslation: provenance.capabilityTranslation ?? null,
      adoptedAt: provenance.adoptedAt ?? null,
    },
    result_metadata: buildVideoJobMetadata("queued", provenance),
    status: "queued",
    target_type: "storyboard_shot_video",
    target_id: shotId,
    project_id: body.projectId,
  };

  try {
    // 先尝试带 idempotency_hash 列（migration 已执行）
    await serviceFetch("/rest/v1/storyflow_generation_jobs", {
      method: "POST",
      body: JSON.stringify({ ...baseRow, idempotency_hash: idempotencyHash }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 唯一约束冲突 → 查现有返回 reused
    if (message.includes("409") || message.includes("uq_generation_jobs_idempotency_hash")) {
      try {
        const existing = await serviceFetch<Array<{ id: string; status: string }>>(
          `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(userId)}&job_type=eq.video&input_params-%3E%3EidempotencyHash=eq.${encodeURIComponent(idempotencyHash)}&status=not.eq.failed&limit=1&select=id,status`,
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
        // ignore
      }
    }
    // 字段不存在（migration 未执行）→ fallback 不带列重试
    if (message.includes("idempotency_hash") || message.includes("column") || message.includes("42703")) {
      try {
        await serviceFetch("/rest/v1/storyflow_generation_jobs", {
          method: "POST",
          body: JSON.stringify(baseRow),
        });
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        return errorResponse(500, "JOB_INSERT_FAILED", `创建 job 记录失败: ${msg2}`);
      }
    } else {
      return errorResponse(500, "JOB_INSERT_FAILED", `创建 job 记录失败: ${message}`);
    }
  }

  // 6. 调用 provider.submit
  try {
    const result = await provider.submit({
      prompt: shotPrompt,
      firstframeUrl,
      duration,
      aspectRatio,
    });

    // update job with provider_task_id and status=running
    await serviceFetch(`/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        provider_task_id: result.providerTaskId,
        status: "running",
        result_metadata: buildVideoJobMetadata("accepted", provenance),
        updated_at: new Date().toISOString(),
      }),
    });

    return NextResponse.json({
      success: true,
      jobId,
      providerTaskId: result.providerTaskId,
      reused: false,
      status: "running",
      subStatus: "accepted",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isAmbiguousVideoSubmissionError(error)) {
      await serviceFetch(`/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "queued",
          error: "SUBMISSION_STATUS_UNKNOWN",
          result_metadata: buildVideoJobMetadata("submission_unknown", provenance),
          updated_at: new Date().toISOString(),
        }),
      }).catch(() => {});
      return NextResponse.json({
        success: true,
        jobId,
        reused: false,
        status: "queued",
        subStatus: "submission_unknown",
      }, { status: 202 });
    }
    // mark job as failed but do NOT throw — caller can retry
    await serviceFetch(`/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "failed",
        error: message,
        result_metadata: buildVideoJobMetadata("failed", provenance),
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
