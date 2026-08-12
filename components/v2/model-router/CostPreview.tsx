"use client";

import { useMemo } from "react";
import { Coins } from "lucide-react";
import type { ModelDescriptor } from "@/lib/client/v2/models/types";
import { formatCostPreview } from "@/lib/client/v2/models/router";

interface CostPreviewProps {
  model: ModelDescriptor | null;
  /** 实际调用模型（发生降级时与 model 不同） */
  actualModel?: ModelDescriptor | null;
  locale: "zh-CN" | "en-US";
}

const shellStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 12,
};

const iconWrapStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: "rgba(109,231,223,0.12)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: "rgba(255,255,255,0.5)",
  letterSpacing: 0.4,
};

const valueStyle: React.CSSProperties = {
  margin: "2px 0 0",
  fontSize: 14,
  fontWeight: 700,
  color: "#f4f7f8",
};

const deltaStyle: React.CSSProperties = {
  marginLeft: 8,
  fontSize: 12,
  color: "#7dd181",
};

/**
 * 任务前成本预览组件。
 * 显示模型预估成本等级，发生降级时同时展示实际模型成本。
 */
export function CostPreview({ model, actualModel, locale }: CostPreviewProps) {
  const isZh = locale === "zh-CN";

  const preview = useMemo(() => {
    if (!model) return null;
    return formatCostPreview(model);
  }, [model]);

  if (!model || !preview) {
    return (
      <div style={shellStyle}>
        <div style={iconWrapStyle}>
          <Coins size={16} color="#6de7df" />
        </div>
        <div>
          <p style={labelStyle}>{isZh ? "任务前成本预览" : "Cost Preview"}</p>
          <p style={valueStyle}>{isZh ? "未选择模型" : "No model selected"}</p>
        </div>
      </div>
    );
  }

  const downgraded = actualModel && actualModel.id !== model.id;
  const actualPreview = downgraded && actualModel ? formatCostPreview(actualModel) : null;

  return (
    <div style={shellStyle}>
      <div style={iconWrapStyle}>
        <Coins size={16} color="#6de7df" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={labelStyle}>{isZh ? "任务前成本预览" : "Cost Preview"}</p>
        <p style={valueStyle}>
          {preview}
          {downgraded && actualPreview && (
            <span style={deltaStyle}>
              {isZh ? `→ 降级后 ${actualPreview}` : `→ after downgrade ${actualPreview}`}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
