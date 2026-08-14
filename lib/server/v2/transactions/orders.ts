/**
 * KIIKIS 2.1 Phase 6 — 交易订单服务 (Task 6.3, TX-001~008)
 *
 * 服务层职责:
 *   1. createTransaction: 创建交易 (TX-001 mode 校验, TX-003 条款快照, TX-005 paid_amount=0)
 *   2. approveTransaction: 批准交易 + 创建 grant (TX-002 审计链)
 *   3. rejectTransaction: 拒绝交易
 *   4. getTransaction / listTransactions: 查询
 *
 * 设计原则:
 *   - TX-001: mode 由服务端校验 (DB CHECK 兜底)
 *   - TX-002: 批准后调用 Phase 4 grant 服务创建 grant (本服务不直接创建 grant, 由调用方注入)
 *   - TX-003: 条款快照在创建时冻结, 不可变
 *   - TX-005: 创建时 paid_amount_cents = 0, 批准后由调用方决定是否更新
 *   - TX-007: is_demo 永久标记, 不与真实数据混淆
 *   - TX-008: 不实现自动收益/提现/分账
 */
import {
  validateCreateTransaction,
  parseTransaction,
  isTransactionMode,
  TransactionValidationError,
  type CreateTransactionInput,
  type Transaction,
  type TransactionRow,
  type TransactionMode,
  type ApproveTransactionInput,
} from "../../../contracts/v2/transactions.ts";

/** PostgREST 风格 fetcher。 */
export type TransactionFetcher = <T = unknown>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

// ============================================================
// 错误类型
// ============================================================

export class TransactionServiceError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "validation_failed"
    | "idempotent_skip"
    | "service_unavailable"
    | "forbidden_feature"; // TX-008
  readonly status: number;
  readonly cause?: unknown;

  constructor(
    code: TransactionServiceError["code"],
    message: string,
    status: number,
    cause?: unknown,
  ) {
    super(`${code}: ${message}`);
    this.name = "TransactionServiceError";
    this.code = code;
    this.status = status;
    if (cause !== undefined) this.cause = cause;
  }
}

// ============================================================
// TX-001/TX-003/TX-005: createTransaction
// ============================================================

/**
 * 创建交易 (TX-001, TX-003, TX-005)
 *
 * - TX-001: 校验 mode 在 free/invite_only/manual_review 内
 * - TX-003: 冻结条款快照 (不可变)
 * - TX-005: 创建时 paid_amount_cents = 0 (DB 默认)
 * - TX-007: is_demo 标记 (调用方决定, 应用层控制 staging/prod 关闭 fixture)
 * - TX-008: 不接受 autoSettle 等禁止字段 (validateCreateTransaction 拦截)
 *
 * buyerId 由服务端注入 (认证用户), 不接受客户端伪造。
 */
export async function createTransaction(
  fetcher: TransactionFetcher,
  input: CreateTransactionInput,
): Promise<Transaction> {
  let validated: CreateTransactionInput;
  try {
    validated = validateCreateTransaction(input);
  } catch (err) {
    if (err instanceof TransactionValidationError) {
      throw new TransactionServiceError("validation_failed", err.message, 400);
    }
    throw err;
  }

  // TX-001: 再次校验 mode (防御)
  if (!isTransactionMode(validated.mode)) {
    throw new TransactionServiceError(
      "validation_failed",
      `invalid mode: ${validated.mode}`,
      400,
    );
  }

  // TX-008: 拒绝禁止的功能字段 (autoSettle/autoRevenue/withdrawal/split)
  const forbiddenKeys = ["autoSettle", "autoRevenue", "withdrawal", "revenueSplit"];
  for (const key of forbiddenKeys) {
    if (key in validated) {
      throw new TransactionServiceError(
        "forbidden_feature",
        `${key} is forbidden (TX-008)`,
        400,
      );
    }
  }

  // 调用 SECURITY DEFINER RPC
  const row = await fetcher<TransactionRow>(`/rest/v1/rpc/create_transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_mode: validated.mode,
      p_order_info: validated.order,
      p_attribution: validated.attribution ?? {},
      p_terms_snapshot: validated.termsSnapshot,
      p_amount_cents: validated.amountCents ?? 0,
      p_currency: validated.currency ?? "usd",
      p_dispute_handling: validated.disputeHandling ?? "manual_review",
      p_settlement_intent: validated.settlementIntent ?? "manual_settlement",
      p_is_demo: validated.isDemo ?? false,
      p_buyer_id: validated.buyerId,
      p_seller_id: validated.sellerId ?? null,
      p_idempotency_key: validated.idempotencyKey,
    }),
  }).catch((err: unknown) => {
    throw new TransactionServiceError("service_unavailable", "failed to create transaction", 503, err);
  });

  return parseTransaction(row);
}

// ============================================================
// TX-002: approveTransaction (关联 grant_id)
// ============================================================

/**
 * 批准交易 (TX-002)
 *
 * - TX-002: 批准后关联 grant_id (grant 由调用方先调用 Phase 4 grant 服务创建)
 * - 审计链: 记录 approver_id + approved_at
 * - 状态机: pending → approved
 *
 * 注意: 本函数不直接创建 grant (避免循环依赖 Phase 4)
 * 调用方应:
 *   1. 先调用 Phase 4 grant 服务 createGrant() 获得 grant_id
 *   2. 再调用本函数 approveTransaction(transactionId, approverId, grantId)
 */
export async function approveTransaction(
  fetcher: TransactionFetcher,
  input: ApproveTransactionInput,
): Promise<Transaction> {
  if (!input.transactionId?.trim()) {
    throw new TransactionServiceError("validation_failed", "transactionId is required", 400);
  }
  if (!input.approverId?.trim()) {
    throw new TransactionServiceError("unauthenticated", "approverId is required", 401);
  }

  const row = await fetcher<TransactionRow>(`/rest/v1/rpc/approve_transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_transaction_id: input.transactionId,
      p_approver_id: input.approverId,
      p_grant_id: input.grantId ?? null,
    }),
  }).catch((err: unknown) => {
    throw new TransactionServiceError("service_unavailable", "failed to approve transaction", 503, err);
  });

  return parseTransaction(row);
}

