import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { getAppeal, reviewAppeal, CommunityServiceError } from "@/lib/server/v2/community/moderation";
import { requireModerator, hasModeratorRole } from "@/lib/server/v2/community/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/community/appeals/[id] — 获取申诉详情 (CM-007, CM-009)
 *   CM-009: appellant 可看自己的; 审核员可看所有 (RLS 兜底)
 *
 * PATCH /api/v2/community/appeals/[id] — 审核员处理申诉 (CM-007)
 *   body: { decision: "approved" | "rejected", reviewNotes? }
 *   CM-007: approved → 自动 restore publication (RPC 内调用 restore_publication)
 *   CM-009: 仅 moderator/admin
 *   CM-006: 通知申诉人 (由 RPC 写入 creative_events)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Community service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const { id } = await params;
    const appeal = await getAppeal(serviceFetch, id);
    if (!appeal) {
      return NextResponse.json(
        { success: false, error: "Appeal not found.", code: "not_found" },
        { status: 404 },
      );
    }
    // CM-009: appellant 可看自己的; 审核员可看所有 (RLS 兜底)
    if (appeal.appellantId !== user.id) {
      const isMod = await hasModeratorRole(serviceFetch, user.id);
      if (!isMod) {
        return NextResponse.json(
          { success: false, error: "Appeal not accessible.", code: "forbidden" },
          { status: 403 },
        );
      }
    }
    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.appeal/1",
      appeal,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to fetch appeal.");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Community service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
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
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (body.decision !== "approved" && body.decision !== "rejected") {
      return NextResponse.json(
        { success: false, error: "decision must be approved or rejected.", code: "validation_failed" },
        { status: 400 },
      );
    }

    // CM-007: 处理申诉 (approved → 自动 restore publication, RPC 内处理)
    const appeal = await reviewAppeal(serviceFetch, {
      appealId: id,
      decision: body.decision,
      reviewNotes: body.reviewNotes ?? null,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.appeal/1",
      appeal,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to review appeal.");
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
