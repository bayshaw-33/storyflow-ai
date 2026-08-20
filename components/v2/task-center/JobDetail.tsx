"use client";

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  FileEdit,
  HelpCircle,
  Loader2,
  RefreshCw,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { GenerationJob, GenerationJobStatus } from "@/lib/contracts/v2";
import {
  resolveActionTarget,
  resolveJobDetailUrl,
  resolveJobResultUrl,
  type JobActionKind,
} from "@/lib/client/v2/navigation/resolver";

const STATUS_ICON: Record<GenerationJobStatus, LucideIcon> = {
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

const STATUS_LABEL_ZH: Record<GenerationJobStatus, string> = {
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

const STATUS_LABEL_EN: Record<GenerationJobStatus, string> = {
  draft: "Draft",
  pending_confirm: "Pending",
  queued: "Queued",
  running: "Running",
  result_ingesting: "Ingesting",
  completed: "Completed",
  partial_failure: "Partial",
  failed: "Failed",
  cancelled: "Cancelled",
};

const JOB_TYPE_LABEL_ZH: Record<string, string> = {
  text: "文本",
  image: "图像",
  video: "视频",
  audio: "声音",
  export: "导出",
  transfer: "转存",
  analysis: "分析",
};

function statusColor(status: GenerationJobStatus): string {
  if (status === "completed") return "#7dd181";
  if (status === "failed" || status === "partial_failure") return "#ff8b8b";
  if (status === "cancelled") return "rgba(255,255,255,0.5)";
  if (status === "queued" || status === "pending_confirm") return "#ffd166";
  return "#6de7df";
}

function formatElapsed(seconds: number, isZh: boolean): string {
  if (seconds < 60) return isZh ? `${seconds} 秒` : `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (min < 60) return isZh ? `${min} 分 ${rem} 秒` : `${min}m ${rem}s`;
  const hr = Math.floor(min / 60);
  return isZh ? `${hr} 时 ${min % 60} 分` : `${hr}h ${min % 60}m`;
}

function formatDate(iso: string, isZh: boolean): string {
  try {
    return new Date(iso).toLocaleString(isZh ? "zh-CN" : "en-US");
  } catch {
    return iso;
  }
}

export interface JobDetailProps {
  job: GenerationJob;
  locale: string;
  accessToken: string | null;
  onUpdated: () => void;
  onBack: () => void;
}

interface ActionButtonConfig {
  kind: JobActionKind;
  labelZh: string;
  labelEn: string;
  icon: LucideIcon;
  color: string;
  enabled: boolean;
  disabledReason?: string;
}

export function JobDetail({ job, locale, accessToken, onUpdated, onBack }: JobDetailProps) {
  const isZh = locale === "zh-CN";
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const StatusIcon = STATUS_ICON[job.status] || HelpCircle;
  const color = statusColor(job.status);
  const isRunning = job.status === "running";
  const elapsed = job.timing?.elapsedSeconds ?? 0;

  // Derive result URL from the optional resultUrl field, falling back to the
  // first resultReference (where the server currently stores result paths).
  const resultUrl = job.resultUrl || job.resultReferences?.[0] || null;
  const internalResultUrl = resolveJobResultUrl({
    resultUrl,
    projectId: job.projectId,
    workId: job.workId,
    workbenchType: job.workbenchType,
  });

  const handlePatchAction = useCallback(
    async (action: "cancel" | "retry") => {
      setPendingAction(action);
      setActionError(null);
      try {
        const target = resolveActionTarget({ kind: action }, { jobId: job.id });
        if (!target) throw new Error(isZh ? "无法解析操作目标" : "No action target");
        const response = await fetch(target, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ action }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || isZh ? "操作失败" : "Action failed");
        }
        onUpdated();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : isZh ? "操作失败" : "Action failed");
      } finally {
        setPendingAction(null);
      }
    },
    [job.id, accessToken, onUpdated, isZh],
  );

  // Build action button configs based on status (PRD §6.3).
  const buttons: ActionButtonConfig[] = [];

  // cancel: queued / running / result_ingesting
  const canCancel = job.status === "queued" || job.status === "running" || job.status === "result_ingesting";
  buttons.push({
    kind: "cancel",
    labelZh: "取消任务",
    labelEn: "Cancel",
    icon: X,
    color: "rgba(255,255,255,0.6)",
    enabled: canCancel,
    disabledReason: canCancel ? undefined : isZh ? "当前状态不可取消" : "Cannot cancel in current status",
  });

  // retry: failed / partial_failure
  const canRetry = job.status === "failed" || job.status === "partial_failure";
  buttons.push({
    kind: "retry",
    labelZh: "重试",
    labelEn: "Retry",
    icon: RefreshCw,
    color: "#6de7df",
    enabled: canRetry,
    disabledReason: canRetry ? undefined : isZh ? "仅失败任务可重试" : "Only failed jobs can be retried",
  });

  // view_results: completed with same-origin resultUrl
  const canViewResults = job.status === "completed" && internalResultUrl !== null;
  buttons.push({
    kind: "view_results",
    labelZh: "查看结果",
    labelEn: "View results",
    icon: ExternalLink,
    color: "#7dd181",
    enabled: canViewResults,
    disabledReason: canViewResults
      ? undefined
      : job.status === "completed"
        ? isZh ? "无同源结果链接" : "No internal result URL"
        : isZh ? "仅已完成任务可查看结果" : "Only completed jobs have results",
  });

  // view_details: always available (→ /job-center/:jobId = current page)
  buttons.push({
    kind: "view_details",
    labelZh: "任务详情",
    labelEn: "Details",
    icon: ArrowLeft,
    color: "#6de7df",
    enabled: true,
  });

  return (
    <main className="app-shell" style={{ minHeight: "100dvh", padding: 24 }}>
      <style>{`
        @keyframes jd-spin { to { transform: rotate(360deg); } }
        .jd-spin { animation: jd-spin 1s linear infinite; }
        @media (prefers-color-scheme: light) {
          .jd-shell { background: #f7f8f9 !important; color: #1a1d1e !important; }
          .jd-card { background: #ffffff !important; border-color: rgba(0,0,0,0.08) !important; }
          .jd-meta { color: rgba(0,0,0,0.6) !important; }
          .jd-sub { color: rgba(0,0,0,0.5) !important; }
          .jd-error { background: rgba(255,139,139,0.06) !important; border-color: rgba(255,139,139,0.2) !important; }
        }
      `}</style>
      <div className="jd-shell" style={{ maxWidth: 880, margin: "0 auto", background: "#070808", color: "#f4f7f8", borderRadius: 16 }}>
        <div style={{ padding: "24px 24px 0" }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontSize: 13,
              opacity: 0.6,
              padding: 0,
              marginBottom: 16,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <ArrowLeft size={14} />
            {isZh ? "返回任务中心" : "Back to task center"}
          </button>
        </div>

        <div className="jd-card" style={{ padding: 24, margin: "0 24px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
              <StatusIcon
                size={20}
                className={isRunning ? "jd-spin" : undefined}
                style={{ color, flexShrink: 0, ...(isRunning ? { animation: "jd-spin 1s linear infinite" } : {}) }}
              />
              <strong style={{ fontSize: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {JOB_TYPE_LABEL_ZH[job.jobType] || job.jobType} · {job.id.length > 8 ? job.id.slice(0, 8) : job.id}
              </strong>
            </div>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              color: "#070808",
              background: color,
              whiteSpace: "nowrap",
            }}>
              {isZh ? STATUS_LABEL_ZH[job.status] : STATUS_LABEL_EN[job.status]}
            </span>
          </div>

          {/* Meta row */}
          <div className="jd-meta" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {job.projectId && <span>{isZh ? "项目" : "Project"}: {job.projectId}</span>}
            <span>{isZh ? "类型" : "Type"}: {JOB_TYPE_LABEL_ZH[job.jobType] || job.jobType}</span>
            <span>{isZh ? "创建于" : "Created"}: {formatDate(job.createdAt, isZh)}</span>
            {job.completedAt && <span>{isZh ? "完成于" : "Completed"}: {formatDate(job.completedAt, isZh)}</span>}
          </div>

          {/* Progress + timing */}
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
            {job.progress.total > 0 && (
              <div>
                <div className="jd-sub" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>
                  {isZh ? "进度" : "Progress"}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {job.progress.completed}/{job.progress.total}
                </div>
              </div>
            )}
            <div>
              <div className="jd-sub" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>
                {isZh ? "已耗时" : "Elapsed"}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{formatElapsed(elapsed, isZh)}</div>
            </div>
            {job.timing?.estimatedSecondsMin != null && job.timing.estimatedSecondsMax != null && (
              <div>
                <div className="jd-sub" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>
                  {isZh ? "预计剩余" : "ETA"}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {formatElapsed(job.timing.estimatedSecondsMin, isZh)} ~ {formatElapsed(job.timing.estimatedSecondsMax, isZh)}
                </div>
              </div>
            )}
          </div>

          {/* Error / failure info */}
          {(job.status === "failed" || job.status === "partial_failure") && (
            <div className="jd-error" style={{
              fontSize: 13,
              color: "#ff8b8b",
              padding: "8px 12px",
              borderRadius: 8,
              background: "rgba(255,139,139,0.08)",
              border: "1px solid rgba(255,139,139,0.2)",
              marginBottom: 16,
            }}>
              {job.status === "partial_failure" && job.failedItemCount
                ? isZh ? `部分失败，${job.failedItemCount} 项未完成` : `Partial failure, ${job.failedItemCount} item(s) failed`
                : isZh ? "任务失败" : "Job failed"}
            </div>
          )}

          {actionError && (
            <div className="jd-error" style={{
              fontSize: 13,
              color: "#ff8b8b",
              padding: "8px 12px",
              borderRadius: 8,
              background: "rgba(255,139,139,0.08)",
              border: "1px solid rgba(255,139,139,0.2)",
              marginBottom: 16,
            }}>
              {actionError}
            </div>
          )}

          {/* Result references */}
          {job.resultReferences && job.resultReferences.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="jd-sub" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
                {isZh ? "结果引用" : "Result references"}
              </div>
              <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                {job.resultReferences.map((ref, i) => (
                  <li key={i} style={{ wordBreak: "break-all" }}>{ref}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {buttons.map((btn) => {
              const Icon = btn.icon;
              const isBusy = pendingAction === btn.kind;
              const isPatch = btn.kind === "cancel" || btn.kind === "retry";
              const detailTarget = resolveJobDetailUrl(job.id);
              const resultsTarget = internalResultUrl;

              const handleClick = () => {
                if (btn.kind === "cancel" || btn.kind === "retry") {
                  void handlePatchAction(btn.kind);
                }
                // view_details and view_results are links (handled below)
              };

              const disabled = !btn.enabled || isBusy;

              // view_results renders as an anchor when enabled
              if (btn.kind === "view_results" && btn.enabled && resultsTarget) {
                return (
                  <a
                    key={btn.kind}
                    href={resultsTarget}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "7px 14px",
                        borderRadius: 7,
                        border: `1px solid ${btn.color}`,
                        background: "transparent",
                        color: btn.color,
                        fontSize: 13,
                        fontWeight: 500,
                        textDecoration: "none",
                        cursor: "pointer",
                      }}
                  >
                    <Icon size={13} />
                    {isZh ? btn.labelZh : btn.labelEn}
                  </a>
                );
              }

              // view_details renders as a link to /job-center/:jobId (current page)
              if (btn.kind === "view_details" && detailTarget) {
                return (
                  <a
                    key={btn.kind}
                    href={detailTarget}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "7px 14px",
                      borderRadius: 7,
                      border: `1px solid ${btn.color}`,
                      background: "transparent",
                      color: btn.color,
                      fontSize: 13,
                      fontWeight: 500,
                      textDecoration: "none",
                      cursor: "pointer",
                      opacity: 0.7,
                    }}
                  >
                    <Icon size={13} />
                    {isZh ? btn.labelZh : btn.labelEn}
                  </a>
                );
              }

              // cancel / retry are buttons that call PATCH
              return (
                <button
                  key={btn.kind}
                  type="button"
                  disabled={disabled}
                  title={disabled ? btn.disabledReason : undefined}
                  onClick={handleClick}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "7px 14px",
                    borderRadius: 7,
                    border: `1px solid ${disabled ? "rgba(255,255,255,0.15)" : btn.color}`,
                    background: "transparent",
                    color: disabled ? "rgba(255,255,255,0.3)" : btn.color,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: disabled ? "not-allowed" : "pointer",
                  }}
                >
                  <Icon size={13} className={isBusy ? "jd-spin" : undefined} />
                  {isBusy
                    ? isZh ? "处理中..." : "Working..."
                    : isZh ? btn.labelZh : btn.labelEn}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </main>
  );
}
