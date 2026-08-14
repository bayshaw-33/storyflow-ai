/**
 * POST /api/v2/works/[workId]/inheritance/adopt — per-item adoption (V2.2)
 *
 * Phase 2 Task 2.4
 *
 * Body: `{ diffIds: string[] }` — the object IDs the user wants to adopt.
 *
 * Creates a new Manifest + Snapshot with only the adopted changes (unadopted
 * items keep their old snapshot content), and a Work Checkpoint. Idempotent:
 * if the Work is already on the latest Universe Version, returns 200 with the
 * current manifest.
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { InheritanceV22Error } from "@/lib/server/v2/inheritance";
import { adoptInheritanceDiff } from "@/lib/server/v2/inheritance/diff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
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

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const diffIds = asStringArray(body.diffIds);

    const result = await adoptInheritanceDiff({
      fetcher: serviceFetch,
      ownerId: viewer.id,
      workId,
      diffIds,
    });

    return NextResponse.json(
      {
        success: true,
        contractVersion: "2.2.0-alpha.1",
        manifest: result.manifest,
        idempotent: result.idempotent,
      },
      { status: result.idempotent ? 200 : 201 },
    );
  } catch (error) {
    return adoptErrorResponse(error);
  }
}

function adoptErrorResponse(error: unknown) {
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
