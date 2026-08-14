/**
 * GET /api/v2/works/[workId]/conversations/[threadId]/messages — list messages
 * POST /api/v2/works/[workId]/conversations/[threadId]/messages — append message
 * Phase 1 Task 1.3
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  appendConversationMessage,
  listConversationMessages,
  ConversationsServiceError,
} from "@/lib/server/v2/conversations/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string; threadId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Conversations service not configured.", code: "service_unavailable" },
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
    const { workId, threadId } = await params;
    const url = new URL(request.url);
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");
    const messages = await listConversationMessages(
      {
        ownerId: viewer.id,
        workId,
        threadId,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      },
      serviceFetch,
    );
    return NextResponse.json({
      success: true,
      contractVersion: "2.2.0-alpha.1",
      messages,
    });
  } catch (error) {
    return conversationsErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string; threadId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Conversations service not configured.", code: "service_unavailable" },
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
    const { workId, threadId } = await params;
    const body = await request.json().catch(() => ({}));
    const message = await appendConversationMessage(
      {
        ownerId: viewer.id,
        workId,
        threadId,
        role: body.role,
        content: body.content ?? "",
        baseVersionId: body.baseVersionId,
        idempotencyKey: body.idempotencyKey,
      },
      serviceFetch,
    );
    return NextResponse.json(
      { success: true, contractVersion: "2.2.0-alpha.1", message },
      { status: 201 },
    );
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
