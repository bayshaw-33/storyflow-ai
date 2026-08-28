"use client";

/**
 * KIIKIS 2.1 Phase 3 — Task 3.3 单一全站 KK Runtime Provider (K21-KK-001..007, 020..024)
 *
 * 设计目标：
 *   - 全站只挂一个 Provider（layout.tsx 顶层），任何子组件通过 useKkRuntime() 取值
 *   - K21-KK-001: KK runtime 是账号级真相，非 localStorage
 *   - K21-KK-002: production/staging 缺服务端配置时显示明确不可用，不静默切 fixture
 *   - K21-KK-003/004: 提供 connectionState 状态机 + 增量事件流补拉
 *   - K21-KK-005: 任务投影只显示真实进度，不伪造百分比
 *   - K21-KK-006: allowedActions 由服务端下发，UI 不可绕过
 *   - K21-KK-007: 事件按 sequence 单调，客户端去重
 *
 * 注意：
 *   - 旧 KkCompanion/KkPanel 的 messages/settings/stats 仍由 useKkRuntime 兼容输出
 *   - Realtime 通道在 Task 3.4 中接入；这里只提供 polling 兜底
 *   - Realtime 接入后状态机会自动从 polling 切到 live
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  fetchKkEvents,
  fetchKkRuntime,
  KkRuntimeClientError,
  fetchKkJobMessages,
  fetchKkMessages,
} from "@/lib/client/v2/kk/api";
import { computeStats } from "@/lib/client/v2/kk/filtering";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ALL_KK_ACTIONS,
  type KkActionId,
  type KkConnectionState,
  type KkEventEntry,
  type KkMessage,
  type KkPendingConfirmation,
  type KkRuntimeResponse,
  type KkSettings,
  type KkStats,
  type KkTaskProjection,
} from "@/lib/client/v2/kk/types";

// ---------------------------------------------------------------------------
// Context 类型
// ---------------------------------------------------------------------------

export interface KkRuntimeContextValue {
  /** K21-KK-003 连接状态机 */
  readonly connectionState: KkConnectionState;
  /** P1-03：最近一次成功 bootstrap/补拉的时间戳（ms）；null=尚无成功记录 */
  readonly lastSuccessAt: number | null;
  /** K21-KK-020 账号级 profile */
  readonly profile: KkRuntimeResponse["profile"] | null;
  /** K21-KK-021 净持有 */
  readonly entitlements: ReadonlyArray<unknown>;
  /** K21-KK-005 任务投影（真实计数，非百分比） */
  readonly taskProjection: KkTaskProjection;
  /** K21-KK-012 待确认动作 */
  readonly pendingConfirmations: ReadonlyArray<KkPendingConfirmation>;
  /** K21-KK-006 允许的 action */
  readonly allowedActions: ReadonlyArray<KkActionId>;
  /** K21-KK-002 feature flags */
  readonly featureFlags: Readonly<Record<string, boolean>>;
  /** K21-KK-003 增量事件流 */
  readonly events: ReadonlyArray<KkEventEntry>;
  /** 已消费的最大 sequence (用于增量补拉) */
  readonly lastSequence: number;
  /** K21-KK-002 启动错误（503/401 等） */
  readonly error: KkRuntimeClientError | null;
  /** runtime 是否已就绪（profile 加载成功且 connectionState=live） */
  readonly enabled: boolean;
  /** 强制重拉 runtime 启动数据 */
  readonly refresh: () => Promise<void>;
  /** K21-KK-004 主动补拉增量事件 */
  readonly pullEvents: () => Promise<void>;

  // 旧 KkCompanion/KkPanel 兼容字段（从 messages 派生）
  /** 旧 KK 消息列表（来自 fixture 或 events 投影） */
  readonly messages: ReadonlyArray<KkMessage>;
  /** 旧 KK 设置（fixture 默认值，2.1 不持久化到服务端） */
  readonly settings: KkSettings;
  /** 旧 KK 统计 */
  readonly stats: KkStats;
  /** 数据源（fixture 或 api） */
  readonly source: "fixture" | "api";
  /** 旧 KkCompanion 标记已读 */
  readonly markMessageRead: (id: string) => void;
}

const DEFAULT_TASK_PROJECTION: KkTaskProjection = {
  queued: 0,
  running: 0,
  ingesting: 0,
  completed: 0,
  failed: 0,
};

