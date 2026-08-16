/**
 * Unit-level API — Phase 3 Task 3.2.
 *
 * GET    /api/v2/works/[workId]/screenplay/units/[unitId] — unit + current content
 * PATCH  /api/v2/works/[workId]/screenplay/units/[unitId] — identity update (title/order/parent)
 * POST   /api/v2/works/[workId]/screenplay/units/[unitId] — save content version
 *        body: { content, baseVersionId, references?, sourceMessageIds?, idempotencyKey? }
 * PUT    /api/v2/works/[workId]/screenplay/units/[unitId] — finalize a version
 *        body: { versionId }
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
  _request: NextRequest,
  { params }: { params: Promise<{ workId: string; unitId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromRequest(_request);
    if (!viewer) return unauthorized();
    const { workId, unitId } = await params;
    const service = new ScreenplayUnitsService(serviceFetch);
    const result = await service.getUnit({ ownerId: viewer.id, workId, unitId });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string; unitId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromRequest(request);
    if (!viewer) return unauthorized();
    const { workId, unitId } = await params;
    const body = await request.json().catch(() => ({}));
    const service = new ScreenplayUnitsService(serviceFetch);
    const result = await service.updateUnitIdentity({
      ownerId: viewer.id,
      workId,
      unitId,
      title: body.title,
      order: body.order,
      parentId: body.parentId,
    });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string; unitId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromRequest(request);
    if (!viewer) return unauthorized();
    const { workId, unitId } = await params;
    const body = await request.json().catch(() => ({}));
    const service = new ScreenplayUnitsService(serviceFetch);
    const result = await service.saveUnitContent({
      ownerId: viewer.id,
      workId,
      unitId,
      content: body.content ?? {},
      baseVersionId: body.baseVersionId ?? null,
      source: body.source,
      sourceMessageIds: body.sourceMessageIds,
      references: body.references,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json(
      { success: true, contractVersion: "2.2.0-alpha.1", ...result },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string; unitId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromRequest(request);
    if (!viewer) return unauthorized();
    const { workId, unitId } = await params;
    const body = await request.json().catch(() => ({}));
    const service = new ScreenplayUnitsService(serviceFetch);
    const result = await service.markFinalized({
      ownerId: viewer.id,
      workId,
      unitId,
      versionId: String(body.versionId ?? ""),
    });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", ...result });
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
  const classified = classifyServiceError(error, "screenplay-unit-detail");
  const body: Record<string, unknown> = {
    success: false,
    error: classified.message,
    code: classified.code,
    requestId: classified.requestId,
  };
  if (error instanceof ScreenplayUnitsError && error.currentVersionId) body.currentVersionId = error.currentVersionId;
  return NextResponse.json(body, { status: classified.status });
}
