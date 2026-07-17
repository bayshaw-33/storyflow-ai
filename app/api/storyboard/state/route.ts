import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { RevisionConflictError, loadStoryboardState, saveStoryboardState } from "@/lib/storyboard/state-api";
import type { SaveRequest } from "@/lib/storyboard/contracts";

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
    return NextResponse.json({ success: true, ...state });
  } catch (error) {
    return storyboardError(error);
  }
}

function isSaveRequest(value: SaveRequest): value is SaveRequest {
  return Boolean(
    value &&
      typeof value.projectId === "string" && value.projectId.trim() &&
      typeof value.sourceUnitId === "string" && value.sourceUnitId.trim() &&
      Number.isInteger(value.expectedRevision) && value.expectedRevision >= 0 &&
      Array.isArray(value.scenes) &&
      Array.isArray(value.deletedSceneIds) &&
      Array.isArray(value.deletedShotIds),
  );
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
