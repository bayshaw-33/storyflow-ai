/**
 * KIIKIS 2.1 Phase 1 — Creative Event Consumer (K21-EV-006)
 *
 * 事件观测与消费者幂等：
 * 1. 维护 consumer checkpoint (lastSequence + processedIds)
 * 2. 从断点之后拉取事件 (复用 listCreativeEvents)
 * 3. 对每个事件调用 handler 触发副作用 (通知、计数等)
 * 4. 相同 event.id 重放时跳过 handler，保证副作用只发生一次
 * 5. 单个 handler 失败不中断后续事件，失败事件保留在下次重放
 *
 * 单次调用处理一批事件，不做无限循环；调用方决定重放节奏
 * (cron / realtime trigger / manual)。
 */

import { listCreativeEvents } from "./index.ts";
import type { CreativeEventsFetcher } from "./index.ts";
import type { CreativeEventV1 } from "../../../contracts/v2/creative-events.ts";

/** 事件处理器：接收已校验的事件，执行副作用。同步或异步均可。 */
export type CreativeEventHandler = (
  event: CreativeEventV1
) => Promise<void> | void;

/** 消费者检查点：持久化后可跨进程恢复。 */
export interface ConsumerCheckpoint {
  /** 最后一个已成功处理事件的 sequence；0 表示还未开始。 */
  readonly lastSequence: number;
  /** 已成功处理事件的 id 集合，用于跨重放幂等去重。 */
  readonly processedIds: ReadonlyArray<string>;
}

/** 持久化检查点存储抽象。生产环境可注入 Redis / DB 实现。 */
export interface CheckpointStore {
  get(consumerId: string): Promise<ConsumerCheckpoint | null>;
  save(
    consumerId: string,
    checkpoint: ConsumerCheckpoint
  ): Promise<void>;
}

/** 默认内存实现：进程内状态，不跨进程持久化。开发/测试用。 */
export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly state = new Map<string, ConsumerCheckpoint>();

  async get(consumerId: string): Promise<ConsumerCheckpoint | null> {
    return this.state.get(consumerId) ?? null;
  }

  async save(
    consumerId: string,
    checkpoint: ConsumerCheckpoint
  ): Promise<void> {
    // 复制成快照，避免外部突变
    this.state.set(consumerId, {
      lastSequence: checkpoint.lastSequence,
      processedIds: [...checkpoint.processedIds],
    });
  }
}

/** 消费结果摘要。 */
export interface ConsumeResult {
  /** 本次实际调用 handler 成功的事件数。 */
  readonly processed: number;
  /** 因幂等去重跳过的事件数 (event.id 已在 processedIds)。 */
  readonly skipped: number;
  /** handler 抛错的事件与错误，调用方决定重试策略。 */
  readonly errors: ReadonlyArray<{ event: CreativeEventV1; error: Error }>;
  /** 本次推进到的 checkpoint。 */
  readonly checkpoint: ConsumerCheckpoint;
  /** 是否已无更多事件 (到达流末尾)。 */
  readonly reachedEnd: boolean;
}

const DEFAULT_BATCH_SIZE = 200;

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  return new Error("handler threw non-error value");
}

/**
 * 消费一批事件。
 *
 * 幂等保证：
 * - event.id 已在 checkpoint.processedIds 中 → 跳过 handler
 * - handler 成功 → 加入 processedIds 并推进 lastSequence
 * - handler 失败 → 记录到 errors，不推进 lastSequence，下次重放会重新拉取
 *
 * 推进策略：
 * - lastSequence 只在事件按 sequence 升序连续成功时推进
 * - 一旦遇到失败事件，后续即使成功也不推进 lastSequence
 *   (确保下次重放能重新拉取失败事件)
 * - 已 processedIds 的事件不会重复触发 handler
 *
 * @param params.consumerId 消费者唯一标识，隔离 checkpoint
 * @param params.fetcher PostgREST fetcher (与 appendCreativeEvent 共用)
 * @param params.userId 调用者 userId，用于 RLS 范围
 * @param params.handler 事件处理器
 * @param params.store checkpoint 存储，默认 InMemoryCheckpointStore
 * @param params.resourceType 可选资源类型过滤
 * @param params.resourceId 可选资源 ID 过滤
 * @param params.batchSize 单次拉取上限，默认 200
 */
export async function consumeCreativeEvents(params: {
  consumerId: string;
  fetcher: CreativeEventsFetcher;
  userId: string;
  handler: CreativeEventHandler;
  store?: CheckpointStore;
  resourceType?: string | null;
  resourceId?: string | null;
  batchSize?: number | null;
}): Promise<ConsumeResult> {
  if (!params.consumerId || typeof params.consumerId !== "string") {
    throw new Error("consumerId must be a non-empty string");
  }
  if (typeof params.handler !== "function") {
    throw new Error("handler must be a function");
  }

  const store = params.store ?? defaultStore;
  const previous = await store.get(params.consumerId);
  const lastSequence = previous?.lastSequence ?? 0;
  const processedIds = new Set<string>(previous?.processedIds ?? []);

  const batchSize =
    params.batchSize && params.batchSize > 0
      ? Math.min(1000, Math.floor(params.batchSize))
      : DEFAULT_BATCH_SIZE;

  // 拉取断点之后的事件
  const { items, nextSequence } = await listCreativeEvents({
    fetcher: params.fetcher,
    userId: params.userId,
    afterSequence: lastSequence,
    resourceType: params.resourceType ?? null,
    resourceId: params.resourceId ?? null,
    limit: batchSize,
  });

  const errors: Array<{ event: CreativeEventV1; error: Error }> = [];
  let processed = 0;
  let skipped = 0;
  // 推进到的 sequence：连续成功 (含幂等跳过) 后才推进
  let advancedSequence = lastSequence;
  let failedSeen = false;

  for (const event of items) {
    if (processedIds.has(event.id)) {
      skipped++;
      // 幂等跳过也算"已处理"，可安全推进 (未遇失败时)
      if (!failedSeen && event.sequence > advancedSequence) {
        advancedSequence = event.sequence;
      }
      continue;
    }

    try {
      await params.handler(event);
    } catch (err) {
      errors.push({ event, error: toError(err) });
      // 标记失败，后续不再推进 lastSequence
      // 失败事件不加入 processedIds，下次重放会重新拉取
      failedSeen = true;
      continue;
    }

    processedIds.add(event.id);
    processed++;
    if (!failedSeen && event.sequence > advancedSequence) {
      advancedSequence = event.sequence;
    }
  }

  const checkpoint: ConsumerCheckpoint = {
    lastSequence: advancedSequence,
    processedIds: [...processedIds],
  };

  await store.save(params.consumerId, checkpoint);

  // reachedEnd: 拉取数 < batchSize，或 nextSequence 为空
  const reachedEnd =
    items.length < batchSize || nextSequence === null;

  return {
    processed,
    skipped,
    errors,
    checkpoint,
    reachedEnd,
  };
}

/** 默认共享内存 store，未显式注入 store 时使用。 */
const defaultStore = new InMemoryCheckpointStore();

/** 重置默认内存 store (仅测试用)。 */
export function __resetDefaultStoreForTests(): void {
  // 重新创建实例，丢弃所有状态
  (defaultStore as { state: Map<string, ConsumerCheckpoint> }).state.clear();
}
