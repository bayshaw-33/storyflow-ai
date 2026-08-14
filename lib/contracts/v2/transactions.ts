/**
 * KIIKIS 2.1 Phase 6 — 交易内测契约 (Task 6.3, TX-001~008)
 *
 * 纯函数契约层。
 *
 * 设计原则:
 *   TX-001: 只开放 free/invite_only/manual_review 三种模式
 *   TX-002: 每个批准结果创建真实、可审计 grant
 *   TX-003: 保存 order、attribution 和创建时条款快照 (不可变)
 *   TX-004: 明示费用、争议和 settlement intent
 *   TX-005: 未移动资金时 paid_amount = 0
 *   TX-006: UI 明示模式 (由应用层保证)
 *   TX-007: staging/prod 默认关闭 fixture, 演示数据 is_demo = true
 *   TX-008: 禁止自动收益/提现/分账 (不实现相关功能)
 */

// ============================================================
// 常量
// ============================================================

/** TX-001: 只允许三种交易模式 */
export const TRANSACTION_MODES = ["free", "invite_only", "manual_review"] as const;
export type TransactionMode = (typeof TRANSACTION_MODES)[number];

/** 交易状态机: pending → approved / rejected / canceled */
export const TRANSACTION_STATUS = ["pending", "approved", "rejected", "canceled"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUS)[number];

/** TX-004: 争议处理方式 */
export const DISPUTE_HANDLING = ["manual_review", "no_dispute"] as const;
export type DisputeHandling = (typeof DISPUTE_HANDLING)[number];

/** TX-004: 结算意图 (TX-008: 不允许 auto_settlement) */
export const SETTLEMENT_INTENTS = ["manual_settlement", "no_settlement"] as const;
export type SettlementIntent = (typeof SETTLEMENT_INTENTS)[number];

/** TX-007: 演示数据标记 */
export const DEMO_MARKERS = Object.freeze({
  isDemo: true,
  demoLabel: "DEMO",
} as const);

/** TX-008: 禁止的功能列表 (用于验证不实现) */
export const FORBIDDEN_FEATURES = Object.freeze([
  "auto_revenue_calculation",
  "withdrawal",
  "auto_revenue_split",
  "fake_balance_display",
] as const);

// ============================================================
// Order (TX-003)
// ============================================================

export interface OrderInfo {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly priceId?: string | null;
  readonly planTier?: string | null;
  readonly quantity?: number;
  readonly [key: string]: unknown;
}

// ============================================================
// Attribution (TX-003)
// ============================================================

export interface Attribution {
  readonly source?: string | null;
  readonly campaign?: string | null;
  readonly referrerId?: string | null;
  readonly inviteToken?: string | null;
  readonly [key: string]: unknown;
}

// ============================================================
// TermsSnapshot (TX-003: 不可变)
// ============================================================

export interface TermsSnapshot {
  readonly termsKey: string;
  readonly version: number;
  readonly body: Readonly<Record<string, unknown>>;
  readonly snapshotAt: string;
  readonly [key: string]: unknown;
}

// ============================================================
// Transaction (TX-001~008)
// ============================================================

