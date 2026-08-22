/**
 * GET /api/v2/works/[workId]/screenplay/units/[unitId]/versions
 *
 * P1-02：单元不可变版本历史（新→旧），含来源/摘要/当前与定稿标记 ——
 * 版本面板不再只暴露裸 UUID。
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { ScreenplayUnitsService, ScreenplayUnitsError } from "@/lib/server/v2/screenplays/units";
import { classifyServiceError } from "@/lib/server/v2/service-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string; unitId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromRequest(request);
    if (!viewer) return unauthorized();
    const { workId, unitId } = await params;
    const limit = Number(new URL(request.url).searchParams.get("limit")) || undefined;
    const service = new ScreenplayUnitsService(serviceFetch);
    const versions = await service.listUnitVersions({ ownerId: viewer.id, workId, unitId, limit });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", versions });
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
  const classified = classifyServiceError(error, "units/versions");
  return NextResponse.json({ success: false, error: classified.message, code: classified.code, requestId: classified.requestId }, { status: classified.status });
}
