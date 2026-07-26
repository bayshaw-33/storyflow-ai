/**
 * POST /api/video-gateway/[jobId]/retry
 * TRAE-V2-05 Video Model Gateway V1
 * 重试视频生成任务
 *
 * - 仅 failed/cancelled 的 job 可重试
 * - 复用原 job 的 input_params 创建新 job（保留原 job 作为历史）
 * - 重新调用 provider.submit
 */

import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import {
  getVideoJob,
  createVideoJob,
  parseJobRow,
} from "@/lib/video-gateway/queries";
import { resolveVideoProvider } from "@/lib/video-gateway/router";
import { isRetryableStatus, estimateDurationSeconds } from "@/lib/video-gateway/lifecycle";
import { isVideoGatewayError } from "@/lib/video-gateway/types";
import type {
  VideoGatewayProviderName,
  VideoRetryResponse,
} from "@/lib/video-gateway/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string, details?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, code, ...(details ? { details } : {}) }, { status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录。");
  }

  const { jobId } = await context.params;
  if (!jobId) return errorResponse(400, "INVALID_INPUT", "缺少 jobId。");

  try {
    const job = await getVideoJob(userId, jobId);
    const parsed = parseJobRow(job);

    if (!isRetryableStatus(parsed.status)) {
      return errorResponse(
        409,
        "JOB_ALREADY_COMPLETED",
        `Job 当前状态为 ${parsed.status}，无法重试。`,
      );
    }

    // 从 input_params 恢复原始请求
    const inputParams = (job.input_params || {}) as Record<string, unknown>;
    const projectId = (inputParams.projectId as string) || job.project_id || "";
    const sourceUnitId = (inputParams.sourceUnitId as string) || "legacy";
    const shotId = (inputParams.shotId as string) || job.target_id || "";
    const firstframeUrl = (inputParams.firstframeUrl as string) || "";
    const duration = (inputParams.duration as number) || 5;
    const aspectRatio = (inputParams.aspectRatio as string) || "9:16";

    if (!projectId || !shotId || !firstframeUrl) {
      return errorResponse(
        400,
        "INVALID_INPUT",
        "原 job 缺少必要的 input_params，无法重试。",
      );
    }

    // 重新解析 provider
    const provider = await resolveVideoProvider(parsed.provider);

    // 重新提交
    let providerTaskId: string;
    let model: string;
    try {
      const submitResult = await provider.submit({
        prompt: job.prompt,
        firstframeUrl,
        duration,
        aspectRatio,
      });
      providerTaskId = submitResult.providerTaskId;
      model = submitResult.provider.model;
    } catch (err) {
      const detail = err instanceof Error ? err.message.slice(0, 200) : String(err);
      return errorResponse(
        502,
        "PROVIDER_CALL_FAILED",
        `视频生成服务调用失败：${detail}`,
        { provider: provider.name },
      );
    }

    // 创建新 job（保留原 job 作为历史）
    const { job: newJob } = await createVideoJob({
      ownerId: userId,
      projectId,
      sourceUnitId,
      shotId,
      prompt: job.prompt,
      firstframeUrl,
      duration,
      aspectRatio,
      provider: provider.name as VideoGatewayProviderName,
      model,
      providerTaskId,
      providerChoice: parsed.provider,
    });

    return NextResponse.json({
      success: true,
      jobId: newJob.id,
      providerTaskId,
      provider: provider.name,
      model,
      status: "queued",
      subStatus: "queued",
      estimatedDurationSeconds: estimateDurationSeconds(provider.name),
    } satisfies VideoRetryResponse);
  } catch (err: unknown) {
    if (isVideoGatewayError(err)) {
      const status =
        err.code === "JOB_NOT_FOUND" ? 404 :
        err.code === "PROVIDER_UNAVAILABLE" ? 503 :
        500;
      return errorResponse(status, err.code, err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, "VIDEO_GATEWAY_FAILED", message);
  }
}
