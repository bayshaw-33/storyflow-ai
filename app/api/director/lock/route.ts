/**
 * POST /api/director/lock
 * TRAE-V2-04 锁定/解锁 scene 或 shot（锁定后重新分析不覆盖）
 */

import { NextResponse } from "next/server";
import { authenticateRequest, getSupabaseServerClient, hasServiceRoleConfig } from "@/lib/supabase/server";
import { ok } from "@/lib/api/responses";
import { setShotLocked, setSceneLocked } from "@/lib/director/queries";
import { isDirectorError } from "@/lib/director/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, error, code }, { status });
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
    return errorResponse(500, "MISSING_SUPABASE_SERVICE_ROLE_KEY", "服务端缺少配置。");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_INPUT", "请求格式不正确。");
  }

  const data = (body ?? {}) as Record<string, unknown>;
  const targetType = typeof data.targetType === "string" ? data.targetType : "";
  const targetId = typeof data.targetId === "string" ? data.targetId : "";
  const locked = data.locked !== false; // 默认 true

  if ((targetType !== "scene" && targetType !== "shot") || !targetId) {
    return errorResponse(400, "INVALID_INPUT", "需要 targetType (scene|shot) 和 targetId。");
  }

  try {
    const client = getSupabaseServerClient();
    if (!client) return errorResponse(500, "MISSING_CONFIG", "服务端缺少配置。");
    if (targetType === "scene") {
      await setSceneLocked(client, targetId, userId, locked);
    } else {
      await setShotLocked(client, targetId, userId, locked);
    }
    return ok({ targetType, targetId, locked });
  } catch (err: unknown) {
    if (isDirectorError(err)) {
      return errorResponse(400, err.code, err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, "LOCK_FAILED", message);
  }
}
