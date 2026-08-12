"use client";

import { memo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Clock,
  CheckCircle2,
  Ban,
  type LucideIcon,
} from "lucide-react";
import type { GenerationJobStatus } from "@/lib/client/v2/workbench/types";
import styles from "./workbench-shell.module.css";

export interface TaskBarProps {
  jobs: Array<{
    id: string;
    name: string;
    type: string;
    stage: GenerationJobStatus;
    completed: number;
    total: number;
    failureReason?: string;
    resultUrl?: string;
  }>;
  locale: string;
}

const STAGE_ICON: Record<GenerationJobStatus, LucideIcon> = {
  draft: Clock,
  pending_confirm: Clock,
  queued: Clock,
  running: Loader2,
  result_ingesting: Loader2,
  completed: CheckCircle2,
  partial_failure: AlertTriangle,
  failed: AlertTriangle,
  cancelled: Ban,
};

const STAGE_COLOR: Record<GenerationJobStatus, string> = {
  draft: "rgba(255,255,255,0.5)",
  pending_confirm: "#ffd166",
  queued: "#ffd166",
  running: "#6de7df",
  result_ingesting: "#6de7df",
  completed: "#7dd181",
  partial_failure: "#ff8b8b",
  failed: "#ff8b8b",
  cancelled: "rgba(255,255,255,0.5)",
};

function TaskBarComponent({ jobs, locale }: TaskBarProps) {
  const isZh = locale === "zh-CN";
  const [expanded, setExpanded] = useState(true);

  const activeCount = jobs.filter((j) =>
    ["running", "queued", "result_ingesting", "pending_confirm"].includes(j.stage),
  ).length;
  const errorCount = jobs.filter((j) =>
    ["partial_failure", "failed"].includes(j.stage),
  ).length;

  if (jobs.length === 0) return null;

  return (
    <div className={styles.taskBar}>
      <div className={styles.taskBarHeader} onClick={() => setExpanded((v) => !v)} role="button" tabIndex={0}>
        <span className={styles.taskBarTitle}>
          {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          {isZh ? "运行任务" : "Running tasks"}
          <span className={`${styles.badge} ${styles.badgeAccent}`}>{activeCount}</span>
          {errorCount > 0 && <span className={`${styles.badge} ${styles.badgeDanger}`}>{errorCount} {isZh ? "异常" : "issues"}</span>}
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          {expanded ? (isZh ? "收起" : "Collapse") : (isZh ? "展开" : "Expand")}
        </span>
      </div>
      {expanded && (
        <div className={styles.taskBarBody}>
          {jobs.map((job) => {
            const Icon = STAGE_ICON[job.stage];
            const color = STAGE_COLOR[job.stage];
            const isError = job.stage === "partial_failure" || job.stage === "failed";
            const isRunning = job.stage === "running";
            return (
              <div key={job.id} className={styles.taskRow}>
                <Icon
                  size={14}
                  style={{ color, flexShrink: 0 }}
                  className={isRunning ? "tc-spin" : undefined}
                />
                <span className={styles.taskRowName}>{job.name}</span>
                {job.total > 0 && (
                  <span className={styles.taskRowMeta}>
                    {job.completed}/{job.total}
                  </span>
                )}
                {isError && job.failureReason && (
                  <span className={styles.taskError} title={job.failureReason}>
                    {job.failureReason}
                  </span>
                )}
                {job.resultUrl && (
                  <a href={job.resultUrl} className={styles.taskLink} onClick={(e) => e.stopPropagation()}>
                    <ExternalLink size={11} />
                    {isZh ? "查看" : "View"}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const TaskBar = memo(TaskBarComponent);
