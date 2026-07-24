import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TrendPoint = { date: string; count: number };
type DistributionPoint = { label: string; count: number };

type StatsResponse = {
  users: {
    total: number;
    newToday: number;
    banned: number;
    planDistribution: DistributionPoint[];
    registrationTrend: TrendPoint[];
  };
  generations: {
    textTotal: number;
    textCompleted: number;
    textFailed: number;
    successRate: number;
    jobTypeDistribution: DistributionPoint[];
    generationTrend: TrendPoint[];
  };
  credits: {
    totalBalance: number;
    avgBalance: number;
    lowBalanceUsers: number;
    monthlyLimitDistribution: DistributionPoint[];
  };
  content: {
    projectsTotal: number;
    projectStatusDistribution: DistributionPoint[];
    episodes: number;
    scenes: number;
    characters: number;
  };
  admin: {
    adminCount: number;
    roleDistribution: DistributionPoint[];
    auditLogLast24h: number;
    aiPromptsCount: number;
    aiPromptsLastUpdated: string | null;
  } | null;
};

/** 把 created_at 数组按日分组 count，补齐无数据日期为 0 */
function groupByDay(dates: string[], days: number): TrendPoint[] {
  const now = new Date();
  const result: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: 0 });
  }
  const map = new Map(result.map((p, i) => [p.date, i]));
  for (const ts of dates) {
    const key = ts.slice(0, 10);
    const idx = map.get(key);
    if (idx !== undefined) result[idx].count++;
  }
  return result;
}

/** PostgREST count via Prefer: count=exact + Range: 0-0 */
async function countTable(table: string, filter?: string): Promise<number> {
  const path = `/rest/v1/${table}?select=*&limit=1${filter ? "&" + filter : ""}`;
  const resp = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}${path}`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
    }
  );
  const range = resp.headers.get("content-range");
  if (range) {
    const slash = range.indexOf("/");
    if (slash >= 0) return parseInt(range.slice(slash + 1), 10) || 0;
  }
  return 0;
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAdminRole(request, "viewer");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }

    const url = new URL(request.url);
    const rangeParam = url.searchParams.get("range") === "30" ? 30 : 7;
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - rangeParam);
    const sinceIso = since.toISOString();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    // 用户模块
    type AuthUser = { id: string; created_at?: string; banned_until?: string | null };
    const [profiles, credits, authUsers, genTasks, genJobs, projects, episodes, scenes, characters] = await Promise.all([
      serviceFetch<Array<{ plan: string }>>("/rest/v1/storyflow_profiles?select=plan"),
      serviceFetch<Array<{ balance: number; monthly_limit: number }>>("/rest/v1/storyflow_credits?select=balance,monthly_limit"),
      serviceFetch<{ users?: AuthUser[] }>("/auth/v1/admin/users?per_page=1000"),
      serviceFetch<Array<{ status: string; created_at: string }>>(`/rest/v1/storyflow_generation_tasks?select=status,created_at&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.asc&limit=10000`),
      serviceFetch<Array<{ job_type: string; created_at: string }>>(`/rest/v1/storyflow_generation_jobs?select=job_type,created_at&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.asc&limit=10000`),
      serviceFetch<Array<{ status: string }>>("/rest/v1/storyflow_projects?select=status&deleted_at=is.null"),
      countTable("storyflow_episodes"),
      countTable("storyflow_scenes"),
      countTable("storyflow_characters"),
    ]);

    // 用户统计
    const allUsers = authUsers?.users || [];
    const total = allUsers.length;
    const newToday = allUsers.filter((u) => u.created_at && u.created_at >= todayIso).length;
    const banned = allUsers.filter((u) => u.banned_until && u.banned_until > new Date().toISOString()).length;
    const planMap = new Map<string, number>();
    for (const p of profiles) planMap.set(p.plan, (planMap.get(p.plan) || 0) + 1);
    const planDistribution = Array.from(planMap, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    const registrationTrend = groupByDay(allUsers.map((u) => u.created_at || "").filter(Boolean), rangeParam);

    // 生成统计
    const textTotal = genTasks.length;
    const textCompleted = genTasks.filter((t) => t.status === "completed").length;
    const textFailed = genTasks.filter((t) => t.status === "failed").length;
    const successRate = textTotal > 0 ? Math.round((textCompleted / textTotal) * 100) : 0;
    const jobTypeMap = new Map<string, number>();
    for (const j of genJobs) jobTypeMap.set(j.job_type, (jobTypeMap.get(j.job_type) || 0) + 1);
    const jobTypeDistribution = Array.from(jobTypeMap, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    const generationTrend = groupByDay(genTasks.map((t) => t.created_at), rangeParam);

    // 额度统计
    const totalBalance = credits.reduce((s, c) => s + (c.balance || 0), 0);
    const avgBalance = credits.length > 0 ? Math.round(totalBalance / credits.length) : 0;
    const lowBalanceUsers = credits.filter((c) => c.monthly_limit > 0 && c.balance < c.monthly_limit * 0.1).length;
    const limitMap = new Map<number, number>();
    for (const c of credits) limitMap.set(c.monthly_limit, (limitMap.get(c.monthly_limit) || 0) + 1);
    const monthlyLimitDistribution = Array.from(limitMap, ([label, count]) => ({ label: String(label), count })).sort((a, b) => Number(a.label) - Number(b.label));

    // 内容统计
    const projectStatusMap = new Map<string, number>();
    for (const p of projects) projectStatusMap.set(p.status, (projectStatusMap.get(p.status) || 0) + 1);
    const projectStatusDistribution = Array.from(projectStatusMap, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    const projectsTotal = projects.length;

    // 管理模块（仅 super_admin）
    let adminSection: StatsResponse["admin"] = null;
    if (ctx.role === "super_admin") {
      const [adminRoles, auditLogs, aiPrompts] = await Promise.all([
        serviceFetch<Array<{ role: string }>>("/rest/v1/storyflow_admin_roles?select=role"),
        serviceFetch<Array<{ created_at: string }>>("/rest/v1/storyflow_admin_audit_log?select=created_at&created_at=gte." + encodeURIComponent(new Date(Date.now() - 86400000).toISOString())),
        serviceFetch<Array<{ updated_at: string }>>("/rest/v1/storyflow_ai_prompts?select=updated_at&order=updated_at.desc&limit=1"),
      ]);
      const roleMap = new Map<string, number>();
      for (const r of adminRoles) roleMap.set(r.role, (roleMap.get(r.role) || 0) + 1);
      const roleDistribution = Array.from(roleMap, ([label, count]) => ({ label, count }));
      adminSection = {
        adminCount: adminRoles.length,
        roleDistribution,
        auditLogLast24h: auditLogs.length,
        aiPromptsCount: await countTable("storyflow_ai_prompts"),
        aiPromptsLastUpdated: aiPrompts[0]?.updated_at || null,
      };
    }

    const response: StatsResponse = {
      users: { total, newToday, banned, planDistribution, registrationTrend },
      generations: { textTotal, textCompleted, textFailed, successRate, jobTypeDistribution, generationTrend },
      credits: { totalBalance, avgBalance, lowBalanceUsers, monthlyLimitDistribution },
      content: { projectsTotal, projectStatusDistribution, episodes, scenes, characters },
      admin: adminSection,
    };

    return Response.json(response);
  } catch (err) {
    return adminErrorResponse(err);
  }
}
