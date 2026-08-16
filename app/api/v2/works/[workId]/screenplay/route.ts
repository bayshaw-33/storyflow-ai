/**
 * GET /api/v2/works/[workId]/screenplay — units list (+ legacy adaptation hint)
 * POST /api/v2/works/[workId]/screenplay/adapt-legacy — legacy adaptation
 * Phase 3 Task 3.2
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  ScreenplayUnitsService,
  ScreenplayUnitsError,
} from "@/lib/server/v2/screenplays/units";
import { classifyServiceError } from "@/lib/server/v2/service-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return unavailable();
    }
    const viewer = await getViewerFromRequest(request);
    if (!viewer) return unauthorized();
    const { workId } = await params;
    const service = new ScreenplayUnitsService(serviceFetch);
    const { units } = await service.listUnits({ ownerId: viewer.id, workId });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", units });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromRequest(request);
    if (!viewer) return unauthorized();
    const { workId } = await params;
    const body = await request.json().catch(() => ({}));
    const service = new ScreenplayUnitsService(serviceFetch);
    const result = await service.adaptLegacyProject({
      ownerId: viewer.id,
      workId,
      projectId: String(body.projectId ?? ""),
    });
    return NextResponse.json(
      { success: true, contractVersion: "2.2.0-alpha.1", ...result },
      { status: 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function unavailable() {
  return NextResponse.json(
    { success: false, error: "Screenplay service not configured.", code: "service_unavailable" },
    { status: 503 },
  );
}

function unauthorized() {
  return NextResponse.json(
    { success: false, error: "Authentication required.", code: "unauthenticated" },
    { status: 401 },
  );
}

function errorResponse(error: unknown) {
  if (error instanceof ScreenplayUnitsError) {
    const classified = classifyServiceError(error, "screenplay");
    const body: Record<string, unknown> = {
      success: false,
      error: classified.message,
      code: classified.code,
      requestId: classified.requestId,
    };
    if (error.currentVersionId) body.currentVersionId = error.currentVersionId;
    return NextResponse.json(body, { status: classified.status });
  }
  const classified = classifyServiceError(error, "screenplay");
  return NextResponse.json(
    { success: false, error: classified.message, code: classified.code, requestId: classified.requestId },
    { status: classified.status },
  );
}
