/**
 * GET /api/editor/timeline/export?projectId=&format=fcpxml|edl&sourceUnitId=&aspectRatio=
 * TRAE-V2-06 Editor Framework — Timeline 导出 API
 *
 * 返回指定格式的剪辑表文件（attachment 下载）
 *   - fcpxml: Final Cut Pro XML 1.9
 *   - edl: CMX 3600 EDL
 *
 * 安全约束：
 * - 必须登录 + 校验 project 归属
 * - Feature Flag EDITOR_FRAMEWORK_ENABLED=true
 * - 必须有 completed 视频资产（exportAvailable）
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
import { serializeTimeline } from "@/lib/editor/timeline-schema";
import {
  isEditorFrameworkEnabled,
  isExportAvailable,
} from "@/lib/editor/feature-flags";
import {
  serializeToFormat,
  isSupportedFormat,
  EXPORT_FORMATS,
} from "@/lib/editor/exporters";
import { isEditorError } from "@/lib/editor/types";

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
  const formatParam = url.searchParams.get("format")?.trim().toLowerCase() || "";
  const fpsParam = url.searchParams.get("fps");
  const fps =
    fpsParam && /^\d+$/.test(fpsParam) && Number(fpsParam) > 0
      ? Math.min(60, Math.max(1, Number(fpsParam)))
      : undefined;

  if (!projectId) {
    return errorResponse(400, "INVALID_INPUT", "缺少 projectId。");
  }

  // 校验 format
  if (!formatParam) {
    return errorResponse(
      400,
      "INVALID_INPUT",
      `缺少 format 参数，支持：${EXPORT_FORMATS.join(", ")}`,
    );
  }
  if (!isSupportedFormat(formatParam)) {
    return errorResponse(
      400,
      "INVALID_INPUT",
      `不支持的 format: ${formatParam}，支持：${EXPORT_FORMATS.join(", ")}`,
    );
  }

  try {
    const data = await loadEditorTimelineData(userId, projectId);
    const timeline = serializeTimeline({
      ...data,
      projectId,
      sourceUnitId,
      aspectRatio,
    });

    // 校验 export 可用性
    const exportCheck = isExportAvailable({
      frameworkEnabled: true,
      hasCompletedVideo: hasCompletedVideo(data.selectedTakes),
    });
    if (!exportCheck.available) {
      return errorResponse(
        409,
        "EXPORT_UNAVAILABLE",
        `导出不可用：${exportCheck.reason ?? "未知原因"}`,
      );
    }

    // 序列化
    const result = serializeToFormat(timeline, formatParam, {
      fps,
      projectName: `Kiikis-${projectId}`,
    });

    // 返回文件（attachment 下载）
    return new NextResponse(result.content, {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="${result.suggestedFilename}"`,
        "Cache-Control": "no-store, max-age=0",
        "X-Export-Format": result.format,
        "X-Export-Filename": result.suggestedFilename,
      },
    });
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
    return errorResponse(500, "EXPORT_FAILED", message);
  }
}
