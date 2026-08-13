"use client";

import { RefreshCw, WifiOff, Wifi } from "lucide-react";
import { useKkRuntime } from "@/components/v2/kk/useKkRuntime";
import type { KkConnectionState } from "@/lib/client/v2/kk/types";

const CONNECTION_LABEL: Record<KkConnectionState, { zh: string; en: string; color: string }> = {
  connecting: { zh: "连接中", en: "Connecting", color: "#ffd166" },
  live: { zh: "实时", en: "Live", color: "#6de7df" },
  reconnecting: { zh: "重连中", en: "Reconnecting", color: "#ffd166" },
  polling: { zh: "轮询补拉", en: "Polling", color: "#ffd166" },
  offline: { zh: "离线", en: "Offline", color: "#ff8b8b" },
};

export function KkRuntimeStatusClient() {
  const runtime = useKkRuntime();
  const meta = CONNECTION_LABEL[runtime.connectionState];

  const isZh =
    typeof navigator !== "undefined" &&
    (navigator.language?.startsWith("zh") || navigator.languages?.[0]?.startsWith("zh"));

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "60px auto",
        padding: "24px",
        fontFamily: "var(--font-geist-sans, system-ui)",
        color: "#f4f7f8",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
          KK Runtime {isZh ? "状态" : "Status"}
        </h1>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 4 }}>
          {isZh
            ? "K21-KK-001 单一全站 runtime。所有 KK 入口读取同一上下文。"
            : "K21-KK-001 single global runtime. All KK entry points read from the same context."}
        </p>
      </header>

      <section
        style={{
          background: "#0d0f10",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          {runtime.connectionState === "offline" ? <WifiOff size={16} /> : <Wifi size={16} />}
          <span style={{ fontSize: 13, color: meta.color, fontWeight: 700 }}>
            {isZh ? meta.zh : meta.en}
          </span>
          <button
            type="button"
            onClick={() => void runtime.refresh()}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.16)",
              color: "rgba(255,255,255,0.7)",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 11,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <RefreshCw size={12} />
            {isZh ? "刷新" : "Refresh"}
          </button>
        </div>
        {runtime.error && (
          <p style={{ color: "#ff8b8b", fontSize: 12, margin: "8px 0 0" }}>
            {runtime.error.code}: {runtime.error.message}
          </p>
        )}
        <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 12 }}>
          <dt style={{ color: "rgba(255,255,255,0.5)" }}>{isZh ? "数据源" : "Source"}</dt>
          <dd style={{ margin: 0 }}>{runtime.source}</dd>
          <dt style={{ color: "rgba(255,255,255,0.5)" }}>{isZh ? "启用" : "Enabled"}</dt>
          <dd style={{ margin: 0 }}>{runtime.enabled ? "true" : "false"}</dd>
          <dt style={{ color: "rgba(255,255,255,0.5)" }}>{isZh ? "事件 cursor" : "Event cursor"}</dt>
          <dd style={{ margin: 0 }}>{runtime.lastSequence}</dd>
          <dt style={{ color: "rgba(255,255,255,0.5)" }}>{isZh ? "事件总数" : "Events"}</dt>
          <dd style={{ margin: 0 }}>{runtime.events.length}</dd>
        </dl>
      </section>

      <section
        style={{
          background: "#0d0f10",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>
          {isZh ? "任务投影" : "Task Projection"}
          <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
            {isZh ? "K21-KK-005 只显示真实计数，不伪造百分比" : "K21-KK-005 only real counts, no fake %"}
          </span>
        </h2>
        <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 16px", fontSize: 12 }}>
          <dt style={{ color: "rgba(255,255,255,0.5)" }}>queued</dt>
          <dd style={{ margin: 0 }}>{runtime.taskProjection.queued}</dd>
          <dd />
          <dt style={{ color: "rgba(255,255,255,0.5)" }}>running</dt>
          <dd style={{ margin: 0 }}>{runtime.taskProjection.running}</dd>
          <dd />
          <dt style={{ color: "rgba(255,255,255,0.5)" }}>ingesting</dt>
          <dd style={{ margin: 0 }}>{runtime.taskProjection.ingesting}</dd>
          <dd />
          <dt style={{ color: "rgba(255,255,255,0.5)" }}>completed</dt>
          <dd style={{ margin: 0 }}>{runtime.taskProjection.completed}</dd>
          <dd />
          <dt style={{ color: "rgba(255,255,255,0.5)" }}>failed</dt>
          <dd style={{ margin: 0 }}>{runtime.taskProjection.failed}</dd>
          <dd />
        </dl>
      </section>

      <section
        style={{
          background: "#0d0f10",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>
          {isZh ? "待确认动作" : "Pending Confirmations"}
          <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
            {isZh ? "K21-KK-012 高风险动作须用户明确确认" : "K21-KK-012 high-risk actions need user confirmation"}
          </span>
        </h2>
        {runtime.pendingConfirmations.length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0 }}>
            {isZh ? "暂无" : "None"}
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
            {runtime.pendingConfirmations.map((p) => (
              <li key={p.actionId} style={{ marginBottom: 6 }}>
                <strong>{p.actionType}</strong>: {p.summary}
                <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 6 }}>
                  {isZh ? "过期" : "expires"} {p.expiresAt}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        style={{
          background: "#0d0f10",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>
          {isZh ? "允许的动作" : "Allowed Actions"}
          <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
            {isZh ? "K21-KK-006 服务端下发" : "K21-KK-006 server-provided"}
          </span>
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {runtime.allowedActions.map((a) => (
            <span
              key={a}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.16)",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              {a}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
