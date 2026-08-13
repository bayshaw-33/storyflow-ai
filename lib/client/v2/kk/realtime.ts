"use client";

/**
 * KIIKIS 2.1 Phase 3 — Task 3.4 KK Realtime 客户端 + 状态机 (K21-KK-003/004/007)
 *
 * 职责：
 *   - 订阅 storyflow_creative_events 的 owner 可见事件（Postgres Changes）
 *   - 维护 KkConnectionState 状态机：connecting → live → reconnecting → polling → offline
 *   - 按 sequence 单调 + 客户端去重 (K21-KK-007)
 *   - 相同 event 重放只触发一次副作用（调用方通过 processedIds 判断）
 *
 * 不依赖 React，可单独被 hook 或测试 import。
 *
 * 不做：
 *   - 不直接显示 toast / 写成就；由调用方根据事件回调决定 UI 副作用
 *   - 不替换 KkRuntimeProvider 的 polling 兜底（realtime.ts 与 polling 互补）
 */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type {
  KkConnectionState,
  KkEventEntry,
} from "./types";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface KkRealtimeEventPayload {
  readonly id: string;
  readonly sequence: number;
  readonly event_type: string;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly task_id: string | null;
  readonly occurred_at: string;
  readonly payload: Record<string, unknown> | null;
}

export interface KkRealtimeClientOptions {
  /** supabase browser client（必须开启 realtime） */
  supabase: SupabaseClient;
  /** 订阅的 owner_id（即 auth user.id） */
  ownerId: string;
  /** 初始 cursor（K21-KK-007：只接受 sequence > lastSequence 的事件） */
  initialCursor: number;
  /** 收到合法增量事件时触发（去重后） */
  onEvent: (event: KkEventEntry) => void;
  /** 连接状态变化时触发 */
  onStateChange: (state: KkConnectionState, info: KkRealtimeStateInfo) => void;
  /** 最大重连尝试次数，默认 5 */
  maxReconnectAttempts?: number;
  /** 重连基础退避 ms，默认 1000（指数退避） */
  reconnectBaseMs?: number;
  /** 最大重连退避上限 ms，默认 30000 */
  reconnectMaxMs?: number;
  /** 长时间无事件后切到 polling 状态的阈值 ms，默认 60000 */
  staleThresholdMs?: number;
}

export interface KkRealtimeStateInfo {
  /** 最后一次成功同步时间（ISO） */
  readonly lastSyncAt: string | null;
  /** 最后一次已处理 sequence */
  readonly lastSequence: number;
  /** 累计重连尝试次数（成功后归零） */
  readonly reconnectAttempts: number;
  /** 当前错误（如有） */
  readonly error: string | null;
}

const DEFAULT_OPTS = {
  maxReconnectAttempts: 5,
  reconnectBaseMs: 1000,
  reconnectMaxMs: 30_000,
  staleThresholdMs: 60_000,
} as const;

// ---------------------------------------------------------------------------
// KkRealtimeClient
// ---------------------------------------------------------------------------

/**
 * 单实例 Realtime 客户端。
 * 同一 owner 只应有一个订阅；多订阅由调用方自行管理。
 */
export class KkRealtimeClient {
  private readonly opts: Required<KkRealtimeClientOptions>;
  private channel: RealtimeChannel | null = null;
  private lastSequence: number;
  private lastSyncAt: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private currentState: KkConnectionState = "connecting";
  private currentError: string | null = null;
  /** 已处理事件 id 集合（K21-KK-007：相同 event 不重复触发副作用） */
  private readonly processedIds: Set<string> = new Set();
  /** 已处理事件 id 集合上限，避免无界增长 */
  private readonly processedIdsLimit = 5000;
  private disposed = false;

  constructor(opts: KkRealtimeClientOptions) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
    this.lastSequence = Math.max(0, opts.initialCursor);
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  /** 启动订阅 */
  start(): void {
    if (this.disposed) return;
    if (this.channel) return;
    this.setState("connecting");
    this.subscribe();
    this.scheduleStaleCheck();
  }

