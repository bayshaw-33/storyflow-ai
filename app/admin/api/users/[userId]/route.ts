import { requireAdminRole, adminErrorResponse, AdminAuthError } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = { user_id: string; email: string | null; display_name: string | null; plan: string; created_at: string; updated_at: string };
type CreditRow = { user_id: string; balance: number; monthly_limit: number; period_start: string; period_end: string };
type AuthUser = { id: string; email?: string; created_at?: string; last_sign_in_at?: string; banned_until?: string | null };
type TaskRow = { id: string; step_key: string; status: string; created_at: string; completed_at: string | null };

export async function GET(request: Request, ctx: { params: { userId: string } }) {
  try {
    await requireAdminRole(request, "viewer");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const userId = ctx.params.userId;

    const [profiles, credits, authResp, tasks] = await Promise.all([
      serviceFetch<ProfileRow[]>(
        `/rest/v1/storyflow_profiles?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`
      ),
      serviceFetch<CreditRow[]>(
        `/rest/v1/storyflow_credits?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`
      ),
      serviceFetch<AuthUser | { error: string }>(
        `/auth/v1/admin/users/${encodeURIComponent(userId)}`
      ).catch(() => null),
      serviceFetch<TaskRow[]>(
        `/rest/v1/storyflow_generation_tasks?user_id=eq.${encodeURIComponent(userId)}&select=id,step_key,status,created_at,completed_at&order=created_at.desc&limit=20`
      ),
    ]);

    const profile = profiles[0];
    const credit = credits[0];
    const auth = authResp && "id" in authResp ? authResp : null;

    if (!profile && !auth) {
      return Response.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    const bannedUntil = auth?.banned_until;
    const isBanned = Boolean(bannedUntil) && new Date(bannedUntil!).getTime() > Date.now();

    return Response.json({
      userId,
      email: profile?.email || auth?.email || "",
      displayName: profile?.display_name ?? null,
      plan: profile?.plan ?? "free",
      createdAt: profile?.created_at ?? auth?.created_at ?? null,
      updatedAt: profile?.updated_at ?? null,
      lastSignInAt: auth?.last_sign_in_at ?? null,
      balance: credit?.balance ?? null,
      monthlyLimit: credit?.monthly_limit ?? null,
      periodStart: credit?.period_start ?? null,
      periodEnd: credit?.period_end ?? null,
      status: isBanned ? "banned" : "active",
      bannedUntil: bannedUntil ?? null,
      recentTasks: tasks,
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function PATCH(request: Request, ctx: { params: { userId: string } }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const userId = ctx.params.userId;
    const body = await request.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    if (typeof body.displayName === "string") patch.display_name = body.displayName;
    if (typeof body.plan === "string") patch.plan = body.plan;
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "NO_FIELDS" }, { status: 400 });
    }

    // 读旧值供审计
    const before = await serviceFetch<ProfileRow[]>(
      `/rest/v1/storyflow_profiles?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`
    );
    const beforeRow = before[0];

    patch.updated_at = new Date().toISOString();
    await serviceFetch(`/rest/v1/storyflow_profiles?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
      headers: { Prefer: "return=representation" },
    });

    await writeAuditLog({
      adminUserId: admin.id,
      action: "user.profile.update",
      targetUserId: userId,
      payload: { before: beforeRow, after: patch },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
