"use client";

/**
 * P1-06 — 遗留工作台入口解析失败/缺参提示。
 *
 * 旧行为：resolve 失败即 router.replace("/projects/new-v2")，projectId 被
 * 丢弃、用户被误导进"新建项目"选择态。现在停留本页（URL 保留 projectId），
 * 显示可解释的错误与去向，可重试。
 */

import { AlertTriangle, ArrowLeft, RefreshCw, SquarePen } from "lucide-react";

export function LegacyEntryNotice(props: {
  kind: "failed" | "no-project";
  projectId?: string | null;
  message?: string | null;
  onRetry?: () => void;
}) {
  const { kind, projectId, message, onRetry } = props;
  const isFailed = kind === "failed";

  return (
    <main className="cosmic-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh" }}>
      <section
        role="status"
        style={{
          maxWidth: 480,
          width: "100%",
          padding: "26px 24px",
          borderRadius: 16,
          border: "1px solid var(--border, rgba(255,255,255,0.12))",
          background: "var(--surface, #10131c)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={20} color={isFailed ? "#ffd166" : "#9aa3b2"} />
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {isFailed ? "暂时无法进入该项目的工作台" : "未指定项目"}
          </h1>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-secondary, #9aa3b2)", lineHeight: 1.6 }}>
          {isFailed
            ? "解析项目时出现问题。项目 ID 仍保留在地址栏，不会丢失；你可以重试，或返回项目库稍后再进。"
            : "这个入口需要携带 projectId 访问。请从项目库选择项目，或新建一个项目。"}
        </p>
        {isFailed && message ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-secondary, #9aa3b2)", padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
            原因：{message}
          </p>
        ) : null}
        {isFailed && projectId ? (
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-secondary, #9aa3b2)", opacity: 0.8 }}>
            项目 ID：{projectId}
          </p>
        ) : null}
        <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          {isFailed && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "none", background: "#14B8A6", color: "#04110f", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
            >
              <RefreshCw size={13} /> 重试
            </button>
          ) : null}
          <a
            href="/projects"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--border, rgba(255,255,255,0.14))", background: "transparent", color: "inherit", fontSize: 13, textDecoration: "none" }}
          >
            <ArrowLeft size={13} /> 返回项目库
          </a>
          <a
            href="/projects/new-v2"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--border, rgba(255,255,255,0.14))", background: "transparent", color: "inherit", fontSize: 13, textDecoration: "none" }}
          >
            <SquarePen size={13} /> 新建项目
          </a>
        </div>
      </section>
    </main>
  );
}
