import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { listModerationQueue, CommunityServiceError } from "@/lib/server/v2/community/moderation";
import { requireModerator } from "@/lib/server/v2/community/permissions";
import { isModerationStatus, isReportTargetType } from "@/lib/contracts/v2/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/community/moderation/queue — 审核员查看审核队列 (CM-007, CM-009)
 *   query: status?, targetType?, limit?, offset?
 *
 * CM-009: 仅 moderator/admin 角色可访问
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

    // CM-009: 权限校验 (RLS 兜底)
    try {
      await requireModerator(serviceFetch, user.id);
    } catch (err) {
      if (err instanceof CommunityServiceError && err.code === "forbidden") {
        return NextResponse.json(
          { success: false, error: "Moderator role required.", code: "forbidden" },
          { status: 403 },
        );
      }
      throw err;
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const targetType = url.searchParams.get("targetType");
    if (status && !isModerationStatus(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status: ${status}`, code: "validation_failed" },
        { status: 400 },
      );
    }
    if (targetType && !isReportTargetType(targetType)) {
      return NextResponse.json(
        { success: false, error: `Invalid targetType: ${targetType}`, code: "validation_failed" },
        { status: 400 },
      );
    }
    const items = await listModerationQueue(serviceFetch, {
      status: status && isModerationStatus(status) ? status : undefined,
      targetType: targetType && isReportTargetType(targetType) ? targetType : undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.moderation/1",
      items,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to list moderation queue.");
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
