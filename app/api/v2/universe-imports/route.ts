/**
 * GET  /api/v2/universe-imports — list resumable import sessions
 * POST /api/v2/universe-imports — create a session { mode, rightsDeclaration }
 * Phase 4 Task 4.2
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { UniverseImportSessionsService, UniverseImportError } from "@/lib/server/v2/universe-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromRequest(request);
    if (!viewer) return unauthorized();
    const service = new UniverseImportSessionsService(serviceFetch);
    const includeFinished = request.nextUrl.searchParams.get("includeFinished") === "1";
    const result = await service.listSessions({ ownerId: viewer.id, includeFinished });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromRequest(request);
    if (!viewer) return unauthorized();
    const body = await request.json().catch(() => ({}));
    const service = new UniverseImportSessionsService(serviceFetch);
    const session = await service.createSession({
      ownerId: viewer.id,
      mode: String(body.mode ?? ""),
      rightsDeclaration:
        body.rightsDeclaration && typeof body.rightsDeclaration === "object"
          ? (body.rightsDeclaration as Record<string, unknown>)
          : undefined,
    });
    return NextResponse.json(
      { success: true, contractVersion: "2.2.0-alpha.1", session },
      { status: 201 },
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
