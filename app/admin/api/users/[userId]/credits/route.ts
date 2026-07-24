// app/admin/api/users/[userId]/credits/route.ts
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: { userId: string } }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const userId = ctx.params.userId;
    const body = await request.json().catch(() => ({}));
    const mode: string = body.mode || ""; // "adjust" | "reset"
    const delta: number = Number(body.delta) || 0;

    const existing = await serviceFetch<Array<{ user_id: string; balance: number; monthly_limit: number }>>(
      `/rest/v1/storyflow_credits?user_id=eq.${encodeURIComponent(userId)}&select=user_id,balance,monthly_limit&limit=1`
    );
    const account = existing[0];
    if (!account) {
      return Response.json({ error: "CREDIT_ACCOUNT_NOT_FOUND" }, { status: 404 });
    }

    let newBalance: number;
    if (mode === "reset") {
      newBalance = account.monthly_limit;
    } else if (mode === "adjust") {
      newBalance = account.balance + delta;
      if (newBalance < 0) newBalance = 0;
    } else {
      return Response.json({ error: "INVALID_MODE" }, { status: 400 });
    }

    await serviceFetch(`/rest/v1/storyflow_credits?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ balance: newBalance, updated_at: new Date().toISOString() }),
    });

    await writeAuditLog({
      adminUserId: admin.id,
      action: "user.credits.adjust",
      targetUserId: userId,
      payload: { before: { balance: account.balance }, after: { balance: newBalance }, mode, delta },
    });

    return Response.json({ ok: true, balance: newBalance });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
