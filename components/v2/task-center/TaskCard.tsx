"use client";

import { memo } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Download,
  ExternalLink,
  FileEdit,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Loader2,
  Music,
  RefreshCw,
  Video,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type {
  JobActionType,
  JobStage,
  JobType,
  UnifiedJob,
} from "@/lib/client/v2/jobs/types";
import {
  resolveJobResultUrl,
} from "@/lib/client/v2/navigation/resolver";
import {
  STAGE_COLORS,
  formatElapsed,
  formatEstimatedRemaining,
  formatProgress,
  jobTypeLabel,
  stageLabel,
} from "@/lib/client/v2/jobs/grouping";

const STAGE_ICON: Record<JobStage, LucideIcon> = {
  draft: FileEdit,
  pending_confirm: HelpCircle,
  queued: Clock,
  running: Loader2,
  result_ingesting: Database,
  completed: CheckCircle2,
  partial_failure: AlertTriangle,
  failed: XCircle,
  cancelled: Ban,
};

const TYPE_ICON: Record<JobType, LucideIcon> = {
  text: FileText,
  image: ImageIcon,
  video: Video,
  audio: Music,
  export: Download,
  transfer: ArrowRightLeft,
  analysis: BarChart3,
};

const ACTION_ICON: Record<JobActionType, LucideIcon> = {
  retry: RefreshCw,
  cancel: X,
  view_detail: ExternalLink,
};

export interface TaskCardProps {
  job: UnifiedJob;
  locale: string;
  onAction: (job: UnifiedJob, action: JobActionType) => void;
  pendingAction?: { jobId: string; action: JobActionType } | null;
}

const cardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const titleBlockStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  flex: 1,
};

const stageBadgeStyle = (color: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  color: "#070808",
  background: color,
  whiteSpace: "nowrap",
});

const metaStyle: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.6)",
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const progressStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#f4f7f8",
  fontWeight: 600,
};

const remainingStyle: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,0.7)",
};

const failureStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#ff8b8b",
  padding: "6px 8px",
  borderRadius: 6,
  background: "rgba(255,139,139,0.08)",
  border: "1px solid rgba(255,139,139,0.2)",
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

function actionButtonStyle(color: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "5px 10px",
    borderRadius: 6,
    border: `1px solid ${color}`,
    background: "transparent",
    color,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
  };
}

function TaskCardComponent({ job, locale, onAction, pendingAction }: TaskCardProps) {
  const StageIcon = STAGE_ICON[job.stage];
  const TypeIcon = TYPE_ICON[job.type];
  const color = STAGE_COLORS[job.stage];
  const progress = formatProgress(job);
  const remaining = formatEstimatedRemaining(job, locale);
  const isRunning = job.stage === "running";
  const busy =
    pendingAction?.jobId === job.id ? pendingAction.action : null;

  return (
    <article style={cardStyle}>
      <div style={headerRowStyle}>
        <div style={titleBlockStyle}>
          <TypeIcon size={16} style={{ color: "#6de7df", flexShrink: 0 }} />
          <strong style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {job.name}
          </strong>
        </div>
        <span style={stageBadgeStyle(color)}>
          <StageIcon
            size={12}
            className={isRunning ? "tc-spin" : undefined}
            style={isRunning ? { animation: "tc-spin 1s linear infinite" } : undefined}
          />
          {stageLabel(job.stage, locale)}
        </span>
      </div>

      <div style={metaStyle}>
        <span>{job.projectName}</span>
        <span>·</span>
        <span>{jobTypeLabel(job.type, locale)}</span>
        <span>·</span>
        <span>{job.workbenchType}</span>
        <span>·</span>
        <span>{new Date(job.createdAt).toLocaleString(locale === "zh-CN" ? "zh-CN" : "en-US")}</span>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        {progress ? (
          <span style={progressStyle}>
            {progress}
            <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 400, marginLeft: 4 }}>
              {locale === "zh-CN" ? "已完成" : "done"}
            </span>
          </span>
        ) : null}
        <span style={remainingStyle}>{remaining}</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          {locale === "zh-CN" ? "已耗时" : "elapsed"} {formatElapsed(job.elapsedMs, locale)}
        </span>
      </div>

      {job.currentResult && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>{job.currentResult}</div>
      )}

      {job.failureReason && <div style={failureStyle}>{job.failureReason}</div>}

      <div style={actionsStyle}>
        {job.actions.map((action) => {
          const Icon = ACTION_ICON[action.type];
          const isBusy = busy === action.type;
          const actionColor =
            action.type === "retry"
              ? "#6de7df"
              : action.type === "cancel"
                ? "rgba(255,255,255,0.6)"
                : "#7dd181";
          // Task 0.3: view_detail always navigates to /job-center/:jobId (never disabled)
          const isDisabled = isBusy;
          return (
            <button
              key={action.type}
              type="button"
              style={actionButtonStyle(actionColor)}
              onClick={() => onAction(job, action.type)}
              disabled={isDisabled}
            >
              <Icon size={12} className={isBusy ? "tc-spin" : undefined} />
              {isBusy
                ? locale === "zh-CN"
                  ? "处理中..."
                  : "Working..."
                : action.label}
            </button>
          );
        })}
        {(() => {
          const target = resolveJobResultUrl({
            resultUrl: job.resultUrl,
            projectId: job.projectId,
            workbenchType: job.workbenchType,
          });
          if (!target) return null;
          return (
            <a
              href={target}
              style={{
                ...actionButtonStyle("#6de7df"),
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <ExternalLink size={12} />
              {locale === "zh-CN" ? "查看结果" : "View result"}
            </a>
          );
        })()}
      </div>
    </article>
  );
}

export const TaskCard = memo(TaskCardComponent);
