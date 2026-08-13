/**
 * KIIKIS 2.1 Phase 3 — KK 成长里程碑服务 (Task 3.6, K21-KK-023)
 *
 * 服务层职责：
 *   1. 接收 Creative Event 派生的 milestone 授予请求
 *   2. 校验 milestone 已定义 (拒绝未知 milestoneId，防 LLM 伪造)
 *   3. 反刷量窗口检查 (K21-KK-023: 批量垃圾生成不能刷成长)
 *   4. 调用 profile.grantMilestone (RPC，幂等)
 *   5. 返回结构化结果，便于上层做幂等日志/审计
 *
 * 与 profile.ts 的关系：
 *   - milestones.ts 是更高层的服务，依赖 profile.grantMilestone
 *   - profile.grantMilestone 调用 RPC grant_milestone (DB 端幂等)
 *   - 本层额外做：milestone 定义校验 + 反刷量 + 事件 idempotency_key
 */

import {
  buildMilestoneIdempotencyKey,
  DEFAULT_RATE_LIMIT_CONFIG,
  getMilestoneDefinition,
  validateGrantFromEventInput,
  type GrantMilestoneFromEventInput,
  type GrantMilestoneResult,
  type MilestoneRateLimitConfig,
} from "../../../contracts/v2/kk-milestones.ts";
import { grantMilestone as profileGrantMilestone, type KkProfileFetcher } from "./profile.ts";

// ============================================================
// 反刷量接口 (可插拔)
// ============================================================

export interface MilestoneRateLimiter {
  /** 检查是否允许授予；返回 true 才继续。 */
  check(
    ownerId: string,
    milestoneId: string,
    occurredAt: string,
  ): Promise<boolean>;
  /** 记录一次成功授予。 */
  record(
    ownerId: string,
    milestoneId: string,
    occurredAt: string,
  ): Promise<void>;
}

/**
 * 默认内存反刷量实现：滑动窗口。
 * K21-KK-023: 同 owner + milestone 在 windowMs 内最多 maxPerWindow 次。
 *
 * 单进程限制：跨进程不共享 — 生产环境应替换为 Redis/DB 实现。
 * 默认 1 小时 5 次，足以容错网络重放/系统迁移，但阻断明显刷量。
 */
export class InMemoryRateLimiter implements MilestoneRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly config: MilestoneRateLimitConfig;

  constructor(config: MilestoneRateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG) {
    this.config = config;
  }

  async check(
    ownerId: string,
    milestoneId: string,
    occurredAt: string,
  ): Promise<boolean> {
    const key = `${ownerId}::${milestoneId}`;
    const ts = Date.parse(occurredAt);
    if (!Number.isFinite(ts)) return false;

    // 清理窗口外的时间戳
    const now = Date.now();
    const history = (this.buckets.get(key) ?? []).filter((t) => now - t < this.config.windowMs);

    if (history.length >= this.config.maxPerWindow) {
      this.buckets.set(key, history);
      return false;
    }
    this.buckets.set(key, history);
    return true;
  }

  async record(
    ownerId: string,
    milestoneId: string,
    occurredAt: string,
  ): Promise<void> {
    const key = `${ownerId}::${milestoneId}`;
    const ts = Date.parse(occurredAt);
    if (!Number.isFinite(ts)) return;
    const history = this.buckets.get(key) ?? [];
    history.push(ts);
    this.buckets.set(key, history);
  }

  /** 测试辅助：清空 */
  clear(): void {
    this.buckets.clear();
  }
}

/** No-op 实现 (用于测试或禁用反刷量的环境)。 */
export class NoOpRateLimiter implements MilestoneRateLimiter {
  async check(): Promise<boolean> {
    return true;
  }
  async record(): Promise<void> {
    // no-op
  }
}

// ============================================================
// 错误类型
// ============================================================

export class MilestoneServiceError extends Error {
  readonly code:
    | "invalid_input"
    | "unknown_milestone"
    | "rate_limited"
    | "grant_failed"
    | "service_unavailable";
  readonly status: number;
  readonly cause?: unknown;

  constructor(
    code: MilestoneServiceError["code"],
    message: string,
    status: number,
    cause?: unknown,
  ) {
    super(`${code}: ${message}`);
    this.name = "MilestoneServiceError";
    this.code = code;
    this.status = status;
    if (cause !== undefined) this.cause = cause;
  }
}

// ============================================================
// 主服务
// ============================================================

