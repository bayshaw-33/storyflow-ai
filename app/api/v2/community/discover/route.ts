import { NextRequest, NextResponse } from "next/server";
import { hasServiceRoleConfig, serviceFetch, getViewerFromCookies } from "@/lib/supabase/server";
import { listDiscoveryFeed, listByPublisher } from "@/lib/server/v2/community/discovery";
import { CommunityServiceError } from "@/lib/server/v2/community/publications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/community/discover — 发现页投影查询 (CM-002)
 *
 * CM-002: 只返回 visibility=public 的 publication 投影，不查私有资源表。
 * CM-009: 匿名用户可浏览 public；认证用户可额外查看自己发布的。
 *
 * query:
 *   - limit (default 20, max 100)
 *   - offset (default 0)
 *   - mine=1 — 仅返回当前用户发布的 publications
 */
export async function GET(request: NextRequest) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Community service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");
    const mine = url.searchParams.get("mine") === "1";

    // CM-009: 匿名可浏览 public; mine 需要登录
    const viewer = await getViewerFromCookies();
    if (mine && !viewer) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }

    const opts = {
      limit: limit ? Number(limit) : 20,
      offset: offset ? Number(offset) : 0,
    };

    // CM-002: mine=1 查询当前用户的 publications 投影
    if (mine && viewer) {
      const items = await listByPublisher(serviceFetch, viewer.id, opts);
      return NextResponse.json({
        success: true,
        contractVersion: "kiikis.community.publication/1",
        items,
      });
    }

    // CM-002: 默认查询 public 投影 (匿名可访问)
    const items = await listDiscoveryFeed(serviceFetch, {
      viewerId: viewer?.id ?? null,
      ...opts,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.publication/1",
      items,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to fetch discovery feed.");
  }
}

function communityErrorResponse(error: unknown, fallback: string) {
  if (error instanceof CommunityServiceError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { success: false, error: fallback, code: "service_unavailable" },
    { status: 503 },
  );
}
