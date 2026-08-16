/**
 * GET  /api/v2/works/[workId]/screenplay/continuity — run analysis, list findings
 * POST /api/v2/works/[workId]/screenplay/continuity — dispose a finding
 *       body: { findingId, action: ignore|revise|create_candidate|universe_proposal, note? }
 *       or:  { action: "reindex", unitId? }
 * Phase 3 Task 3.5
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  ScreenplayContinuityService, 
} from "@/lib/server/v2/screenplays/continuity";
import { classifyServiceError } from "@/lib/server/v2/service-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "Service not configured.", code: "service_unavailable" }, { status: 503 });
    }
    const viewer = await getViewerFromRequest(request);
    if (!viewer) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
    const { workId } = await params;
    const service = new ScreenplayContinuityService(serviceFetch);
    if (request.nextUrl.searchParams.get("references") === "1") {
      const refs = await service.listReferences({
        ownerId: viewer.id,
        workId,
        packetId: request.nextUrl.searchParams.get("packetId") ?? undefined,
      });
      return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", ...refs });
    }
    const result = await service.analyze({ ownerId: viewer.id, workId });
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
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "Service not configured.", code: "service_unavailable" }, { status: 503 });
    }
    const viewer = await getViewerFromRequest(request);
    if (!viewer) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
    const { workId } = await params;
    const body = await request.json().catch(() => ({}));
    const service = new ScreenplayContinuityService(serviceFetch);
    if (body.action === "reindex") {
      const result = body.unitId
        ? await service.reindexUnit({ ownerId: viewer.id, workId, unitId: String(body.unitId) })
        : await service.reindexAll({ ownerId: viewer.id, workId });
      return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", ...result });
    }
    const result = await service.disposeFinding({
      ownerId: viewer.id,
      workId,
      findingId: String(body.findingId ?? ""),
      action: String(body.action ?? ""),
      note: body.note,
    });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  const classified = classifyServiceError(error, "screenplay-continuity");
  const body: Record<string, unknown> = {
    success: false,
    error: classified.message,
    code: classified.code,
    requestId: classified.requestId,
  };
  return NextResponse.json(body, { status: classified.status });
}
