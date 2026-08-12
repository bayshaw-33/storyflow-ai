/**
 * Kiikis 2.0 多模型选择与解释 - 领域类型契约
 *
 * 对应 PRD §8.4 多模型产品化：
 *   - 智能选择模式（默认，附可读理由）
 *   - 专业模式（手动按质量/速度/成本/能力筛选）
 *   - 任务前成本预览
 *   - 降级可读提示
 *   - 路由记录
 *
 * contract_version 与 Codex 后端契约对齐（lib/contracts/v2/index.ts），
 * 复用 Atlas Cloud 已有模型能力（lib/art/providers/catalog.ts、lib/ai/providers）。
 */

/** 与 Codex 契约 (lib/contracts/v2/index.ts) 对齐 */
export const CONTRACT_VERSION = "2.0.0-alpha.1";

/** 模型类别（覆盖 PRD §8.4 专业模式筛选维度） */
export type ModelType = "text" | "image" | "edit" | "video" | "audio";

/** 质量/速度/成本等级 */
export type QualityTier = "high" | "medium" | "standard";
export type SpeedTier = "fast" | "medium" | "slow";
export type CostTier = "low" | "medium" | "high";

/** 参考图能力 */
export type ReferenceImageAbility = "yes" | "no";
/** 一致性能力（角色/风格保持） */
export type ConsistencyTier = "strong" | "medium" | "weak";

/** 模型当前可用状态 */
export type ModelStatus = "available" | "degraded" | "unavailable";

/** 模型能力描述 */
export interface ModelCapabilities {
  quality: QualityTier;
  speed: SpeedTier;
  cost: CostTier;
  referenceImage: ReferenceImageAbility;
  consistency: ConsistencyTier;
}

/** 单次任务成本估算（用户可读） */
export interface CostEstimate {
  /** 最低成本（人民币） */
  min: number;
  /** 最高成本（人民币） */
  max: number;
  /** 单位，如 "张"、"秒"、"千字" */
  unit: string;
}

/** 模型描述符（用户视角，已抹除 provider 内部细节） */
export interface ModelDescriptor {
  id: string;
  /** 展示名称，如 "Seedream v5.0 Pro · 文生图" */
  name: string;
  /** 提供方，如 "atlas"、"flux"、"deepseek" */
  provider: string;
  type: ModelType;
  capabilities: ModelCapabilities;
  status: ModelStatus;
  /** status !== "available" 时的可读原因 */
  statusReason?: string;
  costEstimate: CostEstimate;
  /** 适合的任务场景标签 */
  suitableTasks: string[];
  /** 主要限制，如 "不支持 9:16"、"单次最多 8 张参考图" */
  limitations: string[];
}

/** 智能推荐场景 */
export interface ModelRecommendation {
  /** 任务类型，如 "character_image"、"storyboard_script" */
  taskType: string;
  /** 任务参数摘要，用于匹配（如 "referenceImage:yes, quality:high"） */
  taskParams: Record<string, string>;
  recommendedModelId: string;
  /** 可读推荐理由 */
  reason: string;
  estimatedSpeed: SpeedTier;
  costLevel: CostTier;
  /** 适合场景简述 */
  suitableFor: string;
  /** 提示用户的主要限制 */
  limitations: string;
}

/** 路由记录（PRD §8.4 路由记录） */
export interface RoutingRecord {
  jobId: string;
  /** 用户手动选择；为空表示使用系统推荐 */
  userChoice?: string | null;
  /** 系统推荐模型 id */
  systemRecommendation: string;
  /** 实际调用模型 id（可能与推荐不同，发生降级时） */
  actualModel: string;
  degraded: boolean;
  /** 降级可读原因 */
  downgradeReason?: string | null;
  /** 估算成本（人民币） */
  estimatedCost: number;
  /** 实际成本（人民币） */
  actualCost: number;
  /** 结果状态，对齐契约 GenerationJobStatus */
  resultStatus:
    | "draft"
    | "pending_confirm"
    | "queued"
    | "running"
    | "result_ingesting"
    | "completed"
    | "partial_failure"
    | "failed"
    | "cancelled";
}

/** 模型库统计 */
export interface ModelLibraryStats {
  totalModels: number;
  byType: Record<ModelType, number>;
  byStatus: Record<ModelStatus, number>;
}

/** fixture / API 返回的完整数据集 */
export interface ModelLibraryDataset {
  contractVersion: string;
  models: ModelDescriptor[];
  recommendations: ModelRecommendation[];
  routingRecords: RoutingRecord[];
  stats: ModelLibraryStats;
}

/** 专业模式筛选条件 */
export interface ModelFilters {
  type?: ModelType;
  quality?: QualityTier;
  speed?: SpeedTier;
  cost?: CostTier;
  referenceImage?: ReferenceImageAbility;
  consistency?: ConsistencyTier;
  status?: ModelStatus;
}

/** 模式：智能 / 专业 */
export type SelectionMode = "smart" | "professional";

/**
 * 与 Codex 契约 ModelDecision 对齐的运行时决策记录。
 * 用于在 UI 中展示当前任务的选择与降级状态。
 */
export interface ModelDecisionRuntime {
  mode: SelectionMode;
  recommendationReason: string;
  estimatedSpeed?: SpeedTier;
  estimatedCostTier: CostTier;
  selectedModelKey?: string | null;
  actualModelKey?: string | null;
  wasDegraded: boolean;
  degradationReason?: string | null;
}
