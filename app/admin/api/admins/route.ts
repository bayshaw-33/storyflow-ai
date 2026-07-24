import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminRoleRow = { user_id: string; role: string; created_at: string; updated_at: string };
type AuthUser = { id: string; email?: string };

export async function GET(request: Request) {
  try {
    await requireAdminRole(request, "super_admin");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const roles = await serviceFetch<AdminRoleRow[]>(
      "/rest/v1/storyflow_admin_roles?select=user_id,role,created_at,updated_at&order=created_at.asc"
    );
    const userIds = roles.map((r) => r.user_id);
    // 批量查 email（auth admin api 只支持单查，这里逐个查；量小可接受）
    const authUsers = await Promise.all(
      userIds.map((uid) =>
        serviceFetch<AuthUser | { error: string }>(`/auth/v1/admin/users/${encodeURIComponent(uid)}`).catch(() => null)
      )
    );
    const emailById = new Map<string, string>();
    authUsers.forEach((u, i) => {
      if (u && "id" in u) emailById.set(userIds[i], u.email || "");
    });

    const rows = roles.map((r) => ({
      userId: r.user_id,
      email: emailById.get(r.user_id) || "",
      role: r.role,
      createdAt: r.created_at,
    }));
    return Response.json({ admins: rows });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminRole(request, "super_admin");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const body = await request.json().catch(() => ({}));
    const userId: string = body.userId;
    const role: string = body.role;
    if (!userId) return Response.json({ error: "MISSING_USER_ID" }, { status: 400 });
    if (!["super_admin", "operator", "viewer"].includes(role)) return Response.json({ error: "INVALID_ROLE" }, { status: 400 });

    await serviceFetch("/rest/v1/storyflow_admin_roles", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ user_id: userId, role, updated_by: admin.id }),
    });
    await writeAuditLog({
      adminUserId: admin.id,
      action: "admin.role.add",
      targetUserId: userId,
      payload: { role },
    });
    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
