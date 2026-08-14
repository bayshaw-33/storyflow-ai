import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { createReport, listReportsByReporter, CommunityServiceError } from "@/lib/server/v2/community/moderation";
import { isReportTargetType, isReportReasonType, isReportStatus } from "@/lib/contracts/v2/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/community/reports — 列出当前用户提交的举报 (CM-007)
 *   query: status?, limit?, offset?
 *
 * POST /api/v2/community/reports — 创建举报 (CM-007)
 *   body: { targetType, targetId, reasonType, reasonDescription?, idempotencyKey? }
 *   CM-007: 幂等 — 同一用户对同一对象只能举报一次
 *   CM-008: 举报 publication 不会删除私有源 (由审核动作 hide_publication 单独处理)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Community service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const items = await listReportsByReporter(serviceFetch, user.id, {
      status: status && isReportStatus(status) ? status : undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
    });
    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.report/1",
      items,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to list reports.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Community service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const body = await request.json().catch(() => ({}));
    if (!isReportTargetType(body.targetType)) {
      return NextResponse.json(
        { success: false, error: "Invalid targetType.", code: "validation_failed" },
        { status: 400 },
      );
    }
    if (!body.targetId) {
      return NextResponse.json(
        { success: false, error: "targetId is required.", code: "validation_failed" },
        { status: 400 },
      );
    }
    if (!isReportReasonType(body.reasonType)) {
      return NextResponse.json(
        { success: false, error: "Invalid reasonType.", code: "validation_failed" },
        { status: 400 },
      );
    }

    // CM-007: 服务端注入 reporterId (RG-001 一致)
    const report = await createReport(serviceFetch, {
      reporterId: user.id,
      targetType: body.targetType,
      targetId: body.targetId,
      reasonType: body.reasonType,
      reasonDescription: body.reasonDescription ?? null,
      idempotencyKey: body.idempotencyKey || `report:${user.id}:${body.targetType}:${body.targetId}`,
    });

    return NextResponse.json(
      {
        success: true,
        contractVersion: "kiikis.community.report/1",
        report,
      },
      { status: 201 },
    );
  } catch (error) {
    return communityErrorResponse(error, "Unable to create report.");
  }
}

function communityErrorResponse(error: unknown, fallback: string) {
  if (error instanceof CommunityServiceError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
  }
  return NextResponse.json(
    { success: false, error: fallback, code: "service_unavailable" },
    { status: 503 },
  );
}
