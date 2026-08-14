/**
 * GET /api/v2/works/[workId]/context-packet — build a Context Packet for AI generation.
 *
 * Phase 2 Task 2.3
 *
 * Query params:
 *   workVersionId        — required, the current Work Version to build context for
 *   view                 — optional, default "default" (e.g. "scene", "outline")
 *   selectionEntityType  — optional, type of the user's current selection
 *   selectionEntityId    — optional, id of the user's current selection
 *   tokenBudget          — optional, default 8192, byte budget for selected objects
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { buildContextPacket, ContextPacketError } from "@/lib/server/v2/context-packets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Context packet service not configured.", code: "service_unavailable" },
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

    const searchParams = request.nextUrl.searchParams;
    const workVersionId = searchParams.get("workVersionId");
    if (!workVersionId) {
      return NextResponse.json(
        { success: false, error: "workVersionId is required.", code: "validation_failed" },
        { status: 422 },
      );
    }

    const view = searchParams.get("view") || "default";
    const selectionEntityType = searchParams.get("selectionEntityType");
    const selectionEntityId = searchParams.get("selectionEntityId");
    const tokenBudgetRaw = searchParams.get("tokenBudget");
    const tokenBudget = tokenBudgetRaw ? Number(tokenBudgetRaw) : 8192;
    if (!Number.isFinite(tokenBudget) || tokenBudget < 0) {
      return NextResponse.json(
        { success: false, error: "tokenBudget must be a non-negative number.", code: "validation_failed" },
        { status: 422 },
      );
    }

    const selection =
      selectionEntityType && selectionEntityId
        ? { entityType: selectionEntityType, entityId: selectionEntityId }
        : null;

    const packet = await buildContextPacket(
      { ownerId: viewer.id, workId, workVersionId, view, selection, tokenBudget },
      serviceFetch,
    );

    return NextResponse.json({
      success: true,
      contractVersion: "2.2.0-alpha.1",
      packet,
    });
  } catch (error) {
    return contextPacketErrorResponse(error);
  }
}

function contextPacketErrorResponse(error: unknown) {
  if (error instanceof ContextPacketError) {
    const status =
      error.code === "unauthenticated" ? 401 :
      error.code === "forbidden" ? 403 :
      error.code === "not_found" ? 404 :
      error.code === "validation_failed" ? 422 :
      503;
    return NextResponse.json(
      { success: false, error: error.message.replace(`${error.code}: `, ""), code: error.code },
      { status },
    );
  }
  return NextResponse.json(
    { success: false, error: "Context packet service unavailable.", code: "service_unavailable" },
    { status: 503 },
  );
}