export interface Transaction {
  readonly id: string;
  readonly mode: TransactionMode;
  readonly status: TransactionStatus;
  readonly orderInfo: Readonly<OrderInfo>;
  readonly attribution: Readonly<Attribution>;
  readonly termsSnapshot: Readonly<TermsSnapshot>;
  readonly amountCents: number;
  readonly currency: string;
  /** TX-005: 实际已支付金额 (未移动资金时 = 0) */
  readonly paidAmountCents: number;
  readonly disputeHandling: DisputeHandling;
  readonly settlementIntent: SettlementIntent;
  /** TX-007: 演示数据永久标记 */
  readonly isDemo: boolean;
  /** TX-002: 关联的 grant_id */
  readonly grantId: string | null;
  readonly buyerId: string | null;
  readonly sellerId: string | null;
  readonly approvedAt: string | null;
  readonly approvedBy: string | null;
  readonly rejectedAt: string | null;
  readonly rejectedBy: string | null;
  readonly rejectionReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TransactionRow {
  readonly id: string;
  readonly mode: TransactionMode;
  readonly status: TransactionStatus;
  readonly order_info: Record<string, unknown> | null;
  readonly attribution: Record<string, unknown> | null;
  readonly terms_snapshot: Record<string, unknown> | null;
  readonly amount_cents: number;
  readonly currency: string;
  readonly paid_amount_cents: number;
  readonly dispute_handling: DisputeHandling;
  readonly settlement_intent: SettlementIntent;
  readonly is_demo: boolean;
  readonly grant_id: string | null;
  readonly buyer_id: string | null;
  readonly seller_id: string | null;
  readonly approved_at: string | null;
  readonly approved_by: string | null;
  readonly rejected_at: string | null;
  readonly rejected_by: string | null;
  readonly rejection_reason: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CreateTransactionInput {
  readonly mode: TransactionMode;
  readonly order: OrderInfo;
  readonly attribution?: Attribution;
  readonly termsSnapshot: TermsSnapshot;
  readonly amountCents?: number;
  readonly currency?: string;
  readonly disputeHandling?: DisputeHandling;
  readonly settlementIntent?: SettlementIntent;
  /** TX-007: 演示数据标记 (仅开发/预览环境) */
  readonly isDemo?: boolean;
  readonly buyerId: string | null;
  readonly sellerId?: string | null;
  readonly idempotencyKey: string;
}

export interface ApproveTransactionInput {
  readonly transactionId: string;
  readonly approverId: string;
  /** TX-002: 批准后创建的 grant_id */
  readonly grantId?: string | null;
}

// ============================================================
// 校验 (纯函数)
// ============================================================

export class TransactionValidationError extends Error {
  readonly code: string;
  readonly field?: string;
  constructor(code: string, message: string, field?: string) {
    super(`${code}: ${message}`);
    this.name = "TransactionValidationError";
    this.code = code;
    if (field) this.field = field;
  }
}

export function isTransactionMode(v: string): v is TransactionMode {
  return TRANSACTION_MODES.includes(v as TransactionMode);
}

export function isTransactionStatus(v: string): v is TransactionStatus {
  return TRANSACTION_STATUS.includes(v as TransactionStatus);
}

export function isDisputeHandling(v: string): v is DisputeHandling {
  return DISPUTE_HANDLING.includes(v as DisputeHandling);
}

export function isSettlementIntent(v: string): v is SettlementIntent {
  return SETTLEMENT_INTENTS.includes(v as SettlementIntent);
}

/** TX-003: 冻结条款快照 (不可变) */
export function freezeTermsSnapshot(snapshot: TermsSnapshot): TermsSnapshot {
  return Object.freeze({
    ...snapshot,
    body: Object.freeze({ ...snapshot.body }),
  });
}

/** TX-003: 校验快照完整性 */
export function validateTermsSnapshot(snapshot: TermsSnapshot): TermsSnapshot {
  if (!snapshot?.termsKey?.trim()) {
    throw new TransactionValidationError("missing_terms_key", "termsKey is required", "termsKey");
  }
  if (!Number.isInteger(snapshot.version) || snapshot.version <= 0) {
    throw new TransactionValidationError(
      "invalid_version",
      "version must be a positive integer",
      "version",
    );
  }
  if (!snapshot.body || typeof snapshot.body !== "object") {
    throw new TransactionValidationError("missing_body", "body is required", "body");
  }
  if (!snapshot.snapshotAt || !Date.parse(snapshot.snapshotAt)) {
    throw new TransactionValidationError(
      "invalid_snapshot_at",
      "snapshotAt must be ISO-8601 timestamp",
      "snapshotAt",
    );
  }
  return freezeTermsSnapshot(snapshot);
}

/** TX-001/TX-003/TX-005: 校验创建交易输入 */
export function validateCreateTransaction(input: CreateTransactionInput): CreateTransactionInput {
  if (!input) {
    throw new TransactionValidationError("missing_input", "input is required");
  }

  // TX-001: 校验 mode
  if (!isTransactionMode(input.mode)) {
    throw new TransactionValidationError(
      "invalid_mode",
      `mode must be one of ${TRANSACTION_MODES.join(", ")} (TX-001)`,
      "mode",
    );
  }

  // TX-001: 禁止自动付费/自动分账模式 (TX-008)
  if ((input as { autoSettle?: boolean }).autoSettle) {
    throw new TransactionValidationError(
      "forbidden_auto_settle",
      "auto settlement is forbidden (TX-008)",
      "autoSettle",
    );
  }

  // order 校验
  if (!input.order?.resourceType?.trim()) {
    throw new TransactionValidationError(
      "missing_order_resource_type",
      "order.resourceType is required",
      "order.resourceType",
    );
  }
  if (!input.order?.resourceId?.trim()) {
    throw new TransactionValidationError(
      "missing_order_resource_id",
      "order.resourceId is required",
      "order.resourceId",
    );
  }

  // TX-003: 校验条款快照
  validateTermsSnapshot(input.termsSnapshot);

  // TX-004: 校验结算意图 (禁止 auto_settlement)
  if (input.settlementIntent && !isSettlementIntent(input.settlementIntent)) {
    throw new TransactionValidationError(
      "invalid_settlement_intent",
      `settlementIntent must be one of ${SETTLEMENT_INTENTS.join(", ")}`,
      "settlementIntent",
    );
  }

  // TX-005: amount_cents 不能为负
  if (input.amountCents !== undefined && input.amountCents < 0) {
    throw new TransactionValidationError(
      "invalid_amount",
      "amountCents must be >= 0",
      "amountCents",
    );
  }

  // TX-005: free/invite_only 模式 amountCents 应为 0
  if ((input.mode === "free" || input.mode === "invite_only") && input.amountCents && input.amountCents > 0) {
    throw new TransactionValidationError(
      "invalid_amount_for_mode",
      `${input.mode} mode requires amountCents = 0 (TX-005)`,
      "amountCents",
    );
  }

  // TX-004: disputeHandling 校验
  if (input.disputeHandling && !isDisputeHandling(input.disputeHandling)) {
    throw new TransactionValidationError(
      "invalid_dispute_handling",
      `disputeHandling must be one of ${DISPUTE_HANDLING.join(", ")}`,
      "disputeHandling",
    );
  }

  // buyerId 可空 (匿名 free 模式), 但 invite_only/manual_review 必须有 buyer
  if (input.mode !== "free" && !input.buyerId?.trim()) {
    throw new TransactionValidationError(
      "missing_buyer",
      `buyerId is required for ${input.mode} mode`,
      "buyerId",
    );
  }

  // 幂等 key
  if (!input.idempotencyKey?.trim()) {
    throw new TransactionValidationError(
      "missing_idempotency_key",
      "idempotencyKey is required",
      "idempotencyKey",
    );
  }

  return Object.freeze({
    ...input,
    order: Object.freeze({ ...input.order }),
    attribution: Object.freeze({ ...(input.attribution ?? {}) }),
    termsSnapshot: freezeTermsSnapshot(input.termsSnapshot),
  });
}

// ============================================================
// DB row → 实体
// ============================================================

export function parseTransaction(row: TransactionRow): Transaction {
  const termsSnapshot = (row.terms_snapshot ?? {}) as TermsSnapshot;
  return Object.freeze({
    id: row.id,
    mode: row.mode,
    status: row.status,
    orderInfo: Object.freeze({ ...((row.order_info ?? {}) as OrderInfo) }),
    attribution: Object.freeze({ ...((row.attribution ?? {}) as Attribution) }),
    termsSnapshot: Object.freeze({
      ...termsSnapshot,
      body: Object.freeze({ ...(termsSnapshot.body ?? {}) }),
    }),
    amountCents: row.amount_cents,
    currency: row.currency,
    paidAmountCents: row.paid_amount_cents,
    disputeHandling: row.dispute_handling,
    settlementIntent: row.settlement_intent,
    isDemo: row.is_demo,
    grantId: row.grant_id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    rejectedAt: row.rejected_at,
    rejectedBy: row.rejected_by,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

// ============================================================
// TX-005: 模式与 paid_amount 关系判定
// ============================================================

/** TX-005: 判断交易是否未移动资金 */
export function isUnfunded(tx: Transaction): boolean {
  // free/invite_only: 永远 unfunded
  if (tx.mode === "free" || tx.mode === "invite_only") return true;
  // manual_review: paid_amount = 0 视为未移动资金
  if (tx.mode === "manual_review") return tx.paidAmountCents === 0;
  return false;
}

/** TX-006: 获取模式的 UI 显示文案 */
export function getModeDisplayLabel(mode: TransactionMode): string {
  switch (mode) {
    case "free":
      return "Free";
    case "invite_only":
      return "Invite Only";
    case "manual_review":
      return "Manual Review";
    default:
      return mode;
  }
}

/** TX-006: 获取模式的中文显示文案 */
export function getModeDisplayLabelZh(mode: TransactionMode): string {
  switch (mode) {
    case "free":
      return "免费";
    case "invite_only":
      return "邀请制";
    case "manual_review":
      return "人工审核";
    default:
      return mode;
  }
}

/** TX-004: 获取结算意图的 UI 显示文案 */
export function getSettlementIntentLabel(intent: SettlementIntent): string {
  switch (intent) {
    case "manual_settlement":
      return "Manual Settlement";
    case "no_settlement":
      return "No Settlement";
    default:
      return intent;
  }
}
