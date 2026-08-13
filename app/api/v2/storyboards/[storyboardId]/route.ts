import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  getStoryboardById,
  diffStoryboards,
  DynamicGridStoreError,
} from "@/lib/server/v2/dynamic-storyboards";
import { dynamicStoryboardErrorResponse } from "@/lib/server/v2/dynamic-storyboards/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/storyboards/{storyboardId}
 *
 * 查询参数:
 *   - diffAgainst={rowId}: 返回当前版本与指定版本的 diff
 *
 * 无 diffAgainst 时返回单个版本 (用于 diff dialog 拉取旧版本)。
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ storyboardId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    ensureConfig();
    const { storyboardId } = await context.params;

    const url = new URL(request.url);
    const diffAgainst = url.searchParams.get("diffAgainst");

    const target = await getStoryboardById({
      fetcher: serviceFetch,
      userId: user.id,
      rowId: storyboardId,
    });

    if (diffAgainst) {
      if (diffAgainst === storyboardId) {
        return NextResponse.json(
          { success: false, error: "diffAgainst must differ from storyboardId.", code: "validation_failed" },
          { status: 422 }
        );
      }

      const against = await getStoryboardById({
        fetcher: serviceFetch,
        userId: user.id,
        rowId: diffAgainst,
      });

      const diff = diffStoryboards(against.storyboard, target.storyboard);

      return NextResponse.json({
        success: true,
        contractVersion: "kiikis.dynamic-grid-storyboard/1",
        from: {
          rowId: against.rowId,
          revision: against.revision,
          createdAt: against.createdAt,
          storyboard: against.storyboard,
        },
        to: {
          rowId: target.rowId,
          revision: target.revision,
          createdAt: target.createdAt,
          storyboard: target.storyboard,
        },
        diff,
      });
    }

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.dynamic-grid-storyboard/1",
      storyboard: target.storyboard,
      rowId: target.rowId,
      revision: target.revision,
      parentId: target.parentId,
      revisionSource: target.revisionSource,
      createdAt: target.createdAt,
    });
  } catch (error) {
    return routeError(error, "Unable to fetch dynamic storyboard.");
  }
}

function ensureConfig() {
  if (!hasServiceRoleConfig()) {
    throw new DynamicGridStoreError("service_unavailable", "Cloud data service is not configured.");
  }
}

function routeError(error: unknown, fallback: string) {
  if (
    error instanceof Error &&
    (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))
  ) {
    return NextResponse.json(
      { success: false, error: "Authentication is required.", code: "unauthenticated" },
      { status: 401 }
    );
  }
  return dynamicStoryboardErrorResponse(error, fallback);
}
