/**
 * 多模型路由核心逻辑：
 *   - 智能推荐匹配（taskType + taskParams → ModelRecommendation + ModelDescriptor）
 *   - 专业模式筛选（按 type/quality/speed/cost/referenceImage/consistency/status）
 *   - 不可用模型检测与可读原因
 *   - 任务前成本预览
 *   - 降级可读提示生成
 *   - ModelDecisionRuntime 构造（对齐 Codex 契约 ModelDecision）
 *
 * 不依赖 React，纯函数模块，便于 node --test 测试。
 */
import type {
  CostTier,
  ModelDecisionRuntime,
  ModelDescriptor,
  ModelFilters,
  ModelRecommendation,
  ModelStatus,
  QualityTier,
  RoutingRecord,
  SelectionMode,
  SpeedTier,
} from "./types";

/** 推荐匹配结果 */
export interface RecommendationMatch {
  recommendation: ModelRecommendation;
  model: ModelDescriptor;
}

/**
 * 智能推荐匹配：根据 taskType 与 taskParams 查找推荐。
 *
 * 匹配优先级：
 *   1. taskType 完全匹配 + taskParams 字段交集最多
 *   2. taskType 完全匹配（任意 taskParams）
 *   3. recommendedModelId 在模型库中存在且 available
 *
 * 若推荐模型当前不可用，返回 null 由调用方处理降级。
 */
export function matchRecommendation(
  recommendations: ModelRecommendation[],
  models: ModelDescriptor[],
  taskType: string,
  taskParams: Record<string, string> = {},
): RecommendationMatch | null {
  // 1. taskType 匹配的候选
  const byTask = recommendations.filter((r) => r.taskType === taskType);
  if (byTask.length === 0) return null;

  // 2. 按 taskParams 字段交集排序
  const paramKeys = Object.keys(taskParams);
  const scored = byTask
    .map((r) => {
      const intersection = paramKeys.filter(
        (k) => r.taskParams[k] !== undefined && r.taskParams[k] === taskParams[k],
      ).length;
      return { r, score: intersection };
    })
    .sort((a, b) => b.score - a.score);

  // 3. 找到第一个对应模型可用且存在的推荐
  for (const { r } of scored) {
    const model = models.find((m) => m.id === r.recommendedModelId);
    if (!model) continue;
    // 不可用模型不作为推荐（专业用户可在专业模式手动选）
    if (model.status === "unavailable") continue;
    return { recommendation: r, model };
  }

  // 4. 全部不可用时返回第一个匹配的推荐（调用方决定是否降级）
  const first = scored[0];
  if (!first) return null;
  const model = models.find((m) => m.id === first.r.recommendedModelId);
  if (!model) return null;
  return { recommendation: first.r, model };
}

/**
 * 专业模式筛选：按多维度过滤模型列表。
 * 不传入某个维度表示不限制该维度。
 */
export function filterModels(
  models: ModelDescriptor[],
  filters: ModelFilters,
): ModelDescriptor[] {
  return models.filter((m) => {
    if (filters.type && m.type !== filters.type) return false;
    if (filters.quality && m.capabilities.quality !== filters.quality) return false;
    if (filters.speed && m.capabilities.speed !== filters.speed) return false;
    if (filters.cost && m.capabilities.cost !== filters.cost) return false;
    if (filters.referenceImage && m.capabilities.referenceImage !== filters.referenceImage) return false;
    if (filters.consistency && m.capabilities.consistency !== filters.consistency) return false;
    if (filters.status && m.status !== filters.status) return false;
    return true;
  });
}

/**
 * 判断模型是否对用户可选（不可用模型禁用）。
 * 返回禁用原因；可用时返回 null。
 */
export function getDisabledReason(model: ModelDescriptor, taskType?: string): string | null {
  if (model.status === "unavailable") {
    return model.statusReason || "该模型当前不可用";
  }
  if (taskType && model.suitableTasks.length > 0 && !model.suitableTasks.includes(taskType)) {
    return `该模型不适合「${taskType}」任务`;
  }
  return null;
}

/**
 * 任务前成本预览：返回可读字符串。
 * 例：模型成本 ¥0.5-1.2/张 → "预计 ¥0.5-1.2 / 张"
 */
export function formatCostPreview(model: ModelDescriptor): string {
  const { min, max, unit } = model.costEstimate;
  if (min === 0 && max === 0) {
    return `预计 ¥0 / ${unit}（模型不可用）`;
  }
  return `预计 ¥${min}-${max} / ${unit}`;
}

/**
 * 估算成本等级（low/medium/high），基于模型 costEstimate 中位数。
 * 阈值：≤0.5 low, ≤1.5 medium, >1.5 high
 */