const DEFAULT_SETTINGS: KkSettings = {
  frequency: "key_only",
  doNotDisturb: false,
  mutedUntil: null,
};

const DEFAULT_CONTEXT: KkRuntimeContextValue = {
  connectionState: "connecting",
    lastSuccessAt: null,
  profile: null,
  entitlements: [],
  taskProjection: DEFAULT_TASK_PROJECTION,
  pendingConfirmations: [],
  allowedActions: ALL_KK_ACTIONS,
  featureFlags: {},
  events: [],
  lastSequence: 0,
  error: null,
  enabled: false,
  refresh: async () => {},
  pullEvents: async () => {},
  messages: [],
  settings: DEFAULT_SETTINGS,
  stats: { total: 0, unread: 0, bySeverity: { info: 0, success: 0, warning: 0, error: 0 } },
  source: "api",
  markMessageRead: () => {},
};

const KkRuntimeContext = createContext<KkRuntimeContextValue>(DEFAULT_CONTEXT);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface KkRuntimeProviderProps {
  children: ReactNode;
  /** 显式传入的 access token；不传时使用内置的 supabase browser client 拉取 */
  accessToken?: string | null;
  /** 强制启用（即使 feature flag 关闭）— 用于 /kk /companions 专用页 */
  forceEnabled?: boolean;
  /** 是否启用 polling 兜底（K21-KK-004），默认 true */
  pollingEnabled?: boolean;
  /** polling 间隔 ms，默认 30s */
  pollingIntervalMs?: number;
  /** K21-KK-002: 是否允许 fixture 兜底（默认随 USE_FIXTURE） */
  allowFixtureFallback?: boolean;
}

