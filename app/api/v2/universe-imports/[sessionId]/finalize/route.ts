/**
 * POST /api/v2/universe-imports/[sessionId]/finalize — atomic U1 creation.
 * GET  /api/v2/universe-imports/[sessionId]/finalize — current outcome.
 * Phase 4 Task 4.5
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { FinalizeUniverseImportService, FinalizeError } from "@/lib/server/v2/universe-import/finalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function service() {
  return new FinalizeUniverseImportService(serviceFetch);
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "Import service not configured.", code: "service_unavailable" }, { status: 503 });
    }
    const viewer = await getViewerFromCookies();
    if (!viewer) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
    const { sessionId } = await params;
    const result = await service().finalize({ ownerId: viewer.id, sessionId });
    return NextResponse.json(
      { success: true, contractVersion: "2.2.0-alpha.1", finalize: result },
      { status: result.idempotent ? 200 : 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "Import service not configured.", code: "service_unavailable" }, { status: 503 });
    }
    const viewer = await getViewerFromCookies();
    if (!viewer) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
    const { sessionId } = await params;
    const result = await service().finalize({ ownerId: viewer.id, sessionId });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", finalize: result });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof FinalizeError) {
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
