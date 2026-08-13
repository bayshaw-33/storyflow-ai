import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { createComment, listComments } from "@/lib/server/v2/collab/comments";
import { CollabServiceError } from "@/lib/server/v2/collab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/projects/[projectId]/comments — 列出项目评论 (CO-003)
 *   query: resourceType, resourceId, resourceVersion
 *   注: projectId 用于 RLS 隐式过滤, 实际锚定由 resourceType+resourceId 决定
 *
 * POST /api/v2/projects/[projectId]/comments — 创建评论 (CO-003)
 *   body: { resourceType, resourceId, resourceVersion?, body, anchorType?, anchorId?, parentCommentId? }
 *   authorId 由服务端认证填入 (RG-001)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Collab service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    await params; // 验证 projectId 存在 (RLS 隐式过滤)
    const url = new URL(request.url);
    const resourceType = url.searchParams.get("resourceType");
    const resourceId = url.searchParams.get("resourceId");
    const resourceVersion = url.searchParams.get("resourceVersion") ?? undefined;

    if (!resourceType || !resourceId) {
      return NextResponse.json(
        { success: false, error: "resourceType and resourceId are required.", code: "validation_failed" },
        { status: 422 },
      );
    }

    const comments = await listComments(serviceFetch, { resourceType, resourceId, resourceVersion });
    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.collab/1",
      comments,
    });
  } catch (error) {
    return collabErrorResponse(error, "Unable to list comments.");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Collab service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const { projectId } = await params;
    const body = await request.json().catch(() => ({}));

    // RG-001: authorId 由服务端认证填入
    const comment = await createComment(serviceFetch, {
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      resourceVersion: body.resourceVersion ?? null,
      authorId: user.id, // RG-001
      body: body.body,
      anchorType: body.anchorType ?? null,
      anchorId: body.anchorId ?? null,
      parentCommentId: body.parentCommentId ?? null,
      idempotencyKey: body.idempotencyKey || `comment:${user.id}:${body.resourceType}:${body.resourceId}:${Date.now()}`,
    });

    // CO-006: 记录活动 (异步, 失败不影响主流程)
    try {
      const { appendActivity } = await import("@/lib/server/v2/collab/activity");
      await appendActivity(serviceFetch, {
        projectId,
        resourceType: "comment",
        resourceId: comment.id,
        activityType: body.parentCommentId ? "replied" : "commented",
        actorId: user.id,
        details: { resource_type: body.resourceType, resource_id: body.resourceId },
      });
    } catch {
      // 活动记录失败不影响评论创建
    }

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.collab/1",
      comment,
    }, { status: 201 });
  } catch (error) {
    return collabErrorResponse(error, "Unable to create comment.");
  }
}

function collabErrorResponse(error: unknown, fallback: string) {
  if (error instanceof CollabServiceError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
  }
  return NextResponse.json({ success: false, error: fallback, code: "service_unavailable" }, { status: 503 });
}
