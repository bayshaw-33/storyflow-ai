import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { softDeleteComment, getComment, CommunityServiceError } from "@/lib/server/v2/community/comments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/community/comments/[id] — 获取评论详情 (CM-004)
 *
 * DELETE /api/v2/community/comments/[id] — 软删除评论 (CM-004)
 *   body: { reason? }
 *   CM-004: 软删除只标记 deleted_at, 不物理删除; 只能 author 自己删除。
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Community service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const { id } = await params;
    const comment = await getComment(serviceFetch, id);
    if (!comment) {
      return NextResponse.json(
        { success: false, error: "Comment not found.", code: "not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.comment/1",
      comment,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to fetch comment.");
  }
}

export async function DELETE(
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
    const body = await request.json().catch(() => ({}));

    // CM-004: 先获取评论验证所有权 (RLS 也兜底)
    const existing = await getComment(serviceFetch, id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Comment not found.", code: "not_found" },
        { status: 404 },
      );
    }
    if (existing.authorId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Only author can delete comment.", code: "forbidden" },
        { status: 403 },
      );
    }

    // CM-004: 软删除 (不物理删除, 标记 deleted_at)
    const comment = await softDeleteComment(serviceFetch, id, body.reason);

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.comment/1",
      comment,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to delete comment.");
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
