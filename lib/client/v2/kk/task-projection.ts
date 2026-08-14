/**
 * KIIKIS V2.2 Phase 0 Task 0.4 — KK 任务投影。
 *
 * 把 GenerationJob 投影成 KK 消息，所有跳转目标都来自共享导航解析器，
 * 保证 Dashboard、任务中心和 KK 对同一 Job 给出一致的 status / action。
 *
 * 硬约束（PRD §6.1, §6.3 K22-JOB-006）：
 * - 每条带 actionLabel 的消息必须有合法同源 actionUrl，或填写 actionDisabledReason；
 *   禁止只显示进度文本而无可用动作。
 * - 外部 URL 永远不进入 actionUrl（防开放重定向）。
 * - 任务详情永远可跳（/job-center/:jobId），所以主动作恒可用。
 */

import type { GenerationJob, GenerationJobStatus } from "@/lib/contracts/v2";
import type { KkMessage, KkMessageType, KkSeverity } from "./types";
import {
  resolveJobDetailUrl,
  resolveJobResultUrl,
} from "../navigation/resolver.ts";

export interface ProjectJobMessageInput {
  job: GenerationJob;
  /** 默认 zh-CN，与既有 fixture 一致 */
  locale?: "zh-CN" | "en-US";
  now?: Date;
}

interface StatusMapping {
  type: KkMessageType;
  severity: KkSeverity;
  titleZh: string;
  titleEn: string;
  bodyZh: (job: GenerationJob) => string;
  bodyEn: (job: GenerationJob) => string;
}

// 完整状态映射
const MAPPING: Partial<Record<GenerationJobStatus, StatusMapping>> = {
  completed: {
    type: "task_completed",
    severity: "success",
    titleZh: "任务已完成",
    titleEn: "Task completed",
    bodyZh: (j) => `任务 ${shortId(j.id)} 已完成。`,
    bodyEn: (j) => `Job ${shortId(j.id)} completed.`,
  },
  failed: {
    type: "task_failed",
    severity: "error",
    titleZh: "任务失败",
    titleEn: "Task failed",
    bodyZh: (j) => `任务 ${shortId(j.id)} 失败${j.failedItemCount ? `，${j.failedItemCount} 项未完成` : ""}。`,
    bodyEn: (j) => `Job ${shortId(j.id)} failed${j.failedItemCount ? `, ${j.failedItemCount} item(s) failed` : ""}.`,
  },
  partial_failure: {
    type: "task_failed",
    severity: "error",
    titleZh: "任务部分失败",
    titleEn: "Task partially failed",
    bodyZh: (j) => `任务 ${shortId(j.id)} 部分失败，${j.failedItemCount ?? 0} 项未完成。`,
    bodyEn: (j) => `Job ${shortId(j.id)} partially failed, ${j.failedItemCount ?? 0} item(s) failed.`,
  },
  pending_confirm: {
    type: "task_needs_confirm",
    severity: "warning",
    titleZh: "任务待确认",
    titleEn: "Task needs confirmation",
    bodyZh: (j) => `任务 ${shortId(j.id)} 等待你确认结果。`,
    bodyEn: (j) => `Job ${shortId(j.id)} is awaiting your confirmation.`,
  },
  result_ingesting: {
    type: "task_needs_confirm",
    severity: "warning",
    titleZh: "结果入库中",
    titleEn: "Result ingesting",
    bodyZh: (j) => `任务 ${shortId(j.id)} 结果正在入库。`,
    bodyEn: (j) => `Job ${shortId(j.id)} result is ingesting.`,
  },
  // 非终态的运行/排队不产生关键消息，但仍可投影为 info 供 KK 面板展示。
  queued: {
    type: "task_needs_confirm",
    severity: "info",
    titleZh: "任务排队中",
    titleEn: "Task queued",
    bodyZh: (j) => `任务 ${shortId(j.id)} 正在排队。`,
    bodyEn: (j) => `Job ${shortId(j.id)} is queued.`,
  },
  running: {
    type: "task_needs_confirm",
    severity: "info",
    titleZh: "任务生成中",
    titleEn: "Task running",
    bodyZh: (j) => `任务 ${shortId(j.id)} 正在生成。`,
    bodyEn: (j) => `Job ${shortId(j.id)} is running.`,
  },
  draft: {
    type: "task_needs_confirm",
    severity: "info",
    titleZh: "任务草稿",
    titleEn: "Task draft",
    bodyZh: (j) => `任务 ${shortId(j.id)} 处于草稿状态。`,
    bodyEn: (j) => `Job ${shortId(j.id)} is in draft.`,
  },
  cancelled: {
    type: "task_failed",
    severity: "info",
    titleZh: "任务已取消",
    titleEn: "Task cancelled",
    bodyZh: (j) => `任务 ${shortId(j.id)} 已取消。`,
    bodyEn: (j) => `Job ${shortId(j.id)} was cancelled.`,
  },
};