  /** 停止订阅并清理资源 */
  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
    if (this.channel) {
      try {
        this.opts.supabase.removeChannel(this.channel);
      } catch {
        // 静默
      }
      this.channel = null;
    }
  }

  /** 主动重连（用户点击刷新按钮时调用） */
  async reconnect(): Promise<void> {
    if (this.disposed) return;
    this.teardownChannel();
    this.setState("reconnecting");
    this.reconnectAttempts = 0;
    this.subscribe();
  }

  /** 标记某事件已被消费（用于外部幂等记账，避免 toast 重复） */
  markProcessed(eventId: string): boolean {
    if (this.processedIds.has(eventId)) return false;
    this.processedIds.add(eventId);
    // LRU 退化：超过上限时清空一半（保守起见）
    if (this.processedIds.size > this.processedIdsLimit) {
      const keep = Array.from(this.processedIds).slice(-Math.floor(this.processedIdsLimit / 2));
      this.processedIds.clear();
      for (const id of keep) this.processedIds.add(id);
    }
    return true;
  }

  /** 查询当前是否已处理某事件 */
  hasProcessed(eventId: string): boolean {
    return this.processedIds.has(eventId);
  }

  /** 当前状态快照 */
  getStateInfo(): KkRealtimeStateInfo {
    return {
      lastSyncAt: this.lastSyncAt,
      lastSequence: this.lastSequence,
      reconnectAttempts: this.reconnectAttempts,
      error: this.currentError,
    };
  }

  /** 当前 connectionState */
  getConnectionState(): KkConnectionState {
    return this.currentState;
  }

  /** 手动更新 cursor（如从 polling 补拉拿到更新后的 sequence） */
  advanceCursor(sequence: number): void {
    if (Number.isFinite(sequence) && sequence > this.lastSequence) {
      this.lastSequence = sequence;
      this.lastSyncAt = new Date().toISOString();
      this.resetStaleTimer();
    }
  }

  // -------------------------------------------------------------------------
  // 内部：订阅 + 状态机
  // -------------------------------------------------------------------------

  private subscribe(): void {
    try {
      const channelName = `kk:events:${this.opts.ownerId}`;
      const channel = this.opts.supabase
        .channel(channelName, {
          config: {
            broadcast: { self: false },
            presence: { key: this.opts.ownerId },
          },
        })
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "storyflow_creative_events",
            filter: `owner_id=eq.${this.opts.ownerId}`,
          },
          (payload: { new?: Record<string, unknown> }) => {
            this.handleIncoming(payload.new);
          },
        )
        .on("system", { event: "disconnected" }, () => {
          this.handleDisconnect("system:disconnected");
        })
        .subscribe((status: string, err?: Error) => {
          this.handleSubscribeStatus(status, err);
        });

      this.channel = channel;
    } catch (err) {
      this.currentError = err instanceof Error ? err.message : String(err);
      this.scheduleReconnect();
    }
  }

  private handleSubscribeStatus(status: string, err?: Error): void {
    if (this.disposed) return;
    switch (status) {
      case "SUBSCRIBED":
        this.reconnectAttempts = 0;
        this.currentError = null;
        this.lastSyncAt = new Date().toISOString();
        this.setState("live");
        this.resetStaleTimer();
        break;
      case "CHANNEL_ERROR":
        this.currentError = err?.message ?? "channel error";
        this.scheduleReconnect();
        break;
      case "TIMED_OUT":
        this.currentError = "subscribe timed out";
        this.scheduleReconnect();
        break;
      case "CLOSED":
        this.currentError = "channel closed";
        // 不主动重连，等待 reconnect() 被调用或 dispose
        this.setState("offline");
        break;
      default:
        // 其他状态忽略
        break;
    }
  }

  private handleDisconnect(reason: string): void {
    if (this.disposed) return;
    this.currentError = reason;
    this.setState("reconnecting");
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.reconnectAttempts >= this.opts.maxReconnectAttempts) {
      // 超过最大重连次数 → 切 polling 模式（由 KkRuntimeProvider 接管补拉）
      this.setState("polling");
      return;
    }
    this.reconnectAttempts += 1;
    const backoff = Math.min(
      this.opts.reconnectBaseMs * Math.pow(2, this.reconnectAttempts - 1),
      this.opts.reconnectMaxMs,
    );
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.disposed) return;
      this.teardownChannel();
      this.subscribe();
    }, backoff);
  }

  private scheduleStaleCheck(): void {
    this.resetStaleTimer();
  }

  private resetStaleTimer(): void {
    if (this.staleTimer) clearTimeout(this.staleTimer);
    if (this.disposed) return;
    this.staleTimer = setTimeout(() => {
      if (this.disposed) return;
      // 长时间无新事件 + 仍处于 live → 提示 polling（让上层主动补拉）
      if (this.currentState === "live") {
        this.setState("polling");
      }
    }, this.opts.staleThresholdMs);
  }

  private teardownChannel(): void {
    if (this.channel) {
      try {
        this.opts.supabase.removeChannel(this.channel);
      } catch {
        // 静默
      }
      this.channel = null;
    }
  }

  private setState(next: KkConnectionState): void {
    if (this.currentState === next) return;
    this.currentState = next;
    this.opts.onStateChange(next, this.getStateInfo());
  }

  // -------------------------------------------------------------------------
  // 内部：事件处理 + 去重
  // -------------------------------------------------------------------------

  private handleIncoming(row: Record<string, unknown> | undefined): void {
    if (!row) return;
    const event = parseEventPayload(row);
    if (!event) return;

    // K21-KK-007: sequence 单调
    if (event.sequence <= this.lastSequence) {
      // 老事件 / 重放：不更新 cursor，但已 processedIds 校验后仍可能跳过
      // 已处理过则不再触发
      if (this.processedIds.has(event.id)) return;
      // 否则允许触发（可能是补拉的旧事件）
    } else {
      this.lastSequence = event.sequence;
    }

    // K21-KK-007: 去重 by id
    if (!this.markProcessed(event.id)) {
      // 已处理过 → 静默跳过，不触发副作用
      return;
    }

    this.lastSyncAt = new Date().toISOString();
    this.resetStaleTimer();
    this.opts.onEvent(event);
  }
}

