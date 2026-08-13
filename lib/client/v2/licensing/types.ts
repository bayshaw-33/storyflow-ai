/**
 * K2-T-10 授权、订单与创建者中心 - 领域类型契约。
 *
 * 基于 PRD §9 授权与订单章节，覆盖：
 * - 订单状态机（pending / paid / refunded / cancelled / failed）
 * - 人工结算账本（PRD §9.6 强制：不显示为自动到账）
 * - 举报与争议
 *
 * 关键约束：
 * - 订单失败不创建 Active Grant（PRD §9.6 验收）
 * - 授权范围在下单前可读（PRD §9.3 验收）
 * - 争议状态对用户明确可见
 *
 * contract_version 与 Codex v2 / marketplace 契约对齐。
 */

export const CONTRACT_VERSION = "2.0.0-alpha.1";

// ============================================================
// 订单状态机
// ============================================================

/**
 * 订单状态。
 *
 * 状态流转：
 *   pending  -> paid        （支付成功，激活 Grant）
 *   pending  -> cancelled   （用户取消）
 *   pending  -> failed      （支付失败，不激活 Grant）
 *   paid     -> refunded    （退款）
 *
 * 关键约束（PRD §9.6）：
 *   - 订单 failed / cancelled / pending 时，对应 Grant 状态不得为 active
 *   - 仅 paid 订单激活 Grant
 */
export type OrderStatus = "pending" | "paid" | "refunded" | "cancelled" | "failed";

/** 全部订单状态 */
export const ALL_ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "paid",
  "refunded",
  "cancelled",
  "failed",
];

/** 订单激活状态：决定 Grant 是否可激活 */
export type OrderActivationState = "awaiting_payment" | "activated" | "released";

/**
 * 使用授权状态（Grant Status）。
 *
 * 状态流转：
 *   pending  -> active              （订单支付成功，授权激活）
 *   active   -> expired             （授权到期）
 *   active   -> revoked_for_new_use （撤销新调用，已有调用保留）
 *   pending  -> cancelled           （订单取消/失败）
 *   active   -> disputed            （争议中）
 */
export type UsageGrantStatus =
  | "pending"
  | "active"
  | "expired"
  | "revoked_for_new_use"
  | "cancelled"
  | "disputed";

/** 全部使用授权状态 */
export const ALL_USAGE_GRANT_STATUSES: readonly UsageGrantStatus[] = [
  "pending",
  "active",
  "expired",
  "revoked_for_new_use",
  "cancelled",
  "disputed",
];

// ============================================================
// 支付与结算
// ============================================================

/** 支付方式 */
export type PaymentMethod = "card" | "alipay" | "wechat" | "paypal";

/** 全部支付方式 */
export const ALL_PAYMENT_METHODS: readonly PaymentMethod[] = [
  "card",
  "alipay",
  "wechat",
  "paypal",
];

/**
 * 结算状态（人工，PRD §9.6 强制）。
 *
 * 全部状态均标注为人工结算，不显示为自动到账：
 *   - pending_manual：待人工结算（订单已支付，等待人工审核入账）
 *   - processing：人工结算处理中
 *   - completed_manual：人工结算已完成
 */
export type SettlementStatus =
  | "pending_manual"
  | "processing"
  | "completed_manual";

/** 全部结算状态 */
export const ALL_SETTLEMENT_STATUSES: readonly SettlementStatus[] = [
  "pending_manual",
  "processing",
  "completed_manual",
];

/** 是否为终态结算（不可再变更） */
export function isTerminalSettlement(status: SettlementStatus): boolean {
  return status === "completed_manual";
}

/** 是否为人工结算（全部状态均为人工，PRD §9.6） */
export function isManualSettlement(_status: SettlementStatus): boolean {
  // PRD §9.6：所有结算均标注为人工，不显示为自动到账。
  return true;
}

// ============================================================
// 举报与争议
// ============================================================

/** 举报类型 */
export type ReportType =
  | "infringement" // 侵权
  | "portrait_misuse" // 冒用肖像
  | "false_source" // 虚假来源
  | "inappropriate_content"; // 不当内容

/** 全部举报类型 */
export const ALL_REPORT_TYPES: readonly ReportType[] = [
  "infringement",
  "portrait_misuse",
  "false_source",
  "inappropriate_content",
];

/** 争议状态 */
export type DisputeStatus = "pending" | "under_review" | "resolved" | "dismissed";

/** 全部争议状态 */
export const ALL_DISPUTE_STATUSES: readonly DisputeStatus[] = [
  "pending",
  "under_review",
  "resolved",
  "dismissed",
];

// ============================================================
// 实体类型
// ============================================================

/** 订单证据（生成与人工确认记录，PRD §9.3 验收） */
export interface OrderEvidence {
  /** 支付凭据状态 */
  paymentProof: "generated" | "manual_confirmed" | "missing";
  /** 生成时间 */
  generatedAt: string | null;
  /** 人工确认时间 */
  manualConfirmedAt: string | null;
}

/**
 * 订单实体。
 *
 * 关键约束（PRD §9.6）：
 * - status !== "paid" 时 grant 必须不得为 active（grantStatus 字段供 UI 校验）
 * - amount 单位为分（与 marketplace LicenseOffer.price 一致）
 */
