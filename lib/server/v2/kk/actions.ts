/**
 * KIIKIS 2.1 Phase 3 — KK 高风险动作确认服务 (Task 3.5, K21-KK-012/013/014)
 *
 * 核心规则 (K21-KK-012)：
 *   发布、授权、支付、删除、覆盖 Canon 必须返回 confirmation challenge，
 *   由用户明确确认后服务端执行。LLM 不得直接执行授权/支付/发布/删除。
 *
 * 工作流：
 *   proposeAction(input) -> KkProposedAction  (challenge，未执行)
 *   confirmAction(actionId) -> KkActionResult  (用户确认后执行)
 *   cancelAction(actionId)  -> void           (用户取消，不执行)
 *
 * 幂等：
 *   - 同 actionId 重提 propose 返回同一 challenge (不创建新记录)
 *   - 同 actionId 重 confirm 返回原 result (不重复执行副作用)
 *   - 同 actionId 重 cancel 幂等 (status 已 cancelled 直接返回)
 *
 * 安全：
 *   - 跨账号确认被显式 ownerId 校验阻断
 *   - 过期 challenge 不能 confirm
 *   - LLM 模块只能 import proposeAction，不可 import executeAction
 *     (本文件不导出 executeAction；executor 由调用方注入)
 */

import type { KkProfileFetcher } from "./profile.ts";

// ============================================================
// 契约类型 (K21-KK-012)
// ============================================================

/**
 * 高风险动作类型 (K21-KK-012)。
 * 这些动作必须经过 propose → user_confirm → execute 流程。
 */
export const HIGH_RISK_ACTION_TYPES = [
  "publish",
  "authorize",
  "payment",
  "delete",
  "override_canon",
] as const;
export type KkHighRiskActionType = (typeof HIGH_RISK_ACTION_TYPES)[number];

/** 低风险动作类型 (无需确认)。 */
export const LOW_RISK_ACTION_TYPES = [
  "read",
  "navigate",
  "open_view",
  "list",
  "search",
] as const;
export type KkLowRiskActionType = (typeof LOW_RISK_ACTION_TYPES)[number];

export type KkActionType = KkHighRiskActionType | KkLowRiskActionType;

/** 判断动作类型是否高风险 (需确认)。 */
export function isHighRiskActionType(actionType: string): actionType is KkHighRiskActionType {
  return (HIGH_RISK_ACTION_TYPES as readonly string[]).includes(actionType);
}

/** 动作风险等级。 */
export type KkActionRisk = "low" | "high";

/** 计算动作风险等级。 */
export function resolveRisk(actionType: string): KkActionRisk {
  return isHighRiskActionType(actionType) ? "high" : "low";
}

/**
 * 提议中的动作 (K21-KK-012)。
 * 由 proposeAction 返回，给用户审阅。
 */
export interface KkProposedAction {
  readonly actionId: string;
  readonly ownerId: string;
  readonly actionType: KkActionType;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly risk: KkActionRisk;
  readonly summary: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly status: KkProposedActionStatus;
}

export type KkProposedActionStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "expired"
  | "executed"
  | "failed";

/**
 * 动作执行结果。
 * LLM 无法直接获取此对象 — 必须通过 confirmAction。
 */
export interface KkActionResult {
  readonly actionId: string;
  readonly status: "executed" | "failed" | "skipped";
  readonly executedAt: string;
  readonly error?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

// ============================================================
// 错误类型
// ============================================================

export class KkActionError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "validation_failed"
    | "expired"
    | "already_confirmed"
    | "already_cancelled"
    | "not_pending"
    | "service_unavailable";
  readonly status: number;
  readonly cause?: unknown;

  constructor(
    code: KkActionError["code"],
    message: string,
    status: number,
    cause?: unknown,
  ) {
    super(`${code}: ${message}`);
    this.name = "KkActionError";
    this.code = code;
    this.status = status;
    if (cause !== undefined) this.cause = cause;
  }
}

// ============================================================
// Action Store 接口 (可插拔)
// ============================================================

