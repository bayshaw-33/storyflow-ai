"use client";

import { useMemo } from "react";
import { History, ArrowRight, AlertTriangle } from "lucide-react";
import type { ModelDescriptor, RoutingRecord } from "@/lib/client/v2/models/types";
import { formatRoutingDegradation } from "@/lib/client/v2/models/router";

interface RoutingHistoryProps {
  records: RoutingRecord[];
  /** 模型库，用于把 id 解析为展示名称 */
  models: ModelDescriptor[];
  locale: "zh-CN" | "en-US";
}

const shellStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const titleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 15,
  fontWeight: 800,
  color: "#f4f7f8",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const listStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
  gap: 10,
};

const cardStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const jobIdStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "rgba(255,255,255,0.5)",
  letterSpacing: 0.4,
};

const flowStyle: React.CSSProperties = {
  margin: "6px 0 8px",
  fontSize: 13,
  color: "#f4f7f8",
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const modelChipStyle: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 999,
  background: "rgba(109,231,223,0.10)",
  border: "1px solid rgba(109,231,223,0.28)",
  color: "#6de7df",
  fontSize: 11,
};

const modelChipMutedStyle: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "rgba(255,255,255,0.62)",
  fontSize: 11,
};

const downgradeStyle: React.CSSProperties = {
  margin: "6px 0 0",
  padding: "8px 10px",
  borderRadius: 6,
  background: "rgba(255,209,102,0.08)",
  border: "1px solid rgba(255,209,102,0.24)",
  fontSize: 12,
  color: "rgba(255,255,255,0.82)",
  display: "flex",
  alignItems: "flex-start",
  gap: 6,
};

const costRowStyle: React.CSSProperties = {
  margin: "8px 0 0",
  display: "flex",
  gap: 12,
  fontSize: 12,
  color: "rgba(255,255,255,0.7)",
  flexWrap: "wrap",
};

const statusBadgeStyle = (status: RoutingRecord["resultStatus"]): React.CSSProperties => {
  const color =
    status === "completed"
      ? "#7dd181"
      : status === "failed"
        ? "#ff8b8b"
        : status === "partial_failure"
          ? "#ffd166"
          : "rgba(255,255,255,0.6)";
  return {
    fontSize: 10,
    padding: "2px 6px",
    borderRadius: 999,
    border: `1px solid ${color}55`,
    color,
  };
};

const emptyStyle: React.CSSProperties = {
  padding: "24px 16px",
  textAlign: "center",
  color: "rgba(255,255,255,0.5)",
  fontSize: 13,
};

/** 把 modelId 解析为展示名称 */
function useModelNameMap(models: ModelDescriptor[]): Map<string, string> {
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const m of models) map.set(m.id, m.name);
    return map;
  }, [models]);
}

/**
 * 路由记录列表组件（PRD §8.4 路由记录）。
 * 展示每个任务的：用户选择/系统推荐、实际模型、降级原因、估算与实际成本、结果状态。
 */
export function RoutingHistory({ records, models, locale }: RoutingHistoryProps) {
  const isZh = locale === "zh-CN";
  const nameMap = useModelNameMap(models);

  const statusLabel = (status: RoutingRecord["resultStatus"]): string => {
    const zh: Record<string, string> = {
      draft: "草稿",
      pending_confirm: "待确认",
      queued: "排队中",
      running: "生成中",
      result_ingesting: "结果入库",
      completed: "已完成",
      partial_failure: "部分失败",
      failed: "失败",
      cancelled: "已取消",
    };
    return isZh ? zh[status] || status : status;
  };

  if (records.length === 0) {
    return (
      <div style={shellStyle}>
        <h3 style={titleStyle}>
          <History size={16} color="#6de7df" />
          {isZh ? "路由记录" : "Routing History"}
        </h3>
        <div style={emptyStyle}>
          {isZh ? "暂无路由记录。" : "No routing records yet."}
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <h3 style={titleStyle}>
        <History size={16} color="#6de7df" />
        {isZh ? `路由记录 · ${records.length}` : `Routing History · ${records.length}`}
      </h3>

      <div style={listStyle}>
        {records.map((record) => {
          const downText = formatRoutingDegradation(record);
          const userChoiceName = record.userChoice
            ? nameMap.get(record.userChoice) || record.userChoice
            : null;
          const recName = nameMap.get(record.systemRecommendation) || record.systemRecommendation;
          const actualName = nameMap.get(record.actualModel) || record.actualModel;
          return (
            <div key={record.jobId} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={jobIdStyle}>{record.jobId}</p>
                <span style={statusBadgeStyle(record.resultStatus)}>
                  {statusLabel(record.resultStatus)}
                </span>
              </div>

              <div style={flowStyle}>
                <span style={modelChipMutedStyle}>
                  {isZh ? "推荐" : "Rec"}: {recName}
                </span>
                {userChoiceName && (
                  <span style={modelChipMutedStyle}>
                    {isZh ? "用户" : "User"}: {userChoiceName}
                  </span>
                )}
                <ArrowRight size={12} color="rgba(255,255,255,0.4)" />
                <span style={modelChipStyle}>{actualName}</span>
              </div>

              {record.degraded && downText && (
                <div style={downgradeStyle}>
                  <AlertTriangle size={12} color="#ffd166" style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>{downText}</span>
                </div>
              )}

              <div style={costRowStyle}>
                <span>
                  {isZh ? "估算" : "Est"}: <strong style={{ color: "#f4f7f8" }}>¥{record.estimatedCost.toFixed(2)}</strong>
                </span>
                <span>
                  {isZh ? "实际" : "Actual"}: <strong style={{ color: "#f4f7f8" }}>¥{record.actualCost.toFixed(2)}</strong>
                </span>
                {record.degraded && (
                  <span style={{ color: "#ffd166" }}>
                    {isZh ? "已降级" : "Degraded"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
