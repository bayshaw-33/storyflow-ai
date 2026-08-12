/**
 * 任务中心纯函数：分组、统计、格式化。
 *
 * 全部为纯函数，不依赖 DOM / fetch / JSON import，便于 Node 测试直接导入。
 * PRD §8.6：不伪造精确百分比 —— 进度只展示真实计数（completed/total），
 * 无真实总量时只展示阶段 + 已耗时 + 历史区间。
 */
import type { JobStage, JobType, JobStats, UnifiedJob, EstimatedRange } from "./types";

/** 阶段展示顺序（活跃在前，终态在后） */
export const STAGE_ORDER: JobStage[] = [
  "running",
  "queued",
  "pending_confirm",
  "result_ingesting",
  "draft",
  "partial_failure",
  "failed",
  "cancelled",
  "completed",
];

/** 终态阶段 */
export const TERMINAL_STAGES: JobStage[] = [
  "completed",
  "partial_failure",
  "failed",
  "cancelled",
];

/** 活跃阶段（可轮询刷新） */
export const ACTIVE_STAGES: JobStage[] = [
  "queued",
  "running",
  "result_ingesting",
  "pending_confirm",
];

export function isTerminalStage(stage: JobStage): boolean {
  return TERMINAL_STAGES.includes(stage);
}

export function isActiveStage(stage: JobStage): boolean {
  return ACTIVE_STAGES.includes(stage);
}

/** 阶段中文标签 */
export const STAGE_LABELS_ZH: Record<JobStage, string> = {
  draft: "草稿",
  pending_confirm: "待确认",
  queued: "排队中",
  running: "生成中",
  result_ingesting: "结果入库",
  completed: "已完成",
  partial_failure: "部分失败",
  failed: "已失败",
  cancelled: "已取消",
};

/** 阶段英文标签 */
export const STAGE_LABELS_EN: Record<JobStage, string> = {
  draft: "Draft",
  pending_confirm: "Pending confirm",
  queued: "Queued",
  running: "Running",
  result_ingesting: "Ingesting",
  completed: "Completed",
  partial_failure: "Partial failure",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** 任务类型中文标签 */
export const JOB_TYPE_LABELS_ZH: Record<JobType, string> = {
  text: "文本",
  image: "图像",
  video: "视频",
  audio: "声音",
  export: "导出",
  transfer: "转存",
  analysis: "分析",
};

/** 任务类型英文标签 */
export const JOB_TYPE_LABELS_EN: Record<JobType, string> = {
  text: "Text",
  image: "Image",
  video: "Video",
  audio: "Audio",
  export: "Export",
  transfer: "Transfer",
  analysis: "Analysis",
};

/**
 * 阶段颜色，沿用 1.0 statusColors 视觉规范：
 * completed=#7dd181, failed/partial_failure=#ff8b8b, cancelled=rgba(255,255,255,0.5),
 * running=#6de7df, queued=#ffd166
 */
export const STAGE_COLORS: Record<JobStage, string> = {
  draft: "rgba(255,255,255,0.4)",
  pending_confirm: "#ffd166",
  queued: "#ffd166",
  running: "#6de7df",
  result_ingesting: "#6d9eeb",
  completed: "#7dd181",
  partial_failure: "#ff8b8b",
  failed: "#ff8b8b",
  cancelled: "rgba(255,255,255,0.5)",
};

/** 全部任务类型，用于遍历 */
export const ALL_JOB_TYPES: JobType[] = [
  "text",
  "image",
  "video",
  "audio",
  "export",
  "transfer",
  "analysis",
];

export function stageLabel(stage: JobStage, locale: string): string {
  return locale === "zh-CN" ? STAGE_LABELS_ZH[stage] : STAGE_LABELS_EN[stage];
}

export function jobTypeLabel(type: JobType, locale: string): string {
  return locale === "zh-CN" ? JOB_TYPE_LABELS_ZH[type] : JOB_TYPE_LABELS_EN[type];
}

/** 按阶段分组，保持 STAGE_ORDER 顺序 */
export function groupJobsByStage(jobs: UnifiedJob[]): Record<JobStage, UnifiedJob[]> {
  const result = {} as Record<JobStage, UnifiedJob[]>;
  for (const stage of STAGE_ORDER) result[stage] = [];
  for (const job of jobs) {
    if (result[job.stage]) result[job.stage].push(job);
  }
  return result;
}

/** 按任务类型分组 */
export function groupJobsByType(jobs: UnifiedJob[]): Record<JobType, UnifiedJob[]> {
  const result = {} as Record<JobType, UnifiedJob[]>;
  for (const type of ALL_JOB_TYPES) result[type] = [];
  for (const job of jobs) {
    if (result[job.type]) result[job.type].push(job);
  }
  return result;
}

/** 计算统计：byStatus 按阶段、byType 按类型 */
export function computeStats(jobs: UnifiedJob[]): JobStats {
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const stage of STAGE_ORDER) byStatus[stage] = 0;
  for (const type of ALL_JOB_TYPES) byType[type] = 0;
  for (const job of jobs) {
    byStatus[job.stage] = (byStatus[job.stage] || 0) + 1;
    byType[job.type] = (byType[job.type] || 0) + 1;
  }
  return { total: jobs.length, byStatus, byType };
}

