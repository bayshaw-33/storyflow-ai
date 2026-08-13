import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { listProjectActivity, listResourceActivity } from "@/lib/server/v2/collab/activity";
import { CollabServiceError } from "@/lib/server/v2/collab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/projects/[projectId]/activity — 列出项目活动流 (CO-006)
 *   query: resourceType, resourceId (可选, 指定资源则列出资源活动历史)
 *          limit (默认 50, 最大 200), offset
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
    const { projectId } = await params;
    const url = new URL(request.url);
    const resourceType = url.searchParams.get("resourceType") ?? undefined;
    const resourceId = url.searchParams.get("resourceId") ?? undefined;
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

    let activity;
    if (resourceType && resourceId) {
      // CO-006: 资源级活动历史
      activity = await listResourceActivity(serviceFetch, { resourceType, resourceId }, { limit, offset });
    } else {
      // CO-006: 项目级活动流
      activity = await listProjectActivity(serviceFetch, projectId, { limit, offset });
    }

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.collab/1",
      activity,
    });
  } catch (error) {
    return collabErrorResponse(error, "Unable to list activity.");
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
