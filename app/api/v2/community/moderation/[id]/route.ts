import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { getModerationItem, reviewModeration, CommunityServiceError } from "@/lib/server/v2/community/moderation";
import { requireModerator } from "@/lib/server/v2/community/permissions";
import { isModerationAction } from "@/lib/contracts/v2/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/community/moderation/[id] — 获取审核单条详情 (CM-007, CM-009)
 *   CM-009: 仅 moderator/admin
 *
 * POST /api/v2/community/moderation/[id] — 执行审核动作 (CM-007)
 *   body: { action: "hide" | "restore" | "dismiss", reason? }
 *   CM-008: hide 只改 publication visibility, 不删除私有源
 *   CM-009: 仅 moderator/admin
 *   CM-006: 通知被举报对象作者 (审核结果, 由 RPC 写入 creative_events)
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
    const item = await getModerationItem(serviceFetch, id);
    if (!item) {
      return NextResponse.json(
        { success: false, error: "Moderation item not found.", code: "not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.moderation/1",
      item,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to fetch moderation item.");
  }
}

export async function POST(
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
    if (!isModerationAction(body.action)) {
      return NextResponse.json(
        { success: false, error: "Invalid action.", code: "validation_failed" },
        { status: 400 },
      );
    }

    // CM-007: 执行审核动作 (hide/restore/dismiss)
    // CM-008: hide 只改 publication visibility, 不删除私有源 (RPC 内调用 hide_publication)
    // CM-006: RPC 内写 creative_events 通知 publication owner
    const item = await reviewModeration(serviceFetch, {
      moderationId: id,
      action: body.action,
      reason: body.reason ?? null,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.moderation/1",
      item,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to review moderation.");
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
