/**
 * KIIKIS 2.1 Phase 3 — KK 成长里程碑契约 (Task 3.6, K21-KK-023)
 *
 * 纯函数契约层，被服务层、API、消费者和测试使用。
 *
 * 设计原则 (K21-KK-023)：
 *   1. milestone 由 Creative Event 幂等授予 (idempotency_key 防重)
 *   2. 批量垃圾生成不能刷成长 (反刷量窗口)
 *   3. milestone 必须是已定义的 "有意义事件"，不接受任意 milestoneId
 *   4. milestone 不可直接购买/兑换 (K21-KK-024 禁止付费解锁)
 *
 * 与 kk-profile.ts 的关系：
 *   - milestone 授予最终调用 grant_milestone RPC，更新 kk_profile.growth_xp/level
 *   - 同时插入 memory_fact (type=milestone_grant) 作为审计记录
 */

// ============================================================
// 里程碑定义
// ============================================================

/**
 * 里程碑定义。每个 milestoneId 对应一组固定的 XP 和 level 奖励。
 * 不接受任意 milestoneId — 必须在此列表中 (防 LLM 自行伪造)。
 */
export interface MilestoneDefinition {
  readonly milestoneId: string;
  readonly xp: number;
  readonly levelDelta: number;
  /** 触发此里程碑的 creative_event.event_type */
  readonly triggerEventType: string;
  /** 是否计入反刷量窗口 (默认 true) */
  readonly rateLimited: boolean;
}

/**
 * K21-KK-023: 已定义的里程碑集合。
 * 设计原则：只奖励 "质量事件"，不奖励 "数量事件"。
 *   - 项目首创建 → 1 次（用户生命周期）
 *   - 单集首发布 → 1 次/集
 *   - Universe 首构建 → 1 次
 *   - Canon 提案通过 → 1 次/提案
 *   - 月度活跃创作 (>=5 个 task_completed) → 1 次/月
 *
 * 不奖励：
 *   - 每次 task_completed (避免刷量)
 *   - 每次 ai_generate (避免刷量)
 *   - 每次 page_view
 */
export const MILESTONE_DEFINITIONS: Readonly<Record<string, MilestoneDefinition>> = Object.freeze({
  first_project_created: Object.freeze({
    milestoneId: "first_project_created",
    xp: 50,
    levelDelta: 0,
    triggerEventType: "project_created",
    rateLimited: true,
  }),
  first_episode_published: Object.freeze({
    milestoneId: "first_episode_published",
    xp: 100,
    levelDelta: 1,
    triggerEventType: "episode_published",
    rateLimited: true,
  }),
  ten_episodes_published: Object.freeze({
    milestoneId: "ten_episodes_published",
    xp: 200,
    levelDelta: 1,
    triggerEventType: "episode_published",
    rateLimited: true,
  }),
  first_universe_built: Object.freeze({
    milestoneId: "first_universe_built",
    xp: 30,
    levelDelta: 0,
    triggerEventType: "universe_built",
    rateLimited: true,
  }),
  canon_proposal_passed: Object.freeze({
    milestoneId: "canon_proposal_passed",
    xp: 80,
    levelDelta: 0,
    triggerEventType: "canon_proposal_passed",
    rateLimited: true,
  }),
  monthly_active_creator: Object.freeze({
    milestoneId: "monthly_active_creator",
    xp: 60,
    levelDelta: 0,
    triggerEventType: "monthly_summary",
    rateLimited: true,
  }),
});

/** 已知的 milestoneId 集合。 */
export const KNOWN_MILESTONE_IDS: ReadonlyArray<string> = Object.freeze(
  Object.keys(MILESTONE_DEFINITIONS),
);

/** 判断 milestoneId 是否已定义。 */
export function isKnownMilestone(milestoneId: string): boolean {
  return Object.prototype.hasOwnProperty.call(MILESTONE_DEFINITIONS, milestoneId);
}

/** 获取定义；不存在返回 null。 */
export function getMilestoneDefinition(milestoneId: string): MilestoneDefinition | null {
  return MILESTONE_DEFINITIONS[milestoneId] ?? null;
}

// ============================================================
// 反刷量配置
// ============================================================

/**
 * 反刷量窗口配置。
 * K21-KK-023: 同 owner + milestone 在 windowMs 内最多 grant maxPerWindow 次。
 * 默认 1 小时 5 次 — 足以容错 (网络重放/系统迁移)，但阻断刷量。
 */
export interface MilestoneRateLimitConfig {
  readonly windowMs: number;
  readonly maxPerWindow: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: MilestoneRateLimitConfig = Object.freeze({
  windowMs: 60 * 60 * 1000, // 1 小时
  maxPerWindow: 5,
});

// ============================================================
// 输入与结果
// ============================================================

/**
 * 从 Creative Event 派生的 milestone 授予输入。
 * sourceId 通常是 creative_event.id，用于 idempotency_key。
 */
export interface GrantMilestoneFromEventInput {
  readonly ownerId: string;
  readonly milestoneId: string;
  /** 来源事件 id (作为 idempotency_key 的一部分) */
  readonly sourceId: string;
  /** 事件发生时间 (用于反刷量窗口) */
  readonly occurredAt: string;
}

/** 授予结果。 */
export interface GrantMilestoneResult {
  readonly inserted: boolean;
  readonly reason:
    | "granted"
    | "duplicate"
    | "unknown_milestone"
    | "rate_limited"
    | "invalid_input"
    | "grant_failed";
  readonly milestoneId: string;
  readonly xp: number;
  readonly levelDelta: number;
}

// ============================================================
// 校验 (纯函数)
// ============================================================

export class MilestoneValidationError extends Error {
  readonly code: string;
  readonly field?: string;
  constructor(code: string, message: string, field?: string) {
    super(`${code}: ${message}`);
    this.name = "MilestoneValidationError";
    this.code = code;
    if (field) this.field = field;
  }
}

/** 校验从事件派生的 milestone 输入。 */
export function validateGrantFromEventInput(
  input: GrantMilestoneFromEventInput,
): GrantMilestoneFromEventInput {
  if (!input.ownerId) {
    throw new MilestoneValidationError("missing_owner", "ownerId is required", "ownerId");
  }
  if (!input.milestoneId?.trim()) {
    throw new MilestoneValidationError("missing_milestone", "milestoneId is required", "milestoneId");
  }
  if (!isKnownMilestone(input.milestoneId)) {
    throw new MilestoneValidationError(
      "unknown_milestone",
      `milestoneId ${input.milestoneId} is not defined in MILESTONE_DEFINITIONS`,
      "milestoneId",
    );
  }
  if (!input.sourceId?.trim()) {
    throw new MilestoneValidationError("missing_source_id", "sourceId is required", "sourceId");
  }
  if (!input.occurredAt) {
    throw new MilestoneValidationError("missing_occurred_at", "occurredAt is required", "occurredAt");
  }
  const ts = Date.parse(input.occurredAt);
  if (!Number.isFinite(ts)) {
    throw new MilestoneValidationError("invalid_occurred_at", `occurredAt is not valid ISO: ${input.occurredAt}`, "occurredAt");
  }
  return Object.freeze({ ...input });
}

/**
 * 构造 idempotency_key — 由 sourceId 派生，确保同事件重放幂等。
 */
export function buildMilestoneIdempotencyKey(sourceId: string): string {
  return `evt:${sourceId}`;
}
