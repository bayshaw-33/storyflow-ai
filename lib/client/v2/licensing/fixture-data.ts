/**
 * K2-T-10 授权、订单与创建者中心 fixture 数据（内联 TS 模块）。
 *
 * 数据约束（PRD §9.6 强制）：
 * - 订单 failed / cancelled / pending 时 grantStatus 不得为 active
 * - 收益 netAmount = grossAmount - platformFee
 * - 结算状态全部为人工（pending_manual / processing / completed_manual）
 * - 不暴露内部 Prompt、存储路径与敏感元数据
 *
 * 同步副本写入 tests/fixtures/kiikis-v2/licensing.json，由测试防漂移断言保证一致。
 */
import type {
  Dispute,
  EarningRecord,
  EarningsSummary,
  Order,
  Report,
} from "./types.ts";

// ============================================================
// 订单（5 个，覆盖 pending / paid / refunded / cancelled / failed）
// ============================================================

export const FIXTURE_ORDERS: readonly Order[] = [
  {
    id: "ord-001",
    assetId: "ast-001",
    assetName: "Mara 赛博女侦探",
    grantId: "grt-001",
    grantStatus: "active",
    amount: 9900,
    currency: "CNY",
    paymentMethod: "alipay",
    status: "paid",
    createdAt: "2026-07-15T08:24:00.000Z",
    paidAt: "2026-07-15T08:25:12.000Z",
    refundedAt: null,
    cancelledAt: null,
    failedAt: null,
    evidence: {
      paymentProof: "manual_confirmed",
      generatedAt: "2026-07-15T08:25:00.000Z",
      manualConfirmedAt: "2026-07-15T08:25:12.000Z",
    },
  },
  {
    id: "ord-002",
    assetId: "ast-003",
    assetName: "霓虹港口夜景",
    grantId: "grt-002",
    // PRD §9.6：订单 pending 时 Grant 不得为 active
    grantStatus: "pending",
    amount: 19900,
    currency: "CNY",
    paymentMethod: "wechat",
    status: "pending",
    createdAt: "2026-08-01T14:00:00.000Z",
    paidAt: null,
    refundedAt: null,
    cancelledAt: null,
    failedAt: null,
    evidence: {
      paymentProof: "generated",
      generatedAt: "2026-08-01T14:00:05.000Z",
      manualConfirmedAt: null,
    },
  },
  {
    id: "ord-003",
    assetId: "ast-005",
    assetName: "玻璃海奇幻世界观包",
    grantId: "grt-003",
    // 退款后 Grant 不再激活（已激活的 Grant 在退款时变 cancelled）
    grantStatus: "cancelled",
    amount: 29900,
    currency: "CNY",
    paymentMethod: "card",
    status: "refunded",
    createdAt: "2026-06-20T10:30:00.000Z",
    paidAt: "2026-06-20T10:31:00.000Z",
    refundedAt: "2026-07-02T09:14:00.000Z",
    cancelledAt: null,
    failedAt: null,
    evidence: {
      paymentProof: "manual_confirmed",
      generatedAt: "2026-06-20T10:31:00.000Z",
      manualConfirmedAt: "2026-06-20T10:31:00.000Z",
    },
  },
  {
    id: "ord-004",
    assetId: "ast-007",
    assetName: "复古胶片质感风格包",
    grantId: "grt-004",
    // PRD §9.6：订单 cancelled 时 Grant 不得为 active
    grantStatus: "cancelled",
    amount: 14900,
    currency: "CNY",
    paymentMethod: "alipay",
    status: "cancelled",
    createdAt: "2026-08-05T16:00:00.000Z",
    paidAt: null,
    refundedAt: null,
    cancelledAt: "2026-08-05T16:08:42.000Z",
    failedAt: null,
    evidence: {
      paymentProof: "missing",
      generatedAt: null,
      manualConfirmedAt: null,
    },
  },
  {
    id: "ord-005",
    assetId: "ast-009",
    assetName: "夜行人反派面具",
    grantId: "grt-005",
    // PRD §9.6：订单 failed 时 Grant 不得为 active（关键约束）
    grantStatus: "pending",
    amount: 7900,
    currency: "CNY",
    paymentMethod: "paypal",
    status: "failed",
    createdAt: "2026-08-10T11:20:00.000Z",
    paidAt: null,
    refundedAt: null,
    cancelledAt: null,
    failedAt: "2026-08-10T11:21:30.000Z",
    evidence: {
      paymentProof: "missing",
      generatedAt: null,
      manualConfirmedAt: null,
    },
  },
];

// ============================================================
// 收益记录（5 个，覆盖全部 3 种人工结算状态）
// ============================================================

export const FIXTURE_EARNINGS: readonly EarningRecord[] = [
  {
    id: "ern-001",
    orderId: "ord-001",
    assetId: "ast-001",
    assetName: "Mara 赛博女侦探",
    grossAmount: 9900,
    platformFee: 990,
    netAmount: 8910,
    settlementStatus: "completed_manual",
    createdAt: "2026-07-15T08:25:12.000Z",
    settledAt: "2026-08-01T10:00:00.000Z",
  },
  {
    id: "ern-002",
    orderId: "ord-003",
    assetId: "ast-005",
    assetName: "玻璃海奇幻世界观包",
    grossAmount: 29900,
    platformFee: 2990,
    netAmount: 26910,
    settlementStatus: "processing",
    createdAt: "2026-06-20T10:31:00.000Z",
    settledAt: null,
  },
  {
    id: "ern-003",
    orderId: "ord-001",
    assetId: "ast-001",
    assetName: "Mara 赛博女侦探",
    grossAmount: 9900,
    platformFee: 990,
    netAmount: 8910,
    settlementStatus: "pending_manual",
    createdAt: "2026-07-22T08:25:12.000Z",
    settledAt: null,
  },
  {
    id: "ern-004",
    orderId: "ord-001",
    assetId: "ast-001",
    assetName: "Mara 赛博女侦探",
    grossAmount: 14900,
    platformFee: 1490,
    netAmount: 13410,
    settlementStatus: "completed_manual",
    createdAt: "2026-07-29T08:25:12.000Z",
    settledAt: "2026-08-05T10:00:00.000Z",
  },
  {
    id: "ern-005",
    orderId: "ord-001",
    assetId: "ast-001",
    assetName: "Mara 赛博女侦探",
    grossAmount: 19900,
    platformFee: 1990,
    netAmount: 17910,
    settlementStatus: "pending_manual",
    createdAt: "2026-08-08T08:25:12.000Z",
    settledAt: null,
  },
];

