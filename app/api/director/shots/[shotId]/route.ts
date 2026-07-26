/**
 * PATCH /api/director/shots/[shotId]
 * TRAE-V2-04 更新单个 shot 的 director_meta
 */

import { NextResponse } from "next/server";
import { authenticateRequest, getSupabaseServerClient, hasServiceRoleConfig } from "@/lib/supabase/server";
import { ok } from "@/lib/api/responses";
import { updateShotDirectorMeta } from "@/lib/director/queries";
import { isDirectorError } from "@/lib/director/types";
import type { DirectorShotMeta } from "@/lib/director/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, error, code }, { status });
}

export async function PATCH(request: Request, context: { params: Promise<{ shotId: string }> }) {
  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录。");
  }

  if (!hasServiceRoleConfig()) {
    return errorResponse(500, "MISSING_SUPABASE_SERVICE_ROLE_KEY", "服务端缺少配置。");
  }

  const { shotId } = await context.params;
  if (!shotId) {
    return errorResponse(400, "INVALID_INPUT", "缺少 shotId。");
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
  const meta = data.directorMeta as DirectorShotMeta;
  if (!meta || typeof meta !== "object") {
    return errorResponse(400, "INVALID_INPUT", "缺少 directorMeta。");
  }

  try {
    const client = getSupabaseServerClient();
    if (!client) return errorResponse(500, "MISSING_CONFIG", "服务端缺少配置。");
    await updateShotDirectorMeta(client, shotId, userId, meta);
    return ok({ shotId, updated: true });
  } catch (err: unknown) {
    if (isDirectorError(err)) {
      return errorResponse(400, err.code, err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, "UPDATE_FAILED", message);
  }
}