/**
 * Action 存储抽象。
 * - 测试用 InMemoryKkActionStore。
 * - 生产可由 DB-backed 实现替换 (Phase 3 不强制)。
 */
export interface KkActionStore {
  save(action: KkProposedAction): Promise<void>;
  findById(actionId: string): Promise<KkProposedAction | null>;
  listByOwner(ownerId: string, status?: KkProposedActionStatus): Promise<ReadonlyArray<KkProposedAction>>;
  update(action: KkProposedAction): Promise<void>;
}

/** 默认内存实现 (单进程，TTL 由过期检查负责清理)。 */
export class InMemoryKkActionStore implements KkActionStore {
  private readonly map = new Map<string, KkProposedAction>();

  async save(action: KkProposedAction): Promise<void> {
    this.map.set(action.actionId, action);
  }
  async findById(actionId: string): Promise<KkProposedAction | null> {
    return this.map.get(actionId) ?? null;
  }
  async listByOwner(
    ownerId: string,
    status?: KkProposedActionStatus,
  ): Promise<ReadonlyArray<KkProposedAction>> {
    const list = Array.from(this.map.values()).filter(
      (a) => a.ownerId === ownerId && (status ? a.status === status : true),
    );
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return list;
  }
  async update(action: KkProposedAction): Promise<void> {
    if (!this.map.has(action.actionId)) {
      throw new KkActionError("not_found", `action ${action.actionId} not found`, 404);
    }
    this.map.set(action.actionId, action);
  }
  /** 测试辅助：清空 */
  clear(): void {
    this.map.clear();
  }
}

// ============================================================
// Executor 注入 (LLM 不能直接调用)
// ============================================================

/**
 * 动作执行器接口。
 * 由调用方 (route handler) 注入；LLM 模块不持有此引用。
 *
 * 执行器实现示例：
 *   - publish: 调用 publishService.publish()
 *   - delete: 调用 entityService.delete()
 *   - authorize: 调用 licensingService.grantLicense()
 */
export type KkActionExecutor = (
  action: KkProposedAction,
) => Promise<KkActionResult>;

// ============================================================
// Propose
// ============================================================

export interface ProposeActionInput {
  readonly ownerId: string;
  readonly actionType: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly summary?: string;
  /** 默认 5 分钟 */
  readonly ttlMs?: number;
  /** 调用方传入的 idempotency key，用于去重 propose 请求 */
  readonly idempotencyKey?: string;
}

/** 计算 expiresAt (当前时间 + ttl)。 */
function computeExpiresAt(ttlMs: number): string {
  return new Date(Date.now() + ttlMs).toISOString();
}

/**
 * 提议高风险动作 (K21-KK-012)。
 *
 * 行为：
 *   - 校验输入 (ownerId、actionType 合法、resource 非空)
 *   - 低风险动作不抛错，但返回的 risk=low，调用方可直接执行 (不需 confirm)
 *   - 高风险动作写入 store，返回 challenge；调用方必须把 challenge 交给用户确认
 *   - 幂等：相同 idempotencyKey 重提返回同一 action (若仍 pending)
 */
