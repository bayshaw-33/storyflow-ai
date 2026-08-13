import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { createInvite, revokeInvite, GrantServiceError } from "@/lib/server/v2/grants/invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v2/grants/invite — 创建邀请 token (RG-002)
 *   body: { resourceType, resourceId, scope, role?, terms?, expiresInSeconds? }
 *   返回: { token, invite } — token 明文只返回一次
 *
 * GET /api/v2/grants/invite — 列出当前用户创建的邀请
 *   query: status
 */
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

    // RG-001: inviterId 由服务端认证填入
    const result = await createInvite(serviceFetch, {
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      inviterId: user.id, // RG-001
      scope: body.scope,
      role: body.role ?? null,
      terms: body.terms ?? {},
      expiresInSeconds: body.expiresInSeconds ?? 24 * 60 * 60, // 默认 24h
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.grants/1",
      token: result.token, // 明文只返回一次
      invite: result.invite,
    }, { status: 201 });
  } catch (error) {
    return grantErrorResponse(error, "Unable to create invite.");
  }
}

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
    const status = url.searchParams.get("status") ?? undefined;

    const { listInvites } = await import("@/lib/server/v2/grants/invite");
    const invites = await listInvites(serviceFetch, user.id, { status });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.grants/1",
      invites,
    });
  } catch (error) {
    return grantErrorResponse(error, "Unable to list invites.");
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
