import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest, getSupabaseServerClient, hasServiceRoleConfig } from "@/lib/supabase/server";
import { executePurchase, PurchaseError, type PurchaseErrorCode } from "@/lib/marketplace/purchase-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERROR_STATUS: Record<PurchaseErrorCode, number> = {
  NOT_LISTED: 400,
  CANNOT_BUY_OWN: 400,
  ALREADY_PURCHASED: 409,
  INSUFFICIENT_BALANCE: 402,
  ACTOR_NOT_FOUND: 404,
  PROJECT_NOT_OWNED: 403,
};

/**
 * POST /api/actors/[actorId]/purchase
 * 购买演员。
 * Body: { project_id?: string|null, preview_only?: boolean }
 */
export async function POST(request: NextRequest, context: { params: Promise<{ actorId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "服务端缺少 SUPABASE_SERVICE_ROLE_KEY 配置。" }, { status: 503 });
    }
    const client = getSupabaseServerClient();
    if (!client) {
      return NextResponse.json({ success: false, error: "服务端 Supabase client 不可用。" }, { status: 503 });
    }

    const { actorId } = await context.params;
    const body = await request.json().catch(() => ({}));

    let projectId: string | null = null;
    if (body.project_id !== undefined && body.project_id !== null) {
      const pid = String(body.project_id);
      if (pid && pid !== "null") projectId = pid;
    }
    const previewOnly = Boolean(body.preview_only);

    const result = await executePurchase({
      serverClient: client,
      buyerId: user.id,
      actorId,
      projectId,
      previewOnly,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof PurchaseError) {
      const status = ERROR_STATUS[error.code] || 400;
      return NextResponse.json({ success: false, error: purchaseErrorMessage(error.code), code: error.code }, { status });
    }
    const message = error instanceof Error ? error.message : "";
    if (message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN") {
      return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
    }
    if (message.includes("SUPABASE_SERVICE_ERROR")) {
      return NextResponse.json({ success: false, error: "云端数据服务暂时不可用。" }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: "购买失败，请稍后重试。" }, { status: 500 });
  }
}

function purchaseErrorMessage(code: PurchaseErrorCode): string {
  switch (code) {
    case "NOT_LISTED": return "该演员未上架或已下架。";
    case "CANNOT_BUY_OWN": return "不能购买自己的演员。";
    case "ALREADY_PURCHASED": return "已购买过该演员，无需重复购买。";
    case "INSUFFICIENT_BALANCE": return "KK 币余额不足。";
    case "ACTOR_NOT_FOUND": return "演员不存在。";
    case "PROJECT_NOT_OWNED": return "项目不属于当前用户。";
    default: return "购买失败。";
  }
}
