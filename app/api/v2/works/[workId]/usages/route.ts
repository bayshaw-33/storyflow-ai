/**
 * Work usage links API — Phase 5 Task 5.1.
 *   GET  /api/v2/works/[workId]/usages?direction=incoming|outgoing|both
 *   POST /api/v2/works/[workId]/usages — create a usage link
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { WorkUsageService, WorkUsageError } from "@/lib/server/v2/work-usage";
import { isUsageRole } from "@/lib/contracts/v2/work-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof WorkUsageError) {
    const status =
      error.code === "unauthenticated" ? 401 :
      error.code === "forbidden" ? 403 :
      error.code === "not_found" ? 404 :
      error.code === "conflict" ? 409 :
      error.code === "validation_failed" ? 422 : 503;
    return NextResponse.json({ success: false, error: error.message.replace(`${error.code}: `, ""), code: error.code }, { status });
  }
  return NextResponse.json({ success: false, error: "Usage service unavailable.", code: "service_unavailable" }, { status: 503 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "Usage service not configured.", code: "service_unavailable" }, { status: 503 });
    }
    const viewer = await getViewerFromRequest(request);
    if (!viewer) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
    const { workId } = await params;
    const direction = (request.nextUrl.searchParams.get("direction") ?? "both") as "incoming" | "outgoing" | "both";
    if (!["incoming", "outgoing", "both"].includes(direction)) {
      return NextResponse.json({ success: false, error: "Invalid direction.", code: "validation_failed" }, { status: 422 });
    }
    const service = new WorkUsageService(serviceFetch);
    const links = await service.listLinks({ ownerId: viewer.id, workId, direction });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", links });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "Usage service not configured.", code: "service_unavailable" }, { status: 503 });
    }
    const viewer = await getViewerFromRequest(request);
    if (!viewer) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
    const { workId } = await params;
    const body = await request.json().catch(() => ({}));
    if (!isUsageRole(body.usageRole)) {
      return NextResponse.json({ success: false, error: `Unknown usage role: ${String(body.usageRole)}`, code: "validation_failed" }, { status: 422 });
    }
    const service = new WorkUsageService(serviceFetch);
    const link = await service.createLink({
      ownerId: viewer.id,
      sourceWorkId: String(body.sourceWorkId ?? ""),
      sourceWorkVersionId: String(body.sourceWorkVersionId ?? ""),
      targetProjectId: String(body.targetProjectId ?? ""),
      targetWorkId: workId,
      targetWorkVersionId: body.targetWorkVersionId ? String(body.targetWorkVersionId) : null,
      targetEntityType: body.targetEntityType ? String(body.targetEntityType) : null,
      targetEntityId: body.targetEntityId ? String(body.targetEntityId) : null,
      usageRole: body.usageRole,
      assetVersionId: body.assetVersionId ? String(body.assetVersionId) : null,
      grantId: body.grantId ? String(body.grantId) : null,
    });
    return NextResponse.json(
      { success: true, contractVersion: "2.2.0-alpha.1", link },
      { status: link.idempotent ? 200 : 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
