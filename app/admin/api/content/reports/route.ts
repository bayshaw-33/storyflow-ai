import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportRow = {
  id: string;
  reporter_user_id: string;
  target_type: string;
  target_id: string;
  reason_category: string;
  reason_detail: string;
  status: string;
  created_at: string;
};

type ModerationRow = {
  target_type: string;
  target_id: string;
  moderation_status: string;
};

export async function GET(request: Request) {
  try {
    await requireAdminRole(request, "viewer");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "pending";
    const targetType = url.searchParams.get("targetType") || "";
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize") || "50")));
    const offset = (page - 1) * pageSize;

    let query = `/rest/v1/storyflow_content_reports?select=id,reporter_user_id,target_type,target_id,reason_category,reason_detail,status,created_at&order=created_at.desc&limit=${pageSize}&offset=${offset}`;
    const filters: string[] = [];
    if (status === "pending" || status === "resolved") filters.push(`status=eq.${status}`);
    if (targetType) filters.push(`target_type=eq.${encodeURIComponent(targetType)}`);
    if (filters.length) query += "&" + filters.join("&");

    const reports = await serviceFetch<ReportRow[]>(query);

    // 批量取关联的 moderation 状态（仅 pending 的）
    const moderationMap = new Map<string, string>();
    if (reports.length > 0) {
      const modFilters = reports
        .map((r) => `(target_type.eq.${r.target_type},target_id.eq.${encodeURIComponent(r.target_id)})`)
        .join(",");
      const mods = await serviceFetch<ModerationRow[]>(
        `/rest/v1/storyflow_content_moderation?select=target_type,target_id,moderation_status&or=${modFilters}&moderation_status=eq.pending`
      );
      for (const m of mods) {
        moderationMap.set(`${m.target_type}:${m.target_id}`, m.moderation_status);
      }
    }

    // 取 reporter email
    const reporterIds = [...new Set(reports.map((r) => r.reporter_user_id))];
    const emailMap = new Map<string, string>();
    if (reporterIds.length > 0) {
      const { users } = await serviceFetch<{ users: Array<{ id: string; email?: string }> }>(
        `/auth/v1/admin/users?per_page=1000`
      );
      for (const u of users || []) {
        if (reporterIds.includes(u.id)) emailMap.set(u.id, u.email || "");
      }
    }

    // 总数（用 content-range header）
    let countQuery = `/rest/v1/storyflow_content_reports?select=*&limit=1`;
    const countFilters: string[] = [];
    if (status === "pending" || status === "resolved") countFilters.push(`status=eq.${status}`);
    if (targetType) countFilters.push(`target_type=eq.${encodeURIComponent(targetType)}`);
    if (countFilters.length) countQuery += "&" + countFilters.join("&");
    const countResp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}${countQuery}`, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
    });
    const range = countResp.headers.get("content-range");
    const total = range ? parseInt(range.slice(range.indexOf("/") + 1), 10) || 0 : 0;

    return Response.json({
      reports: reports.map((r) => ({
        id: r.id,
        reporterEmail: emailMap.get(r.reporter_user_id) || "",
        targetType: r.target_type,
        targetId: r.target_id,
        reasonCategory: r.reason_category,
        reasonDetail: r.reason_detail,
        status: r.status,
        createdAt: r.created_at,
        moderationStatus: moderationMap.get(`${r.target_type}:${r.target_id}`) || null,
      })),
      page,
      pageSize,
      total,
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
