// app/admin/api/users/[userId]/ban/route.ts
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
    const body = await request.json().catch(() => ({}));
    // duration: "24h" / "7d" / "permanent"(87600h=10年)
    const duration: string = body.duration || "24h";

    await serviceFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify({ ban_duration: duration }),
    });

    await writeAuditLog({
      adminUserId: admin.id,
      action: "user.ban",
      targetUserId: userId,
      payload: { duration },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
