/**
 * POST /api/v2/works/[workId]/screenplay/discuss — KK 聊一聊（只追加对话）
 * Phase 3 Task 3.4
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  ScreenplayGenerationService,
  ScreenplayGenerationError,
  type GenerationDeps,
} from "@/lib/server/v2/screenplays/generation";
import { buildContextPacket } from "@/lib/server/v2/context-packets";
import { getWork } from "@/lib/server/v2/works/versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildDeps(ownerId: string): GenerationDeps {
  return {
    contextPacket: async ({ workId }) => {
      try {
        const work = await getWork({ ownerId, workId }, serviceFetch);
        const versionId = work.current_version_id ?? "";
        if (!versionId) return { packetId: null, references: [] };
        const packet = await buildContextPacket(
          { ownerId, workId, workVersionId: versionId, view: "screenplay-studio-kk", tokenBudget: 4096 },
          serviceFetch,
        );
        return { packetId: packet.id, references: packet.references };
      } catch {
        // Context packet is best-effort for chat; missing packet never blocks
        // the append-only discussion.
        return { packetId: null, references: [] };
      }
    },
    modelInvoke: async () => {
      // Real provider routing is wired in Phase 5 model-router integration;
      // until then discussing returns a deterministic assistant echo so the
      // append-only semantics stay verifiable without fake content edits.
      return { assistantText: "KK：收到。我在听，先不动稿子——需要改法就说“生成修改方案”。", patches: [] };
    },
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "Service not configured.", code: "service_unavailable" }, { status: 503 });
    }
    const viewer = await getViewerFromRequest(request);
    if (!viewer) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
    const { workId } = await params;
    const body = await request.json().catch(() => ({}));
    const service = new ScreenplayGenerationService(serviceFetch, buildDeps(viewer.id));
    const result = await service.discuss({
      ownerId: viewer.id,
      workId,
      conversationId: String(body.conversationId ?? ""),
      userMessage: String(body.userMessage ?? ""),
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json({
      success: true,
      contractVersion: "2.2.0-alpha.1",
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof ScreenplayGenerationError) {
    const status =
      error.code === "unauthenticated" ? 401 :
      error.code === "forbidden" ? 403 :
      error.code === "not_found" ? 404 :
      error.code === "conflict" ? 409 :
      error.code === "validation_failed" ? 422 :
      error.code === "provider_failed" ? 502 :
      503;
    return NextResponse.json(
      { success: false, error: error.message.replace(`${error.code}: `, ""), code: error.code },
      { status },
    );
  }
  return NextResponse.json(
    { success: false, error: "Service unavailable.", code: "service_unavailable" },
    { status: 503 },
  );
}
