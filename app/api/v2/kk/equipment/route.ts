import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  equipItem,
  listEquipmentHistory,
  getNetEntitlements,
  kkProfileErrorResponse,
} from "@/lib/server/v2/kk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/kk/equipment — 列出装备历史 (K21-KK-022)
 *   query: limit (默认 50, 最大 200)
 *   返回: { entitlements: 当前净持有, equipmentHistory: 装备历史 }
 *
 * POST /api/v2/kk/equipment — 装备 item (K21-KK-022)
 *   body: { itemId, itemVersion }
 *   调用 RPC equip_kk_item，内部校验 ledger 净持有
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "KK service not configured (K21-KK-002).", code: "service_unavailable" },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.min(Math.max(limitRaw ? parseInt(limitRaw, 10) : 50, 1), 200);

    const entitlements = await getNetEntitlements(serviceFetch, user.id);
    const equipmentHistory = await listEquipmentHistory(serviceFetch, user.id, { limit });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.kk-runtime/1",
      entitlements,
      equipmentHistory,
    });
  } catch (error) {
    return kkProfileErrorResponse(error, "Unable to fetch KK equipment.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "KK service not configured (K21-KK-002).", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const body = await request.json().catch(() => ({}));
    if (!body.itemId || !body.itemVersion) {
      return NextResponse.json(
        { success: false, error: "itemId and itemVersion are required.", code: "validation_failed" },
        { status: 422 },
      );
    }

    // 调用服务层装备 (内部走 RPC equip_kk_item，含 ledger 净持有校验)
    await equipItem(serviceFetch, user.id, body.itemId, body.itemVersion);

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.kk-runtime/1",
      equipped: { itemId: body.itemId, itemVersion: body.itemVersion },
    });
  } catch (error) {
    return kkProfileErrorResponse(error, "Unable to equip KK item.");
  }
}
