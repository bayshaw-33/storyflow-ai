import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { getSupabaseServerClient, hasServiceRoleConfig } from "@/lib/supabase/server";
import { getAdminListings, type ListingStatus } from "@/lib/supabase/marketplace-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/actors/listings?status=listed|delisted|removed&cursor=0&limit=12
 * 管理员查看所有上架演员。
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const client = getSupabaseServerClient();
    if (!client) {
      return NextResponse.json({ success: false, error: "服务端 Supabase client 不可用。" }, { status: 503 });
    }

    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const limitRaw = Number(url.searchParams.get("limit") || "12");
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 50 ? limitRaw : 12;
    const statusParam = url.searchParams.get("status");
    const status = (statusParam === "listed" || statusParam === "delisted" || statusParam === "removed" || statusParam === "unlisted")
      ? (statusParam as ListingStatus)
      : undefined;

    const result = await getAdminListings(client, cursor, limit, status);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
