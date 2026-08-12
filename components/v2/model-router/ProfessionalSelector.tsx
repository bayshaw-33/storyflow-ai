"use client";

import { useMemo } from "react";
import { Filter, Lock } from "lucide-react";
import type {
  ConsistencyTier,
  CostTier,
  ModelDescriptor,
  ModelFilters,
  ModelStatus,
  ModelType,
  QualityTier,
  ReferenceImageAbility,
  SpeedTier,
} from "@/lib/client/v2/models/types";
import {
  QUALITY_ORDER,
  STATUS_ORDER,
  costLevelSymbol,
  getDisabledReason,
  statusColor,
  tierLabel,
} from "@/lib/client/v2/models/router";

interface ProfessionalSelectorProps {
  models: ModelDescriptor[];
  filters: ModelFilters;
  onFiltersChange: (next: ModelFilters) => void;
  selectedModelId: string | null;
  onSelect: (model: ModelDescriptor) => void;
  /** 当前任务类型，用于检测不适合 */
  taskType?: string;
  locale: "zh-CN" | "en-US";
}

const shellStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
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

const filterGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  gap: 8,
  marginBottom: 14,
};

const filterGroupStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const filterLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.5)",
  letterSpacing: 0.4,
};

const selectStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 6,
  background: "rgba(7,8,8,0.6)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "#f4f7f8",
  fontSize: 12,
  width: "100%",
};

const listStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  gap: 10,
};

const cardStyle = (selected: boolean, disabled: boolean): React.CSSProperties => ({
  padding: 12,
  borderRadius: 10,
  background: selected ? "rgba(109,231,223,0.10)" : "rgba(255,255,255,0.03)",
  border: selected
    ? "1px solid rgba(109,231,223,0.6)"
    : disabled
      ? "1px solid rgba(255,139,139,0.24)"
      : "1px solid rgba(255,255,255,0.08)",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
  position: "relative",
});

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 8,
  marginBottom: 8,
};

const modelNameStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 800,
  color: "#f4f7f8",
};

const metaLineStyle: React.CSSProperties = {
  margin: "2px 0 0",
  fontSize: 11,
  color: "rgba(255,255,255,0.5)",
};

const badgeRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginBottom: 8,
};

const badgeStyle = (color: string): React.CSSProperties => ({
  fontSize: 10,
  padding: "2px 6px",
  borderRadius: 999,
  border: `1px solid ${color}55`,
  color,
  background: "rgba(255,255,255,0.02)",
});

const costPreviewStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
  color: "#6de7df",
  fontWeight: 700,
};

const disabledReasonStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: 11,
  color: "#ff8b8b",
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const emptyStyle: React.CSSProperties = {
  padding: "32px 16px",
  textAlign: "center",
  color: "rgba(255,255,255,0.55)",
  fontSize: 13,
};

// 筛选选项（顺序即下拉顺序）
const TYPE_OPTIONS: ModelType[] = ["text", "image", "edit", "video", "audio"];
const QUALITY_OPTIONS: QualityTier[] = ["high", "medium", "standard"];
const SPEED_OPTIONS: SpeedTier[] = ["fast", "medium", "slow"];
const COST_OPTIONS: CostTier[] = ["low", "medium", "high"];
const REF_OPTIONS: ReferenceImageAbility[] = ["yes", "no"];
const CONSISTENCY_OPTIONS: ConsistencyTier[] = ["strong", "medium", "weak"];
const STATUS_OPTIONS: ModelStatus[] = ["available", "degraded", "unavailable"];

