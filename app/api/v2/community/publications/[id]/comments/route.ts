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
    await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Community service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const { id } = await params;
    const url = new URL(request.url);
    const limit = parseInteger(url.searchParams.get("limit"), 20, 1, 100);
    const offset = parseInteger(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);

    const page = await listComments(serviceFetch, id, {
      limit: limit + 1,
      offset,
    });
    const hasMore = page.length > limit;
    const items = page.slice(0, limit);

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.comment/1",
      items,
      hasMore,
      nextOffset: hasMore ? offset + items.length : null,
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

    // CM-004: authorId 由服务端注入；重试必须复用客户端生成的幂等键。
    if (typeof body.idempotencyKey !== "string" || !body.idempotencyKey.trim()) {
      return NextResponse.json(
        { success: false, error: "idempotencyKey is required.", code: "validation_failed" },
        { status: 400 },
      );
    }
    const idempotencyKey = body.idempotencyKey.trim();

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

function parseInteger(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new CommunityServiceError("validation_failed", "Invalid comment pagination.", 400);
  }
  return parsed;
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
