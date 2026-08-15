/**
 * GET   /api/v2/universe-imports/[sessionId]/files — list files
 * POST  /api/v2/universe-imports/[sessionId]/files — attach a file record
 *       body: { filename, declaredRole, mimeType, sizeBytes, contentHash? }
 * PATCH /api/v2/universe-imports/[sessionId]/files — confirm upload
 *       body: { fileId }
 * Phase 4 Task 4.2
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { UniverseImportSessionsService, UniverseImportError } from "@/lib/server/v2/universe-import";
import { signUploadTarget } from "@/lib/server/v2/universe-import/storage";

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
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", files: session.files, state: session.state });
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
    const { file, duplicate } = await service.attachFile({
      ownerId: viewer.id,
      sessionId,
      filename: String(body.filename ?? ""),
      declaredRole: String(body.declaredRole ?? ""),
      mimeType: String(body.mimeType ?? ""),
      sizeBytes: Number(body.sizeBytes ?? 0),
    }, body.contentHash ? { contentHash: String(body.contentHash) } : undefined);
    const target = signUploadTarget({
      ownerId: viewer.id,
      sessionId,
      filename: String(body.filename ?? ""),
      contentType: String(body.mimeType ?? ""),
    });
    return NextResponse.json(
      { success: true, contractVersion: "2.2.0-alpha.1", file, duplicate, uploadTarget: target },
      { status: duplicate ? 200 : 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
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
    const result = await service.confirmUpload({
      ownerId: viewer.id,
      sessionId,
      fileId: String(body.fileId ?? ""),
    });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", ...result });
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
