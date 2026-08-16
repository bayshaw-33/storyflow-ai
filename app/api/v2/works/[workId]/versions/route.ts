/**
 * GET /api/v2/works/[workId]/versions — list version chain
 * POST /api/v2/works/[workId]/versions — append a new version (editing_draft/checkpoint)
 * Phase 1 Task 1.2
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  appendWorkVersion,
  listWorkVersions,
  WorkVersionsServiceError,
} from "@/lib/server/v2/works/versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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
    const viewer = await getViewerFromRequest(request);
    if (!viewer) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
    const { workId } = await params;
    const url = new URL(request.url);
    const limit = url.searchParams.get("limit");
    const versions = await listWorkVersions(
      { ownerId: viewer.id, workId, limit: limit ? Number(limit) : undefined },
      serviceFetch,
    );
    return NextResponse.json({
      success: true,
      contractVersion: "2.2.0-alpha.1",
      versions,
    });
  } catch (error) {
    return workErrorResponse(error);
  }
}

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
    const viewer = await getViewerFromRequest(request);
    if (!viewer) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
    const { workId } = await params;
    const body = await request.json().catch(() => ({}));
    const { version, idempotentReplay } = await appendWorkVersion(
      {
        ownerId: viewer.id,
        workId,
        parentVersionId: body.parentVersionId ?? null,
        kind: body.kind,
        contentSchema: body.contentSchema,
        content: body.content ?? {},
        source: body.source ?? "manual",
        sourceMessageIds: body.sourceMessageIds,
        sourceJobId: body.sourceJobId,
        idempotencyKey: body.idempotencyKey,
        expectedCurrentVersionId: body.expectedCurrentVersionId,
      },
      serviceFetch,
    );
    return NextResponse.json(
      {
        success: true,
        contractVersion: "2.2.0-alpha.1",
        version,
        idempotentReplay,
      },
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
      error.code === "immutable_violation" || error.code === "state_transition_denied" ? 409 :
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
