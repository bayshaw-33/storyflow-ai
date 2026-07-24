import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { getSupabaseServerClient, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/actors/[actorId]/remove
 * 强制下架（管理员）。
 * Body: { reason: string }
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
    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    const now = new Date().toISOString();
    const { data, error } = await client
      .from("storyflow_actor_profiles")
      .update({
        listing_status: "removed",
        listing_removed_reason: reason || null,
        updated_at: now,
      })
      .eq("id", actorId)
      .select("id, name, owner_id, listing_status, listing_removed_reason")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ success: false, error: "演员不存在。", code: "ACTOR_NOT_FOUND" }, { status: 404 });
    }

    await writeAuditLog({
      adminUserId: admin.id,
      action: "actor.remove_listing",
      targetUserId: data.owner_id as string,
      payload: { actorId, reason, actorName: data.name },
    }).catch(() => undefined);

    return NextResponse.json({ success: true, actor: data });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
