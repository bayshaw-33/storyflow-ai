import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import { isEvidenceLedgerEnabled } from "@/lib/evidence/feature-flags";
import { storyboardSaveEvidenceEvent } from "@/lib/evidence/hooks";
import { recordEvidenceEvent } from "@/lib/evidence/ledger";
import { RevisionConflictError, loadStoryboardState, saveStoryboardState } from "@/lib/storyboard/state-api";
import type { SaveRequest } from "@/lib/storyboard/contracts";
import { isSaveRequest } from "@/lib/storyboard/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId")?.trim();
  const sourceUnitId = request.nextUrl.searchParams.get("sourceUnitId")?.trim();
  if (!projectId || !sourceUnitId) return badRequest("缺少 projectId 或 sourceUnitId。");

  try {
    const user = await authenticateRequest(request);
    const state = await loadStoryboardState(user.id, projectId, sourceUnitId);
    return NextResponse.json({ success: true, state });
  } catch (error) {
    return storyboardError(error);
  }
}

export async function PUT(request: NextRequest) {
  let body: SaveRequest;
  try {
    body = (await request.json()) as SaveRequest;
  } catch {
    return badRequest("请求格式不正确，请提交 JSON。");
  }
  if (!isSaveRequest(body)) return badRequest("分镜保存请求缺少作用域、revision 或 Scene 数据。");

  try {
    const user = await authenticateRequest(request);
    const state = await saveStoryboardState(user.id, body);
    let projectMetadataSynced = true;
    if (body.projectMetadata) {
      try {
        await serviceFetch(
          `/rest/v1/storyflow_production_projects?owner_id=eq.${encodeURIComponent(user.id)}&project_id=eq.${encodeURIComponent(body.projectId)}&source_unit_id=eq.${encodeURIComponent(body.sourceUnitId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              title: body.projectMetadata.title.trim() || "未命名制片项目",
              source_summary: body.projectMetadata.manuscript,
              source_files: body.projectMetadata.sourceFiles,
              updated_at: new Date().toISOString(),
            }),
          },
        );
      } catch (metadataError) {
        projectMetadataSynced = false;
        console.error("[storyboard/state] project metadata sync failed", metadataError);
      }
    }
    let evidenceSynced = !isEvidenceLedgerEnabled();
    if (isEvidenceLedgerEnabled()) {
      try {
        await recordEvidenceEvent(storyboardSaveEvidenceEvent({
          ownerId: user.id,
          projectId: body.projectId,
          sourceUnitId: body.sourceUnitId,
          revision: state.revision,
          sceneCount: state.scenes.length,
        }));
        evidenceSynced = true;
      } catch (evidenceError) {
        console.error("[evidence] storyboard save trace failed", evidenceError);
      }
    }
    return NextResponse.json({ success: true, ...state, evidenceSynced, projectMetadataSynced });
  } catch (error) {
    return storyboardError(error);
  }
}

function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

function storyboardError(error: unknown) {
  if (error instanceof RevisionConflictError) {
    return NextResponse.json(
      { success: false, code: error.code, currentRevision: error.currentRevision },
      { status: 409 },
    );
  }
  const message = error instanceof Error ? error.message : "STORYBOARD_STATE_ERROR";
  const status = message === "STORYBOARD_PROJECT_NOT_FOUND" || message === "STORYBOARD_STATE_NOT_FOUND" ? 404 : 500;
  return NextResponse.json({ success: false, error: message }, { status });
}
