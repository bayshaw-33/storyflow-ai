import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  createTransaction,
  listTransactionsByBuyer,
  listPendingTransactions,
  TransactionServiceError,
} from "@/lib/server/v2/transactions/orders";
import { isTransactionMode, TransactionValidationError } from "@/lib/contracts/v2/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/transactions/orders — 列出当前用户的交易 (TX-003)
 *   query: status?, mode?, limit?, offset?, pending=true (列出待审核)
 *
 * POST /api/v2/transactions/orders — 创建交易 (TX-001, TX-003, TX-005)
 *   TX-001: mode 必须为 free/invite_only/manual_review
 *   TX-003: order/attribution/termsSnapshot 必填
 *   TX-005: free/invite_only 模式 amountCents 必须为 0
 *   TX-007: isDemo 由调用方决定 (staging/prod 由 feature flag 控制)
 *
 * body: { mode, order, attribution?, termsSnapshot, amountCents?, currency?, disputeHandling?, settlementIntent?, isDemo?, sellerId?, idempotencyKey? }
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Transaction service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");
    const status = url.searchParams.get("status") ?? undefined;
    const mode = url.searchParams.get("mode") ?? undefined;
    const pendingOnly = url.searchParams.get("pending") === "true";

    // TX-007: admin/audit 可查看待审核队列
    const items = pendingOnly
      ? await listPendingTransactions(serviceFetch, {
          mode: mode && isTransactionMode(mode) ? mode : undefined,
          limit: limit ? Number(limit) : 50,
          offset: offset ? Number(offset) : 0,
        })
      : await listTransactionsByBuyer(serviceFetch, user.id, {
          status,
          mode: mode && isTransactionMode(mode) ? mode : undefined,
          limit: limit ? Number(limit) : 50,
          offset: offset ? Number(offset) : 0,
        });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.transaction.order/1",
      items,
    });
  } catch (error) {
    return transactionErrorResponse(error, "Unable to list transactions.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Transaction service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => ({}));

    // TX-001: mode 校验
    if (!body.mode || !isTransactionMode(body.mode)) {
      return NextResponse.json(
        {
          success: false,
          error: `mode must be one of free/invite_only/manual_review (TX-001)`,
          code: "validation_failed",
        },
        { status: 400 },
      );
    }

    // TX-008: 拒绝禁止的功能字段
    const forbiddenFields = ["autoSettle", "autoRevenue", "withdrawal", "revenueSplit"];
    for (const key of forbiddenFields) {
      if (key in body) {
        return NextResponse.json(
          {
            success: false,
            error: `${key} is forbidden (TX-008: no auto revenue/withdrawal/split)`,
            code: "forbidden_feature",
          },
          { status: 400 },
        );
      }
    }

    // TX-003: order 必填
    if (!body.order?.resourceType || !body.order?.resourceId) {
      return NextResponse.json(
        {
          success: false,
          error: "order.resourceType and order.resourceId are required (TX-003)",
          code: "validation_failed",
        },
        { status: 400 },
      );
    }

    // TX-003: termsSnapshot 必填
    if (!body.termsSnapshot?.termsKey) {
      return NextResponse.json(
        {
          success: false,
          error: "termsSnapshot.termsKey is required (TX-003)",
          code: "validation_failed",
        },
        { status: 400 },
      );
    }

    // TX-005: free/invite_only 模式 amountCents 必须为 0
    if (
      (body.mode === "free" || body.mode === "invite_only") &&
      body.amountCents &&
      body.amountCents > 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `${body.mode} mode requires amountCents = 0 (TX-005)`,
          code: "validation_failed",
        },
        { status: 400 },
      );
    }

    // TX-007: isDemo 永久标记 (调用方决定, 应用层控制 staging/prod 关闭)
    const idempotencyKey =
      body.idempotencyKey ||
      `tx:${user.id}:${body.mode}:${body.order.resourceType}:${body.order.resourceId}`;

    const transaction = await createTransaction(serviceFetch, {
      mode: body.mode,
      order: body.order,
      attribution: body.attribution ?? {},
      termsSnapshot: body.termsSnapshot,
      amountCents: body.amountCents ?? 0,
      currency: body.currency ?? "usd",
      disputeHandling: body.disputeHandling ?? "manual_review",
      settlementIntent: body.settlementIntent ?? "manual_settlement",
      isDemo: body.isDemo === true, // TX-007: 显式标记
      buyerId: user.id, // 服务端注入
      sellerId: body.sellerId ?? null,
      idempotencyKey,
    });

    return NextResponse.json(
      {
        success: true,
        contractVersion: "kiikis.transaction.order/1",
        transaction,
      },
      { status: 201 },
    );
  } catch (error) {
    return transactionErrorResponse(error, "Unable to create transaction.");
  }
}

function transactionErrorResponse(error: unknown, fallback: string) {
  if (error instanceof TransactionServiceError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof TransactionValidationError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: 400 },
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
