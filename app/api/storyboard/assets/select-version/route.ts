/**
 * POST /api/storyboard/assets/select-version — mark one generated version as
 * the selected (approved) reference for an asset.
 *
 * Task card: KIIKIS-P1-KIMI-002 §4
 *
 * Mapping: StoryboardAssetUsage.selectedVersionId ↔
 * storyflow_art_asset_variants.approved_version_id. After selection, the
 * prompts API single-sources this version's appearance summary and includes
 * the version id in referenceVersionIds / inputHash.
 */

import { NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { ok } from "@/lib/api/responses";
import { markVersionSelected } from "@/lib/storyboard/assets/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string, details?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, code, ...(details ? { details } : {}) }, { status });
}

export async function POST(request: Request) {
  try {
    await authenticateRequest(request);
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
    return errorResponse(422, "INVALID_JSON", "请求体不是合法的 JSON。");
  }

  const input = body as Record<string, unknown> | null;
  const assetId = typeof input?.assetId === "string" ? input.assetId.trim() : "";
  const versionId = typeof input?.versionId === "string" ? input.versionId.trim() : "";
  const fields: string[] = [];
  if (!assetId) fields.push("assetId");
  if (!versionId) fields.push("versionId");
  if (fields.length > 0) {
    return errorResponse(422, "MISSING_FIELD", `请求缺少或包含非法字段: ${fields.join(", ")}`, { fields });
  }

  try {
    await markVersionSelected(serviceFetch, { assetId, versionId });
    return ok({ assetId, selectedVersionId: versionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("VERSION_NOT_FOUND")) {
      return errorResponse(404, "VERSION_NOT_FOUND", "版本不存在或不属于该资产。");
    }
    return errorResponse(500, "SELECT_VERSION_FAILED", message);
  }
}