/** 渲染单个筛选下拉 */
function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  locale,
  placeholder,
}: {
  label: string;
  value: T | undefined;
  options: T[];
  onChange: (next: T | undefined) => void;
  locale: "zh-CN" | "en-US";
  placeholder: string;
}) {
  return (
    <div style={filterGroupStyle}>
      <label style={filterLabelStyle}>{label}</label>
      <select
        style={selectStyle}
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {tierLabel(opt, locale)}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * 专业模式选择器。
 * 用户可按 type / quality / speed / cost / referenceImage / consistency / status
 * 多维度筛选，并手动选择模型。不可用模型禁用并说明原因。
 */
export function ProfessionalSelector({
  models,
  filters,
  onFiltersChange,
  selectedModelId,
  onSelect,
  taskType,
  locale,
}: ProfessionalSelectorProps) {
  const isZh = locale === "zh-CN";

  const filtered = useMemo(() => {
    return models
      .filter((m) => {
        if (filters.type && m.type !== filters.type) return false;
        if (filters.quality && m.capabilities.quality !== filters.quality) return false;
        if (filters.speed && m.capabilities.speed !== filters.speed) return false;
        if (filters.cost && m.capabilities.cost !== filters.cost) return false;
        if (filters.referenceImage && m.capabilities.referenceImage !== filters.referenceImage) return false;
        if (filters.consistency && m.capabilities.consistency !== filters.consistency) return false;
        if (filters.status && m.status !== filters.status) return false;
        return true;
      })
      .sort((a, b) => {
        // 可用优先 → 质量优先
        const statusDelta = STATUS_ORDER[b.status] - STATUS_ORDER[a.status];
        if (statusDelta !== 0) return statusDelta;
        return QUALITY_ORDER[b.capabilities.quality] - QUALITY_ORDER[a.capabilities.quality];
      });
  }, [models, filters]);

  return (
    <div style={shellStyle}>
      <h3 style={titleStyle}>
        <Filter size={16} color="#6de7df" />
        {isZh ? "专业模式 · 手动选择" : "Professional · Manual"}
      </h3>

      <div style={filterGridStyle}>
        <FilterSelect
          label={isZh ? "类型" : "Type"}
          value={filters.type}
          options={TYPE_OPTIONS}
          onChange={(next) => onFiltersChange({ ...filters, type: next })}
          locale={locale}
          placeholder={isZh ? "全部" : "All"}
        />
        <FilterSelect
          label={isZh ? "质量" : "Quality"}
          value={filters.quality}
          options={QUALITY_OPTIONS}
          onChange={(next) => onFiltersChange({ ...filters, quality: next })}
          locale={locale}
          placeholder={isZh ? "全部" : "All"}
        />
        <FilterSelect
          label={isZh ? "速度" : "Speed"}
          value={filters.speed}
          options={SPEED_OPTIONS}
          onChange={(next) => onFiltersChange({ ...filters, speed: next })}
          locale={locale}
          placeholder={isZh ? "全部" : "All"}
        />
        <FilterSelect
          label={isZh ? "成本" : "Cost"}
          value={filters.cost}
          options={COST_OPTIONS}
          onChange={(next) => onFiltersChange({ ...filters, cost: next })}
          locale={locale}
          placeholder={isZh ? "全部" : "All"}
        />
        <FilterSelect
          label={isZh ? "参考图" : "Reference"}
          value={filters.referenceImage}
          options={REF_OPTIONS}
          onChange={(next) => onFiltersChange({ ...filters, referenceImage: next })}
          locale={locale}
          placeholder={isZh ? "全部" : "All"}
        />
        <FilterSelect
          label={isZh ? "一致性" : "Consistency"}
          value={filters.consistency}
          options={CONSISTENCY_OPTIONS}
          onChange={(next) => onFiltersChange({ ...filters, consistency: next })}
          locale={locale}
          placeholder={isZh ? "全部" : "All"}
        />
        <FilterSelect
          label={isZh ? "状态" : "Status"}
          value={filters.status}
          options={STATUS_OPTIONS}
          onChange={(next) => onFiltersChange({ ...filters, status: next })}
          locale={locale}
          placeholder={isZh ? "全部" : "All"}
        />
      </div>

      {filtered.length === 0 ? (
        <div style={emptyStyle}>
          {isZh ? "没有匹配的模型，请调整筛选条件。" : "No models match the filters."}
        </div>
      ) : (
        <div style={listStyle}>
          {filtered.map((model) => {
            const disabledReason = getDisabledReason(model, taskType);
            const isSelected = selectedModelId === model.id;
            const sColor = statusColor(model.status);
            return (
              <div
                key={model.id}
                style={cardStyle(isSelected, Boolean(disabledReason))}
                onClick={() => {
                  if (disabledReason) return;
                  onSelect(model);
                }}
                role="button"
                aria-disabled={Boolean(disabledReason)}
              >
                <div style={cardHeaderStyle}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={modelNameStyle}>{model.name}</p>
                    <p style={metaLineStyle}>
                      {model.provider} · {tierLabel(model.type, locale)}
                    </p>
                  </div>
                  <span style={badgeStyle(sColor)}>{tierLabel(model.status, locale)}</span>
                </div>

                <div style={badgeRowStyle}>
                  <span style={badgeStyle("#6de7df")}>
                    {isZh ? "质量" : "Q"}: {tierLabel(model.capabilities.quality, locale)}
                  </span>
                  <span style={badgeStyle("#7dd181")}>
                    {isZh ? "速度" : "S"}: {tierLabel(model.capabilities.speed, locale)}
                  </span>
                  <span style={badgeStyle("#ffd166")}>
                    {costLevelSymbol(model.capabilities.cost)}
                  </span>
                  <span style={badgeStyle("rgba(255,255,255,0.6)")}>
                    {isZh ? "参考图" : "Ref"}: {tierLabel(model.capabilities.referenceImage, locale)}
                  </span>
                  <span style={badgeStyle("rgba(255,255,255,0.6)")}>
                    {isZh ? "一致性" : "Con"}: {tierLabel(model.capabilities.consistency, locale)}
                  </span>
                </div>

                <p style={costPreviewStyle}>
                  ¥{model.costEstimate.min}-{model.costEstimate.max}/{model.costEstimate.unit}
                </p>

                {disabledReason && (
                  <p style={disabledReasonStyle}>
                    <Lock size={11} />
                    {disabledReason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