function shortId(id: string): string {
  return id.length > 10 ? id.slice(0, 10) : id;
}

/**
 * Project a GenerationJob into a KK message.
 *
 * Action resolution:
 * - completed + internal resultUrl → actionUrl = resultUrl (查看结果)
 * - completed + external/absent resultUrl → actionUrl = detail URL (查看详情),
 *   actionDisabledReason explains why results are not directly viewable.
 * - all other statuses → actionUrl = detail URL (查看详情)
 *
 * The detail URL is always a valid same-origin route, so the primary action is
 * always enabled. External URLs never leak into actionUrl.
 */
export function projectJobToKkMessage(input: ProjectJobMessageInput): KkMessage {
  const { job } = input;
  const isZh = (input.locale ?? "zh-CN") === "zh-CN";
  const now = (input.now ?? new Date()).toISOString();

  const mapping = MAPPING[job.status];
  if (!mapping) {
    // Defensive: unknown status → treat as failed so the user is alerted.
    const fallback = MAPPING.failed!;
    return {
      id: `kk-job-${job.id}`,
      type: fallback.type,
      title: isZh ? fallback.titleZh : fallback.titleEn,
      body: isZh ? fallback.bodyZh(job) : fallback.bodyEn(job),
      severity: fallback.severity,
      createdAt: now,
      actionLabel: isZh ? "查看详情" : "View details",
      actionUrl: resolveJobDetailUrl(job.id),
      relatedJobId: job.id,
      read: false,
    };
  }

  const detailUrl = resolveJobDetailUrl(job.id);
  const internalResult = resolveJobResultUrl({ resultUrl: job.resultUrl ?? null });

  // Completed jobs prefer the result URL when it is a safe same-origin route.
  const useResultAction = job.status === "completed" && internalResult !== null;

  const message: KkMessage = {
    id: `kk-job-${job.id}`,
    type: mapping.type,
    title: isZh ? mapping.titleZh : mapping.titleEn,
    body: isZh ? mapping.bodyZh(job) : mapping.bodyEn(job),
    severity: mapping.severity,
    createdAt: now,
    actionLabel: useResultAction
      ? isZh ? "查看结果" : "View results"
      : isZh ? "查看详情" : "View details",
    actionUrl: useResultAction ? internalResult! : detailUrl,
    relatedJobId: job.id,
    read: false,
  };

  // When completed but no internal result URL, flag why "查看结果" is disabled.
  if (job.status === "completed" && !useResultAction) {
    message.actionDisabledReason = isZh
      ? "无同源结果链接，可在任务详情查看"
      : "No internal result URL; open details to view";
  }

  return message;
}

/**
 * Project multiple jobs, deduplicating by job id (last wins) and sorting by
 * createdAt desc so the most recent job appears first in the KK feed.
 */
export function projectJobsToKkMessages(
  jobs: ReadonlyArray<GenerationJob>,
  opts: { locale?: "zh-CN" | "en-US"; now?: Date } = {},
): KkMessage[] {
  const now = opts.now ?? new Date();
  const byId = new Map<string, KkMessage>();
  for (const job of jobs) {
    byId.set(job.id, projectJobToKkMessage({ job, locale: opts.locale, now }));
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export { MAPPING as STATUS_MAPPING };
