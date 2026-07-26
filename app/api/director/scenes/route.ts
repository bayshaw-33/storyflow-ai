/**
 * GET /api/director/scenes
 * TRAE-V2-04 读取 scenes with director_meta
 */

import { NextResponse } from "next/server";
import { authenticateRequest, getSupabaseServerClient, hasServiceRoleConfig } from "@/lib/supabase/server";
import { ok } from "@/lib/api/responses";
import { fetchScenesWithDirectorMeta } from "@/lib/director/queries";
import { isDirectorError } from "@/lib/director/types";

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
    return errorResponse(500, "MISSING_SUPABASE_SERVICE_ROLE_KEY", "服务端缺少配置。");
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? "";
  const sourceUnitId = url.searchParams.get("sourceUnitId") ?? "legacy";

  if (!projectId.trim()) {
    return errorResponse(400, "INVALID_INPUT", "缺少 projectId。");
  }

  try {
    const client = getSupabaseServerClient();
    if (!client) return errorResponse(500, "MISSING_CONFIG", "服务端缺少配置。");
    const scenes = await fetchScenesWithDirectorMeta(client, userId, projectId, sourceUnitId);
    return ok({ scenes });
  } catch (err: unknown) {
    if (isDirectorError(err)) {
      return errorResponse(400, err.code, err.message);
    }
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, "FETCH_FAILED", message);
  }
}
