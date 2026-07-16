"use client";

import { useState, type CSSProperties } from "react";
import type {
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
