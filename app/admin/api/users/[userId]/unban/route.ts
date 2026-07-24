// app/admin/api/users/[userId]/unban/route.ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const userId = (await ctx.params).userId;

    await serviceFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify({ ban_duration: "none" }),
    });

    await writeAuditLog({
      adminUserId: admin.id,
      action: "user.unban",
      targetUserId: userId,
      payload: {},
    });

    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
