import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { getGrant, revokeGrant, GrantServiceError } from "@/lib/server/v2/grants/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/grants/[id] — grant 详情 (RG-003)
 * POST /api/v2/grants/[id]/revoke — 撤销 grant (RG-004: 不删除历史)
 *   body: { reason? }
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Grant service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const { id } = await params;
    const grant = await getGrant(serviceFetch, id);
    if (!grant) {
      return NextResponse.json({ success: false, error: "Grant not found.", code: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, contractVersion: "kiikis.grants/1", grant });
  } catch (error) {
    return grantErrorResponse(error, "Unable to fetch grant.");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Grant service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    // RG-004: 撤销只改 status, 不删除历史
    if (body.action === "revoke" || body.status === "revoked") {
      const grant = await revokeGrant(serviceFetch, {
        grantId: id,
        revokeReason: body.reason,
      });
      return NextResponse.json({ success: true, contractVersion: "kiikis.grants/1", grant });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported PATCH action. Use action=revoke.", code: "validation_failed" },
      { status: 422 },
    );
  } catch (error) {
    return grantErrorResponse(error, "Unable to update grant.");
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
