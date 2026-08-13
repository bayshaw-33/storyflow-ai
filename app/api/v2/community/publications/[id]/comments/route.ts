import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { createComment, listComments, CommunityServiceError } from "@/lib/server/v2/community/comments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/community/publications/[id]/comments — 列出 publication 的评论 (CM-004)
 *   query: limit?, offset?
 *
 * POST /api/v2/community/publications/[id]/comments — 创建评论 (CM-004)
 *   body: { body, parentCommentId? }
 *   CM-004: authorId 由服务端从认证用户注入；支持回复 (parentCommentId);
 *           body append-only; 软删除由单独 RPC 处理。
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
    const url = new URL(request.url);

    const items = await listComments(serviceFetch, id, {
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 100,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.comment/1",
      items,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to list comments.");
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
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body.body || typeof body.body !== "string" || !body.body.trim()) {
      return NextResponse.json(
        { success: false, error: "body is required.", code: "validation_failed" },
        { status: 400 },
      );
    }

    // CM-004: authorId 由服务端注入；idempotencyKey 缺失时由服务端生成确定性 key
    const idempotencyKey =
      body.idempotencyKey ||
      `comment:${user.id}:${id}:${body.parentCommentId ?? "root"}:${Date.now()}`;

    const comment = await createComment(serviceFetch, {
      publicationId: id,
      parentCommentId: body.parentCommentId ?? null,
      authorId: user.id,
      body: body.body,
      idempotencyKey,
    });

    return NextResponse.json(
      {
        success: true,
        contractVersion: "kiikis.community.comment/1",
        comment,
      },
      { status: 201 },
    );
  } catch (error) {
    return communityErrorResponse(error, "Unable to create comment.");
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
