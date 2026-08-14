/**
 * POST /api/v2/works/[workId]/finalize — promote a version to finalized
 * Phase 1 Task 1.2
 *
 * Body: { versionId, idempotencyKey, sourceMessageIds?, sourceJobId? }
 * The versionId must be an existing checkpoint or editing_draft of the same work.
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { finalizeWorkVersion, WorkVersionsServiceError } from "@/lib/server/v2/works/versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Work service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const viewer = await getViewerFromCookies();
    if (!viewer) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
    const { workId } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body.versionId) {
      return NextResponse.json(
        { success: false, error: "versionId is required.", code: "validation_failed" },
        { status: 422 },
      );
    }
    if (!body.idempotencyKey) {
      return NextResponse.json(
        { success: false, error: "idempotencyKey is required.", code: "validation_failed" },
        { status: 422 },
      );
    }
    const { version, idempotentReplay } = await finalizeWorkVersion(
      {
        ownerId: viewer.id,
        workId,
        versionId: body.versionId,
        idempotencyKey: body.idempotencyKey,
        sourceMessageIds: body.sourceMessageIds,
        sourceJobId: body.sourceJobId,
      },
      serviceFetch,
    );
    return NextResponse.json(
      { success: true, contractVersion: "2.2.0-alpha.1", version, idempotentReplay },
      { status: idempotentReplay ? 200 : 201 },
    );
  } catch (error) {
    return workErrorResponse(error);
  }
}

function workErrorResponse(error: unknown) {
  if (error instanceof WorkVersionsServiceError) {
    const status =
      error.code === "unauthenticated" ? 401 :
      error.code === "forbidden" ? 403 :
      error.code === "not_found" ? 404 :
      error.code === "conflict" ? 409 :
      error.code === "validation_failed" ? 422 :
      503;
    const body: Record<string, unknown> = {
      success: false,
      error: error.message.replace(`${error.code}: `, ""),
      code: error.code,
    };
    if (error.currentVersionId) body.currentVersionId = error.currentVersionId;
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(
    { success: false, error: "Work service unavailable.", code: "service_unavailable" },
    { status: 503 },
  );
}
