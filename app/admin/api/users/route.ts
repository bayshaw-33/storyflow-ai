import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = { user_id: string; email: string | null; display_name: string | null; plan: string };
type CreditRow = { user_id: string; balance: number; monthly_limit: number };
type AuthUser = { id: string; email?: string; created_at?: string; banned_until?: string | null };

export async function GET(request: Request) {
  try {
    const ctx = await requireAdminRole(request, "viewer");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const plan = url.searchParams.get("plan") || "";
    const status = url.searchParams.get("status") || ""; // active | banned
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize") || "50")));
    const rangeStart = (page - 1) * pageSize;
    const rangeEnd = rangeStart + pageSize - 1;

    // 查 profiles（带筛选）
    let profileQuery = "/rest/v1/storyflow_profiles?select=user_id,email,display_name,plan";
    const filters: string[] = [];
    if (q) filters.push(`email=ilike.*${encodeURIComponent(q)}*`);
    if (plan) filters.push(`plan=eq.${encodeURIComponent(plan)}`);
    if (filters.length) profileQuery += "&" + filters.join("&");
    profileQuery += `&order=created_at.desc&limit=${pageSize}&offset=${rangeStart}`;
    const profileRangeHeader = `${rangeStart}-${rangeEnd}`;

    const [profiles, credits, authResp] = await Promise.all([
      serviceFetch<ProfileRow[]>(profileQuery, {
        headers: { Range: profileRangeHeader, Prefer: "count=exact" },
      }),
      serviceFetch<CreditRow[]>("/rest/v1/storyflow_credits?select=user_id,balance,monthly_limit"),
      serviceFetch<{ users?: AuthUser[] } | AuthUser[]>(
        "/auth/v1/admin/users?page=1&per_page=200"
      ),
    ]);

    const creditById = new Map(credits.map((c) => [c.user_id, c]));
    const authUsers = Array.isArray(authResp) ? authResp : authResp.users || [];
    const authById = new Map(authUsers.map((u) => [u.id, u]));

    // 合并 + 状态筛选（banned 状态来自 auth.users.banned_until）
    let rows = profiles.map((p) => {
      const auth = authById.get(p.user_id);
      const credit = creditById.get(p.user_id);
      const bannedUntil = auth?.banned_until;
      const isBanned = Boolean(bannedUntil) && new Date(bannedUntil!).getTime() > Date.now();
      return {
        userId: p.user_id,
        email: p.email || auth?.email || "",
        displayName: p.display_name,
        createdAt: auth?.created_at ?? null,
        plan: p.plan,
        balance: credit?.balance ?? null,
        monthlyLimit: credit?.monthly_limit ?? null,
        status: isBanned ? "banned" : "active",
        bannedUntil: bannedUntil ?? null,
      };
    });

    if (status === "active") rows = rows.filter((r) => r.status === "active");
    if (status === "banned") rows = rows.filter((r) => r.status === "banned");

    // total 来自 content-range header（serviceFetch 不返回 header，这里用 auth users 总数近似）
    const total = authUsers.length;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const newToday = authUsers.filter(
      (u) => u.created_at && new Date(u.created_at).getTime() >= todayStart.getTime()
    ).length;

    return Response.json({
      users: rows,
      page,
      pageSize,
      total,
      newToday,
      totalGenerations: 0, // Task 后续可补，需读 storyflow_generation_tasks count
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
