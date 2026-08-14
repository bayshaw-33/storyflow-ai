import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  getEntitlements,
  getActivePlanTier,
  hasFeature as hasFeatureService,
} from "@/lib/server/v2/billing/entitlements";
import { BillingServiceError } from "@/lib/server/v2/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/billing/entitlements — 查询当前用户的权益 (BI-008)
 *
 * BI-008: plan entitlement 只由服务器读取 webhook 同步状态
 *   - 客户端不持有 entitlement 判定逻辑
 *   - 权益查询通过 API 调用服务器, 服务器读取 webhook 同步的订阅状态
 *   - 服务器返回 plan tier 和有效权益列表
 *
 * query:
 *   - feature=<key>: 检查是否拥有某权益 (返回 { hasFeature: boolean })
 *   - planTier=true: 只返回当前 plan tier (返回 { planTier: "free" | "creator" | "pro" | "enterprise" })
 *   - 无 query: 返回所有有效权益列表
 *
 * 默认 (无订阅): 返回 free tier 权益 (active=true)
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

    const url = new URL(request.url);
    const featureQuery = url.searchParams.get("feature");
    const planTierOnly = url.searchParams.get("planTier") === "true";

    // BI-008: 客户端无法伪造 — 服务器读取 webhook 同步状态
    if (featureQuery) {
      const has = await hasFeatureService(serviceFetch, user.id, featureQuery);
      return NextResponse.json({
        success: true,
        contractVersion: "kiikis.billing.entitlement/1",
        feature: featureQuery,
        hasFeature: has,
      });
    }

    if (planTierOnly) {
      const planTier = await getActivePlanTier(serviceFetch, user.id);
      return NextResponse.json({
        success: true,
        contractVersion: "kiikis.billing.entitlement/1",
        planTier,
      });
    }

    const entitlements = await getEntitlements(serviceFetch, user.id);

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.billing.entitlement/1",
      entitlements,
    });
  } catch (error) {
    return billingErrorResponse(error, "Unable to read entitlements.");
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
