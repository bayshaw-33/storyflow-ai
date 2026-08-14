/**
 * POST /api/v2/works/[workId]/generation-requests — create a generation request snapshot
 * Phase 1 Task 1.3
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  createGenerationRequest,
  GenerationsServiceError,
} from "@/lib/server/v2/generations/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Generations service not configured.", code: "service_unavailable" },
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
    const snapshot = await createGenerationRequest(
      {
        ownerId: viewer.id,
        workId,
        baseVersionId: body.baseVersionId,
        messageIds: body.messageIds || [],
        contextPacketId: body.contextPacketId,
        operation: body.operation,
        idempotencyKey: body.idempotencyKey,
      },
      serviceFetch,
    );
    return NextResponse.json(
      { success: true, contractVersion: "2.2.0-alpha.1", request: snapshot },
      { status: 201 },
    );
  } catch (error) {
    return generationsErrorResponse(error);
  }
}

function generationsErrorResponse(error: unknown) {
  if (error instanceof GenerationsServiceError) {
    const status =
      error.code === "unauthenticated" ? 401 :
      error.code === "forbidden" ? 403 :
      error.code === "not_found" ? 404 :
      error.code === "conflict" ? 409 :
      error.code === "validation_failed" ? 422 :
      error.code === "state_transition_denied" ? 409 :
      503;
    const body: Record<string, unknown> = {
      success: false,
      error: error.message.replace(`${error.code}: `, ""),
      code: error.code,
    };
    if (error.correlationId) body.correlationId = error.correlationId;
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(
    { success: false, error: "Generations service unavailable.", code: "service_unavailable" },
    { status: 503 },
  );
}
