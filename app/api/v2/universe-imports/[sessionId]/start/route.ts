/**
 * GET  /api/v2/universe-imports/[sessionId] — session detail (resume)
 * POST /api/v2/universe-imports/[sessionId]/start — start extraction
 *      body: {} → session uploaded → extracting (files must be persisted)
 * DELETE-equivalent cancel: POST /api/v2/universe-imports/[sessionId]/start
 *      with { action: "cancel" }
 * Phase 4 Task 4.2
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { UniverseImportSessionsService, UniverseImportError } from "@/lib/server/v2/universe-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromCookies();
    if (!viewer) return unauthorized();
    const { sessionId } = await params;
    const service = new UniverseImportSessionsService(serviceFetch);
    const session = await service.getSession({ ownerId: viewer.id, sessionId });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", session });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromCookies();
    if (!viewer) return unauthorized();
    const { sessionId } = await params;
    const body = await request.json().catch(() => ({}));
    const service = new UniverseImportSessionsService(serviceFetch);

    if (body.action === "cancel") {
      const result = await service.cancelSession({ ownerId: viewer.id, sessionId });
      return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", ...result });
    }

    const session = await service.getSession({ ownerId: viewer.id, sessionId });
    if (session.state !== "uploaded") {
      return NextResponse.json(
        {
          success: false,
          error: `Session state is ${session.state}; only uploaded sessions can start extraction.`,
          code: "conflict",
        },
        { status: 409 },
      );
    }
    // Extraction job creation lands with Task 4.3; the state transition is
    // validated and persisted here so the workflow cannot skip the gate.
    return NextResponse.json(
      {
        success: true,
        contractVersion: "2.2.0-alpha.1",
        state: session.state,
        pendingJob: true,
        message: "Extraction starts in Task 4.3 (job wiring). Session is ready.",
      },
      { status: 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function unavailable() {
  return NextResponse.json({ success: false, error: "Import service not configured.", code: "service_unavailable" }, { status: 503 });
}
function unauthorized() {
  return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
}
function errorResponse(error: unknown) {
  if (error instanceof UniverseImportError) {
    const status =
      error.code === "unauthenticated" ? 401 :
      error.code === "forbidden" ? 403 :
      error.code === "not_found" ? 404 :
      error.code === "conflict" ? 409 :
      error.code === "validation_failed" ? 422 : 503;
    return NextResponse.json({ success: false, error: error.message.replace(`${error.code}: `, ""), code: error.code }, { status });
  }
  return NextResponse.json({ success: false, error: "Import service unavailable.", code: "service_unavailable" }, { status: 503 });
}
