/**
 * GET /api/video-gateway/catalog
 * TRAE-V2-05 Video Model Gateway V1
 * 返回可用的视频生成 Provider 列表（UI 选择器用）
 *
 * 不返回 API Key、Secret 或内部端点
 */

import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { getProviderCatalog } from "@/lib/video-gateway/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, error: string) {
  return NextResponse.json({ success: false, error, code }, { status });
}

export async function GET(request: Request) {
  try {
    await authenticateRequest(request);
  } catch {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录。");
  }
  const catalog = getProviderCatalog();
  return NextResponse.json({ success: true, catalog });
}
