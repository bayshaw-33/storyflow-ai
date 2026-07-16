"use client";

import { useState, type CSSProperties } from "react";
import type {
  KeyframeSlot,
  KeyframeSlotRole,
  ProductionShot,
  ProductionShotStatus,
  ProductionAspectRatio,
  ProductionMode,
  ProductionShotType,
} from "@/lib/production/types";

type ShotStatusBadgeProps = {
  status: ProductionShotStatus;
};

type ShotLoadingSpinnerProps = {
  label?: string;
};

type PromptViewerProps = {
  imagePrompt: string;
  videoPrompt: string;
  shotType: ProductionShotType;
  duration: string;
};

type ShotThumbnailProps = {
  imageUrl?: string;
  videoUrl?: string;
  status: ProductionShotStatus;
  aspectRatio: ProductionAspectRatio;
};

type ShotActionBarProps = {
  status: ProductionShotStatus;
  onGenerateImage?: () => void;
  onGenerateVideo?: () => void;
  onEdit?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onSelect?: () => void;
  mode: ProductionMode;
};

const statusBadgeConfig: Record<
  ProductionShotStatus,
  { label: string; background: string; color: string; pulse?: boolean }
> = {
  draft: { label: "草稿", background: "rgba(255, 255, 255, 0.10)", color: "#cbd5da" },
  image_generating: { label: "图片生成中", background: "rgba(245, 158, 11, 0.20)", color: "#fbbf24", pulse: true },
  image_ready: { label: "图片就绪", background: "rgba(59, 130, 246, 0.20)", color: "#60a5fa" },
  video_generating: { label: "视频生成中", background: "rgba(245, 158, 11, 0.20)", color: "#fbbf24", pulse: true },
  video_ready: { label: "视频就绪", background: "rgba(117, 219, 198, 0.20)", color: "#75dbc6" },
  error: { label: "错误", background: "rgba(239, 68, 68, 0.20)", color: "#f87171" },
};

export function ShotStatusBadge({ status }: ShotStatusBadgeProps) {
  const config = statusBadgeConfig[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        borderRadius: 999,
        background: config.background,
        color: config.color,
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.6,
        whiteSpace: "nowrap",
      }}
    >
      {config.pulse ? (
        <>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: config.color,
              animation: "shot-card-pulse 1.4s ease-in-out infinite",
            }}
          />
          <style>{`@keyframes shot-card-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.8); } }`}</style>
        </>
      ) : null}
      {config.label}
    </span>
  );
}

