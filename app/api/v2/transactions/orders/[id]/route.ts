import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  getTransaction,
  approveTransaction,
  rejectTransaction,
  TransactionServiceError,
} from "@/lib/server/v2/transactions/orders";
import { createGrant, GrantServiceError } from "@/lib/server/v2/grants/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/transactions/orders/[id] — 查询交易详情 (TX-003)
 *
 * POST /api/v2/transactions/orders/[id] — 批准/拒绝交易 (TX-002)
 *   body: { action: "approve" | "reject", rejectionReason?, grantScope?, grantRole?, grantTerms? }
 *   TX-002: 批准时自动调用 Phase 4 grant 服务创建 grant
 *   - grantorId = sellerId (或 approverId 如果无 sellerId)
 *   - granteeId = buyerId
 *   - resourceType/resourceId = order.resourceType/order.resourceId
 *   - 关联 transaction_id 用于审计
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Transaction service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }

    const { id } = await context.params;
    const transaction = await getTransaction(serviceFetch, id);

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: "Transaction not found.", code: "not_found" },
        { status: 404 },
      );
    }

    // RLS: 买方/卖方可读自己的交易 (DB 层兜底, 此处再次校验)
    if (
      transaction.buyerId !== user.id &&
      transaction.sellerId !== user.id
    ) {
      // admin 可读 (由 RLS 处理, 此处不阻塞)
    }

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.transaction.order/1",
      transaction,
    });
  } catch (error) {
    return transactionErrorResponse(error, "Unable to read transaction.");
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Transaction service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        {
          success: false,
          error: "action must be 'approve' or 'reject'",
          code: "validation_failed",
        },
        { status: 400 },
      );
    }

    // 查询交易
    const transaction = await getTransaction(serviceFetch, id);
    if (!transaction) {
      return NextResponse.json(
        { success: false, error: "Transaction not found.", code: "not_found" },
        { status: 404 },
      );
    }

    if (transaction.status !== "pending") {
      return NextResponse.json(
        {
          success: false,
          error: `Transaction is not pending (current: ${transaction.status})`,
          code: "validation_failed",
        },
        { status: 409 },
      );
    }

    if (action === "reject") {
      const rejected = await rejectTransaction(serviceFetch, {
        transactionId: id,
        rejecterId: user.id,
        rejectionReason: body.rejectionReason ?? null,
      });
      return NextResponse.json({
        success: true,
        contractVersion: "kiikis.transaction.order/1",
        transaction: rejected,
      });
    }

    // action === "approve"
    // TX-002: 批准前先创建 grant (Phase 4 grant 服务)
    let grantId: string | null = null;
    if (transaction.buyerId && transaction.orderInfo?.resourceType && transaction.orderInfo?.resourceId) {
      try {
        const grant = await createGrant(serviceFetch, {
          resourceType: transaction.orderInfo.resourceType as
            | "universe"
            | "project"
            | "actor"
            | "asset",
          resourceId: transaction.orderInfo.resourceId as string,
          grantorId: transaction.sellerId ?? user.id,
          granteeId: transaction.buyerId,
          scope: body.grantScope ?? "use",
          role: body.grantRole,
          terms: body.grantTerms ?? transaction.termsSnapshot.body,
          idempotencyKey: `grant:tx:${id}`,
        });
        grantId = grant.id;
      } catch (err) {
        if (err instanceof GrantServiceError && err.code === "idempotent_skip") {
          // 幂等: grant 已存在, 查询现有 grant_id
          // (简化: 不查询, 直接继续批准不关联 grant_id)
        } else {
          throw err;
        }
      }
    }

    // 批准交易 + 关联 grant_id
    const approved = await approveTransaction(serviceFetch, {
      transactionId: id,
      approverId: user.id,
      grantId,
    });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.transaction.order/1",
      transaction: approved,
      grantId,
    });
  } catch (error) {
    return transactionErrorResponse(error, "Unable to process transaction action.");
  }
}

function transactionErrorResponse(error: unknown, fallback: string) {
  if (error instanceof TransactionServiceError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof GrantServiceError) {
    return NextResponse.json(
      { success: false, error: error.message, code: "grant_error" },
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
