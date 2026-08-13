import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { kkProfileErrorResponse } from "@/lib/server/v2/kk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/kk/events?afterSequence=N&limit=100
 *
 * 返回 owner 的增量事件流 (K21-KK-003)。
 * Realtime 通道断线后通过此接口补拉 (K21-KK-004)。
 *
 * K21-KK-007: 服务端按 sequence 单调返回，客户端去重。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        {
          success: false,
          error: "KK service not configured (K21-KK-002).",
          code: "service_unavailable",
        },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const afterSequenceRaw = url.searchParams.get("afterSequence");
    const limitRaw = url.searchParams.get("limit");

    const afterSequence = afterSequenceRaw ? parseInt(afterSequenceRaw, 10) : 0;
    if (!Number.isFinite(afterSequence) || afterSequence < 0) {
      return NextResponse.json(
        { success: false, error: "afterSequence must be a non-negative integer.", code: "validation_failed" },
        { status: 422 },
      );
    }
    const limit = Math.min(Math.max(limitRaw ? parseInt(limitRaw, 10) : 100, 1), 500);
    if (!Number.isFinite(limit)) {
      return NextResponse.json(
        { success: false, error: "limit must be a positive integer.", code: "validation_failed" },
        { status: 422 },
      );
    }

    // 查询 sequence > afterSequence 的事件，按 sequence 升序
    const rows = await serviceFetch<Array<{
      id: string;
      sequence: number;
      event_type: string;
      resource_type: string;
      resource_id: string;
      task_id: string | null;
      occurred_at: string;
      payload: Record<string, unknown> | null;
    }>>(
      `/rest/v1/storyflow_creative_events?owner_id=eq.${encodeURIComponent(user.id)}&sequence=gt.${afterSequence}&order=sequence.asc&limit=${limit}`,
    );

    const events = (rows ?? []).map((r) => ({
      id: r.id,
      sequence: r.sequence,
      eventType: r.event_type,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      taskId: r.task_id,
      occurredAt: r.occurred_at,
      payload: r.payload ?? {},
    }));

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.kk-runtime/1",
      events,
      nextCursor: events.length > 0 ? events[events.length - 1].sequence : afterSequence,
    });
  } catch (error) {
    return kkProfileErrorResponse(error, "Unable to fetch KK event stream.");
  }
}