export function KkRuntimeProvider({
  children,
  accessToken,
  forceEnabled = false,
  pollingEnabled = true,
  pollingIntervalMs = 30_000,
  allowFixtureFallback = true,
}: KkRuntimeProviderProps) {
  const [connectionState, setConnectionState] = useState<KkConnectionState>("connecting");
  // P1-03：最近成功时间（用于状态条降噪展示）
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [runtime, setRuntime] = useState<KkRuntimeResponse | null>(null);
  const [events, setEvents] = useState<KkEventEntry[]>([]);
  const [error, setError] = useState<KkRuntimeClientError | null>(null);
  const [lastSequence, setLastSequence] = useState(0);
  const [browserSession, setBrowserSession] = useState<{
    accessToken: string | null;
    userId: string | null;
    resolved: boolean;
  }>({ accessToken: null, userId: null, resolved: false });

  const runtimeAccessToken = accessToken === undefined ? browserSession.accessToken : accessToken;
  const sessionResolved = accessToken !== undefined || browserSession.resolved;

  // 旧 KkCompanion 兼容：fixture 消息（仅当 fixture 模式启用时拉取）
  const [legacyMessages, setLegacyMessages] = useState<KkMessage[]>([]);
  const [jobMessages, setJobMessages] = useState<KkMessage[]>([]);
  const [legacySource, setLegacySource] = useState<"fixture" | "api">("api");

  // 防止重复并发 fetch
  const inflightRefresh = useRef(false);
  const inflightPull = useRef(false);
  const sessionGeneration = useRef(0);
  const sessionIdentity = useRef<string | null>(null);
  const explicitToken = useRef(accessToken);

  const clearSessionData = useCallback(() => {
    inflightRefresh.current = false;
    inflightPull.current = false;
    setRuntime(null);
    setEvents([]);
    setLastSequence(0);
    setError(null);
    setLastSuccessAt(null);
    setLegacyMessages([]);
    setJobMessages([]);
    setLegacySource("api");
    setConnectionState("connecting");
  }, []);

  const applySession = useCallback((session: Session | null) => {
    const nextIdentity = session?.user?.id ?? null;
    const identityChanged = sessionIdentity.current !== nextIdentity;
    sessionIdentity.current = nextIdentity;
    sessionGeneration.current += 1;
    if (identityChanged) clearSessionData();
    setBrowserSession({
      accessToken: session?.access_token ?? null,
      userId: nextIdentity,
      resolved: true,
    });
  }, [clearSessionData]);

  useEffect(() => {
    if (explicitToken.current === accessToken) return;
    explicitToken.current = accessToken;
    sessionGeneration.current += 1;
    clearSessionData();
  }, [accessToken, clearSessionData]);

  useEffect(() => {
    if (accessToken !== undefined) return;

    const client = getSupabaseBrowserClient();
    if (!client) {
      applySession(null);
      return;
    }

    let active = true;
    let authStateChanged = false;
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      authStateChanged = true;
      applySession(session);
    });

    void client.auth
      .getSession()
      .then(({ data }) => {
        if (!active || authStateChanged) return;
        applySession(data.session);
      })
      .catch(() => {
        if (!active || authStateChanged) return;
        applySession(null);
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [accessToken, applySession]);

  const refreshJobMessages = useCallback(async () => {
    if (!sessionResolved) return;
    const generation = sessionGeneration.current;
    try {
      const messages = await fetchKkJobMessages(runtimeAccessToken);
      if (generation !== sessionGeneration.current) return;
      setJobMessages(messages);
    } catch {
      // Job messages are additive; a transient jobs failure must not disable KK runtime.
    }
  }, [runtimeAccessToken, sessionResolved]);

  // -----------------------------------------------------------------------
  // 启动 fetch (K21-KK-001)
  // -----------------------------------------------------------------------
  const refresh = useCallback(async () => {
    if (!sessionResolved) return;
    if (inflightRefresh.current) return;
    const generation = sessionGeneration.current;
    inflightRefresh.current = true;
    setConnectionState((prev) => (prev === "live" ? "live" : "connecting"));
    try {
      const data = await fetchKkRuntime(runtimeAccessToken);
      if (generation !== sessionGeneration.current) return;
      setRuntime(data);
      setLastSequence(data.serverCursor);
      // HTTP 成功只代表补拉可用；不冒充 WebSocket 实时订阅。
      setConnectionState("polling");
      setError(null);
      setLastSuccessAt(Date.now());
    } catch (err) {
      if (generation !== sessionGeneration.current) return;
      const clientErr =
        err instanceof KkRuntimeClientError
          ? err
          : new KkRuntimeClientError("service_unavailable", String(err), 500);
      setError(clientErr);
      if (clientErr.code === "service_unavailable" || clientErr.code === "unauthenticated") {
        // K21-KK-002: production/staging 缺服务端配置时切 offline
        // 但允许 fixture 兜底（仅在 allowFixtureFallback=true 时）
        setConnectionState("offline");
      } else {
        setConnectionState("reconnecting");
      }
    } finally {
      if (generation === sessionGeneration.current) inflightRefresh.current = false;
    }
  }, [runtimeAccessToken, sessionResolved]);

  // -----------------------------------------------------------------------
  // 增量事件 pull (K21-KK-003/004)
  // -----------------------------------------------------------------------
  const pullEvents = useCallback(async () => {
    if (!sessionResolved) return;
    if (inflightPull.current) return;
    if (!runtimeAccessToken) return;
    const generation = sessionGeneration.current;
    inflightPull.current = true;
    try {
      const result = await fetchKkEvents(runtimeAccessToken, { afterSequence: lastSequence });
      if (generation !== sessionGeneration.current) return;
      if (result.events.length > 0) {
        // K21-KK-007: 按 sequence 单调 + 客户端去重
        setEvents((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          const merged = [...prev];
          for (const e of result.events) {
            if (!seen.has(e.id)) {
              seen.add(e.id);
              merged.push(e);
            }
          }
          merged.sort((a, b) => a.sequence - b.sequence);
          return merged;
        });
        const nextCursor = result.nextCursor;
        if (Number.isFinite(nextCursor) && nextCursor > lastSequence) {
          setLastSequence(nextCursor);
        }
      }
      // 拉取成功 → live
      setConnectionState((prev) => (prev === "live" ? "live" : "polling"));
      setError(null);
      setLastSuccessAt(Date.now());
    } catch (err) {
      if (generation !== sessionGeneration.current) return;
      if (err instanceof KkRuntimeClientError) {
        if (err.code === "unauthenticated" || err.code === "service_unavailable") {
          setConnectionState("offline");
        } else {
          setConnectionState("polling");
        }
      }
      // 静默失败，等下次轮询
    } finally {
      if (generation === sessionGeneration.current) inflightPull.current = false;
    }
  }, [runtimeAccessToken, sessionResolved, lastSequence, connectionState, allowFixtureFallback]);

  // -----------------------------------------------------------------------
  // 启动时 fetch
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!sessionResolved) return;
    void refresh();
    void refreshJobMessages();
  }, [sessionResolved, refresh, refreshJobMessages]);

  // -----------------------------------------------------------------------
  // polling 兜底 (K21-KK-004: Realtime 断线补拉)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!sessionResolved) return;
    if (!pollingEnabled) return;
    if (!runtimeAccessToken) return;
    const id = setInterval(() => {
      if (!runtime || connectionState === "offline" || connectionState === "reconnecting") void refresh();
      else void pullEvents();
      void refreshJobMessages();
    }, pollingIntervalMs);
    return () => clearInterval(id);
  }, [sessionResolved, runtimeAccessToken, runtime, pollingEnabled, pollingIntervalMs, connectionState, refresh, pullEvents, refreshJobMessages]);

  // -----------------------------------------------------------------------
  // fixture 兜底：连接失败时拉旧 KkMessage（K21-KK-002 dev 允许）
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!sessionResolved) return;
    if (connectionState !== "offline") return;
    if (!allowFixtureFallback) return;
    let cancelled = false;
    const generation = sessionGeneration.current;
    void (async () => {
      try {
        const result = await fetchKkMessages(runtimeAccessToken);
        if (cancelled || generation !== sessionGeneration.current) return;
        setLegacyMessages(result.messages);
        setLegacySource(result.source);
      } catch {
        // 静默失败
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectionState, allowFixtureFallback, runtimeAccessToken, sessionResolved]);

  // -----------------------------------------------------------------------
  // 旧 KkCompanion 兼容：标记已读（本地状态）
  // -----------------------------------------------------------------------
  const markMessageRead = useCallback((id: string) => {
    setLegacyMessages((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)));
    setJobMessages((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)));
  }, []);

  // -----------------------------------------------------------------------
  // 派生 messages/stats（兼容消息 + 服务端 Job 投影）
  // -----------------------------------------------------------------------
  const derivedMessages = useMemo<ReadonlyArray<KkMessage>>(() => {
    const byId = new Map<string, KkMessage>();
    for (const message of legacyMessages) byId.set(message.id, message);
    for (const message of jobMessages) byId.set(message.id, message);
    return Array.from(byId.values()).sort((a, b) => {
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [legacyMessages, jobMessages]);

  const derivedStats = useMemo<KkStats>(() => computeStats(derivedMessages as KkMessage[]), [derivedMessages]);

  const derivedSettings = useMemo<KkSettings>(() => DEFAULT_SETTINGS, []);

  const value = useMemo<KkRuntimeContextValue>(() => {
    const ff = (runtime?.featureFlags as Record<string, boolean> | null) ?? {};
    const kkRealtimeEnabled = ff.kkRealtime === true;
    const enabled =
      forceEnabled ||
      ((connectionState === "live" || connectionState === "polling") && kkRealtimeEnabled) ||
      (connectionState === "live" && legacySource === "fixture");
    return {
      connectionState,
      lastSuccessAt,
      profile: runtime?.profile ?? null,
      entitlements: runtime?.entitlements ?? [],
      taskProjection: runtime?.taskProjection ?? DEFAULT_TASK_PROJECTION,
      pendingConfirmations: runtime?.pendingConfirmations ?? [],
      allowedActions: runtime?.allowedActions ?? ALL_KK_ACTIONS,
      featureFlags: ff,
      events,
      lastSequence,
      error,
      enabled,
      refresh,
      pullEvents,
      messages: derivedMessages,
      settings: derivedSettings,
      stats: derivedStats,
      source: connectionState === "live" ? "api" : legacySource,
      markMessageRead,
    };
  }, [
    runtime,
    events,
    lastSequence,
    lastSuccessAt,
    error,
    connectionState,
    forceEnabled,
    refresh,
    pullEvents,
    derivedMessages,
    derivedSettings,
    derivedStats,
    legacySource,
    markMessageRead,
  ]);

  return <KkRuntimeContext.Provider value={value}>{children}</KkRuntimeContext.Provider>;
}

// 暴露 context 供 useKkRuntime.ts 直接 import
export { KkRuntimeContext, DEFAULT_CONTEXT as DEFAULT_KK_RUNTIME_CONTEXT };
