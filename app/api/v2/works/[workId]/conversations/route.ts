/**
 * GET /api/v2/works/[workId]/conversations — list threads for a work
 * POST /api/v2/works/[workId]/conversations — create/ensure a thread
 * Phase 1 Task 1.3
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  ensureThread,
  ConversationsServiceError,
} from "@/lib/server/v2/conversations/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Conversations service not configured.", code: "service_unavailable" },
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
    const result = await ensureThread(
      {
        ownerId: viewer.id,
        workId,
        threadId: body.threadId,
        title: body.title,
      },
      serviceFetch,
    );
    return NextResponse.json({
      success: true,
      contractVersion: "2.2.0-alpha.1",
      ...result,
    });
  } catch (error) {
    return conversationsErrorResponse(error);
  }
}

function conversationsErrorResponse(error: unknown) {
  if (error instanceof ConversationsServiceError) {
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
    if (error.correlationId) body.correlationId = error.correlationId;
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(
    { success: false, error: "Conversations service unavailable.", code: "service_unavailable" },
    { status: 503 },
  );
}
