/**
 * K2-T-10 授权、订单与创建者中心 fixture 加载器。
 *
 * 从内联 TS 模块（fixture-data.ts）读取演示数据，
 * 不用 dynamic import 加载 tests/ 目录 JSON，避免打包与类型问题。
 * 真实数据走 api.ts 的 API 适配器。
 *
 * 返回深拷贝，避免调用方误改原 fixture 数据。
 */
import {
  FIXTURE_DATASET,
  FIXTURE_DISPUTES,
  FIXTURE_EARNINGS,
  FIXTURE_EARNINGS_SUMMARY,
  FIXTURE_ORDERS,
  FIXTURE_REPORTS,
} from "./fixture-data.ts";
import {
  CONTRACT_VERSION,
  assertEarningNetAmount,
  assertEarningsSummary,
  assertOrderFailureDoesNotActivateGrant,
  type Dispute,
  type EarningRecord,
  type EarningsSummary,
  type Order,
  type Report,
} from "./types.ts";

/** 深拷贝单个订单（含嵌套 evidence） */
function cloneOrder(order: Order): Order {
  return {
    ...order,
    evidence: { ...order.evidence },
  };
}

/** 深拷贝单个收益记录 */
function cloneEarning(earning: EarningRecord): EarningRecord {
  return { ...earning };
}

/** 深拷贝单个举报 */
function cloneReport(report: Report): Report {
  return { ...report };
}

/** 深拷贝单个争议（含嵌套 adminActions） */
function cloneDispute(dispute: Dispute): Dispute {
  return {
    ...dispute,
    adminActions: dispute.adminActions.map((a) => ({ ...a })),
  };
}

/** 加载全部 fixture 订单（返回深拷贝） */
export function loadFixtureOrders(): Order[] {
  const orders = FIXTURE_ORDERS.map(cloneOrder);
  // 在加载时验证关键不变式（PRD §9.6）
  for (const order of orders) {
    assertOrderFailureDoesNotActivateGrant(order);
  }
  return orders;
}

/** 加载 fixture 收益记录 */
export function loadFixtureEarnings(): EarningRecord[] {
  const earnings = FIXTURE_EARNINGS.map(cloneEarning);
  for (const e of earnings) {
    assertEarningNetAmount(e);
  }
  return earnings;
}

/** 加载 fixture 收益汇总（PRD §9.6：manualSettlement=true） */
export function loadFixtureEarningsSummary(): EarningsSummary {
  const summary = { ...FIXTURE_EARNINGS_SUMMARY };
  assertEarningsSummary(summary);
  return summary;
}

/** 加载 fixture 举报 */
export function loadFixtureReports(): Report[] {
  return FIXTURE_REPORTS.map(cloneReport);
}

/** 加载 fixture 争议 */
export function loadFixtureDisputes(): Dispute[] {
  return FIXTURE_DISPUTES.map(cloneDispute);
}

/** 按 ID 加载单个 fixture 订单 */
export function loadFixtureOrderById(id: string): Order | null {
  const order = FIXTURE_ORDERS.find((o) => o.id === id);
  if (!order) return null;
  const cloned = cloneOrder(order);
  assertOrderFailureDoesNotActivateGrant(cloned);
  return cloned;
}

/** 加载完整 fixture 数据集 */
export function loadFixtureDataset() {
  return {
    contractVersion: FIXTURE_DATASET.contractVersion || CONTRACT_VERSION,
    orders: loadFixtureOrders(),
    earnings: loadFixtureEarnings(),
    earningsSummary: loadFixtureEarningsSummary(),
    reports: loadFixtureReports(),
    disputes: loadFixtureDisputes(),
  };
}

/** fixture 契约版本（用于运行时校验） */
export function fixtureContractVersion(): string {
  return FIXTURE_DATASET.contractVersion || CONTRACT_VERSION;
}
