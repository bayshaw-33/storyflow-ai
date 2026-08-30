/**
 * ShotVideoPanel — 任务 1 (KIIKIS-P2-TRAE-002)
 *
 * 渲染单个 Shot 卡片下方的"视频"区块。状态机：
 *   idle         — 未生成，按钮可点（前置：shot.confirmed + 已有分镜图）
 *   queued       — 已提交 job，等待 provider 接收
 *   running      — provider 生成中，显示已等待时长
 *   completed    — 完成，内嵌 <video> 播放器
 *   failed       — 失败，显示原因 + 重试
 *
 * 轮询：每 5 秒一次，done/failed 即停。页面卸载后恢复轮询（任务在服务端继续）。
 * 重新生成：保留旧视频直到新视频成功（不得先删旧的）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Film,
  Loader2,
  Play,
  RefreshCw,
  Video as VideoIcon,
} from "lucide-react";
import type { StoryboardScene, StoryboardShot } from "@/lib/storyboard/contracts";
import type { PrevisVersionSummary } from "@/lib/director/previs-version";
import type { VideoJobSubStatus } from "@/lib/storyboard/video-submission";
import { VideoGenerationConfirmDialog } from "./VideoGenerationConfirmDialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VideoJobStatus = "idle" | "queued" | "running" | "completed" | "failed";

export type VideoJobState = {
  jobId: string | null;
  status: VideoJobStatus;
  subStatus?: VideoJobSubStatus;
  /** ISO when the job was submitted (for elapsed time display). */
  startedAt: number | null;
  /** ISO when the job reached terminal state. */
  finishedAt: number | null;
  videoUrl: string | null;
  /** Estimated cost in credits (filled on completion). */
  costEstimate: number | null;
  /** Video duration in seconds (filled on completion). */
  durationSeconds: number | null;
  /** Error message for failed jobs. */
  error: string | null;
  /** Provider task id (MiniMax task_id). */
  providerTaskId: string | null;
  /** Aspect ratio for the video element. */
  aspectRatio: string;
};

export type VideoJobMap = Record<string, VideoJobState>;

