import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { parseSubscription, type SubscriptionRow } from "@/lib/contracts/v2/billing";
import { BillingServiceError } from "@/lib/server/v2/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/billing/subscription — 查询当前用户的订阅状态 (BI-008)
 *
 * BI-008: 客户端通过 API 调用服务器, 服务器读取 webhook 同步的订阅状态
 *   - 客户端不持有 entitlement 判定逻辑
 *   - 客户端无法伪造订阅状态 (RLS 限制: user_id = auth.uid())
 *
 * 返回: 当前用户的订阅记录 (无订阅时返回 null)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Billing service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }

    // BI-008: 服务器读取订阅状态 (RLS 限制: user_id = auth.uid())
    const rows = await serviceFetch<SubscriptionRow[]>(
      `/rest/v1/storyflow_subscriptions?user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
      { headers: { Accept: "application/json" } },
    );

    const subscription = rows && rows.length > 0 ? parseSubscription(rows[0]) : null;

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.billing.subscription/1",
      subscription,
    });
  } catch (error) {
    return billingErrorResponse(error, "Unable to read subscription.");
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
