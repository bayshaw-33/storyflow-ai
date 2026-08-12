"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import type { ModelDescriptor } from "@/lib/client/v2/models/types";

interface DegradationNoticeProps {
  /** 原选择 / 推荐模型 */
  originalModel: ModelDescriptor | null;
  /** 实际调用模型 */
  actualModel: ModelDescriptor;
  /** 可读降级原因 */
  reason?: string | null;
  locale: "zh-CN" | "en-US";
}

const shellStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  background: "rgba(255,209,102,0.08)",
  border: "1px solid rgba(255,209,102,0.32)",
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  marginBottom: 12,
};

const iconWrapStyle: React.CSSProperties = {
  flexShrink: 0,
  marginTop: 2,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 800,
  color: "#ffd166",
  letterSpacing: 0.3,
};

const bodyStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  lineHeight: 1.6,
  color: "rgba(255,255,255,0.86)",
};

const modelFlowStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  marginTop: 6,
  fontSize: 12,
  color: "rgba(255,255,255,0.62)",
};

/**
 * 降级提示组件。
 * 任务执行中发生降级时显示可读原因，对齐 PRD §8.4。
 */
export function DegradationNotice({
  originalModel,
  actualModel,
  reason,
  locale,
}: DegradationNoticeProps) {
  const isZh = locale === "zh-CN";
  const text =
    reason ||
    (isZh
      ? `原模型不可用，已降级到 ${actualModel.name}`
      : `Original model unavailable, downgraded to ${actualModel.name}`);

  return (
    <div style={shellStyle} role="status">
      <div style={iconWrapStyle}>
        <AlertTriangle size={16} color="#ffd166" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={titleStyle}>{isZh ? "降级提示" : "Degradation Notice"}</p>
        <p style={bodyStyle}>{text}</p>
        {originalModel && originalModel.id !== actualModel.id && (
          <div style={modelFlowStyle}>
            <span>{originalModel.name}</span>
            <ArrowRight size={12} />
            <span style={{ color: "#6de7df", fontWeight: 700 }}>{actualModel.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
