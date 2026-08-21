/**
 * POST  /api/v2/works/[workId]/screenplay/propose-change — 生成修改方案（Candidate Diff）
 * PUT   /api/v2/works/[workId]/screenplay/propose-change — 采用候选（acceptedPatchIndexes）
 * DELETE /api/v2/works/[workId]/screenplay/propose-change — 拒绝候选
 * Phase 3 Task 3.4 · 2026-08-16 hotfix: real model routing + atomic RPC transitions.
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  ScreenplayGenerationService,
  type GenerationDeps,
  type ProposeScope,
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
          { ownerId, workId, workVersionId: versionId, view: "screenplay-studio-propose", tokenBudget: 8192 },
          serviceFetch,
        );
        return { packetId: packet.id, packetContent: packet.content, references: packet.references };
      } catch {
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
    modelInvoke: async (params) => {
      return invokeScreenplayModel({
        userMessage: params.userMessage,
        purpose: "propose_change",
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

function unauthorized() {
  return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
}

function unavailable() {
  return NextResponse.json({ success: false, error: "Service not configured.", code: "service_unavailable" }, { status: 503 });
}

function errorResponse(error: unknown) {
  const classified = classifyServiceError(error, "screenplay-propose-change");
  return NextResponse.json(
    { success: false, error: classified.message, code: classified.code, requestId: classified.requestId },
    { status: classified.status },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromRequest(request);
    if (!viewer) return unauthorized();
    const { workId } = await params;
    const body = await request.json().catch(() => ({}));
    const conversationId = normalizeScreenplayConversationId(workId, String(body.conversationId ?? ""));
    if (!conversationId) {
      return NextResponse.json({ success: false, error: "conversationId must be a UUID.", code: "validation_failed" }, { status: 422 });
    }
    const work = await getWork({ ownerId: viewer.id, workId }, serviceFetch);
    const service = new ScreenplayGenerationService(serviceFetch, buildDeps(viewer.id));
    const result = await service.proposeChange({
      ownerId: viewer.id,
      workId,
      conversationId,
      userMessage: String(body.userMessage ?? ""),
      scope: (body.scope ?? { kind: "all" }) as ProposeScope,
      baseVersionId: body.baseVersionId ?? work.current_version_id ?? "",
      clientContext: body.clientContext ? String(body.clientContext).slice(0, 200) : null,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json(
      { success: true, contractVersion: "2.2.0-alpha.1", candidate: result.candidate, snapshotId: result.snapshotId },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromRequest(request);
    if (!viewer) return unauthorized();
    const { workId } = await params;
    const body = await request.json().catch(() => ({}));
    const service = new ScreenplayGenerationService(serviceFetch, buildDeps(viewer.id));
    const result = await service.applyCandidate({
      ownerId: viewer.id,
      workId,
      candidateId: String(body.candidateId ?? ""),
      acceptedPatchIndexes: Array.isArray(body.acceptedPatchIndexes) ? body.acceptedPatchIndexes.map(Number) : [],
    });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromRequest(request);
    if (!viewer) return unauthorized();
    const { workId } = await params;
    const body = await request.json().catch(() => ({}));
    const service = new ScreenplayGenerationService(serviceFetch, buildDeps(viewer.id));
    const result = await service.rejectCandidate({
      ownerId: viewer.id,
      workId,
      candidateId: String(body.candidateId ?? ""),
    });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
