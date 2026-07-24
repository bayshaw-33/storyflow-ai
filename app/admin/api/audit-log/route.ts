import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuditRow = {
  id: string; admin_user_id: string; action: string;
  target_user_id: string | null; target_ref: string | null;
  payload: unknown; created_at: string;
};
type AuthUser = { id: string; email?: string };

export async function GET(request: Request) {
  try {
    await requireAdminRole(request, "super_admin");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "";
    const adminId = url.searchParams.get("admin_id") || "";
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || "50")));
    const offset = (page - 1) * pageSize;

    let query = "/rest/v1/storyflow_admin_audit_log?select=*&order=created_at.desc";
    const filters: string[] = [];
    if (action) filters.push(`action=eq.${encodeURIComponent(action)}`);
    if (adminId) filters.push(`admin_user_id=eq.${encodeURIComponent(adminId)}`);
    if (filters.length) query += "&" + filters.join("&");
    query += `&limit=${pageSize}&offset=${offset}`;

    const rows = await serviceFetch<AuditRow[]>(query);

    // 批量查 admin email
    const adminIds = [...new Set(rows.map((r) => r.admin_user_id))];
    const authUsers = await Promise.all(
      adminIds.map((uid) =>
        serviceFetch<AuthUser | { error: string }>(`/auth/v1/admin/users/${encodeURIComponent(uid)}`).catch(() => null)
      )
    );
    const emailById = new Map<string, string>();
    adminIds.forEach((uid, i) => {
      const u = authUsers[i];
      if (u && "id" in u) emailById.set(uid, u.email || "");
    });

    const result = rows.map((r) => ({
      ...r,
      adminEmail: emailById.get(r.admin_user_id) || "",
    }));
    return Response.json({ logs: result, page, pageSize });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
