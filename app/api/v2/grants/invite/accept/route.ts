import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { acceptInvite, GrantServiceError } from "@/lib/server/v2/grants/invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v2/grants/invite/accept — 接受邀请 token (RG-002)
 *   body: { token }
 *   单次使用: accepted 后 token 失效
 *   限时过期: 过期后拒绝
 *   接受后绑定到当前认证用户 (accepterId 由服务端填入)
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
    if (!body.token) {
      return NextResponse.json(
        { success: false, error: "token is required.", code: "validation_failed" },
        { status: 422 },
      );
    }

    // RG-001: accepterId 由服务端认证填入
    const grant = await acceptInvite(serviceFetch, {
      token: body.token,
      accepterId: user.id,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.grants/1",
      grant,
    });
  } catch (error) {
    return grantErrorResponse(error, "Unable to accept invite.");
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
