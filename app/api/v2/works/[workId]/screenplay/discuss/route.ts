/**
 * POST /api/v2/works/[workId]/screenplay/discuss — KK 聊一聊（只追加对话）
 * GET  /api/v2/works/[workId]/screenplay/discuss?conversationId= — 会话历史（刷新恢复）
 * Phase 3 Task 3.4 · 2026-08-16 production hotfix: real model routing.
 *
 * body.purpose:
 *   - "discuss"（默认）：自由讨论。
 *   - "similarity_review"：大纲雷同审查。要求已存在大纲单元；结果会追加
 *     一条 work-scoped 证据事件（绑定大纲版本与会话），作为审查留痕。
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  ScreenplayGenerationService,
  type GenerationDeps,
  type KkPurpose,
} from "@/lib/server/v2/screenplays/generation";
import { invokeScreenplayModel } from "@/lib/server/v2/screenplays/model-invoke";
import { buildContextPacket } from "@/lib/server/v2/context-packets";
import { getWork } from "@/lib/server/v2/works/versions";
import { ScreenplayUnitsService } from "@/lib/server/v2/screenplays/units";
import { classifyServiceError } from "@/lib/server/v2/service-errors";
import { normalizeScreenplayConversationId } from "@/lib/server/v2/screenplays/conversation-id";

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
        return { packetId: packet.id, packetContent: packet.content, references: packet.references };
      } catch {
        // Context packet is best-effort for chat; missing packet never blocks
        // the append-only discussion.
        return { packetId: null, references: [] };
      }
    },
    loadUnit: async (workId, unitId) => {
      try {
        const units = new ScreenplayUnitsService(serviceFetch);
        const { unit, content } = await units.getUnit({ ownerId, workId, unitId });
        return { type: unit.type, title: unit.title, body: String((content as { body?: string } | null)?.body ?? "") };
      } catch {
        return null;
      }
    },
    // Real provider routing (DeepSeek flash→pro fallback). Missing credentials
    // surface as provider_failed — never a deterministic fake reply.
    modelInvoke: async (params) => {
      return invokeScreenplayModel({
        userMessage: params.userMessage,
        purpose: params.purpose,
        scope: params.scope,
        packetContent: params.packetContent,
        references: (params.references as Array<{ type: string; id: string; versionId: string; reason: string }>) ?? [],
        history: params.history,
        unit: params.unit,
        clientContext: params.clientContext,
      });
    },
  };
}

export async function GET(
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
    const conversationId = normalizeScreenplayConversationId(
      workId,
      request.nextUrl.searchParams.get("conversationId"),
    );
    if (!conversationId) {
      return NextResponse.json({ success: false, error: "conversationId must be a UUID.", code: "validation_failed" }, { status: 422 });
    }
    const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? "30");
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 30;
    const before = request.nextUrl.searchParams.get("before");
    const service = new ScreenplayGenerationService(serviceFetch, buildDeps(viewer.id));
    const page = await service.listMessages({ ownerId: viewer.id, workId, conversationId, limit, before });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", ...page });
  } catch (error) {
    return errorResponse(error);
  }
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
    const conversationId = normalizeScreenplayConversationId(workId, String(body.conversationId ?? ""));
    if (!conversationId) {
      return NextResponse.json({ success: false, error: "conversationId must be a UUID.", code: "validation_failed" }, { status: 422 });
    }
    const purpose = (String(body.purpose ?? "discuss") === "similarity_review" ? "similarity_review" : "discuss") as KkPurpose;
    const service = new ScreenplayGenerationService(serviceFetch, buildDeps(viewer.id));
    const result = await service.discuss({
      ownerId: viewer.id,
      workId,
      conversationId,
      userMessage: String(body.userMessage ?? ""),
      purpose,
      clientContext: body.clientContext ? String(body.clientContext).slice(0, 200) : null,
      idempotencyKey: body.idempotencyKey,
    });

    // Similarity review leaves a work-scoped evidence record bound to the
    // current outline version, so the review survives refreshes and audits.
    if (purpose === "similarity_review") {
      const outlineVersionId = await resolveOutlineVersionId(viewer.id, workId);
      await service
        .appendEvidence({
          ownerId: viewer.id,
          workId,
          kind: "similarity_review",
          payload: {
            threadId: conversationId,
            assistantMessageId: result.assistantMessage.id,
            outlineVersionId,
            reviewedAt: new Date().toISOString(),
          },
        })
        .catch(() => undefined); // 留痕失败不阻断审查结果返回
    }

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

async function resolveOutlineVersionId(ownerId: string, workId: string): Promise<string | null> {
  try {
    const units = new ScreenplayUnitsService(serviceFetch);
    const { units: list } = await units.listUnits({ ownerId, workId });
    const outline = list.find((u) => u.type === "outline");
    return outline?.currentVersionId ?? null;
  } catch {
    return null;
  }
}

function errorResponse(error: unknown) {
  const classified = classifyServiceError(error, "screenplay-discuss");
  return NextResponse.json(
    { success: false, error: classified.message, code: classified.code, requestId: classified.requestId },
    { status: classified.status },
  );
}
