import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { createCheckoutSession, BillingServiceError } from "@/lib/server/v2/billing/stripe";
import { getStripeWebhookSecret } from "@/lib/server/v2/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v2/billing/checkout — 创建 Stripe Checkout session (BI-002, BI-003)
 *
 * BI-002: 只创建允许列表内 price 的会话 (服务端校验白名单)
 * BI-003: success_url 指向"确认中"页面, 不直接授予权益
 *
 * body: { priceId, successUrl?, cancelUrl? }
 *   - successUrl 默认指向 /subscription?status=pending (BI-003: 不授予权益)
 *   - userId/userEmail 由服务端从认证用户注入, 不接受客户端传入 (RG-001 一致)
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

    // BI-004: webhook secret 必须配置 (checkout 后续依赖 webhook 授予权益)
    if (!getStripeWebhookSecret()) {
      return NextResponse.json(
        {
          success: false,
          error: "Stripe webhook secret not configured (BI-004).",
          code: "service_unavailable",
        },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => ({}));
    if (!body.priceId || typeof body.priceId !== "string") {
      return NextResponse.json(
        { success: false, error: "priceId is required.", code: "validation_failed" },
        { status: 400 },
      );
    }

    // BI-003: success_url 必须指向"确认中"页面, 默认 /subscription?status=pending
    const origin =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const successUrl =
      body.successUrl && typeof body.successUrl === "string"
        ? body.successUrl
        : `${origin}/subscription?status=pending&price=${encodeURIComponent(body.priceId)}`;
    const cancelUrl =
      body.cancelUrl && typeof body.cancelUrl === "string"
        ? body.cancelUrl
        : `${origin}/subscription?status=cancelled`;

    // BI-001: userId/userEmail 由服务端注入 (RG-001 一致)
    const session = await createCheckoutSession(serviceFetch, {
      priceId: body.priceId,
      userId: user.id,
      userEmail: user.email,
      successUrl,
      cancelUrl,
    });

    return NextResponse.json(
      {
        success: true,
        contractVersion: "kiikis.billing.checkout/1",
        session,
      },
      { status: 201 },
    );
  } catch (error) {
    return billingErrorResponse(error, "Unable to create checkout session.");
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
