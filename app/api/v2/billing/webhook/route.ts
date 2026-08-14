import { NextRequest, NextResponse } from "next/server";
import { hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  verifyWebhookSignature,
  processWebhookEvent,
} from "@/lib/server/v2/billing/webhook";
import { getStripeWebhookSecret, BillingServiceError } from "@/lib/server/v2/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// BI-004: 必须保留原始 raw body 用于验签, 不能让 Next 解析为 JSON
export const fetchCache = "force-no-store";

/**
 * POST /api/v2/billing/webhook — Stripe webhook 接收 (BI-004~008)
 *
 * BI-004: 使用原始 body + Stripe webhook secret 验签 (HMAC-SHA256)
 * BI-005: 按 Stripe event ID 幂等处理
 * BI-006: 拒绝用较旧事件覆盖较新订阅状态
 * BI-007: 同步 checkout/subscription/invoice/refund 生命周期
 * BI-008: 权益只由服务器读取 webhook 同步状态
 *
 * 无认证要求 (webhook 来自 Stripe, 通过签名验证身份)
 * 通过 Stripe-Signature header 验签: "t=timestamp,v1=signature"
 */
export async function POST(request: NextRequest) {
  if (!hasServiceRoleConfig()) {
    return NextResponse.json(
      { success: false, error: "Billing service not configured.", code: "service_unavailable" },
      { status: 503 },
    );
  }

  const secret = getStripeWebhookSecret();
  if (!secret) {
    return NextResponse.json(
      {
        success: false,
        error: "Stripe webhook secret not configured (BI-004).",
        code: "service_unavailable",
      },
      { status: 503 },
    );
  }

  // BI-004: 读取原始 raw body (非 parsed JSON)
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("Stripe-Signature") || "";

  // BI-004: 验证签名
  let verifyResult: { timestamp: number; valid: boolean };
  try {
    verifyResult = verifyWebhookSignature(rawBody, signatureHeader, secret);
  } catch (error) {
    const status = error instanceof BillingServiceError ? error.status : 400;
    const message = error instanceof Error ? error.message : "signature verification failed";
    return NextResponse.json(
      { success: false, error: message, code: "validation_failed" },
      { status },
    );
  }
  if (!verifyResult.valid) {
    return NextResponse.json(
      { success: false, error: "Invalid signature.", code: "validation_failed" },
      { status: 400 },
    );
  }

  // 解析事件 (验签通过后才能信任)
  let event: {
    id: string;
    type: string;
    created: number;
    data: { object: Record<string, unknown> };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body.", code: "validation_failed" },
      { status: 400 },
    );
  }

  if (!event.id || !event.type) {
    return NextResponse.json(
      { success: false, error: "Missing event id or type.", code: "validation_failed" },
      { status: 400 },
    );
  }

  // BI-005/006/007/008: 处理事件 (幂等 + 拒绝旧事件 + 同步生命周期 + 同步权益)
  const result = await processWebhookEvent(serviceFetch, event);

  // Stripe 要求 webhook 返回 200, 即使跳过重复事件
  return NextResponse.json(
    {
      success: true,
      received: true,
      eventId: event.id,
      eventType: event.type,
      processed: result.status,
      reason: result.reason,
    },
    { status: 200 },
  );
}
