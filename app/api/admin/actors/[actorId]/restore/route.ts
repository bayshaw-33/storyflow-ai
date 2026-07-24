import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { getSupabaseServerClient, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/actors/[actorId]/restore
 * 恢复上架（管理员，removed → listed）。
 */
export async function POST(request: NextRequest, context: { params: Promise<{ actorId: string }> }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const client = getSupabaseServerClient();
    if (!client) {
      return NextResponse.json({ success: false, error: "服务端 Supabase client 不可用。" }, { status: 503 });
    }

    const { actorId } = await context.params;

    // 仅 removed 状态可恢复
    const { data: existing, error: fetchErr } = await client
      .from("storyflow_actor_profiles")
      .select("id, owner_id, name, listing_status")
      .eq("id", actorId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) {
      return NextResponse.json({ success: false, error: "演员不存在。", code: "ACTOR_NOT_FOUND" }, { status: 404 });
    }
    if (existing.listing_status !== "removed") {
      return NextResponse.json({ success: false, error: "该演员未被平台下架，无需恢复。", code: "NOT_REMOVED" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data, error } = await client
      .from("storyflow_actor_profiles")
      .update({
        listing_status: "listed",
        listing_removed_reason: null,
        updated_at: now,
      })
      .eq("id", actorId)
      .select("id, name, owner_id, listing_status, listing_price_kk")
      .maybeSingle();

    if (error) throw error;

    await writeAuditLog({
      adminUserId: admin.id,
      action: "actor.restore_listing",
      targetUserId: existing.owner_id as string,
      payload: { actorId, actorName: existing.name },
    }).catch(() => undefined);

    return NextResponse.json({ success: true, actor: data });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
