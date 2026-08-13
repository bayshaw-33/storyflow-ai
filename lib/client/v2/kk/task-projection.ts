/**
 * KIIKIS 2.1 Phase 3 — Task 3.4 KK 任务投影 (K21-KK-005)
 *
 * 从增量事件流（KkEventEntry[]）聚合任务状态计数。
 *
 * 设计原则：
 *   - K21-KK-005: 只显示服务端可验证的真实进度；不可量化任务只显示阶段
 *   - 不伪造百分比、不预测剩余时间
 *   - 重复事件重放（相同 id）不重复计数
 *   - 任务状态以"最新事件"为准：同一 taskId 先 task_queued 后 task_completed，
 *     投影时 completed=1, queued=0
 */

import type { KkEventEntry, KkTaskProjection } from "./types";

/** 默认空投影 */
export const ZERO_TASK_PROJECTION: KkTaskProjection = {
  queued: 0,
  running: 0,
  ingesting: 0,
  completed: 0,
  failed: 0,
} as const;

/** K21-KK-005 支持的事件类型 */
export const TASK_EVENT_TYPES = [
  "task_queued",
  "task_running",
  "task_ingesting",
  "task_completed",
  "task_failed",
] as const;
export type TaskEventType = (typeof TASK_EVENT_TYPES)[number];

export function isTaskEventType(t: string): t is TaskEventType {
  return (TASK_EVENT_TYPES as readonly string[]).includes(t);
}

/**
 * 单任务最终状态（按最新事件决定）。
 */
type TaskFinalState = "queued" | "running" | "ingesting" | "completed" | "failed";

/**
 * 从事件流计算任务投影。
 *
 * 算法：
 *   1. 按 sequence 升序排序事件（K21-KK-007 单调性）
 *   2. 对每个 taskId 维护"最新状态"，更新时覆盖旧状态
 *   3. 同时维护 processedIds 防止相同事件重复触发
 *   4. 最终按状态聚合计数
 *
 * @param events 已排序或未排序的事件流
 * @param options 可选 lastSequence 用于过滤
 */
export function computeTaskProjection(
  events: ReadonlyArray<KkEventEntry>,
  options: { processedIds?: Set<string> } = {},
): KkTaskProjection {
  const seen = options.processedIds ?? new Set<string>();
  const taskState = new Map<string, TaskFinalState>();

  // 按 sequence 升序排序，保证"最新事件"覆盖旧状态
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);

  for (const e of sorted) {
    if (!isTaskEventType(e.eventType)) continue;
    // K21-KK-007 幂等：相同事件 id 不重复处理
    if (seen.has(e.id)) continue;
    seen.add(e.id);

    const taskId = e.taskId;
    if (!taskId) {
      // 无 taskId 的事件只能按累计计数（无法去重任务维度）
      // 这里仍计入"事件计数"，但不计入"任务维度"
      // 实际生产中 task_* 事件都应携带 taskId
      continue;
    }

    const finalState: TaskFinalState = e.eventType.replace("task_", "") as TaskFinalState;
    taskState.set(taskId, finalState);
  }

  const result: KkTaskProjection = { ...ZERO_TASK_PROJECTION };
  for (const state of taskState.values()) {
    switch (state) {
      case "queued":
        result.queued += 1;
        break;
      case "running":
        result.running += 1;
        break;
      case "ingesting":
        result.ingesting += 1;
        break;
      case "completed":
        result.completed += 1;
        break;
      case "failed":
        result.failed += 1;
        break;
    }
  }
  return Object.freeze(result);
}

/**
 * 增量更新投影：基于现有 projection + 新事件列表，返回新 projection。
 * 用于 Realtime 推送的增量更新场景。
 */
export function applyEventsToProjection(
  base: KkTaskProjection,
  events: ReadonlyArray<KkEventEntry>,
  options: {
    processedIds: Set<string>;
    /** 维护 taskId → finalState 的快照（增量更新需要） */
    taskStateSnapshot?: Map<string, TaskFinalState>;
  },
): KkTaskProjection {
  // 复用 computeTaskProjection 但传入 base 的快照
  // 简化：重新计算全量投影（事件流应该不会过大；Realtime 推送是增量）
  // 注意：调用方必须复用同一 processedIds，否则会重复计数
  // 这里返回新对象，taskStateSnapshot 不变（因为重算）
  // 优化：将现有 snapshot 作为起点
  const taskState = new Map(options.taskStateSnapshot ?? []);
  for (const e of events) {
    if (!isTaskEventType(e.eventType)) continue;
    if (options.processedIds.has(e.id)) continue;
    options.processedIds.add(e.id);
    if (!e.taskId) continue;
    taskState.set(e.taskId, e.eventType.replace("task_", "") as TaskFinalState);
  }
  const result: KkTaskProjection = { ...ZERO_TASK_PROJECTION };
  for (const state of taskState.values()) {
    switch (state) {
      case "queued":
        result.queued += 1;
        break;
      case "running":
        result.running += 1;
        break;
      case "ingesting":
        result.ingesting += 1;
        break;
      case "completed":
        result.completed += 1;
        break;
      case "failed":
        result.failed += 1;
        break;
    }
  }
  // 更新 snapshot 供下次调用
  if (options.taskStateSnapshot) {
    options.taskStateSnapshot.clear();
    for (const [k, v] of taskState) options.taskStateSnapshot.set(k, v);
  }
  return Object.freeze(result);
}

/**
 * 计算完成率（用于 UI 显示，不作为权威进度）。
 * 完成率 = completed / (queued + running + ingesting + completed + failed)
 * 失败计入分母，不计入分子。
 *
 * K21-KK-005: 不主动展示百分比；这里仅供调用方在用户明确请求时使用。
 * 完成数为 0 时返回 0，不抛 NaN。
 */
export function computeCompletionRate(projection: KkTaskProjection): number {
  const total =
    projection.queued +
    projection.running +
    projection.ingesting +
    projection.completed +
    projection.failed;
  if (total === 0) return 0;
  return projection.completed / total;
}
