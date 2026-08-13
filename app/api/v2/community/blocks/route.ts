import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { toggleBlock, listBlocks, CommunityServiceError } from "@/lib/server/v2/community/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/community/blocks — 列出当前用户屏蔽的人 (CM-007)
 *   query: limit?, offset?
 *
 * POST /api/v2/community/blocks — 切换屏蔽状态 (CM-007, 幂等 toggle)
 *   body: { blockedId }
 *   CM-009: 屏蔽后双向不可见 (RLS 兜底)
 *   返回 { blocking: boolean } — 已屏蔽则取消，未屏蔽则屏蔽
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
    const items = await listBlocks(serviceFetch, user.id, {
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
    });
    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.block/1",
      items,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to list blocks.");
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
    if (!body.blockedId) {
      return NextResponse.json(
        { success: false, error: "blockedId is required.", code: "validation_failed" },
        { status: 400 },
      );
    }

    // CM-007: 幂等 toggle (已屏蔽→取消, 未屏蔽→屏蔽)
    const { blocking } = await toggleBlock(serviceFetch, {
      blockerId: user.id,
      blockedId: body.blockedId,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.block/1",
      blocking,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to toggle block.");
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
