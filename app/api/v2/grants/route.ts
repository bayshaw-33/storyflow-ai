import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { createGrant, listGrants, GrantServiceError } from "@/lib/server/v2/grants/store";
import type { GrantServiceError as _Alias } from "@/lib/server/v2/grants/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/grants — 列出当前用户相关的 grant (RG-003)
 *   query: resourceType, resourceId, scope, status
 *
 * POST /api/v2/grants — 创建 grant (RG-001: grantorId 由服务端认证填入)
 *   body: { resourceType, resourceId, granteeId, scope, role?, terms?, expiresAt?, sourceGrantId?, idempotencyKey }
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Grant service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const filter: Record<string, string> = {};
    if (url.searchParams.get("resourceType")) filter.resourceType = url.searchParams.get("resourceType")!;
    if (url.searchParams.get("resourceId")) filter.resourceId = url.searchParams.get("resourceId")!;
    if (url.searchParams.get("scope")) filter.scope = url.searchParams.get("scope")!;
    if (url.searchParams.get("status")) filter.status = url.searchParams.get("status")!;

    const grants = await listGrants(serviceFetch, user.id, filter);

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.grants/1",
      grants,
    });
  } catch (error) {
    return grantErrorResponse(error, "Unable to list grants.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Grant service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const body = await request.json().catch(() => ({}));

    // RG-001: grantorId 由服务端从认证用户注入，不接受客户端传入
    const grant = await createGrant(serviceFetch, {
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      granteeId: body.granteeId,
      grantorId: user.id, // RG-001: 服务端决定
      scope: body.scope,
      role: body.role ?? null,
      terms: body.terms ?? {},
      expiresAt: body.expiresAt ?? null,
      sourceGrantId: body.sourceGrantId ?? null,
      idempotencyKey: body.idempotencyKey || `grant:${user.id}:${body.resourceType}:${body.resourceId}:${body.granteeId}:${Date.now()}`,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.grants/1",
      grant,
    }, { status: 201 });
  } catch (error) {
    return grantErrorResponse(error, "Unable to create grant.");
  }
}

function grantErrorResponse(error: unknown, fallback: string) {
  if (error instanceof GrantServiceError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
  }
  return NextResponse.json({ success: false, error: fallback, code: "service_unavailable" }, { status: 503 });
}
