import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

/**
 * 写一条审计日志。失败不抛错（审计不应阻断主操作）。
 */
export async function writeAuditLog(params: {
  adminUserId: string;
  action: string;
  targetUserId?: string | null;
  targetRef?: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  if (!hasServiceRoleConfig()) return;
  try {
    await serviceFetch("/rest/v1/storyflow_admin_audit_log", {
      method: "POST",
      body: JSON.stringify({
        admin_user_id: params.adminUserId,
        action: params.action,
        target_user_id: params.targetUserId ?? null,
        target_ref: params.targetRef ?? null,
        payload: params.payload ?? null,
      }),
    });
  } catch (err) {
    // 审计失败只记 console，不阻断业务
    console.error("[audit] writeAuditLog failed:", err);
  }
}
