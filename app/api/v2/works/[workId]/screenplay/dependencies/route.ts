/**
 * GET  /api/v2/works/[workId]/screenplay/dependencies — stale edges list
 * POST /api/v2/works/[workId]/screenplay/dependencies — recompute | resolve
 *       body: { action: "recompute" } | { action: "resolve", resolution,
 *              upstreamUnitId, downstreamUnitId, note? }
 * Phase 3 Task 3.2
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  ScreenplayDependenciesService, 
} from "@/lib/server/v2/screenplays/dependencies";
import { classifyServiceError } from "@/lib/server/v2/service-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromRequest(_request);
    if (!viewer) return unauthorized();
    const { workId } = await params;
    const service = new ScreenplayDependenciesService(serviceFetch);
    const result = await service.listStale({ ownerId: viewer.id, workId });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", ...result });
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
    const service = new ScreenplayDependenciesService(serviceFetch);
    if (body.action === "recompute") {
      const result = await service.recomputeStale({ ownerId: viewer.id, workId });
      return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", ...result });
    }
    if (body.action === "resolve") {
      const result = await service.resolveStale({
        ownerId: viewer.id,
        workId,
        upstreamUnitId: String(body.upstreamUnitId ?? ""),
        downstreamUnitId: String(body.downstreamUnitId ?? ""),
        action: String(body.resolution ?? ""),
        note: body.note,
      });
      return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", ...result });
    }
    return NextResponse.json(
      { success: false, error: "Unknown action. Use recompute|resolve.", code: "validation_failed" },
      { status: 422 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function unavailable() {
  return NextResponse.json(
    { success: false, error: "Dependency service not configured.", code: "service_unavailable" },
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
  const classified = classifyServiceError(error, "screenplay-dependencies");
  const body: Record<string, unknown> = {
    success: false,
    error: classified.message,
    code: classified.code,
    requestId: classified.requestId,
  };
  return NextResponse.json(body, { status: classified.status });
}