type ShotVideoPanelProps = {
  scene: StoryboardScene;
  shot: StoryboardShot;
  /** Current video job state for this shot (keyed by shotId). */
  videoState: VideoJobState | undefined;
  /** True if the shot has a confirmed firstframe image. */
  hasFirstframe: boolean;
  /** True while the generate request is in-flight (button disabled). */
  submitting: boolean;
  /** Immutable white-model version adopted for this shot, if any. */
  previsVersion?: PrevisVersionSummary;
  /** Callback: generate video for this shot. */
  onGenerate: (previsVersionId?: string) => void;
  /** Callback: re-poll job status (called every 5s while running). */
  onPoll: () => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5_000;

const labelColor = "#cbd5da";
const mutedColor = "#8b97a3";
const accentColor = "#75dbc6";
const borderColor = "rgba(255, 255, 255, 0.08)";
const dangerColor = "#ff6b6b";
const warningColor = "#fbbf24";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShotVideoPanel({
  scene,
  shot,
  videoState,
  hasFirstframe,
  submitting,
  previsVersion,
  onGenerate,
  onPoll,
}: ShotVideoPanelProps) {
  const status = videoState?.status ?? "idle";
  const [elapsed, setElapsed] = useState<number>(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Elapsed timer while queued/running
  useEffect(() => {
    if (status !== "queued" && status !== "running") return;
    if (!videoState?.startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - (videoState.startedAt ?? 0)) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status, videoState?.startedAt]);

  // Polling: every 5s while queued/running
  useEffect(() => {
    if (status !== "queued" && status !== "running") return;
    const id = setInterval(onPoll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [status, onPoll]);

  const shotId = shot.id ?? shot.clientId ?? "";
  const canGenerate = shot.confirmed && hasFirstframe && !submitting && status !== "queued" && status !== "running";
  const disabledReason = !shot.confirmed
    ? "请先在分镜图 tab 确认该 Shot"
    : !hasFirstframe
      ? "该 Shot 没有已生成的分镜图作为首帧"
      : status === "queued" || status === "running"
        ? "正在生成中，请等待"
        : "";

  const handleCopyLink = useCallback(() => {
    if (videoState?.videoUrl) {
      void navigator.clipboard.writeText(videoState.videoUrl);
    }
  }, [videoState?.videoUrl]);

  return (
    <div style={{ marginTop: 10, padding: "10px 12px", border: `1px solid ${borderColor}`, borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <VideoIcon size={12} color={accentColor} />
          <span style={{ fontSize: 11, fontWeight: 700, color: accentColor, letterSpacing: 0.5 }}>视频</span>
          <StatusBadge status={status} subStatus={videoState?.subStatus} />
        </div>
        {status === "queued" || status === "running" ? (
          <span style={{ fontSize: 11, color: mutedColor, display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={11} /> 已等待 {formatElapsed(elapsed)}
          </span>
        ) : null}
      </header>

      {/* 生成按钮 */}
      <div style={{ display: "flex", gap: 6, marginBottom: status === "completed" ? 10 : 0, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={canGenerate ? () => setConfirmOpen(true) : undefined}
          disabled={!canGenerate}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            borderRadius: 6,
            border: `1px solid ${canGenerate ? "rgba(117, 219, 198, 0.45)" : borderColor}`,
            background: canGenerate ? "rgba(117, 219, 198, 0.12)" : "transparent",
            color: canGenerate ? accentColor : mutedColor,
            cursor: canGenerate ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
          title={disabledReason || (status === "completed" ? "重新生成（保留旧视频直到新视频成功）" : "生成视频")}
        >
          {submitting || status === "queued" || status === "running" ? (
            <Loader2 size={11} className="animate-spin" />
          ) : status === "completed" ? (
            <RefreshCw size={11} />
          ) : (
            <Play size={11} />
          )}
          {submitting ? "提交中…" : status === "queued" ? "排队中" : status === "running" ? "生成中" : status === "completed" ? "重新生成" : "生成视频"}
        </button>
        {videoState?.subStatus === "submission_unknown" ? (
          <button type="button" onClick={onPoll} style={{ padding: "4px 10px", fontSize: 12, borderRadius: 6, border: `1px solid ${borderColor}`, background: "transparent", color: labelColor, cursor: "pointer" }}>
            <RefreshCw size={11} style={{ marginRight: 4 }} />刷新状态
          </button>
        ) : null}
      </div>

      {/* 失败状态 */}
      {status === "failed" ? (
        <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(255, 107, 107, 0.08)", border: `1px solid rgba(255, 107, 107, 0.25)`, borderRadius: 6, fontSize: 12, color: dangerColor }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <AlertTriangle size={11} />
            <span style={{ fontWeight: 700 }}>生成失败</span>
          </div>
          <div style={{ color: mutedColor, fontSize: 11 }}>{videoState?.error || "未知错误"}</div>
          <button
            type="button"
            onClick={canGenerate ? () => setConfirmOpen(true) : undefined}
            disabled={!canGenerate}
            style={{
              marginTop: 6, padding: "3px 8px", fontSize: 11, borderRadius: 4,
              border: `1px solid ${canGenerate ? "rgba(255, 107, 107, 0.4)" : borderColor}`,
              background: "transparent", color: canGenerate ? dangerColor : mutedColor,
              cursor: canGenerate ? "pointer" : "not-allowed",
            }}
          >
            <RefreshCw size={10} style={{ marginRight: 4 }} />
            重试
          </button>
        </div>
      ) : null}

      {/* 完成状态：video 播放器 */}
      {status === "completed" && videoState?.videoUrl ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ position: "relative", width: "100%", aspectRatio: videoState.aspectRatio === "16:9" ? "16 / 9" : "9 / 16", background: "#000", borderRadius: 8, overflow: "hidden", border: `1px solid ${borderColor}` }}>
            <video
              src={videoState.videoUrl}
              poster={undefined}
              controls
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, fontSize: 11, color: mutedColor, flexWrap: "wrap", gap: 4 }}>
            <span>
              时长 {videoState.durationSeconds ?? "—"}s · 画幅 {videoState.aspectRatio}
              {videoState.costEstimate !== null ? ` · 估算成本 ${videoState.costEstimate} 积分` : ""}
            </span>
            <span style={{ color: accentColor, display: "flex", alignItems: "center", gap: 3 }}>
              <CheckCircle2 size={10} />
              {new Date(videoState.finishedAt ?? Date.now()).toLocaleString()}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <a
              href={videoState.videoUrl}
              download={`shot-${shot.order}.mp4`}
              style={{
                padding: "3px 8px", fontSize: 11, borderRadius: 4,
                border: `1px solid ${borderColor}`, background: "transparent",
                color: labelColor, textDecoration: "none", display: "flex", alignItems: "center", gap: 3,
              }}
            >
              <Download size={10} /> 下载
            </a>
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                padding: "3px 8px", fontSize: 11, borderRadius: 4,
                border: `1px solid ${borderColor}`, background: "transparent",
                color: labelColor, cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
              }}
            >
              <Copy size={10} /> 复制链接
            </button>
          </div>
        </div>
      ) : null}

      {/* idle 且无前置条件时的提示 */}
      {status === "idle" && !canGenerate && disabledReason ? (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: warningColor, display: "flex", alignItems: "center", gap: 4 }}>
          <AlertTriangle size={10} />
          {disabledReason}
        </p>
      ) : null}

      {/* 占位：idle 但有 firstframe */}
      {status === "idle" && canGenerate ? (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: mutedColor, display: "flex", alignItems: "center", gap: 4 }}>
          <Film size={10} />
          点击「生成视频」使用即梦提示词 + 分镜图首帧提交。
        </p>
      ) : null}

      <span style={{ display: "none" }}>{scene.id ?? scene.clientId}{shotId}</span>
      <VideoGenerationConfirmDialog
        open={confirmOpen}
        shotLabel={`场 ${scene.order} · 镜头 ${shot.order}`}
        previsVersion={previsVersion ?? null}
        busy={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onGenerate(previsVersion?.id);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status, subStatus }: { status: VideoJobStatus; subStatus?: VideoJobSubStatus }) {
  const map: Record<VideoJobStatus, { label: string; color: string; bg: string }> = {
    idle: { label: "未生成", color: mutedColor, bg: "rgba(139, 151, 163, 0.12)" },
    queued: { label: "排队中", color: warningColor, bg: "rgba(251, 191, 36, 0.12)" },
    running: { label: "生成中", color: warningColor, bg: "rgba(251, 191, 36, 0.12)" },
    completed: { label: "已完成", color: accentColor, bg: "rgba(117, 219, 198, 0.12)" },
    failed: { label: "失败", color: dangerColor, bg: "rgba(255, 107, 107, 0.12)" },
  };
  const subStatusLabels: Partial<Record<VideoJobSubStatus, string>> = {
    accepted: "已受理",
    generating: "生成中",
    result_ingesting: "转存中",
    submission_unknown: "提交待确认",
    provider_timeout: "查询超时",
  };
  const s = map[status];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, color: s.color, background: s.bg }}>
      {subStatusLabels[subStatus ?? "queued"] ?? s.label}
    </span>
  );
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

