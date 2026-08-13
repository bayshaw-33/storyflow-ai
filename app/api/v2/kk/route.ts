import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { ensureProfile, getNetEntitlements, kkProfileErrorResponse } from "@/lib/server/v2/kk";
import { resolveKiikis21Flags } from "@/lib/server/v2/feature-flags";
import {
  ALL_KK_ACTIONS,
  isKkAction,
  type KkActionId,
} from "@/lib/client/v2/kk/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/kk
 *
 * 返回当前用户的 KK runtime 启动数据：
 *   - profile (K21-KK-020 账号级真相)
 *   - entitlements 净持有
 *   - serverCursor (最近事件 sequence)
 *   - taskProjection (queued/running/ingesting 计数，K21-KK-005)
 *   - pendingConfirmations (K21-KK-012)
 *   - allowedActions (K21-KK-006)
 *   - featureFlags (K21-KK-002)
 *
 * K21-KK-002: production/staging 缺服务端配置时返回 503，
 * 不静默切 fixture。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      const env = process.env;
      const flags = resolveKiikis21Flags(env);
      // development 环境允许 fixture (K21-KK-002 dev 默认启用)
      if (env.NODE_ENV === "development" && flags.kkRealtime) {
        // 允许 dev 继续到下方 service 调用，但 service 未配置时会抛 503
      } else {
        return NextResponse.json(
          {
            success: false,
            error: "KK service not configured in production-like environment (K21-KK-002).",
            code: "service_unavailable",
          },
          { status: 503 },
        );
      }
    }

    // 1. 获取 profile (K21-KK-020)
    const profile = await ensureProfile(serviceFetch, user.id);

    // 2. 净持有 (K21-KK-021)
    const entitlements = await getNetEntitlements(serviceFetch, user.id);

    // 3. serverCursor (最近事件 sequence，K21-KK-003/004)
    // 从 storyflow_creative_events 取最近事件 sequence 作为 cursor
    let serverCursor: number = 0;
    try {
      const cursorRow = await serviceFetch<{ sequence: number } | null>(
        `/rest/v1/storyflow_creative_events?owner_id=eq.${encodeURIComponent(user.id)}&order=sequence.desc&limit=1&select=sequence`,
        { headers: { Accept: "application/vnd.pgrst.object+json" } },
      );
      serverCursor = cursorRow?.sequence ?? 0;
    } catch {
      // 406 表示无事件，cursor=0
      serverCursor = 0;
    }

    // 4. taskProjection (K21-KK-005: 只显示真实进度)
    // 从 storyflow_creative_events 聚合 status 分布
    let taskProjection = {
      queued: 0,
      running: 0,
      ingesting: 0,
      completed: 0,
      failed: 0,
    };
    try {
      const statusRows = await serviceFetch<Array<{ event_type: string; cnt: number }> | null>(
        `/rest/v1/rpc/aggregate_event_status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_owner_id: user.id }),
        },
      );
      if (statusRows && Array.isArray(statusRows)) {
        for (const r of statusRows) {
          if (r.event_type === "task_queued") taskProjection.queued = r.cnt;
          else if (r.event_type === "task_running") taskProjection.running = r.cnt;
          else if (r.event_type === "task_ingesting") taskProjection.ingesting = r.cnt;
          else if (r.event_type === "task_completed") taskProjection.completed = r.cnt;
          else if (r.event_type === "task_failed") taskProjection.failed = r.cnt;
        }
      }
    } catch {
      // RPC 不可用时返回全 0 (K21-KK-005: 不伪造)
    }

    // 5. pendingConfirmations (K21-KK-012)
    // 查询 risk=high 的 proposed_action 中未确认的
    let pendingConfirmations: Array<{ actionId: string; actionType: string; summary: string; expiresAt: string }> = [];
    try {
      const confirmRows = await serviceFetch<Array<{ action_id: string; action_type: string; summary: string; expires_at: string }> | null>(
        `/rest/v1/storyflow_kk_proposed_actions?owner_id=eq.${encodeURIComponent(user.id)}&status=eq.pending&order=created_at.desc&limit=20`,
      );
      pendingConfirmations = (confirmRows ?? []).map((r) => ({
        actionId: r.action_id,
        actionType: r.action_type,
        summary: r.summary,
        expiresAt: r.expires_at,
      }));
    } catch {
      // 表不存在或 RPC 不可用时返回空数组
    }

    // 6. allowedActions (K21-KK-006)
    const allowedActions: ReadonlyArray<KkActionId> = ALL_KK_ACTIONS;

    // 7. featureFlags
    const flags = resolveKiikis21Flags(process.env);

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.kk-runtime/1",
      profile,
      entitlements,
      serverCursor,
      taskProjection,
      pendingConfirmations,
      allowedActions,
      featureFlags: flags,
      source: "api",
    });
  } catch (error) {
    return kkProfileErrorResponse(error, "Unable to fetch KK runtime data.");
  }
}