export interface Order {
  id: string;
  assetId: string;
  assetName: string;
  /** 关联的 Usage Grant ID */
  grantId: string;
  /** 关联的 Grant 状态（用于 UI 验证订单失败不激活 Grant） */
  grantStatus: "pending" | "active" | "cancelled";
  /** 金额（分） */
  amount: number;
  /** 货币 */
  currency: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  cancelledAt: string | null;
  failedAt: string | null;
  evidence: OrderEvidence;
}

/**
 * 收益记录（创建者账本）。
 *
 * 关键约束（PRD §9.6 强制）：
 * - settlementStatus 全部为人工（pending_manual / processing / completed_manual）
 * - UI 必须明确标注为人工结算，不显示为自动到账
 * - netAmount = grossAmount - platformFee
 */
export interface EarningRecord {
  id: string;
  orderId: string;
  assetId: string;
  assetName: string;
  /** 总金额（分） */
  grossAmount: number;
  /** 平台服务费（分） */
  platformFee: number;
  /** 净收入（分）= grossAmount - platformFee */
  netAmount: number;
  /** 结算状态（人工，PRD §9.6） */
  settlementStatus: SettlementStatus;
  createdAt: string;
  settledAt: string | null;
}

/** 收益汇总 */
export interface EarningsSummary {
  /** 总收入（分） */
  totalGross: number;
  /** 平台服务费总计（分） */
  totalPlatformFee: number;
  /** 净收入总计（分）= totalGross - totalPlatformFee */
  totalNet: number;
  /** 待人工结算金额（分） */
  pendingManualAmount: number;
  /** 人工结算中金额（分） */
  processingAmount: number;
  /** 人工结算已完成金额（分） */
  completedManualAmount: number;
  /** 记录数 */
  count: number;
  /** 货币 */
  currency: string;
  /** 是否标注为人工结算（PRD §9.6：恒为 true） */
  manualSettlement: true;
}

/** 管理员动作记录（对用户可见的部分，不暴露内部细节） */
export interface AdminAction {
  /** 动作时间 */
  at: string;
  /** 动作类型（用户可见的摘要，如 "审核开始" / "已联系双方" / "已结案"） */
  summary: string;
}

/** 举报实体 */
export interface Report {
  id: string;
  type: ReportType;
  assetId: string;
  assetName: string;
  reporterId: string;
  description: string;
  /** 证据附件标识（不暴露内部路径） */
  evidenceCount: number;
  status: DisputeStatus;
  createdAt: string;
  resolvedAt: string | null;
  /** 管理员对用户可见的处理记录摘要 */
  adminNote: string | null;
}

/** 争议实体 */
export interface Dispute {
  id: string;
  grantId: string;
  assetId: string;
  assetName: string;
  reason: string;
  status: DisputeStatus;
  createdAt: string;
  resolvedAt: string | null;
  /** 管理员处理记录（对用户可见部分，不暴露内部细节） */
  adminActions: AdminAction[];
}

// ============================================================
// 创建授权要约输入（与 marketplace 对齐，但保留扩展字段）
// ============================================================

/** 创建订单输入（fixture 模式下用于 CheckoutConfirm） */
export interface CreateOrderInput {
  offerId: string;
  assetId: string;
  targetProjectId: string;
  paymentMethod: PaymentMethod;
  expiresAt?: string | null;
}

/** 创建举报输入 */
export interface CreateReportInput {
  type: ReportType;
  assetId: string;
  description: string;
  evidenceCount?: number;
}

// ============================================================
// 加载状态
// ============================================================

export type LicensingStatus = "loading" | "empty" | "error" | "ready" | "unauthenticated";

/** 校验 contract_version */
export function assertContractVersion(version: string): void {
  if (version !== CONTRACT_VERSION) {
    throw new Error(
      `licensing contract version mismatch: expected ${CONTRACT_VERSION}, got ${version}`,
    );
  }
}

// ============================================================
// 关键不变式校验（PRD §9.6 强制）
// ============================================================

/**
 * 校验订单失败不创建 Active Grant（PRD §9.6）。
 *
 * 规则：
 * - order.status !== "paid" 时 grantStatus 不得为 "active"
 * - 仅 paid 订单可激活 Grant
 */
export function assertOrderFailureDoesNotActivateGrant(order: Order): void {
  if (order.status !== "paid" && order.grantStatus === "active") {
    throw new Error(
      `订单 ${order.id} 状态为 ${order.status} 但 Grant 已激活，违反 PRD §9.6：订单失败不创建 Active Grant`,
    );
  }
}

/**
 * 校验收益净额计算正确：netAmount = grossAmount - platformFee
 */
export function assertEarningNetAmount(earning: EarningRecord): void {
  const expected = earning.grossAmount - earning.platformFee;
  if (earning.netAmount !== expected) {
    throw new Error(
      `收益 ${earning.id} 净额计算错误：期望 ${expected}，实际 ${earning.netAmount}`,
    );
  }
}

/**
 * 校验收益汇总净额计算正确：totalNet = totalGross - totalPlatformFee
 */
export function assertEarningsSummary(summary: EarningsSummary): void {
  const expected = summary.totalGross - summary.totalPlatformFee;
  if (summary.totalNet !== expected) {
    throw new Error(
      `收益汇总净额计算错误：期望 ${expected}，实际 ${summary.totalNet}`,
    );
  }
  // PRD §9.6 强制：manualSettlement 必须为 true
  if (summary.manualSettlement !== true) {
    throw new Error("收益汇总必须标注为人工结算（PRD §9.6 强制）");
  }
}