export function estimateCostTierFromCost(cost: number): CostTier {
  if (cost <= 0.5) return "low";
  if (cost <= 1.5) return "medium";
  return "high";
}

/**
 * 生成降级可读提示。
 * 例："原模型 Qwen Image 2.0 Pro 当前限额不足，已降级到 Nano Banana 2 编辑链路，质量略低但成本不变"
 */
export function formatDegradationNotice(
  originalModel: ModelDescriptor | null,
  actualModel: ModelDescriptor,
  reason?: string | null,
): string {
  if (!reason) {
    return `原模型不可用，已降级到 ${actualModel.name}`;
  }
  return reason;
}

/**
 * 构造 ModelDecisionRuntime（对齐 Codex 契约 ModelDecision）。
 * 用于 UI 展示当前任务的选择与降级状态。
 */
export function buildDecisionRuntime(
  mode: SelectionMode,
  recommendation: ModelRecommendation | null,
  selectedModel: ModelDescriptor | null,
  actualModel: ModelDescriptor | null,
  wasDegraded: boolean,
  degradationReason?: string | null,
): ModelDecisionRuntime {
  return {
    mode,
    recommendationReason: recommendation?.reason || (selectedModel ? `已手动选择 ${selectedModel.name}` : "暂无推荐"),
    estimatedSpeed: recommendation?.estimatedSpeed || selectedModel?.capabilities.speed,
    estimatedCostTier: recommendation?.costLevel || selectedModel?.capabilities.cost || "medium",
    selectedModelKey: selectedModel?.id || null,
    actualModelKey: actualModel?.id || null,
    wasDegraded,
    degradationReason: wasDegraded ? degradationReason || null : null,
  };
}

/**
 * 从路由记录构造降级可读提示（用于历史记录展示）。
 */
export function formatRoutingDegradation(record: RoutingRecord): string | null {
  if (!record.degraded) return null;
  if (record.downgradeReason) return record.downgradeReason;
  return `原模型 ${record.systemRecommendation} 已降级到 ${record.actualModel}`;
}

/**
 * 速度/成本/质量/一致性/状态等级中文标签（i18n 兜底，组件可用 useI18n 覆盖）。
 */
export const TIER_LABELS_ZH: Record<string, string> = {
  // QualityTier
  high: "高",
  medium: "中",
  standard: "标准",
  // SpeedTier
  fast: "快",
  slow: "慢",
  // CostTier
  low: "低",
  // ConsistencyTier
  strong: "强",
  weak: "弱",
  // ModelStatus
  available: "可用",
  degraded: "降级",
  unavailable: "不可用",
  // ModelType
  text: "文本",
  image: "图像",
  edit: "编辑",
  video: "视频",
  audio: "声音",
  // ReferenceImageAbility
  yes: "支持",
  no: "不支持",
};

export const TIER_LABELS_EN: Record<string, string> = {
  high: "High",
  medium: "Medium",
  standard: "Standard",
  fast: "Fast",
  slow: "Slow",
  low: "Low",
  strong: "Strong",
  weak: "Weak",
  available: "Available",
  degraded: "Degraded",
  unavailable: "Unavailable",
  text: "Text",
  image: "Image",
  edit: "Edit",
  video: "Video",
  audio: "Audio",
  yes: "Yes",
  no: "No",
};

/** 通用等级标签获取（locale 兜底） */
export function tierLabel(key: string, locale: "zh-CN" | "en-US" = "zh-CN"): string {
  const table = locale === "zh-CN" ? TIER_LABELS_ZH : TIER_LABELS_EN;
  return table[key] || key;
}

/** 成本等级符号（用于卡片角标） */
export function costLevelSymbol(tier: CostTier): string {
  if (tier === "low") return "¥";
  if (tier === "medium") return "¥¥";
  return "¥¥¥";
}

/** 速度区间可读文本 */
export function speedRangeLabel(speed: SpeedTier, locale: "zh-CN" | "en-US" = "zh-CN"): string {
  if (locale === "zh-CN") {
    if (speed === "fast") return "5-15 秒";
    if (speed === "medium") return "10-30 秒";
    return "30 秒以上";
  }
  if (speed === "fast") return "5-15s";
  if (speed === "medium") return "10-30s";
  return "30s+";
}

/** 状态徽章颜色 */
export function statusColor(status: ModelStatus): string {
  if (status === "available") return "#7dd181";
  if (status === "degraded") return "#ffd166";
  return "#ff8b8b";
}

/** 质量等级排序（用于排序模型列表） */
export const QUALITY_ORDER: Record<QualityTier, number> = { high: 3, medium: 2, standard: 1 };

/** 状态排序权重（available 优先） */
export const STATUS_ORDER: Record<ModelStatus, number> = { available: 3, degraded: 2, unavailable: 1 };
