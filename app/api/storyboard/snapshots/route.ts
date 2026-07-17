import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { RevisionConflictError, createStoryboardSnapshot } from "@/lib/storyboard/state-api";
import type { SnapshotRequest } from "@/lib/storyboard/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: SnapshotRequest;
  try {
    body = (await request.json()) as SnapshotRequest;
  } catch {
    return NextResponse.json({ success: false, error: "请求格式不正确，请提交 JSON。" }, { status: 400 });
  }
  if (!isSnapshotRequest(body)) {
    return NextResponse.json({ success: false, error: "快照请求缺少作用域、revision 或 scenes 数据。" }, { status: 400 });
  }

  try {
    const user = await authenticateRequest(request);
    const snapshot = await createStoryboardSnapshot(user.id, body);
    return NextResponse.json({ success: true, ...snapshot });
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return NextResponse.json(
        { success: false, code: error.code, currentRevision: error.currentRevision },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : "STORYBOARD_SNAPSHOT_ERROR";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function isSnapshotRequest(value: SnapshotRequest): value is SnapshotRequest {
  return Boolean(
    value &&
      typeof value.projectId === "string" && value.projectId.trim() &&
      typeof value.sourceUnitId === "string" && value.sourceUnitId.trim() &&
      Number.isInteger(value.expectedRevision) && value.expectedRevision >= 0 &&
      (value.reason === "manual" || value.reason === "before_reanalysis" || value.reason === "restore") &&
      Array.isArray(value.scenes) &&
      Array.isArray(value.deletedSceneIds) &&
      Array.isArray(value.deletedShotIds),
  );
}
