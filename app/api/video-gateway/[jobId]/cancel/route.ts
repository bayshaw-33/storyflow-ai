/**
 * POST /api/video-gateway/[jobId]/cancel
 * TRAE-V2-05 Video Model Gateway V1
 * 取消视频生成任务（best-effort）
 *
 * - 调用 provider.cancel（如果支持）
 * - 更新 generation_job.status=cancelled, sub_status=cancelled
 * - 终态 job 不可取消
 */

import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { getVideoJob, updateVideoJobStatus, parseJobRow } from "@/lib/video-gateway/queries";
import { resolveVideoProvider } from "@/lib/video-gateway/router";
import { isCancellableStatus } from "@/lib/video-gateway/lifecycle";
import { isVideoGatewayError } from "@/lib/video-gateway/types";
import type { VideoCancelResponse } from "@/lib/video-gateway/types";

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

    if (!isCancellableStatus(parsed.status)) {
      return errorResponse(
        409,
        "JOB_NOT_CANCELLABLE",
        `Job 当前状态为 ${parsed.status}，无法取消。`,
      );
    }

    // 标记 cancel_requested
    await updateVideoJobStatus(userId, jobId, {
      subStatus: "cancel_requested",
    });

    // 调用 provider.cancel（best-effort）
    let providerAccepted = false;
    if (parsed.providerTaskId) {
      try {
        const provider = await resolveVideoProvider(parsed.provider);
        if (provider.cancel) {
          providerAccepted = await provider.cancel(parsed.providerTaskId);
        }
      } catch {
        // provider 不可用或 cancel 失败，仍标记 DB 为 cancelled
      }
    }

    const updated = await updateVideoJobStatus(userId, jobId, {
      status: "cancelled",
      subStatus: "cancelled",
      completedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      jobId,
      status: updated.status as VideoCancelResponse["status"],
      subStatus: "cancelled",
      providerAccepted,
    } satisfies VideoCancelResponse);
  } catch (err: unknown) {
    if (isVideoGatewayError(err)) {
      const status = err.code === "JOB_NOT_FOUND" ? 404 : 500;
      return errorResponse(status, err.code, err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, "VIDEO_GATEWAY_FAILED", message);
  }
}
