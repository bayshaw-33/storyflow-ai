import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  toggleReaction,
  listReactions,
  CommunityServiceError,
} from "@/lib/server/v2/community/interactions";
import { isReactionType } from "@/lib/contracts/v2/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/community/reactions — 列出 publication 的反应
 *   query: publicationId (required), reactionType?, limit?, offset?
 *
 * POST /api/v2/community/reactions — 切换反应状态 (CM-003, 幂等 toggle)
 *   body: { publicationId, reactionType }
 *   返回 { reacted: boolean }
 *   同一 (user, publication, reactionType) 重复操作幂等
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
    const publicationId = url.searchParams.get("publicationId");
    if (!publicationId) {
      return NextResponse.json(
        { success: false, error: "publicationId is required.", code: "validation_failed" },
        { status: 400 },
      );
    }

    const reactionType = url.searchParams.get("reactionType");
    if (reactionType && !isReactionType(reactionType)) {
      return NextResponse.json(
        { success: false, error: "Invalid reactionType.", code: "validation_failed" },
        { status: 400 },
      );
    }

    const items = await listReactions(serviceFetch, publicationId, {
      reactionType: reactionType && isReactionType(reactionType) ? reactionType : undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.reaction/1",
      items,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to list reactions.");
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
    if (!body.publicationId) {
      return NextResponse.json(
        { success: false, error: "publicationId is required.", code: "validation_failed" },
        { status: 400 },
      );
    }
    if (!isReactionType(body.reactionType)) {
      return NextResponse.json(
        { success: false, error: "Invalid reactionType.", code: "validation_failed" },
        { status: 400 },
      );
    }

    // CM-003: 幂等 toggle (同类型 reaction 再点取消)
    const { reacted } = await toggleReaction(serviceFetch, {
      publicationId: body.publicationId,
      reactionType: body.reactionType,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.reaction/1",
      reacted,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to toggle reaction.");
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