// ============================================================
// rejectTransaction
// ============================================================

export async function rejectTransaction(
  fetcher: TransactionFetcher,
  input: {
    transactionId: string;
    rejecterId: string;
    rejectionReason?: string | null;
  },
): Promise<Transaction> {
  if (!input.transactionId?.trim()) {
    throw new TransactionServiceError("validation_failed", "transactionId is required", 400);
  }
  if (!input.rejecterId?.trim()) {
    throw new TransactionServiceError("unauthenticated", "rejecterId is required", 401);
  }

  const row = await fetcher<TransactionRow>(`/rest/v1/rpc/reject_transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_transaction_id: input.transactionId,
      p_rejecter_id: input.rejecterId,
      p_rejection_reason: input.rejectionReason ?? null,
    }),
  }).catch((err: unknown) => {
    throw new TransactionServiceError("service_unavailable", "failed to reject transaction", 503, err);
  });

  return parseTransaction(row);
}

// ============================================================
// 查询
// ============================================================

export async function getTransaction(
  fetcher: TransactionFetcher,
  transactionId: string,
): Promise<Transaction | null> {
  if (!transactionId?.trim()) {
    throw new TransactionServiceError("validation_failed", "transactionId is required", 400);
  }

  const rows = await fetcher<TransactionRow[]>(
    `/rest/v1/storyflow_transactions?id=eq.${encodeURIComponent(transactionId)}&limit=1`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new TransactionServiceError("service_unavailable", "failed to read transaction", 503, err);
  });

  if (!rows || rows.length === 0) return null;
  return parseTransaction(rows[0]);
}

export async function listTransactionsByBuyer(
  fetcher: TransactionFetcher,
  buyerId: string,
  filter?: {
    status?: string;
    mode?: TransactionMode;
    limit?: number;
    offset?: number;
  },
): Promise<Transaction[]> {
  if (!buyerId?.trim()) {
    throw new TransactionServiceError("unauthenticated", "buyerId is required", 401);
  }

  let path = `/rest/v1/storyflow_transactions?buyer_id=eq.${encodeURIComponent(buyerId)}`;
  if (filter?.status) path += `&status=eq.${encodeURIComponent(filter.status)}`;
  if (filter?.mode) path += `&mode=eq.${encodeURIComponent(filter.mode)}`;
  path += `&order=created_at.desc&limit=${filter?.limit ?? 50}&offset=${filter?.offset ?? 0}`;

  const rows = await fetcher<TransactionRow[]>(path, {
    headers: { Accept: "application/json" },
  }).catch((err: unknown) => {
    throw new TransactionServiceError("service_unavailable", "failed to list transactions", 503, err);
  });

  return (rows ?? []).map((row) => parseTransaction(row));
}

export async function listTransactionsBySeller(
  fetcher: TransactionFetcher,
  sellerId: string,
  filter?: {
    status?: string;
    mode?: TransactionMode;
    limit?: number;
    offset?: number;
  },
): Promise<Transaction[]> {
  if (!sellerId?.trim()) {
    throw new TransactionServiceError("unauthenticated", "sellerId is required", 401);
  }

  let path = `/rest/v1/storyflow_transactions?seller_id=eq.${encodeURIComponent(sellerId)}`;
  if (filter?.status) path += `&status=eq.${encodeURIComponent(filter.status)}`;
  if (filter?.mode) path += `&mode=eq.${encodeURIComponent(filter.mode)}`;
  path += `&order=created_at.desc&limit=${filter?.limit ?? 50}&offset=${filter?.offset ?? 0}`;

  const rows = await fetcher<TransactionRow[]>(path, {
    headers: { Accept: "application/json" },
  }).catch((err: unknown) => {
    throw new TransactionServiceError("service_unavailable", "failed to list transactions", 503, err);
  });

  return (rows ?? []).map((row) => parseTransaction(row));
}

/** TX-007: 列出待审核的交易 (admin/manual_review 用) */
export async function listPendingTransactions(
  fetcher: TransactionFetcher,
  filter?: {
    mode?: TransactionMode;
    limit?: number;
    offset?: number;
  },
): Promise<Transaction[]> {
  let path = `/rest/v1/storyflow_transactions?status=eq.pending`;
  if (filter?.mode) path += `&mode=eq.${encodeURIComponent(filter.mode)}`;
  path += `&order=created_at.asc&limit=${filter?.limit ?? 50}&offset=${filter?.offset ?? 0}`;

  const rows = await fetcher<TransactionRow[]>(path, {
    headers: { Accept: "application/json" },
  }).catch((err: unknown) => {
    throw new TransactionServiceError("service_unavailable", "failed to list pending transactions", 503, err);
  });

  return (rows ?? []).map((row) => parseTransaction(row));
}
