/**
 * GET /api/v2/works/[workId] — Work metadata + version pointers
 * Phase 1 Task 1.2
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { getWork, WorkVersionsServiceError } from "@/lib/server/v2/works/versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
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
    const work = await getWork({ ownerId: viewer.id, workId }, serviceFetch);
    return NextResponse.json({
      success: true,
      work: {
        id: work.id,
        currentVersionId: work.current_version_id,
        latestCheckpointId: work.latest_checkpoint_id,
        finalizedVersionId: work.finalized_version_id,
      },
    });
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
