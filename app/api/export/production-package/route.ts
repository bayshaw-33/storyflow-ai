/**
 * GET /api/export/production-package?projectId=&sourceUnitId=&aspectRatio=9:16&format=json
 *
 * TRAE-V2-07 Production Package 与资产清单
 *
 * 返回完整 Production Package：
 *   - format=json (默认): 返回 JSON 整包
 *   - format=manifest: 只返回 manifest.json
 *
 * 规则：
 *   - 必须通过认证
 *   - 必须 owner 校验
 *   - 不返回 API Key / 签名 URL / Provider 原始错误
 *   - 缺失素材在 manifest 中标记 missing
 */

import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { buildProductionPackage } from "@/lib/export/package-builder";
import { isExportError } from "@/lib/export/types";

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

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim() || "";
  const sourceUnitIdParam = url.searchParams.get("sourceUnitId")?.trim() || "";
  const aspectRatioParam = url.searchParams.get("aspectRatio")?.trim() || "9:16";
  const format = url.searchParams.get("format")?.trim() || "json";

  if (!projectId) {
    return errorResponse(400, "VALIDATION_FAILED", "缺少 projectId。");
  }

  if (!["9:16", "16:9", "1:1"].includes(aspectRatioParam)) {
    return errorResponse(400, "VALIDATION_FAILED", "aspectRatio 必须是 9:16 / 16:9 / 1:1。");
  }

  if (!["json", "manifest"].includes(format)) {
    return errorResponse(400, "VALIDATION_FAILED", "format 必须是 json 或 manifest。");
  }

  try {
    const { package: pkg, manifest } = await buildProductionPackage({
      ownerId: userId,
      projectId,
      sourceUnitId: sourceUnitIdParam || undefined,
      aspectRatio: aspectRatioParam as "9:16" | "16:9" | "1:1",
    });

    if (format === "manifest") {
      return NextResponse.json({
        success: true,
        manifest,
      });
    }

    return NextResponse.json({
      success: true,
      manifest,
      files: pkg.files,
      summary: manifest.summary,
    });
  } catch (err: unknown) {
    if (isExportError(err)) {
      return errorResponse(err.httpStatus, err.code, err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, "INTERNAL_ERROR", `导出失败：${message.slice(0, 200)}`);
  }
}
