/**
 * GET /api/v2/works/[workId]/inheritance — read active Work inheritance (V2.2)
 *
 * Phase 2 Task 2.2
 *
 * Returns the active manifest + universe version + snapshot, or 404 if the
 * Work is not bound to a Universe.
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { readWorkInheritanceV22, InheritanceV22Error } from "@/lib/server/v2/inheritance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Inheritance service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const viewer = await getViewerFromRequest(_request);
    if (!viewer) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
    const { workId } = await params;

    const result = await readWorkInheritanceV22({
      fetcher: serviceFetch,
      ownerId: viewer.id,
      workId,
    });

    if (!result.manifest) {
      return NextResponse.json(
        { success: false, error: "Work is not bound to a Universe.", code: "not_found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      contractVersion: "2.2.0-alpha.1",
      manifest: result.manifest,
      universeVersion: result.universeVersion,
      snapshot: result.snapshot,
    });
  } catch (error) {
    return readErrorResponse(error);
  }
}

function readErrorResponse(error: unknown) {
  if (error instanceof InheritanceV22Error) {
    const status =
      error.code === "unauthenticated" ? 401 :
      error.code === "forbidden" ? 403 :
      error.code === "not_found" ? 404 :
      error.code === "conflict" ? 409 :
      error.code === "validation_failed" ? 422 :
      503;
    return NextResponse.json(
      { success: false, error: error.message.replace(`${error.code}: `, ""), code: error.code },
      { status },
    );
  }
  return NextResponse.json(
    { success: false, error: "Inheritance service unavailable.", code: "service_unavailable" },
    { status: 503 },
  );
}
