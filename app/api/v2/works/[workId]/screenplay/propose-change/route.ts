/**
 * POST  /api/v2/works/[workId]/screenplay/propose-change — 生成修改方案（Candidate Diff）
 * PUT   /api/v2/works/[workId]/screenplay/propose-change — 采用候选（acceptedPatchIndexes）
 * DELETE /api/v2/works/[workId]/screenplay/propose-change — 拒绝候选
 * Phase 3 Task 3.4
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  ScreenplayGenerationService,
  ScreenplayGenerationError,
  type GenerationDeps,
  type ProposeScope,
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
          { ownerId, workId, workVersionId: versionId, view: "screenplay-studio-propose", tokenBudget: 8192 },
          serviceFetch,
        );
        return { packetId: packet.id, references: packet.references };
      } catch {
        return { packetId: null, references: [] };
      }
    },
    modelInvoke: async ({ userMessage, scope }) => {
      // Deterministic candidate builder until Phase 5 model-router lands.
      // It returns a reviewable patch derived from the request itself — never
      // a silent content rewrite: the patch only takes effect on user apply.
      const label = scope?.kind === "all" ? "全剧本" : `${scope?.kind ?? "未指定范围"}`;
      return {
        assistantText: `KK：基于「${label}」范围生成了一版修改方案，请逐块审阅。`,
        patches: [
          {
            unitPath: scope?.unitId ? `unit:${scope.unitId}` : "scope:current",
            before: "（当前正文保持不变，等待审阅）",
            after: `【建议】${userMessage.slice(0, 80)}`,
          },
        ],
      };
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
    const work = await getWork({ ownerId: viewer.id, workId }, serviceFetch);
    const service = new ScreenplayGenerationService(serviceFetch, buildDeps(viewer.id));
    const result = await service.proposeChange({
      ownerId: viewer.id,
      workId,
      conversationId: String(body.conversationId ?? ""),
      userMessage: String(body.userMessage ?? ""),
      scope: (body.scope ?? { kind: "all" }) as ProposeScope,
      baseVersionId: body.baseVersionId ?? work.current_version_id ?? "",
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