// ---------------------------------------------------------------------------
// 纯函数：解析 payload (snake_case → camelCase)
// ---------------------------------------------------------------------------

export function parseEventPayload(
  row: Record<string, unknown>,
): KkEventEntry | null {
  if (!row || typeof row !== "object") return null;
  const id = row["id"];
  const sequence = row["sequence"];
  const eventType = row["event_type"];
  const resourceType = row["resource_type"];
  const resourceId = row["resource_id"];
  const occurredAt = row["occurred_at"];
  const payload = row["payload"];

  if (typeof id !== "string" || typeof sequence !== "number") return null;
  if (typeof eventType !== "string" || typeof resourceType !== "string") return null;
  if (typeof resourceId !== "string") return null;
  if (typeof occurredAt !== "string") return null;

  return {
    id,
    sequence,
    eventType,
    resourceType,
    resourceId,
    taskId: typeof row["task_id"] === "string" ? (row["task_id"] as string) : null,
    occurredAt,
    payload:
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {},
  };
}

/**
 * 计算 Realtime 客户端应该向 KkRuntimeProvider 上报的状态信息。
 * 用于断线后 UI 显示"最后同步于 xxx"。
 */
export function formatLastSync(info: KkRealtimeStateInfo, locale: string): string {
  if (!info.lastSyncAt) {
    return locale === "zh-CN" ? "尚未同步" : "Never synced";
  }
  const date = new Date(info.lastSyncAt);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const diffMs = date.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, "hour");
  const diffDay = Math.round(diffHr / 24);
  return rtf.format(diffDay, "day");
}
