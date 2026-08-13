import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { createAppeal, listAppeals, CommunityServiceError } from "@/lib/server/v2/community/moderation";
import { hasModeratorRole } from "@/lib/server/v2/community/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/community/appeals — 列出申诉 (CM-007, CM-009)
 *   query: status?, limit?, offset?
 *   普通用户: 列出自己的申诉 (appellant 视角)
 *   审核员: 列出所有申诉 (不带 appellantId 过滤, RLS 兜底)
 *
 * POST /api/v2/community/appeals — 创建申诉 (CM-007)
 *   body: { moderationId, appealText, idempotencyKey? }
 *   CM-007: 幂等 — 同一 idempotency_key 只创建一次
 *   CM-009: 仅被处罚用户可创建 (RPC 内校验 publication owner)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Community service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const url = new URL(request.url);
    const isMod = await hasModeratorRole(serviceFetch, user.id);
    // CM-009: 审核员可看所有 (传 all=true); 普通用户只看自己的
    const items = await listAppeals(serviceFetch, user.id, {
      all: isMod,
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
    });
    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.appeal/1",
      items,
    });
  } catch (error) {
    return communityErrorResponse(error, "Unable to list appeals.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Community service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const body = await request.json().catch(() => ({}));
    if (!body.moderationId) {
      return NextResponse.json(
        { success: false, error: "moderationId is required.", code: "validation_failed" },
        { status: 400 },
      );
    }
    if (!body.appealText || typeof body.appealText !== "string" || body.appealText.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "appealText is required.", code: "validation_failed" },
        { status: 400 },
      );
    }

    // CM-007: 服务端注入 appellantId
    const appeal = await createAppeal(serviceFetch, {
      appellantId: user.id,
      moderationId: body.moderationId,
      appealText: body.appealText,
      idempotencyKey: body.idempotencyKey || `appeal:${user.id}:${body.moderationId}`,
    });

    return NextResponse.json(
      {
        success: true,
        contractVersion: "kiikis.community.appeal/1",
        appeal,
      },
      { status: 201 },
    );
  } catch (error) {
    return communityErrorResponse(error, "Unable to create appeal.");
  }
}

function communityErrorResponse(error: unknown, fallback: string) {
  if (error instanceof CommunityServiceError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
  }
  return NextResponse.json(
    { success: false, error: fallback, code: "service_unavailable" },
    { status: 503 },
  );
}