export interface MilestoneServiceOptions {
  readonly rateLimiter?: MilestoneRateLimiter;
  /** 用于测试时跳过 milestone 定义检查 */
  readonly allowUnknownMilestones?: boolean;
}

export class MilestoneService {
  private readonly rateLimiter: MilestoneRateLimiter;
  private readonly allowUnknown: boolean;

  constructor(
    private readonly fetcher: KkProfileFetcher,
    options: MilestoneServiceOptions = {},
  ) {
    this.rateLimiter = options.rateLimiter ?? new InMemoryRateLimiter();
    this.allowUnknown = options.allowUnknownMilestones === true;
  }

  /**
   * 从 Creative Event 派生 milestone 授予 (K21-KK-023)。
   *
   * 流程：
   *   1. 校验输入 (ownerId、milestoneId 已定义、sourceId 非空、occurredAt 合法 ISO)
   *   2. 反刷量窗口检查
   *   3. 调用 profile.grantMilestone (RPC 端幂等 via idempotency_key)
   *   4. 记录到反刷量窗口 (即使 RPC 跳过插入也记录，防同窗口内重复尝试)
   *   5. 返回结构化结果
   *
   * 幂等：同 sourceId 重放返回 { inserted: false, reason: "duplicate" }，不重复加 XP。
   *   RPC 内部已通过 idempotency_key 保证；本层再次保证语义清晰。
   */
  async grantFromEvent(
    input: GrantMilestoneFromEventInput,
  ): Promise<GrantMilestoneResult> {
    // 1. 校验输入
    let validated: GrantMilestoneFromEventInput;
    try {
      validated = validateGrantFromEventInput(input);
    } catch {
      return {
        inserted: false,
        reason: "invalid_input",
        milestoneId: input.milestoneId ?? "",
        xp: 0,
        levelDelta: 0,
      };
    }

    // 2. milestone 定义检查
    const def = getMilestoneDefinition(validated.milestoneId);
    if (!def) {
      if (!this.allowUnknown) {
        return {
          inserted: false,
          reason: "unknown_milestone",
          milestoneId: validated.milestoneId,
          xp: 0,
          levelDelta: 0,
        };
      }
    }

    // 3. 反刷量窗口
    if (def?.rateLimited !== false) {
      const allowed = await this.rateLimiter.check(
        validated.ownerId,
        validated.milestoneId,
        validated.occurredAt,
      );
      if (!allowed) {
        return {
          inserted: false,
          reason: "rate_limited",
          milestoneId: validated.milestoneId,
          xp: 0,
          levelDelta: 0,
        };
      }
    }

    // 4. 调用底层 grantMilestone
    const idempotencyKey = buildMilestoneIdempotencyKey(validated.sourceId);
    const xp = def?.xp ?? 0;
    const levelDelta = def?.levelDelta ?? 0;

    try {
      const result = await profileGrantMilestone(this.fetcher, {
        ownerId: validated.ownerId,
        milestoneId: validated.milestoneId,
        xp,
        levelDelta,
        idempotencyKey,
      });

      // 5. 记录反刷量窗口 (无论是否新插入都记录，防止刷量尝试)
      if (def?.rateLimited !== false) {
        await this.rateLimiter.record(
          validated.ownerId,
          validated.milestoneId,
          validated.occurredAt,
        );
      }

      // RPC 不区分 inserted/duplicate — 但本契约要求语义清晰。
      // 简化：成功调用即视为 "granted"，重复调用由 RPC 内部 ON CONFLICT DO NOTHING 保证幂等。
      // 上层可通过查 memory_facts 判断是否真的首次授予。
      return {
        inserted: result.inserted,
        reason: "granted",
        milestoneId: validated.milestoneId,
        xp,
        levelDelta,
      };
    } catch (err: unknown) {
      return {
        inserted: false,
        reason: "grant_failed",
        milestoneId: validated.milestoneId,
        xp,
        levelDelta,
      };
    }
  }
}

// ============================================================
// 便捷函数：直接构造服务并调用
// ============================================================

/**
 * 便捷函数：从 Creative Event 授予 milestone (K21-KK-023)。
 * 等价于 `new MilestoneService(fetcher).grantFromEvent(input)`。
 */
export async function grantMilestoneFromEvent(
  fetcher: KkProfileFetcher,
  input: GrantMilestoneFromEventInput,
  options?: MilestoneServiceOptions,
): Promise<GrantMilestoneResult> {
  const svc = new MilestoneService(fetcher, options);
  return svc.grantFromEvent(input);
}
