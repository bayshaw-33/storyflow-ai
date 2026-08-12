"use client";

import { RefreshCw } from "lucide-react";
import type { JobType } from "@/lib/client/v2/jobs/types";
import { ALL_JOB_TYPES, JOB_TYPE_LABELS_ZH, JOB_TYPE_LABELS_EN } from "@/lib/client/v2/jobs/grouping";

export type GroupingDimension = "stage" | "type" | "project";

export interface TaskFiltersProps {
  locale: string;
  dimension: GroupingDimension;
  onDimensionChange: (d: GroupingDimension) => void;
  typeFilter: "all" | JobType;
  onTypeFilterChange: (t: "all" | JobType) => void;
  activeOnly: boolean;
  onActiveOnlyChange: (v: boolean) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

const barStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: 16,
};

const groupStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  flexWrap: "wrap",
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    cursor: "pointer",
    border: active ? "1px solid #6de7df" : "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(109,231,223,0.12)" : "transparent",
    color: active ? "#6de7df" : "rgba(255,255,255,0.7)",
  };
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.45)",
  marginRight: 4,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

export function TaskFilters({
  locale,
  dimension,
  onDimensionChange,
  typeFilter,
  onTypeFilterChange,
  activeOnly,
  onActiveOnlyChange,
  onRefresh,
  refreshing,
}: TaskFiltersProps) {
  const isZh = locale === "zh-CN";
  const dimensionOptions: { value: GroupingDimension; label: string }[] = [
    { value: "stage", label: isZh ? "按状态" : "By status" },
    { value: "type", label: isZh ? "按类型" : "By type" },
    { value: "project", label: isZh ? "按项目" : "By project" },
  ];

  return (
    <div style={barStyle}>
      <div style={groupStyle}>
        <span style={labelStyle}>{isZh ? "分组" : "Group"}</span>
        {dimensionOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            style={chipStyle(dimension === opt.value)}
            onClick={() => onDimensionChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={groupStyle}>
        <span style={labelStyle}>{isZh ? "类型" : "Type"}</span>
        <button
          type="button"
          style={chipStyle(typeFilter === "all")}
          onClick={() => onTypeFilterChange("all")}
        >
          {isZh ? "全部" : "All"}
        </button>
        {ALL_JOB_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            style={chipStyle(typeFilter === t)}
            onClick={() => onTypeFilterChange(t)}
          >
            {isZh ? JOB_TYPE_LABELS_ZH[t] : JOB_TYPE_LABELS_EN[t]}
          </button>
        ))}
      </div>

      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "rgba(255,255,255,0.7)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={(e) => onActiveOnlyChange(e.target.checked)}
          style={{ accentColor: "#6de7df" }}
        />
        {isZh ? "仅看进行中" : "Active only"}
      </label>

      <button
        type="button"
        onClick={onRefresh}
        style={{
          ...chipStyle(false),
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginLeft: "auto",
        }}
      >
        <RefreshCw size={12} className={refreshing ? "tc-spin" : undefined} />
        {isZh ? "刷新" : "Refresh"}
      </button>
    </div>
  );
}