/** 格式化已耗时毫秒为人类可读：如 "2分30秒" / "45秒" / "1小时5分" */
export function formatElapsed(ms: number, locale: string = "zh-CN"): string {
  if (!Number.isFinite(ms) || ms < 0) return locale === "zh-CN" ? "0秒" : "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (locale === "zh-CN") {
    if (hours > 0) return `${hours}小时${minutes}分`;
    if (minutes > 0) return `${minutes}分${seconds}秒`;
    return `${seconds}秒`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** 格式化耗时区间（毫秒）为 "5-8 分钟" 等 */
export function formatDurationRangeMs(range: EstimatedRange, locale: string = "zh-CN"): string {
  const minMin = Math.max(1, Math.round(range.min / 60000));
  const maxMin = Math.max(minMin, Math.round(range.max / 60000));
  if (locale === "zh-CN") return `${minMin}-${maxMin} 分钟`;
  return `${minMin}-${maxMin} min`;
}

/**
 * 进度展示：仅返回真实计数 "completed/total"。
 * 当 total = 0 时返回空串 —— 不伪造百分比。
 * 永远不返回形如 "40%" 的合成数字。
 */
export function formatProgress(job: UnifiedJob): string {
  if (!job || job.total > 0) {
    return `${job.completed}/${job.total}`;
  }
  return "";
}

/**
 * 预计剩余展示：
 * - 有 estimatedRangeMs：预计还需 X-Y 分钟（置信度 NN%）
 * - 排队中无区间：排队中 · 已等待 X · 历史平均 Y 分钟
 * - 否则：阶段 + 已耗时
 * 不伪造精确百分比。
 */
export function formatEstimatedRemaining(job: UnifiedJob, locale: string = "zh-CN"): string {
  const elapsed = formatElapsed(job.elapsedMs, locale);
  if (job.estimatedRangeMs) {
    const range = formatDurationRangeMs(job.estimatedRangeMs, locale);
    const confidence = Math.round((job.estimatedRangeMs.confidence ?? 0) * 100);
    if (locale === "zh-CN") return `预计还需 ${range}（置信度 ${confidence}%）`;
    return `Est. ${range} left (${confidence}% confidence)`;
  }
  if (job.stage === "queued") {
    if (locale === "zh-CN") return `排队中 · 已等待 ${elapsed} · 历史平均 5 分钟`;
    return `Queued · waited ${elapsed} · avg 5 min`;
  }
  if (locale === "zh-CN") return `${stageLabel(job.stage, locale)} · 已耗时 ${elapsed}`;
  return `${stageLabel(job.stage, locale)} · ${elapsed} elapsed`;
}
