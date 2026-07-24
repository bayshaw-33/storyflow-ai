import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TARGET_TYPES = ["creative_document", "asset", "actor_profile"];
const VALID_ACTIONS = ["approve", "reject", "takedown", "restore"];

const ACTION_TO_STATUS: Record<string, string> = {
  approve: "approved",
  reject: "rejected",
  takedown: "taken_down",
  restore: "approved",
};

type ModerationRow = {
  id: string;
  target_type: string;
  target_id: string;
  moderation_status: string;
  action: string;
  moderated_by: string | null;
  moderation_reason: string;
  report_id: string | null;
  created_at: string;
};

export async function POST(
  request: Request,
  ctx: { params: Promise<{ targetType: string; targetId: string }> }
) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }

    const { targetType, targetId } = await ctx.params;
    if (!VALID_TARGET_TYPES.includes(targetType)) {
      return Response.json({ error: "INVALID_TARGET_TYPE" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action as string;
    const reason = (body.reason as string) || "";
    const reportId = body.reportId as string | undefined;

    if (!VALID_ACTIONS.includes(action)) {
      return Response.json({ error: "INVALID_ACTION" }, { status: 400 });
    }

    if (action === "restore") {
      // restore: 查最新 taken_down 记录，新增 approved 记录
      const takenDown = await serviceFetch<ModerationRow[]>(
        `/rest/v1/storyflow_content_moderation?select=id,target_type,target_id,moderation_status,action,moderated_by,moderation_reason,report_id,created_at&target_type=eq.${encodeURIComponent(targetType)}&target_id=eq.${encodeURIComponent(targetId)}&moderation_status=eq.taken_down&order=created_at.desc&limit=1`
      );
      if (takenDown.length === 0) {
        return Response.json({ error: "NO_TAKEN_DOWN_RECORD" }, { status: 404 });
      }
      const newRecord = await serviceFetch<ModerationRow>("/rest/v1/storyflow_content_moderation", {
        method: "POST",
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId,
          moderation_status: "approved",
          action: "restore",
          moderated_by: admin.id,
          moderation_reason: reason,
          report_id: null,
        }),
        headers: { Prefer: "return=representation" },
      });
      await writeAuditLog({
        adminUserId: admin.id,
        action: "content_moderate",
        targetRef: `${targetType}:${targetId}`,
        payload: { action: "restore", reason },
      });
      return Response.json({ moderation: newRecord });
    }

    // approve/reject/takedown: 更新 pending 记录
    const pending = await serviceFetch<ModerationRow[]>(
      `/rest/v1/storyflow_content_moderation?select=id,target_type,target_id,moderation_status,action,moderated_by,moderation_reason,report_id,created_at&target_type=eq.${encodeURIComponent(targetType)}&target_id=eq.${encodeURIComponent(targetId)}&moderation_status=eq.pending&limit=1`
    );
    if (pending.length === 0) {
      return Response.json({ error: "NO_PENDING_MODERATION" }, { status: 404 });
    }

    const newStatus = ACTION_TO_STATUS[action];
    const updated = await serviceFetch<ModerationRow>(
      `/rest/v1/storyflow_content_moderation?id=eq.${pending[0].id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          moderation_status: newStatus,
          action,
          moderated_by: admin.id,
          moderation_reason: reason,
        }),
        headers: { Prefer: "return=representation" },
      }
    );

    // 关联举报标记为 resolved
    const rid = reportId || pending[0].report_id;
    if (rid) {
      await serviceFetch(`/rest/v1/storyflow_content_reports?id=eq.${encodeURIComponent(rid as string)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved" }),
      });
    }

    await writeAuditLog({
      adminUserId: admin.id,
      action: "content_moderate",
      targetRef: `${targetType}:${targetId}`,
      payload: { action, reason, reportId: rid || null },
    });

    return Response.json({ moderation: updated });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
