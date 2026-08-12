"use client";

import { useMemo } from "react";
import { Check, Sparkles, Zap, Gauge, AlertTriangle } from "lucide-react";
import type { ModelDescriptor, ModelRecommendation } from "@/lib/client/v2/models/types";
import {
  costLevelSymbol,
  speedRangeLabel,
  tierLabel,
} from "@/lib/client/v2/models/router";

interface SmartRecommendationProps {
  recommendation: ModelRecommendation;
  model: ModelDescriptor;
  locale: "zh-CN" | "en-US";
  onAccept: () => void;
  onSwitchProfessional: () => void;
}

const shellStyle: React.CSSProperties = {
  padding: 20,
  borderRadius: 14,
  background:
    "linear-gradient(180deg, rgba(109,231,223,0.10) 0%, rgba(255,255,255,0.03) 100%)",
  border: "1px solid rgba(109,231,223,0.32)",
  marginBottom: 16,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 12,
};

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#6de7df",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1,
  textTransform: "uppercase",
};

const modelNameStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 900,
  color: "#f4f7f8",
};

const reasonStyle: React.CSSProperties = {
  margin: "8px 0 14px",
  fontSize: 14,
  lineHeight: 1.7,
  color: "rgba(255,255,255,0.82)",
};

const metaRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: 10,
  marginBottom: 14,
};

const metaItemStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const metaLabelStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: "rgba(255,255,255,0.5)",
  letterSpacing: 0.4,
  marginBottom: 4,
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const metaValueStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#f4f7f8",
  fontWeight: 700,
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const acceptButtonStyle: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "1px solid #6de7df",
  background: "#6de7df",
  color: "#070808",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 800,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const switchButtonStyle: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "transparent",
  color: "rgba(255,255,255,0.82)",
  cursor: "pointer",
  fontSize: 14,
};

const limitationStyle: React.CSSProperties = {
  margin: "10px 0 0",
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(255,209,102,0.08)",
  border: "1px solid rgba(255,209,102,0.28)",
  fontSize: 13,
  color: "rgba(255,255,255,0.78)",
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
};

export function SmartRecommendation({
  recommendation,
  model,
  locale,
  onAccept,
  onSwitchProfessional,
}: SmartRecommendationProps) {
  const isZh = locale === "zh-CN";

  const speedText = useMemo(
    () => speedRangeLabel(recommendation.estimatedSpeed, locale),
    [recommendation.estimatedSpeed, locale],
  );

  const costText = useMemo(() => {
    const sym = costLevelSymbol(recommendation.costLevel);
    const { min, max, unit } = model.costEstimate;
    if (min === 0 && max === 0) {
      return isZh ? `${sym} · 不可用` : `${sym} · N/A`;
    }
    return `${sym} · ¥${min}-${max}/${unit}`;
  }, [recommendation.costLevel, model.costEstimate, isZh]);

  return (
    <div style={shellStyle}>
      <div style={headerStyle}>
        <Sparkles size={18} color="#6de7df" />
        <div>
          <p style={eyebrowStyle}>
            {isZh ? "智能推荐" : "Smart Recommendation"}
          </p>
          <h3 style={modelNameStyle}>{model.name}</h3>
        </div>
      </div>

      <p style={reasonStyle}>{recommendation.reason}</p>

      <div style={metaRowStyle}>
        <div style={metaItemStyle}>
          <p style={metaLabelStyle}>
            <Gauge size={12} />
            {isZh ? "预计速度" : "Speed"}
          </p>
          <p style={metaValueStyle}>
            {tierLabel(recommendation.estimatedSpeed, locale)} · {speedText}
          </p>
        </div>
        <div style={metaItemStyle}>
          <p style={metaLabelStyle}>
            <Zap size={12} />
            {isZh ? "成本等级" : "Cost"}
          </p>
          <p style={metaValueStyle}>{costText}</p>
        </div>
        <div style={metaItemStyle}>
          <p style={metaLabelStyle}>{isZh ? "适合任务" : "Suitable For"}</p>
          <p style={metaValueStyle}>{recommendation.suitableFor}</p>
        </div>
        <div style={metaItemStyle}>
          <p style={metaLabelStyle}>{isZh ? "类型 / 一致性" : "Type / Consistency"}</p>
          <p style={metaValueStyle}>
            {tierLabel(model.type, locale)} · {tierLabel(model.capabilities.consistency, locale)}
          </p>
        </div>
      </div>

      <div style={limitationStyle}>
        <AlertTriangle size={14} color="#ffd166" style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          <strong style={{ color: "#ffd166" }}>{isZh ? "主要限制：" : "Limitations: "}</strong>
          {recommendation.limitations}
        </span>
      </div>

      <div style={actionsStyle}>
        <button type="button" style={acceptButtonStyle} onClick={onAccept}>
          <Check size={16} />
          {isZh ? "接受推荐" : "Accept"}
        </button>
        <button type="button" style={switchButtonStyle} onClick={onSwitchProfessional}>
          {isZh ? "切换到专业模式" : "Switch to Professional"}
        </button>
      </div>
    </div>
  );
}
