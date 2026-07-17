/**
 * POST /api/exports — 旧导出端点（已弃用）
 *
 * 任务卡：KIIKIS-TR-G0-002-7
 *
 * 此端点直接返回 payload 而不经过 Compliance Export Gate，已弃用。
 * 新代码应使用 POST /api/exports/request。
 *
 * Phase 0 策略：保留功能但添加 Deprecation + Sunset 头，
 * 返回的 JSON 中附带 deprecationWarning 字段引导前端迁移。
 * Phase 1 将改为返回 410 Gone。
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest } from "@/lib/supabase/server";
import { exportProjectAsJson, exportProjectAsMarkdown } from "@/lib/supabase/phase2";

const DEPRECATION_MESSAGE = "此端点已弃用，请使用 POST /api/exports/request 走合规导出 Gate。";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const exportType = body.exportType === "markdown" ? "markdown" : "json";
    const payload = exportType === "markdown"
      ? await exportProjectAsMarkdown(user.id, projectId)
      : await exportProjectAsJson(user.id, projectId);

    const response = ok({ exportType, payload, deprecationWarning: DEPRECATION_MESSAGE });
    response.headers.set("Deprecation", "true");
    response.headers.set("Sunset", "Fri, 31 Oct 2026 00:00:00 GMT");
    response.headers.set("Link", '</api/exports/request>; rel="successor-version"');
    return response;
  } catch (error) {
    return apiError(error, "导出项目失败。");
  }
}
