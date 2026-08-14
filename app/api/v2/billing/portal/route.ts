import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { createCustomerPortalSession, recordPortalSessionCreated } from "@/lib/server/v2/billing/portal";
import { BillingServiceError } from "@/lib/server/v2/billing/stripe";
import { parseSubscription, type SubscriptionRow } from "@/lib/contracts/v2/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v2/billing/portal — 创建 Stripe Customer Portal session (BI-009)
 *
 * BI-009: 提供 Customer Portal 入口
 *   - 用户可通过 Portal 取消订阅、更新支付方式
 *   - Portal 不可用时返回 503, 客户端可改用 /api/v2/billing/cancel
 *
 * body: { returnUrl? }
 *   - returnUrl 默认 /settings/subscription
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

    const body = await request.json().catch(() => ({}));
    const origin =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const returnUrl =
      body.returnUrl && typeof body.returnUrl === "string"
        ? body.returnUrl
        : `${origin}/settings/subscription`;

    // 查询用户当前订阅 (获取 stripe_customer_id)
    const rows = await serviceFetch<SubscriptionRow[]>(
      `/rest/v1/storyflow_subscriptions?user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
      { headers: { Accept: "application/json" } },
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No active subscription found. Cannot open Customer Portal.",
          code: "not_found",
        },
        { status: 404 },
      );
    }

    const subscription = parseSubscription(rows[0]);

    // BI-009: 创建 Portal session
    const session = await createCustomerPortalSession(serviceFetch, {
      userId: user.id,
      stripeCustomerId: subscription.stripeCustomerId,
      returnUrl,
    });

    // BI-010: 记录 Portal session 创建事件 (异步, 失败不影响主流程)
    await recordPortalSessionCreated(serviceFetch, {
      userId: user.id,
      portalSessionId: session.id,
      customerId: session.customerId,
    }).catch(() => {
      // 审计日志失败不阻塞 Portal 跳转
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.billing.portal/1",
      session,
    });
  } catch (error) {
    return billingErrorResponse(error, "Unable to create Customer Portal session.");
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