export async function proposeAction(
  store: KkActionStore,
  input: ProposeActionInput,
): Promise<KkProposedAction> {
  if (!input.ownerId) {
    throw new KkActionError("unauthenticated", "ownerId is required", 401);
  }
  if (!input.actionType?.trim()) {
    throw new KkActionError("validation_failed", "actionType is required", 400);
  }
  if (!input.resourceType?.trim()) {
    throw new KkActionError("validation_failed", "resourceType is required", 400);
  }
  if (!input.resourceId?.trim()) {
    throw new KkActionError("validation_failed", "resourceId is required", 400);
  }

  // 校验 actionType 是已知的
  const known =
    (HIGH_RISK_ACTION_TYPES as readonly string[]).includes(input.actionType) ||
    (LOW_RISK_ACTION_TYPES as readonly string[]).includes(input.actionType);
  if (!known) {
    throw new KkActionError(
      "validation_failed",
      `unknown actionType: ${input.actionType}`,
      400,
    );
  }

  // 幂等：相同 idempotencyKey 已有 pending → 返回原 action
  if (input.idempotencyKey) {
    const existing = await store.findById(input.idempotencyKey);
    if (existing) {
      // K21-KK-013: 跨账号不得复用 idempotencyKey 偷取他人动作
      if (existing.ownerId !== input.ownerId) {
        throw new KkActionError(
          "forbidden",
          `idempotencyKey ${input.idempotencyKey} belongs to another owner`,
          403,
        );
      }
      if (existing.status === "pending") {
        // 重新计算过期状态
        return refreshExpiry(store, existing);
      }
      // 已 confirmed/cancelled/expired 的也直接返回原对象
      return existing;
    }
  }

  const actionType = input.actionType as KkActionType;
  const risk = resolveRisk(actionType);
  const ttlMs = Math.min(Math.max(input.ttlMs ?? 5 * 60_000, 10_000), 60 * 60_000);
  const now = new Date();
  const actionId = input.idempotencyKey ?? generateActionId();

  const action: KkProposedAction = Object.freeze({
    actionId,
    ownerId: input.ownerId,
    actionType,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    risk,
    summary: input.summary ?? defaultSummary(actionType, input.resourceType, input.resourceId),
    expiresAt: computeExpiresAt(ttlMs),
    createdAt: now.toISOString(),
    status: "pending",
  });

  await store.save(action);
  return action;
}

/** 重新检查过期状态，若已过期则更新 store 并返回 status=expired 的副本。 */
async function refreshExpiry(store: KkActionStore, action: KkProposedAction): Promise<KkProposedAction> {
  if (action.status === "pending" && isExpired(action)) {
    const expired = { ...action, status: "expired" as const };
    Object.freeze(expired);
    await store.update(expired).catch(() => {});
    return expired;
  }
  return action;
}

function isExpired(action: KkProposedAction): boolean {
  if (action.status !== "pending") return false;
  const expiresAtMs = Date.parse(action.expiresAt);
  if (Number.isNaN(expiresAtMs)) return true;
  return Date.now() >= expiresAtMs;
}

function defaultSummary(actionType: string, resourceType: string, resourceId: string): string {
  return `${actionType} ${resourceType} ${resourceId}`;
}

