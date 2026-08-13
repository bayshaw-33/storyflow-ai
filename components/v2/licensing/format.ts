/**
 * K2-T-10 授权、订单与创建者中心 - UI 格式化纯函数。
 *
 * 全部为纯函数，不依赖 DOM，便于 Node 测试直接导入验证。
 *
 * 关键约束：
 * - 价格单位为分，显示时转换为元
 * - 状态标签中文化（与 marketplace 一致）
 * - 结算状态强制标注为人工（PRD §9.6）
 */
import type {
  DisputeStatus,
  OrderStatus,
  PaymentMethod,
  ReportType,
  SettlementStatus,
  UsageGrantStatus,
} from "@/lib/client/v2/licensing/types";

// ============================================================
// 价格格式化
// ============================================================

/** 将分转换为元字符串（不带货币符号） */
export function centsToYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** 格式化价格（分 -> ¥XX.XX） */
export function formatAmount(cents: number, currency: string, locale: string): string {
  const isZh = locale === "zh-CN";
  const yuan = centsToYuan(cents);
  if (currency === "CNY") {
    return isZh ? `¥${yuan}` : `CNY ${yuan}`;
  }
  if (currency === "USD") {
    return `$${yuan}`;
  }
  return `${currency} ${yuan}`;
}

// ============================================================
// 订单状态标签
// ============================================================

export function orderStatusLabel(status: OrderStatus, locale: string): string {
  const isZh = locale === "zh-CN";
  const map: Record<OrderStatus, [string, string]> = {
    pending: ["待支付", "Pending"],
    paid: ["已支付", "Paid"],
    refunded: ["已退款", "Refunded"],
    cancelled: ["已取消", "Cancelled"],
    failed: ["失败", "Failed"],
  };
  return isZh ? map[status][0] : map[status][1];
}

/** 订单状态对应的 CSS class 名 */
export function orderStatusClass(status: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    pending: "statusPending",
    paid: "statusPaid",
    refunded: "statusRefunded",
    cancelled: "statusCancelled",
    failed: "statusFailed",
  };
  return map[status];
}

/** Grant 状态对应的 CSS class 名 */
export function grantStatusClass(status: UsageGrantStatus): string {
  const map: Record<UsageGrantStatus, string> = {
    pending: "statusPending",
    active: "statusActive",
    expired: "statusExpired",
    revoked_for_new_use: "statusRevoked",
    cancelled: "statusCancelled",
    disputed: "statusDisputed",
  };
  return map[status];
}

export function grantStatusLabel(status: UsageGrantStatus, locale: string): string {
  const isZh = locale === "zh-CN";
  const map: Record<UsageGrantStatus, [string, string]> = {
    pending: ["待激活", "Pending"],
    active: ["已激活", "Active"],
    expired: ["已过期", "Expired"],
    revoked_for_new_use: ["已撤销新调用", "Revoked"],
    cancelled: ["已取消", "Cancelled"],
    disputed: ["争议中", "Disputed"],
  };
  return isZh ? map[status][0] : map[status][1];
}

// ============================================================
// 结算状态标签（PRD §9.6 强制：全部标注为人工）
// ============================================================

export function settlementStatusLabel(
  status: SettlementStatus,
  locale: string,
): string {
  const isZh = locale === "zh-CN";
  const map: Record<SettlementStatus, [string, string]> = {
    pending_manual: ["待人工结算", "Pending manual settlement"],
    processing: ["人工结算处理中", "Manual settlement processing"],
    completed_manual: ["人工结算已完成", "Manual settlement completed"],
  };
  return isZh ? map[status][0] : map[status][1];
}

export function settlementStatusClass(status: SettlementStatus): string {
  const map: Record<SettlementStatus, string> = {
    pending_manual: "statusPendingManual",
    processing: "statusProcessing",
    completed_manual: "statusCompletedManual",
  };
  return map[status];
}

/**
 * 返回人工结算标记文案（PRD §9.6 强制：不显示为自动到账）。
 *
 * 所有结算状态都附带此标记，避免被误读为自动到账。
 */
export function manualSettlementBadge(locale: string): string {
  return locale === "zh-CN" ? "人工结算" : "Manual settlement";
}

// ============================================================
// 争议 / 举报状态标签
// ============================================================

export function disputeStatusLabel(
  status: DisputeStatus,
  locale: string,
): string {
  const isZh = locale === "zh-CN";
  const map: Record<DisputeStatus, [string, string]> = {
    pending: ["待受理", "Pending"],
    under_review: ["审核中", "Under review"],
    resolved: ["已解决", "Resolved"],
    dismissed: ["已驳回", "Dismissed"],
  };
  return isZh ? map[status][0] : map[status][1];
}

export function disputeStatusClass(status: DisputeStatus): string {
  const map: Record<DisputeStatus, string> = {
    pending: "statusPending",
    under_review: "statusUnderReview",
    resolved: "statusResolved",
    dismissed: "statusDismissed",
  };
  return map[status];
}

export function reportTypeLabel(type: ReportType, locale: string): string {
  const isZh = locale === "zh-CN";
  const map: Record<ReportType, [string, string]> = {
    infringement: ["侵权", "Infringement"],
    portrait_misuse: ["冒用肖像", "Portrait misuse"],
    false_source: ["虚假来源", "False source"],
    inappropriate_content: ["不当内容", "Inappropriate content"],
  };
  return isZh ? map[type][0] : map[type][1];
}

export function paymentMethodLabel(method: PaymentMethod, locale: string): string {
  const isZh = locale === "zh-CN";
  const map: Record<PaymentMethod, [string, string]> = {
    card: ["银行卡", "Card"],
    alipay: ["支付宝", "Alipay"],
    wechat: ["微信支付", "WeChat Pay"],
    paypal: ["PayPal", "PayPal"],
  };
  return isZh ? map[method][0] : map[method][1];
}

/** 格式化 ISO 时间为本地日期时间字符串 */
export function formatTime(iso: string | null, locale: string): string {
  if (!iso) return locale === "zh-CN" ? "—" : "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(locale === "zh-CN" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
