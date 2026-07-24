import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ModerationRow = {
  id: string;
  target_type: string;
  target_id: string;
  moderation_status: string;
  report_id: string | null;
  created_at: string;
};

type ReportRow = {
  id: string;
  reporter_user_id: string;
  reason_category: string;
  reason_detail: string;
};

export async function GET(request: Request) {
  try {
    await requireAdminRole(request, "viewer");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }

    const url = new URL(request.url);
    const targetType = url.searchParams.get("targetType") || "";
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize") || "50")));
    const offset = (page - 1) * pageSize;

    let query = `/rest/v1/storyflow_content_moderation?select=id,target_type,target_id,moderation_status,report_id,created_at&moderation_status=eq.pending&order=created_at.asc&limit=${pageSize}&offset=${offset}`;
    if (targetType) query += `&target_type=eq.${encodeURIComponent(targetType)}`;

    const items = await serviceFetch<ModerationRow[]>(query);

    // 关联举报信息
    const reportIds = items.filter((i) => i.report_id).map((i) => i.report_id as string);
    const reportMap = new Map<string, ReportRow>();
    if (reportIds.length > 0) {
      const idFilter = reportIds.map((id) => `id=eq.${encodeURIComponent(id)}`).join(",");
      const reports = await serviceFetch<ReportRow[]>(
        `/rest/v1/storyflow_content_reports?select=id,reporter_user_id,reason_category,reason_detail&or=${idFilter}`
      );
      for (const r of reports) reportMap.set(r.id, r);
    }

    // 取 reporter email
    const reporterIds = [...new Set([...reportMap.values()].map((r) => r.reporter_user_id))];
    const emailMap = new Map<string, string>();
    if (reporterIds.length > 0) {
      const { users } = await serviceFetch<{ users: Array<{ id: string; email?: string }> }>(
        `/auth/v1/admin/users?per_page=1000`
      );
      for (const u of users || []) {
        if (reporterIds.includes(u.id)) emailMap.set(u.id, u.email || "");
      }
    }

    // 总数
    let countQuery = `/rest/v1/storyflow_content_moderation?select=*&moderation_status=eq.pending&limit=1`;
    if (targetType) countQuery += `&target_type=eq.${encodeURIComponent(targetType)}`;
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
      items: items.map((m) => {
        const report = m.report_id ? reportMap.get(m.report_id) : null;
        return {
          id: m.id,
          targetType: m.target_type,
          targetId: m.target_id,
          moderationStatus: m.moderation_status,
          reportId: m.report_id,
          createdAt: m.created_at,
          report: report
            ? {
                reporterEmail: emailMap.get(report.reporter_user_id) || "",
                reasonCategory: report.reason_category,
                reasonDetail: report.reason_detail,
              }
            : null,
        };
      }),
      page,
      pageSize,
      total,
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
