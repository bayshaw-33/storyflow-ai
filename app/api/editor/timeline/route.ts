/**
 * GET /api/editor/timeline?projectId=&sourceUnitId=
 * TRAE-V2-06 OpenCut-ready Editor Framework
 * 读取并序列化 kiikis.timeline/1
 *
 * - 校验 owner + project 归属
 * - 读取 assembly_sequence + items + selected_takes + voice_lines
 * - 序列化为 KiikisTimeline DTO
 * - 返回 OpenCut 状态 + Export 可用性
 *
 * Feature Flag：EDITOR_FRAMEWORK_ENABLED=true 才启用
 */

import { NextResponse } from "next/server";
import {
  authenticateRequest,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import {
  loadEditorTimelineData,
  hasCompletedVideo,
} from "@/lib/editor/queries";
import { serializeTimeline, parseSequenceMeta } from "@/lib/editor/timeline-schema";
import {
  isEditorFrameworkEnabled,
  isOpenCutAvailable,
  getOpenCutUnavailableReason,
  isExportAvailable,
} from "@/lib/editor/feature-flags";
import { isEditorError } from "@/lib/editor/types";
import type { EditorTimelineResponse } from "@/lib/editor/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, error, code }, { status });
}

export async function GET(request: Request) {
  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录。");
  }

  if (!hasServiceRoleConfig()) {
    return errorResponse(500, "MISSING_CONFIG", "服务端缺少配置。");
  }

  // Feature Flag
  if (!isEditorFrameworkEnabled()) {
    return errorResponse(
      503,
      "FEATURE_DISABLED",
      "Editor Framework 当前未启用（EDITOR_FRAMEWORK_ENABLED!=true）。",
    );
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim() || "";
  const sourceUnitId = url.searchParams.get("sourceUnitId")?.trim() || "legacy";
  const aspectRatioParam = url.searchParams.get("aspectRatio") || "9:16";
  const aspectRatio = (
    ["9:16", "16:9", "1:1"].includes(aspectRatioParam)
      ? aspectRatioParam
      : "9:16"
  ) as "9:16" | "16:9" | "1:1";

  if (!projectId) {
    return errorResponse(400, "INVALID_INPUT", "缺少 projectId。");
  }

  try {
    const data = await loadEditorTimelineData(userId, projectId);
    const timeline = serializeTimeline({
      ...data,
      projectId,
      sourceUnitId,
      aspectRatio,
    });

    const meta = parseSequenceMeta(
      data.sequence.metadata as Record<string, unknown>,
    );

    const openCutAvail = isOpenCutAvailable();
    const exportCheck = isExportAvailable({
      frameworkEnabled: true,
      hasCompletedVideo: hasCompletedVideo(data.selectedTakes),
    });

    return NextResponse.json({
      success: true,
      timeline,
      sequence: {
        id: data.sequence.id,
        status: data.sequence.status,
        editorStatus: meta.editor_status ?? "framework",
        editorEngine: meta.editor_engine ?? "none",
      },
      opencutStatus: {
        available: openCutAvail,
        reason: openCutAvail ? "" : getOpenCutUnavailableReason(),
      },
      exportAvailable: exportCheck.available,
      exportUnavailableReason: exportCheck.reason,
    } satisfies EditorTimelineResponse);
  } catch (err: unknown) {
    if (isEditorError(err)) {
      const status =
        err.code === "SCOPE_NOT_FOUND" ? 404 :
        err.code === "SEQUENCE_NOT_FOUND" ? 404 :
        err.code === "FEATURE_DISABLED" ? 503 :
        err.code === "INVALID_INPUT" ? 400 :
        500;
      return errorResponse(status, err.code, err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, "EDITOR_FAILED", message);
  }
}
