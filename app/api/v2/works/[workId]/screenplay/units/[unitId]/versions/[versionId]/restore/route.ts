/**
 * POST /api/v2/works/[workId]/screenplay/units/[unitId]/versions/[versionId]/restore
 *
 * P1-02：恢复 = 以目标版本内容创建新的子版本（source=restore，确定性幂等键），
 * 不回写旧版本（append-only 语义）。
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { ScreenplayUnitsService, ScreenplayUnitsError } from "@/lib/server/v2/screenplays/units";
import { classifyServiceError } from "@/lib/server/v2/service-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string; unitId: string; versionId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromRequest(request);
    if (!viewer) return unauthorized();
    const { workId, unitId, versionId } = await params;
    const service = new ScreenplayUnitsService(serviceFetch);
    const { version } = await service.restoreUnitVersion({ ownerId: viewer.id, workId, unitId, versionId });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", version });
  } catch (error) {
    return errorResponse(error);
  }
}

function unavailable() {
  return NextResponse.json({ success: false, error: "Screenplay service not configured.", code: "service_unavailable" }, { status: 503 });
}

function unauthorized() {
  return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
}

function errorResponse(error: unknown) {
  if (error instanceof ScreenplayUnitsError) {
    const status = error.code === "unauthenticated" ? 401 : error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : error.code === "validation_failed" ? 422 : 503;
    const body: Record<string, unknown> = { success: false, error: error.message.replace(`${error.code}: `, ""), code: error.code };
    if (error.currentVersionId) body.currentVersionId = error.currentVersionId;
    return NextResponse.json(body, { status });
  }
  const classified = classifyServiceError(error, "units/restore");
  return NextResponse.json({ success: false, error: classified.message, code: classified.code, requestId: classified.requestId }, { status: classified.status });
}
