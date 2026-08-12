/**
 * Kiikis 2.0 全局任务中心 - 领域类型契约
 *
 * 对应 PRD §10.3 任务状态机（Generation Job 维度）。
 * contract_version 与 Codex 后端契约对齐，当前自建 fixture 演进。
 */

/** 任务中心契约版本，与后端 / Codex 对齐 */
export const CONTRACT_VERSION = "2.0.0-alpha.1";

/**
 * 任务阶段（PRD §10.3 Generation Job 状态机）
 * 不伪造精确百分比：阶段本身就是真实进度信号。
 */
export type JobStage =
  | "draft"
  | "pending_confirm"
  | "queued"
  | "running"
  | "result_ingesting"
  | "completed"
  | "partial_failure"
  | "failed"
  | "cancelled";

/** 任务类型，跨工作台聚合 */
export type JobType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "export"
  | "transfer"
  | "analysis";

/** 任务上可执行的动作 */
export type JobActionType = "retry" | "cancel" | "view_detail";

export interface JobAction {
  type: JobActionType;
  label: string;
}

/** 预计耗时区间（毫秒）+ 置信度 0-1 */
export interface EstimatedRange {
  min: number;
  max: number;
  confidence: number;
}

/**
 * 统一任务模型：跨工作台聚合后的任务视图。
 * 不包含 provider/model 等实现细节，聚焦用户视角。
 */
export interface UnifiedJob {
  id: string;
  name: string;
  /** 任务类型（用于跨工作台按类型分组与统计） */
  type: JobType;
  projectName: string;
  projectId: string;
  /** 工作台类型，如 novel / script / art / production / video / song 等 */
  workbenchType: string;
  stage: JobStage;
  /** 已完成数量（真实计数，非百分比） */
  completed: number;
  /** 总数量；为 0 表示无明确总量，不伪造百分比 */
  total: number;
  /** 已耗时（毫秒） */
  elapsedMs: number;
  estimatedRangeMs?: EstimatedRange;
  /** 当前结果摘要，如 "已生成 3 张图片" */
  currentResult?: string;
  /** 失败 / 部分失败原因 */
  failureReason?: string;
  actions: JobAction[];
  createdAt: string;
  /** 终态结果入口 */
  resultUrl?: string;
}

/** 任务统计 */
export interface JobStats {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
}

/** fixture / API 返回的数据集 */
export interface JobsDataset {
  contractVersion: string;
  jobs: UnifiedJob[];
  stats: JobStats;
}

/** 列表筛选条件 */
export interface JobFilters {
  stage?: JobStage;
  type?: JobType;
  projectId?: string;
  workbenchType?: string;
}