export function ShotLoadingSpinner({ label }: ShotLoadingSpinnerProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        color: "#aeb8be",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ animation: "shot-card-spin 0.9s linear infinite" }}
      >
        <circle cx="12" cy="12" r="10" stroke="rgba(174, 184, 190, 0.25)" strokeWidth="3" />
        <path d="M22 12a10 10 0 0 1-10 10" stroke="#aeb8be" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label ? <span>{label}</span> : null}
      <style>{`@keyframes shot-card-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

export function PromptViewer({ imagePrompt, videoPrompt, shotType, duration }: PromptViewerProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      style={{
        marginTop: 8,
        borderRadius: 12,
        background: "#0d0f10",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 12px",
          background: "transparent",
          border: 0,
          color: "#e0e0e0",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "#75dbc6" }}>{expanded ? "▾" : "▸"}</span>
          <span style={{ padding: "1px 6px", borderRadius: 6, background: "rgba(255, 255, 255, 0.08)", color: "#cbd5da" }}>{shotType}</span>
          <span style={{ padding: "1px 6px", borderRadius: 6, background: "rgba(255, 255, 255, 0.08)", color: "#cbd5da" }}>{duration}</span>
        </span>
        <span style={{ color: "#75dbc6", fontSize: 11 }}>{expanded ? "收起" : "展开"}</span>
      </button>
      {expanded ? (
        <div style={{ padding: "0 12px 12px", display: "grid", gap: 10 }}>
          <div>
            <p style={{ margin: "0 0 4px", color: "#75dbc6", fontSize: 11, fontWeight: 700 }}>图片提示词</p>
            <p style={{ margin: 0, color: "#cbd5da", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{imagePrompt || "—"}</p>
          </div>
          <div>
            <p style={{ margin: "0 0 4px", color: "#75dbc6", fontSize: 11, fontWeight: 700 }}>视频提示词</p>
            <p style={{ margin: 0, color: "#cbd5da", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{videoPrompt || "—"}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const aspectRatioMap: Record<ProductionAspectRatio, string> = {
  "9:16": "9 / 16",
  "16:9": "16 / 9",
  "1:1": "1 / 1",
};

export function ShotThumbnail({ imageUrl, videoUrl, status, aspectRatio }: ShotThumbnailProps) {
  const isGenerating = status === "image_generating" || status === "video_generating";
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: aspectRatioMap[aspectRatio],
        borderRadius: 12,
        overflow: "hidden",
        background: "#0d0f10",
        border: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      {videoUrl ? (
        <video
          src={videoUrl}
          poster={imageUrl}
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : imageUrl ? (
        <img
          src={imageUrl}
          alt="shot thumbnail"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: status === "error" ? "#f87171" : "#5b666d",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {status === "error" ? "⚠" : status === "draft" ? "📝" : "🎬"}
        </div>
      )}
      {isGenerating ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(13, 15, 16, 0.72)",
          }}
        >
          <ShotLoadingSpinner label={status === "image_generating" ? "生成图片" : "生成视频"} />
        </div>
      ) : null}
    </div>
  );
}

export function ShotActionBar({
  status,
  onGenerateImage,
  onGenerateVideo,
  onEdit,
  onCopy,
  onDelete,
  onMoveUp,
  onMoveDown,
  onSelect,
  mode,
}: ShotActionBarProps) {
  const baseButtonStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255, 255, 255, 0.12)",
    background: "rgba(255, 255, 255, 0.06)",
    color: "#e0e0e0",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  };
  const disabledButtonStyle: CSSProperties = {
    ...baseButtonStyle,
    opacity: 0.45,
    cursor: "not-allowed",
  };
  const primaryButtonStyle: CSSProperties = {
    ...baseButtonStyle,
    borderColor: "rgba(117, 219, 198, 0.45)",
    background: "rgba(117, 219, 198, 0.16)",
    color: "#75dbc6",
  };

  const isImageGenerating = status === "image_generating";
  const isVideoGenerating = status === "video_generating";
  const disableGenerateImage = isImageGenerating || isVideoGenerating;
  const canGenerateVideo = status === "image_ready";

  if (mode === "planning") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <button type="button" style={baseButtonStyle} onClick={onEdit}>✏️ 编辑</button>
        <button type="button" style={baseButtonStyle} onClick={onCopy}>📋 复制</button>
        <button
          type="button"
          style={disableGenerateImage ? disabledButtonStyle : primaryButtonStyle}
          onClick={disableGenerateImage ? undefined : onGenerateImage}
          disabled={disableGenerateImage}
        >
          {isImageGenerating ? "⏳ 图片生成中" : "🖼 生成图片"}
        </button>
        <button type="button" style={baseButtonStyle} onClick={onSelect}>☑ 选择</button>
      </div>
    );
  }

  if (mode === "canvas") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <button type="button" style={baseButtonStyle} onClick={onMoveUp}>↑ 上移</button>
        <button type="button" style={baseButtonStyle} onClick={onMoveDown}>↓ 下移</button>
        <button
          type="button"
          style={disableGenerateImage ? disabledButtonStyle : primaryButtonStyle}
          onClick={disableGenerateImage ? undefined : onGenerateImage}
          disabled={disableGenerateImage}
        >
          {isImageGenerating ? "⏳ 图片生成中" : "🖼 生成图片"}
        </button>
        <button
          type="button"
          style={canGenerateVideo && !isVideoGenerating ? primaryButtonStyle : disabledButtonStyle}
          onClick={canGenerateVideo && !isVideoGenerating ? onGenerateVideo : undefined}
          disabled={!canGenerateVideo || isVideoGenerating}
        >
          {isVideoGenerating ? "⏳ 视频生成中" : "🎬 生成视频"}
        </button>
        <button type="button" style={baseButtonStyle} onClick={onDelete}>🗑 删除</button>
      </div>
    );
  }

  return null;
}


/* ------------------------------------------------------------------ */
/* Keyframe Slot 四层结构展示                                          */
/* ------------------------------------------------------------------ */

type KeyframeSlotViewerProps = {
  slots: KeyframeSlot[];
  onSelectCandidate?: (slotId: string, candidateId: string) => void;
};

const slotRoleConfig: Record<KeyframeSlotRole, { label: string; background: string; color: string }> = {
  single: { label: "Single", background: "rgba(109, 231, 223, 0.16)", color: "#6de7df" },
  start: { label: "Start", background: "rgba(96, 165, 250, 0.18)", color: "#60a5fa" },
  intermediate: { label: "Intermediate", background: "rgba(251, 191, 36, 0.18)", color: "#fbbf24" },
  end: { label: "End", background: "rgba(192, 132, 252, 0.18)", color: "#c084fc" },
};

const candidateStatusLabels: Record<string, string> = {
  draft: "草稿",
  generating: "生成中",
  ready: "就绪",
  failed: "失败",
  archived: "已归档",
};

export function KeyframeSlotViewer({ slots, onSelectCandidate }: KeyframeSlotViewerProps) {
  if (!slots || slots.length === 0) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: "10px 12px",
          borderRadius: 12,
          background: "#0d0f10",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          color: "#5b666d",
          fontSize: 12,
          fontWeight: 600,
          textAlign: "center",
        }}
      >
        暂无关键帧
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 8,
        display: "grid",
        gap: 8,
      }}
    >
      {slots.map((slot) => (
        <KeyframeSlotItem key={slot.id} slot={slot} onSelectCandidate={onSelectCandidate} />
      ))}
    </div>
  );
}

type KeyframeSlotItemProps = {
  slot: KeyframeSlot;
  onSelectCandidate?: (slotId: string, candidateId: string) => void;
};

function KeyframeSlotItem({ slot, onSelectCandidate }: KeyframeSlotItemProps) {
  const role = slotRoleConfig[slot.slot_role] || slotRoleConfig.single;
  const ratioPercent = Math.round((slot.timestamp_ratio || 0) * 100);
  const sortedCandidates = [...slot.candidates].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div
      style={{
        borderRadius: 12,
        background: "#0d0f10",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        padding: 10,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            background: role.background,
            color: role.color,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {role.label}
        </span>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 6,
            background: "rgba(255, 255, 255, 0.08)",
            color: "#6de7df",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {ratioPercent}%
        </span>
        {slot.label ? (
          <span style={{ color: "#cbd5da", fontSize: 12, fontWeight: 600 }}>{slot.label}</span>
        ) : null}
        {sortedCandidates.length > 0 ? (
          <span style={{ color: "#5b666d", fontSize: 11, fontWeight: 600, marginLeft: "auto" }}>
            {sortedCandidates.length} 个候选
          </span>
        ) : null}
      </div>

      {sortedCandidates.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))",
            gap: 6,
          }}
        >
          {sortedCandidates.map((candidate) => (
            <KeyframeCandidateThumb
              key={candidate.id}
              candidate={candidate}
              isSelected={Boolean(candidate.is_selected) || slot.selected_candidate_id === candidate.id}
              onClick={
                onSelectCandidate
                  ? () => onSelectCandidate(slot.id, candidate.id)
                  : undefined
              }
            />
          ))}
        </div>
      ) : (
        <div style={{ color: "#5b666d", fontSize: 11, fontWeight: 600, padding: "4px 2px" }}>
          该 Slot 暂无候选关键帧
        </div>
      )}
    </div>
  );
}

type KeyframeCandidateThumbProps = {
  candidate: {
    id: string;
    image_url?: string;
    status: string;
    prompt: string;
  };
  isSelected: boolean;
  onClick?: () => void;
};

function KeyframeCandidateThumb({ candidate, isSelected, onClick }: KeyframeCandidateThumbProps) {
  const statusLabel = candidateStatusLabels[candidate.status] || candidate.status;
  const hasImage = Boolean(candidate.image_url);
  const borderStyle = isSelected
    ? "2px solid #6de7df"
    : "1px solid rgba(255, 255, 255, 0.08)";

  return (
    <button
      type="button"
      onClick={onClick}
      title={candidate.prompt || statusLabel}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        aspectRatio: "9 / 16",
        padding: 0,
        border: borderStyle,
        borderRadius: 8,
        overflow: "hidden",
        background: "#000",
        cursor: onClick ? "pointer" : "default",
        boxShadow: isSelected ? "0 0 0 1px rgba(109, 231, 223, 0.35)" : "none",
        transition: "box-shadow 0.15s ease, border-color 0.15s ease",
      }}
    >
      {hasImage ? (
        <img
          src={candidate.image_url}
          alt={statusLabel}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "#5b666d",
            fontSize: 18,
          }}
        >
          {candidate.status === "failed" ? "⚠" : candidate.status === "generating" ? "⏳" : "🖼"}
        </div>
      )}
      <span
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          right: 0,
          padding: "1px 4px",
          background: "rgba(13, 15, 16, 0.78)",
          color: isSelected ? "#6de7df" : "#aeb8be",
          fontSize: 10,
          fontWeight: 700,
          textAlign: "center",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {isSelected ? "✓ " : ""}{statusLabel}
      </span>
    </button>
  );
}
