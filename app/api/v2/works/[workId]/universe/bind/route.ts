/**
 * POST /api/v2/works/[workId]/universe/bind — bind a Work to a Universe (V2.2)
 *
 * Phase 2 Task 2.2
 *
 * Calls the `bind_work_to_universe_v22` RPC atomically. The RPC validates
 * ownership and object membership, finds-or-creates a Universe Version, and
 * inserts the Manifest + Snapshot in a single transaction. Idempotent: a
 * second bind with identical params returns the existing active manifest.
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { bindWorkToUniverseV22, InheritanceV22Error } from "@/lib/server/v2/inheritance";

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
    const viewer = await getViewerFromRequest(request);
    if (!viewer) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
    const { workId } = await params;

    const body = await request.json().catch(() => ({} as Record<string, unknown>));

    const manifest = await bindWorkToUniverseV22({
      fetcher: serviceFetch,
      ownerId: viewer.id,
      workId,
      universeId: typeof body.universeId === "string" ? body.universeId : "",
      relation: (typeof body.relation === "string" ? body.relation : "") as "canon_continuation" | "prequel" | "sequel" | "spinoff" | "adaptation" | "parallel",
      canonPolicy: (typeof body.canonPolicy === "string" ? body.canonPolicy : "") as "strict" | "flexible" | "reference_only",
      timelineAnchorId: typeof body.timelineAnchorId === "string" ? body.timelineAnchorId : body.timelineAnchorId === null ? null : undefined,
      includedEntityIds: asStringArray(body.includedEntityIds),
      includedFactIds: asStringArray(body.includedFactIds),
      includedRelationshipIds: asStringArray(body.includedRelationshipIds),
      includedTimelineEventIds: asStringArray(body.includedTimelineEventIds),
      includedAssetIds: asStringArray(body.includedAssetIds),
    });

    return NextResponse.json(
      { success: true, contractVersion: "2.2.0-alpha.1", manifest },
      { status: 201 },
    );
  } catch (error) {
    return bindErrorResponse(error);
  }
}

function bindErrorResponse(error: unknown) {
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