// ---------------------------------------------------------------------------
// Batch progress bar (任务 2)
// ---------------------------------------------------------------------------

export type BatchVideoProgress = {
  total: number;
  completed: number;
  failed: number;
  running: number;
};

type BatchVideoBarProps = {
  progress: BatchVideoProgress;
};

export function BatchVideoProgressBar({ progress }: BatchVideoBarProps) {
  const { total, completed, failed, running } = progress;
  if (total === 0) return null;
  const pending = Math.max(0, total - completed - failed - running);
  const completedPct = (completed / total) * 100;
  const failedPct = (failed / total) * 100;
  const runningPct = (running / total) * 100;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11, color: mutedColor }}>
        <span>
          总数 <strong style={{ color: labelColor }}>{total}</strong> · 完成 <strong style={{ color: accentColor }}>{completed}</strong> · 失败 <strong style={{ color: dangerColor }}>{failed}</strong> · 进行中 <strong style={{ color: warningColor }}>{running}</strong> · 待处理 {pending}
        </span>
      </div>
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "rgba(255,255,255,0.05)" }}>
        <div style={{ width: `${completedPct}%`, background: accentColor, transition: "width 0.3s" }} />
        <div style={{ width: `${runningPct}%`, background: warningColor, transition: "width 0.3s" }} />
        <div style={{ width: `${failedPct}%`, background: dangerColor, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}
