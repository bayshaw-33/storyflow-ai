/**
 * POST /api/director/apply
 * TRAE-V2-04 应用 Breakdown Preview 到 DB
 * - 创建新 scene/shot + director_meta
 * - 更新已有 scene/shot 的 director_meta（locked 不覆盖）
 */

import { NextResponse } from "next/server";
import { authenticateRequest, getSupabaseServerClient, hasServiceRoleConfig } from "@/lib/supabase/server";
import { ok } from "@/lib/api/responses";
import { applyBreakdown } from "@/lib/director/queries";
import { isDirectorError } from "@/lib/director/types";
import type { ApplyBreakdownRequest, SceneBreakdownPreview } from "@/lib/director/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string, details?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, code, ...(details ? { details } : {}) }, { status });
}

export async function POST(request: Request) {
  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录。");
  }

  if (!hasServiceRoleConfig()) {
    return errorResponse(500, "MISSING_SUPABASE_SERVICE_ROLE_KEY", "服务端缺少 Supabase Service Role 配置。");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_INPUT", "请求格式不正确。");
  }

  if (!body || typeof body !== "object") {
    return errorResponse(400, "INVALID_INPUT", "请求格式不正确。");
  }

  const data = body as Record<string, unknown>;
  const projectId = typeof data.projectId === "string" ? data.projectId : "";
  const sourceUnitId = typeof data.sourceUnitId === "string" ? data.sourceUnitId : "legacy";
  const scenesRaw = Array.isArray(data.scenes) ? data.scenes : [];
  const deletedSceneIds = Array.isArray(data.deletedSceneIds) ? (data.deletedSceneIds as string[]) : [];
  const deletedShotIds = Array.isArray(data.deletedShotIds) ? (data.deletedShotIds as string[]) : [];

  if (!projectId.trim() || scenesRaw.length === 0) {
    return errorResponse(400, "INVALID_INPUT", "缺少必要参数：projectId / scenes。");
  }

  // 类型收窄：scenes 必须是 SceneBreakdownPreview[]
  const scenes = scenesRaw as unknown as SceneBreakdownPreview[];

  const request_: ApplyBreakdownRequest = {
    projectId,
    sourceUnitId,
    scenes,
    deletedSceneIds,
    deletedShotIds,
  };

  try {
    const client = getSupabaseServerClient();
    if (!client) return errorResponse(500, "MISSING_CONFIG", "服务端缺少配置。");
    const result = await applyBreakdown(client, userId, request_);
    return ok(result);
  } catch (err: unknown) {
    if (isDirectorError(err)) {
      const status = err.code === "INVALID_INPUT" ? 400 : 500;
      return errorResponse(status, err.code, err.message, err.details);
    }
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, "APPLY_FAILED", message);
  }
}
