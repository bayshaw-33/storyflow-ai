/**
 * GET /api/v2/work-usages/[usageId] — single usage link (read-only view).
 * Phase 5 Task 5.1
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { WorkUsageService, WorkUsageError } from "@/lib/server/v2/work-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ usageId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "Usage service not configured.", code: "service_unavailable" }, { status: 503 });
    }
    const viewer = await getViewerFromCookies();
    if (!viewer) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
    const { usageId } = await params;
    const service = new WorkUsageService(serviceFetch);
    const link = await service.getLink({ ownerId: viewer.id, usageId });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", link });
  } catch (error) {
    if (error instanceof WorkUsageError) {
      const status =
        error.code === "forbidden" ? 403 :
        error.code === "not_found" ? 404 : 503;
      return NextResponse.json({ success: false, error: error.message.replace(`${error.code}: `, ""), code: error.code }, { status });
    }
    return NextResponse.json({ success: false, error: "Usage service unavailable.", code: "service_unavailable" }, { status: 503 });
  }
}
