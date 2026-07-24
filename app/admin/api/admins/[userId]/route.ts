import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireAdminRole(request, "super_admin");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const { userId } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const role: string = body.role;
    if (!["super_admin", "operator", "viewer"].includes(role)) return Response.json({ error: "INVALID_ROLE" }, { status: 400 });

    await serviceFetch(`/rest/v1/storyflow_admin_roles?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ role, updated_at: new Date().toISOString(), updated_by: admin.id }),
    });
    await writeAuditLog({
      adminUserId: admin.id,
      action: "admin.role.update",
      targetUserId: userId,
      payload: { role },
    });
    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireAdminRole(request, "super_admin");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const { userId } = await ctx.params;
    if (userId === admin.id) return Response.json({ error: "CANNOT_REMOVE_SELF" }, { status: 400 });

    await serviceFetch(`/rest/v1/storyflow_admin_roles?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    await writeAuditLog({
      adminUserId: admin.id,
      action: "admin.role.remove",
      targetUserId: userId,
      payload: {},
    });
    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
