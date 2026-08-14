/**
 * GET /api/v2/works/[workId]/inheritance/diff — Universe update diff (V2.2)
 *
 * Phase 2 Task 2.4
 *
 * Returns the object-level diff between the Work's bound snapshot and the
 * latest Universe Version. The Work's content is never changed; only the
 * `isStale` flag and `diffs` array reflect what changed in the Universe.
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { InheritanceV22Error } from "@/lib/server/v2/inheritance";
import { readInheritanceDiff } from "@/lib/server/v2/inheritance/diff";

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
    const viewer = await getViewerFromCookies();
    if (!viewer) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
    const { workId } = await params;

    const result = await readInheritanceDiff({
      fetcher: serviceFetch,
      ownerId: viewer.id,
      workId,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "2.2.0-alpha.1",
      ...result,
    });
  } catch (error) {
    return diffErrorResponse(error);
  }
}

function diffErrorResponse(error: unknown) {
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