// 预计算汇总（PRD §9.6 强制：manualSettlement=true）
export const FIXTURE_EARNINGS_SUMMARY: EarningsSummary = (() => {
  const totalGross = FIXTURE_EARNINGS.reduce((s, e) => s + e.grossAmount, 0);
  const totalPlatformFee = FIXTURE_EARNINGS.reduce((s, e) => s + e.platformFee, 0);
  const totalNet = FIXTURE_EARNINGS.reduce((s, e) => s + e.netAmount, 0);
  const pendingManualAmount = FIXTURE_EARNINGS.filter(
    (e) => e.settlementStatus === "pending_manual",
  ).reduce((s, e) => s + e.netAmount, 0);
  const processingAmount = FIXTURE_EARNINGS.filter(
    (e) => e.settlementStatus === "processing",
  ).reduce((s, e) => s + e.netAmount, 0);
  const completedManualAmount = FIXTURE_EARNINGS.filter(
    (e) => e.settlementStatus === "completed_manual",
  ).reduce((s, e) => s + e.netAmount, 0);
  return {
    totalGross,
    totalPlatformFee,
    totalNet,
    pendingManualAmount,
    processingAmount,
    completedManualAmount,
    count: FIXTURE_EARNINGS.length,
    currency: "CNY",
    manualSettlement: true,
  };
})();

// ============================================================
// 举报（3 个，覆盖 pending / under_review / resolved）
// ============================================================

export const FIXTURE_REPORTS: readonly Report[] = [
  {
    id: "rpt-001",
    type: "portrait_misuse",
    assetId: "ast-002",
    assetName: "未授权演员形象 A",
    reporterId: "u-001",
    description:
      "该资产使用了本人肖像但未取得授权，要求下架并撤销所有授权。",
    evidenceCount: 2,
    status: "under_review",
    createdAt: "2026-08-01T09:00:00.000Z",
    resolvedAt: null,
    adminNote: "已联系双方核实，正在等待被举报方举证。",
  },
  {
    id: "rpt-002",
    type: "infringement",
    assetId: "ast-004",
    assetName: "抄袭场景 B",
    reporterId: "u-002",
    description: "该场景资产抄袭本人 2025 年发布的作品。",
    evidenceCount: 3,
    status: "pending",
    createdAt: "2026-08-05T14:30:00.000Z",
    resolvedAt: null,
    adminNote: null,
  },
  {
    id: "rpt-003",
    type: "false_source",
    assetId: "ast-006",
    assetName: "虚假来源声称 C",
    reporterId: "u-003",
    description: "创建者声称资产由本人独立创作，实际为他人作品转售。",
    evidenceCount: 1,
    status: "resolved",
    createdAt: "2026-07-10T11:00:00.000Z",
    resolvedAt: "2026-07-18T15:00:00.000Z",
    adminNote: "经核实证据成立，资产已下架，已撤销相关授权。",
  },
];

// ============================================================
// 争议（2 个，覆盖 pending / resolved）
// ============================================================

export const FIXTURE_DISPUTES: readonly Dispute[] = [
  {
    id: "dsp-001",
    grantId: "grt-001",
    assetId: "ast-001",
    assetName: "Mara 赛博女侦探",
    reason: "授权人主张使用者超出允许用途范围使用资产。",
    status: "under_review",
    createdAt: "2026-08-02T10:00:00.000Z",
    resolvedAt: null,
    adminActions: [
      {
        at: "2026-08-02T10:30:00.000Z",
        summary: "已受理争议，开始审核。",
      },
      {
        at: "2026-08-03T16:00:00.000Z",
        summary: "已联系双方，等待举证。",
      },
    ],
  },
  {
    id: "dsp-002",
    grantId: "grt-003",
    assetId: "ast-005",
    assetName: "玻璃海奇幻世界观包",
    reason: "使用者主张授权范围被错误解读，要求退款。",
    status: "resolved",
    createdAt: "2026-07-01T09:00:00.000Z",
    resolvedAt: "2026-07-05T14:00:00.000Z",
    adminActions: [
      {
        at: "2026-07-01T09:30:00.000Z",
        summary: "已受理争议。",
      },
      {
        at: "2026-07-03T11:00:00.000Z",
        summary: "已联系双方，确认证据。",
      },
      {
        at: "2026-07-05T14:00:00.000Z",
        summary: "争议已结案，订单已退款，Grant 已撤销。",
      },
    ],
  },
];

// ============================================================
// 完整 fixture 数据集
// ============================================================

export const FIXTURE_DATASET = {
  contractVersion: "2.0.0-alpha.1",
  orders: FIXTURE_ORDERS,
  earnings: FIXTURE_EARNINGS,
  earningsSummary: FIXTURE_EARNINGS_SUMMARY,
  reports: FIXTURE_REPORTS,
  disputes: FIXTURE_DISPUTES,
} as const;