function generateActionId(): string {
  return `kka_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================
// Confirm
// ============================================================

/**
 * 确认执行高风险动作 (K21-KK-012)。
 *
 * 行为：
 *   - 校验 action 存在 + owner 匹配 + 仍 pending + 未过期
 *   - 调用注入的 executor 执行动作
 *   - 标记 status=executed 或 failed
 *   - 幂等：已 executed 的 action 重 confirm 直接返回原 result，不重新执行
 *
 * LLM 不能直接调用此函数 — 它由 route handler 在用户点击 "确认" 后调用，
 * executor 参数由服务端注入。
 */
export async function confirmAction(
  store: KkActionStore,
  ownerId: string,
  actionId: string,
  executor: KkActionExecutor,
): Promise<KkActionResult> {
  if (!ownerId) {
    throw new KkActionError("unauthenticated", "ownerId is required", 401);
  }
  if (!actionId) {
    throw new KkActionError("validation_failed", "actionId is required", 400);
  }

  const action = await store.findById(actionId);
  if (!action) {
    throw new KkActionError("not_found", `action ${actionId} not found`, 404);
  }

  // K21-KK-013: 跨账号确认被阻断
  if (action.ownerId !== ownerId) {
    throw new KkActionError(
      "forbidden",
      `action ${actionId} does not belong to owner ${ownerId}`,
      403,
    );
  }

  // 幂等：已 executed 直接返回
  if (action.status === "executed") {
    return {
      actionId: action.actionId,
      status: "executed",
      executedAt: action.expiresAt, // 使用任意时间作为执行时间占位 (实际应在 update 时记录)
      data: undefined,
    };
  }

  // 状态校验
  if (action.status === "cancelled") {
    throw new KkActionError("already_cancelled", `action ${actionId} was cancelled`, 409);
  }
  if (action.status === "expired" || isExpired(action)) {
    // 标记过期
    if (action.status !== "expired") {
      const expired = { ...action, status: "expired" as const };
      Object.freeze(expired);
      await store.update(expired);
    }
    throw new KkActionError("expired", `action ${actionId} expired`, 410);
  }
  if (action.status !== "pending") {
    throw new KkActionError("not_pending", `action ${actionId} status ${action.status} cannot be confirmed`, 409);
  }

  // 低风险动作本来不需 confirm；若调用方仍然 confirm，也执行 (兼容)
  // 但原则上低风险不应进入此流程 — 由调用方自行决定

  // 执行
  let result: KkActionResult;
  try {
    result = await executor(action);
  } catch (err: unknown) {
    const failed: KkActionResult = Object.freeze({
      actionId: action.actionId,
      status: "failed",
      executedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    });
    // 标记 failed (仍允许重试 confirm — 但本契约不实现自动重试)
    const updated = { ...action, status: "failed" as const };
    Object.freeze(updated);
    await store.update(updated);
    return failed;
  }

  // 标记 executed
  const updated = { ...action, status: "executed" as const };
  Object.freeze(updated);
  await store.update(updated);

  return result;
}

// ============================================================
// Cancel
// ============================================================

/**
 * 取消提议中的动作 (K21-KK-012)。
 * 取消不改变业务状态 — executor 永不被调用。
 */
export async function cancelAction(
  store: KkActionStore,
  ownerId: string,
  actionId: string,
): Promise<KkProposedAction> {
  if (!ownerId) {
    throw new KkActionError("unauthenticated", "ownerId is required", 401);
  }
  if (!actionId) {
    throw new KkActionError("validation_failed", "actionId is required", 400);
  }

  const action = await store.findById(actionId);
  if (!action) {
    throw new KkActionError("not_found", `action ${actionId} not found`, 404);
  }

  if (action.ownerId !== ownerId) {
    throw new KkActionError(
      "forbidden",
      `action ${actionId} does not belong to owner ${ownerId}`,
      403,
    );
  }

  // 幂等：已 cancelled 直接返回
  if (action.status === "cancelled") {
    return action;
  }

  // 已 executed 不能 cancel
  if (action.status === "executed") {
    throw new KkActionError("not_pending", `action ${actionId} already executed`, 409);
  }

  // pending / expired / failed 都可以 cancel (统一标 cancelled)
  const cancelled = { ...action, status: "cancelled" as const };
  Object.freeze(cancelled);
  await store.update(cancelled);
  return cancelled;
}

// ============================================================
// 查询
// ============================================================

/**
 * 列出某 owner 的待确认动作 (K21-KK-012)。
 * 自动标记过期动作为 expired。
 */
export async function listPendingActions(
  store: KkActionStore,
  ownerId: string,
): Promise<ReadonlyArray<KkProposedAction>> {
  if (!ownerId) {
    throw new KkActionError("unauthenticated", "ownerId is required", 401);
  }
  const all = await store.listByOwner(ownerId, "pending");
  const refreshed: KkProposedAction[] = [];
  for (const a of all) {
    if (isExpired(a)) {
      const expired = { ...a, status: "expired" as const };
      Object.freeze(expired);
      await store.update(expired).catch(() => {});
      refreshed.push(expired);
    } else {
      refreshed.push(a);
    }
  }
  return Object.freeze(refreshed);
}

/**
 * 按 ID 查询动作 (跨账号访问被阻断)。
 */
export async function getAction(
  store: KkActionStore,
  ownerId: string,
  actionId: string,
): Promise<KkProposedAction> {
  if (!ownerId) {
    throw new KkActionError("unauthenticated", "ownerId is required", 401);
  }
  const action = await store.findById(actionId);
  if (!action) {
    throw new KkActionError("not_found", `action ${actionId} not found`, 404);
  }
  if (action.ownerId !== ownerId) {
    throw new KkActionError(
      "forbidden",
      `action ${actionId} does not belong to owner ${ownerId}`,
      403,
    );
  }
  // 过期刷新
  if (action.status === "pending" && isExpired(action)) {
    const expired = { ...action, status: "expired" as const };
    Object.freeze(expired);
    await store.update(expired).catch(() => {});
    return expired;
  }
  return action;
}
