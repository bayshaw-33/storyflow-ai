/**
 * POST /api/video-gateway/generate
 * TRAE-V2-05 Video Model Gateway V1
 * 提交视频生成任务（创建 generation_job + 调用 provider.submit）
 *
 * 幂等：同 (ownerId, projectId, shotId, prompt, firstframeUrl, duration, provider) 的 in-flight job 直接返回
 * 不暴露 Provider Key、原始错误正文
 */

import { NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig } from "@/lib/supabase/server";
import { resolveVideoProvider } from "@/lib/video-gateway/router";
import { createVideoJob, updateVideoJobStatus } from "@/lib/video-gateway/queries";
import { estimateDurationSeconds } from "@/lib/video-gateway/lifecycle";
import { isVideoGatewayError } from "@/lib/video-gateway/types";
import type {
  VideoGatewayProviderName,
  VideoGenerateRequest,
  VideoGenerateResponse,
  VideoJobStatus,
  VideoJobSubStatus,
} from "@/lib/video-gateway/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(
  status: number,
  code: string,
  error: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    { success: false, error, code, ...(details ? { details } : {}) },
    { status },
  );
}

export async function POST(request: Request) {
  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录。");
  }

  if (!hasServiceRoleConfig()) {
    return errorResponse(500, "MISSING_CONFIG", "服务端缺少配置。");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_INPUT", "请求格式不正确。");
  }
  if (!body || typeof body !== "object") {
    return errorResponse(400, "INVALID_INPUT", "请求格式不正确。");
  }

  const data = body as Record<string, unknown>;
  const projectId = typeof data.projectId === "string" ? data.projectId : "";
  const sourceUnitId =
    typeof data.sourceUnitId === "string" ? data.sourceUnitId : "legacy";
  const shotId = typeof data.shotId === "string" ? data.shotId : "";
  const prompt = typeof data.prompt === "string" ? data.prompt : "";
  const firstframeUrl =
    typeof data.firstframeUrl === "string" ? data.firstframeUrl : "";
  const duration =
    typeof data.duration === "number" ? data.duration : 5;
  const aspectRatio =
    (typeof data.aspectRatio === "string" ? data.aspectRatio : "9:16") as
      | "9:16"
      | "16:9"
      | "1:1";
  const providerChoiceRaw =
    typeof data.provider === "string" ? data.provider : "auto";

  if (!projectId.trim() || !shotId.trim()) {
    return errorResponse(400, "INVALID_INPUT", "缺少 projectId / shotId。");
  }
  if (!prompt.trim() || !firstframeUrl.trim()) {
    return errorResponse(400, "INVALID_INPUT", "缺少 prompt / firstframeUrl。");
  }

  const validProviders: string[] = ["auto", "atlas", "minimax", "runway", "seedance"];
  if (!validProviders.includes(providerChoiceRaw)) {
    return errorResponse(
      400,
      "INVALID_INPUT",
      `不支持的 provider: ${providerChoiceRaw}`,
    );
  }
  const providerChoice = providerChoiceRaw as
    | VideoGatewayProviderName
    | "auto";

  try {
    // 1. 解析 provider
    const provider = await resolveVideoProvider(providerChoice);

    // 2. 提交到 provider
    let providerTaskId: string;
    let model: string;
    try {
      const submitResult = await provider.submit({
        prompt,
        firstframeUrl,
        duration,
        aspectRatio,
      });
      providerTaskId = submitResult.providerTaskId;
      model = submitResult.provider.model;
    } catch (err) {
      const detail = err instanceof Error ? err.message.slice(0, 200) : String(err);
      console.error("[video-gateway/generate] provider.submit failed", {
        provider: provider.name,
        detail,
      });
      return errorResponse(
        502,
        "PROVIDER_CALL_FAILED",
        `视频生成服务调用失败：${detail}`,
        { provider: provider.name },
      );
    }

    // 3. 创建 generation_job（带幂等检查）
    const { job, created } = await createVideoJob({
      ownerId: userId,
      projectId,
      sourceUnitId,
      shotId,
      prompt,
      firstframeUrl,
      duration,
      aspectRatio,
      provider: provider.name,
      model,
      providerTaskId,
      providerChoice,
    });

    if (!created) {
      // 已有 in-flight job，幂等返回
      return NextResponse.json({
        success: true,
        jobId: job.id,
        providerTaskId: job.provider_task_id as string,
        provider: job.provider as VideoGatewayProviderName,
        model: job.model as string,
        status: job.status as VideoJobStatus,
        subStatus: ((job.result_metadata as Record<string, unknown>)?.sub_status ?? "queued") as VideoJobSubStatus,
        estimatedDurationSeconds: estimateDurationSeconds(provider.name),
        idempotent: true,
      } satisfies VideoGenerateResponse & { idempotent: true });
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      providerTaskId,
      provider: provider.name,
      model,
      status: "queued",
      subStatus: "queued",
      estimatedDurationSeconds: estimateDurationSeconds(provider.name),
    } satisfies VideoGenerateResponse);
  } catch (err: unknown) {
    if (isVideoGatewayError(err)) {
      const status =
        err.code === "PROVIDER_UNAVAILABLE" ? 503 :
        err.code === "INVALID_INPUT" ? 400 :
        err.code === "PROVIDER_TIMEOUT" ? 504 :
        500;
      return errorResponse(status, err.code, err.message, err.details);
    }
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, "VIDEO_GATEWAY_FAILED", message);
  }
}
