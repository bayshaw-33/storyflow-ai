import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { cancelSubscriptionAtPeriodEnd, recordSubscriptionCanceled } from "@/lib/server/v2/billing/portal";
import { BillingServiceError } from "@/lib/server/v2/billing/stripe";
import { parseSubscription, type SubscriptionRow } from "@/lib/contracts/v2/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v2/billing/cancel — 取消订阅 (BI-009 等价方案)
 *
 * BI-009: Portal 不可用时的等价端点
 *   - 将订阅标记为 cancel_at_period_end=true (在当前周期结束时取消)
 *   - 不立即取消, 用户在周期结束前可继续使用
 *   - 也会触发 customer.subscription.updated webhook, 由 webhook 同步状态
 *
 * 无 body 参数 (取消当前用户的活跃订阅)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Billing service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }

    // 查询用户当前订阅
    const rows = await serviceFetch<SubscriptionRow[]>(
      `/rest/v1/storyflow_subscriptions?user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
      { headers: { Accept: "application/json" } },
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No active subscription found.",
          code: "not_found",
        },
        { status: 404 },
      );
    }

    const subscription = parseSubscription(rows[0]);

    if (!subscription.stripeSubscriptionId) {
      return NextResponse.json(
        {
          success: false,
          error: "Subscription has no Stripe subscription ID (cannot cancel).",
          code: "validation_failed",
        },
        { status: 400 },
      );
    }

    if (subscription.status === "canceled" || subscription.status === "ended") {
      return NextResponse.json(
        {
          success: false,
          error: "Subscription is already canceled.",
          code: "validation_failed",
        },
        { status: 409 },
      );
    }

    // BI-009: 调用 Stripe API 取消订阅 (cancel_at_period_end=true)
    const result = await cancelSubscriptionAtPeriodEnd(subscription.stripeSubscriptionId);

    // BI-010: 记录取消事件 (异步, 失败不影响主流程)
    await recordSubscriptionCanceled(serviceFetch, {
      userId: user.id,
      subscriptionId: subscription.stripeSubscriptionId,
      cancelAtPeriodEnd: result.cancelAtPeriodEnd,
      currentPeriodEnd: result.currentPeriodEnd,
    }).catch(() => {
      // 审计日志失败不阻塞取消操作
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.billing.cancel/1",
      result: {
        stripeSubscriptionId: result.stripeSubscriptionId,
        cancelAtPeriodEnd: result.cancelAtPeriodEnd,
        currentPeriodEnd: result.currentPeriodEnd,
      },
    });
  } catch (error) {
    return billingErrorResponse(error, "Unable to cancel subscription.");
  }
}

function billingErrorResponse(error: unknown, fallback: string) {
  if (error instanceof BillingServiceError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
  }
  return NextResponse.json(
    { success: false, error: fallback, code: "service_unavailable" },
    { status: 503 },
  );
}
