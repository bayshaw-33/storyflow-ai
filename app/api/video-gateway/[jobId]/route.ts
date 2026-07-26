/**
 * GET /api/video-gateway/[jobId]
 * TRAE-V2-05 Video Model Gateway V1
 * 查询视频生成任务状态
 *
 * - queued/running: 调用 provider.poll 同步状态，必要时触发转存
 * - completed: 根据 storage_path 重签 result_url
 * - failed/cancelled: 直接返回
 *
 * 不暴露 Provider Key、原始错误正文
 */

import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import {
  getVideoJob,
  updateVideoJobStatus,
  ingestVideoResult,
  parseJobRow,
  resignJobResultUrl,
} from "@/lib/video-gateway/queries";
import { resolveVideoProvider } from "@/lib/video-gateway/router";
import { mapPollToJobStatus, isTerminalStatus, isQueryableStatus } from "@/lib/video-gateway/lifecycle";
import { isVideoGatewayError } from "@/lib/video-gateway/types";
import type { VideoJobStatusResponse, VideoJobStatus } from "@/lib/video-gateway/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string, details?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, code, ...(details ? { details } : {}) }, { status });
}

export async function GET(
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

    // 终态：直接返回（completed 时重签 URL）
    if (isTerminalStatus(parsed.status)) {
      let signedUrl = parsed.signedUrl;
      if (parsed.status === "completed" && parsed.storagePath) {
        signedUrl = (await resignJobResultUrl(userId, jobId)) ?? parsed.signedUrl;
      }
      return NextResponse.json({
        success: true,
        ...parsed,
        signedUrl,
      } satisfies VideoJobStatusResponse);
    }

    // 非终态：调用 provider.poll 同步
    if (!isQueryableStatus(parsed.status) || !parsed.providerTaskId) {
      return NextResponse.json({ success: true, ...parsed } satisfies VideoJobStatusResponse);
    }

    let provider;
    try {
      provider = await resolveVideoProvider(parsed.provider);
    } catch {
      // provider 已不可用，返回当前状态
      return NextResponse.json({ success: true, ...parsed } satisfies VideoJobStatusResponse);
    }

    let poll;
    try {
      poll = await provider.poll(parsed.providerTaskId);
    } catch (err) {
      const detail = err instanceof Error ? err.message.slice(0, 200) : String(err);
      console.error("[video-gateway/status] provider.poll failed", {
        jobId,
        provider: parsed.provider,
        detail,
      });
      // poll 失败不改变 DB 状态，前端继续轮询
      return NextResponse.json({
        success: true,
        ...parsed,
        errorCode: "POLL_FAILED",
        errorMessage: "查询 provider 状态失败，稍后重试。",
      } satisfies VideoJobStatusResponse);
    }

    const mapped = mapPollToJobStatus(poll);

    // done → 触发转存
    if (poll.status === "done" && poll.videoUrl) {
      // 标记 result_ingesting
      await updateVideoJobStatus(userId, jobId, {
        status: mapped.status,
        subStatus: "result_ingesting",
      });

      try {
        const result = await ingestVideoResult({
          ownerId: userId,
          jobId,
          shotId: parsed.shotId ?? jobId,
          providerTempUrl: poll.videoUrl,
        });
        return NextResponse.json({
          success: true,
          ...parsed,
          status: "completed",
          subStatus: "completed",
          signedUrl: result.signedUrl,
          storagePath: result.storagePath,
          completedAt: new Date().toISOString(),
        } satisfies VideoJobStatusResponse);
      } catch (err) {
        // ingestVideoResult 内部已更新 DB 状态
        const detail = err instanceof Error ? err.message.slice(0, 200) : String(err);
        const refreshed = await getVideoJob(userId, jobId);
        return NextResponse.json({
          success: true,
          ...parseJobRow(refreshed),
          errorCode: isVideoGatewayError(err) ? err.code : "RESULT_INGEST_FAILED",
          errorMessage: detail,
        } satisfies VideoJobStatusResponse);
      }
    }

    // 普通 running/queued/error：更新状态
    const updated = await updateVideoJobStatus(userId, jobId, {
      status: mapped.status,
      subStatus: mapped.subStatus,
      error: poll.status === "error" ? `Provider status: ${poll.rawStatus ?? "error"}` : null,
      completedAt: mapped.status === "failed" ? new Date().toISOString() : null,
    });
    return NextResponse.json({
      success: true,
      ...parseJobRow(updated),
    } satisfies VideoJobStatusResponse);
  } catch (err: unknown) {
    if (isVideoGatewayError(err)) {
      const status =
        err.code === "JOB_NOT_FOUND" ? 404 :
        err.code === "INVALID_INPUT" ? 400 :
        500;
      return errorResponse(status, err.code, err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, "VIDEO_GATEWAY_FAILED", message);
  }
}
