import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  createOwnershipTransfer,
  confirmOwnershipTransfer,
  cancelOwnershipTransfer,
  listOwnershipTransfers,
  GrantServiceError,
} from "@/lib/server/v2/grants/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v2/grants/transfer — 发起所有权转移 (RG-006: 双方确认)
 *   body: { resourceType, resourceId, toOwnerId }
 *   fromOwnerId 由服务端认证填入 (当前用户)
 *
 * PATCH /api/v2/grants/transfer — 确认或取消转移
 *   body: { transferId, action: "confirm" | "cancel" }
 *
 * GET /api/v2/grants/transfer — 列出资源的转移历史
 *   query: resourceType, resourceId
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Grant service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const body = await request.json().catch(() => ({}));

    // RG-001: fromOwnerId 由服务端认证填入
    const transfer = await createOwnershipTransfer(serviceFetch, {
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      fromOwnerId: user.id, // RG-001
      toOwnerId: body.toOwnerId,
      idempotencyKey: body.idempotencyKey || `transfer:${user.id}:${body.toOwnerId}:${body.resourceType}:${body.resourceId}:${Date.now()}`,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.grants/1",
      transfer,
    }, { status: 201 });
  } catch (error) {
    return grantErrorResponse(error, "Unable to create ownership transfer.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Grant service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const body = await request.json().catch(() => ({}));
    if (!body.transferId || !body.action) {
      return NextResponse.json(
        { success: false, error: "transferId and action are required.", code: "validation_failed" },
        { status: 422 },
      );
    }

    let transfer;
    if (body.action === "confirm") {
      // RG-006: to_owner 确认 (RPC 内部校验 auth.uid() == to_owner_id)
      transfer = await confirmOwnershipTransfer(serviceFetch, body.transferId);
    } else if (body.action === "cancel") {
      transfer = await cancelOwnershipTransfer(serviceFetch, body.transferId);
    } else {
      return NextResponse.json(
        { success: false, error: "action must be 'confirm' or 'cancel'.", code: "validation_failed" },
        { status: 422 },
      );
    }

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.grants/1",
      transfer,
    });
  } catch (error) {
    return grantErrorResponse(error, "Unable to update ownership transfer.");
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Grant service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const url = new URL(request.url);
    const resourceType = url.searchParams.get("resourceType");
    const resourceId = url.searchParams.get("resourceId");
    if (!resourceType || !resourceId) {
      return NextResponse.json(
        { success: false, error: "resourceType and resourceId are required.", code: "validation_failed" },
        { status: 422 },
      );
    }

    const transfers = await listOwnershipTransfers(serviceFetch, {
      resourceType: resourceType as never,
      resourceId,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.grants/1",
      transfers,
    });
  } catch (error) {
    return grantErrorResponse(error, "Unable to list ownership transfers.");
  }
}

function grantErrorResponse(error: unknown, fallback: string) {
  if (error instanceof GrantServiceError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
  }
  return NextResponse.json({ success: false, error: fallback, code: "service_unavailable" }, { status: 503 });
}
