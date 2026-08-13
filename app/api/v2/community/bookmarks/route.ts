import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  toggleBookmark,
  listBookmarks,
  CommunityServiceError,
} from "@/lib/server/v2/community/interactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/community/bookmarks — 列出当前用户的收藏
 *   query: limit?, offset?
 *
 * POST /api/v2/community/bookmarks — 切换收藏状态 (CM-003, 幂等 toggle)
 *   body: { publicationId }
 *   返回 { bookmarked: boolean }
 *   同一 (user, publication) 重复操作幂等
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
    const items = await listBookmarks(serviceFetch, user.id, {
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.bookmark/1",
      items,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to list bookmarks.");
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

    // CM-003: 幂等 toggle (已收藏→取消, 未收藏→收藏)
    const { bookmarked } = await toggleBookmark(serviceFetch, {
      publicationId: body.publicationId,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.bookmark/1",
      bookmarked,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to toggle bookmark.");
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
