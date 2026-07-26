/**
 * TRAE-V2-06 OpenCut-ready Editor Framework
 * 剪辑工作台空壳组件
 *
 * 布局：
 *   左：Production Assets（Selected Takes + Voice Lines）
 *   中：Preview Placeholder（无剪辑能力，仅展示）
 *   下：Timeline Framework（kiikis.timeline/1 序列化展示）
 *   右：Clip/Project Properties（只读）
 *
 * 本轮不做：
 *   - 拖拽剪辑
 *   - 裁剪、分割
 *   - 转场编辑
 *   - 特效
 *   - 浏览器 MP4 导出
 *   - OpenCut iframe
 */

"use client";

import { memo, useCallback, useEffect, useState } from "react";
import type {
  EditorTimelineResponse,
  KiikisTimeline,
  TimelineClip,
  TimelineTrack,
} from "@/lib/editor/types";

type Props = {
  projectId: string;
  sourceUnitId: string;
  accessToken: string | null;
  isZh?: boolean;
};

const COPY = {
  zh: {
    title: "剪辑工作台",
    subtitle: "OpenCut-ready Framework",
    loading: "加载时间线…",
    error: "加载失败",
    retry: "重试",
    assets: "Production Assets",
    preview: "Preview",
    previewPlaceholder: "预览占位（本轮不提供剪辑能力）",
    timeline: "Timeline Framework",
    timelineEmpty: "时间线为空，请先在 Production 中创建 Selected Takes",
    properties: "Project Properties",
    opencutStatus: "OpenCut 状态",
    opencutWaiting: "待适配",
    opencutReason: "OpenCut Adapter 首期仅作为框架占位，尚未实际接入。",
    exportBtn: "导出 Production Package",
    exportUnavailable: "导出不可用",
    duration: "总时长",
    seconds: "秒",
    tracks: "轨道",
    videoTrack: "视频轨",
    voiceTrack: "语音轨",
    captionsTrack: "字幕轨",
    noClips: "无片段",
    clips: "片段",
    schemaVersion: "Schema 版本",
    serializedAt: "序列化时间",
    refresh: "刷新",
  },
  en: {
    title: "Editor Framework",
    subtitle: "OpenCut-ready",
    loading: "Loading timeline…",
    error: "Load failed",
    retry: "Retry",
    assets: "Production Assets",
    preview: "Preview",
    previewPlaceholder: "Preview placeholder (no editing in this phase)",
    timeline: "Timeline Framework",
    timelineEmpty: "Timeline is empty. Create Selected Takes in Production first.",
    properties: "Project Properties",
    opencutStatus: "OpenCut Status",
    opencutWaiting: "Waiting",
    opencutReason: "OpenCut Adapter is a stub in this phase.",
    exportBtn: "Export Production Package",
    exportUnavailable: "Export unavailable",
    duration: "Duration",
    seconds: "s",
    tracks: "Tracks",
    videoTrack: "Video",
    voiceTrack: "Voice",
    captionsTrack: "Captions",
    noClips: "No clips",
    clips: "clips",
    schemaVersion: "Schema",
    serializedAt: "Serialized at",
    refresh: "Refresh",
  },
};

export const EditorFramework = memo(function EditorFramework({
  projectId,
  sourceUnitId,
  accessToken,
  isZh = true,
}: Props) {
  const copy = isZh ? COPY.zh : COPY.en;
  const [data, setData] = useState<EditorTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTimeline = useCallback(async () => {
    if (!accessToken || !projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        projectId,
        sourceUnitId,
        aspectRatio: "9:16",
      });
      const res = await fetch(`/api/editor/timeline?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "fetch failed");
      }
      setData(json as EditorTimelineResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, [accessToken, projectId, sourceUnitId]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 600 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
            {copy.title}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            {copy.subtitle} · {projectId}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 4,
              background: data?.opencutStatus.available
                ? "rgba(120,255,180,0.1)"
                : "rgba(255,180,120,0.1)",
              color: data?.opencutStatus.available
                ? "rgba(120,255,180,0.9)"
                : "rgba(255,180,120,0.9)",
            }}
          >
            {copy.opencutStatus}: {data?.opencutStatus.available ? "✓" : copy.opencutWaiting}
          </span>
          <button
            type="button"
            onClick={() => void loadTimeline()}
            disabled={loading}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.8)",
              padding: "4px 10px",
              borderRadius: 4,
              fontSize: 11,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {copy.refresh}
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ padding: 24, color: "rgba(255,255,255,0.5)" }}>
          {copy.loading}
        </div>
      ) : error ? (
        <div style={{ padding: 24, color: "rgba(255,120,120,0.8)" }}>
          {copy.error}: {error}{" "}
          <button
            type="button"
            onClick={() => void loadTimeline()}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,180,120,0.9)",
              cursor: "pointer",
            }}
          >
            {copy.retry}
          </button>
        </div>
      ) : data ? (
        <div style={{ display: "flex", flex: 1, gap: 1, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
          {/* Left: Assets */}
          <AssetsPanel timeline={data.timeline} copy={copy} />

          {/* Center: Preview + Timeline */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.4)" }}>
            {/* Preview Placeholder */}
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.3)",
                fontSize: 12,
                padding: 24,
                textAlign: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 24, marginBottom: 8 }}>▶</div>
                <div>{copy.previewPlaceholder}</div>
              </div>
            </div>

            {/* Timeline Framework */}
            <TimelinePanel timeline={data.timeline} copy={copy} />
          </div>

          {/* Right: Properties */}
          <PropertiesPanel data={data} copy={copy} />
        </div>
      ) : null}
    </div>
  );
});

// ============================================================
// 子组件
// ============================================================

type CopyObj = typeof COPY.zh;

function AssetsPanel({
  timeline,
  copy,
}: {
  timeline: KiikisTimeline;
  copy: CopyObj;
}) {
  const videoTrack = timeline.tracks.find((t) => t.kind === "video");
  const voiceTrack = timeline.tracks.find((t) => t.kind === "voice");
  const captionsTrack = timeline.tracks.find((t) => t.kind === "captions");

  return (
    <div
      style={{
        width: 260,
        background: "rgba(0,0,0,0.3)",
        padding: 12,
        overflowY: "auto",
      }}
    >
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
        {copy.assets}
      </div>
      <AssetGroup
        title={copy.videoTrack}
        clips={videoTrack?.clips ?? []}
        emptyText={copy.noClips}
      />
      <AssetGroup
        title={copy.voiceTrack}
        clips={voiceTrack?.clips ?? []}
        emptyText={copy.noClips}
      />
      <AssetGroup
        title={copy.captionsTrack}
        clips={captionsTrack?.clips ?? []}
        emptyText={copy.noClips}
      />
    </div>
  );
}

function AssetGroup({
  title,
  clips,
  emptyText,
}: {
  title: string;
  clips: TimelineClip[];
  emptyText: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.6)",
          marginBottom: 4,
          fontWeight: 500,
        }}
      >
        {title} ({clips.length})
      </div>
      {clips.length === 0 ? (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
          {emptyText}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {clips.slice(0, 10).map((clip) => (
            <div
              key={clip.id}
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.7)",
                padding: "2px 6px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={clip.label || clip.text || clip.shotId}
            >
              {clip.label || clip.text || clip.shotId}
            </div>
          ))}
          {clips.length > 10 && (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
              +{clips.length - 10} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TimelinePanel({
  timeline,
  copy,
}: {
  timeline: KiikisTimeline;
  copy: CopyObj;
}) {
  if (timeline.durationSeconds === 0 || timeline.tracks.every((t) => t.clips.length === 0)) {
    return (
      <div
        style={{
          height: 200,
          padding: 16,
          color: "rgba(255,255,255,0.4)",
          fontSize: 12,
          textAlign: "center",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {copy.timelineEmpty}
      </div>
    );
  }

  return (
    <div
      style={{
        height: 220,
        padding: 12,
        borderTop: "1px solid rgba(255,255,255,0.1)",
        overflowX: "auto",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.5)",
          marginBottom: 8,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          {copy.timeline} · {copy.schemaVersion}: {timeline.schemaVersion}
        </span>
        <span>
          {copy.duration}: {timeline.durationSeconds.toFixed(1)}
          {copy.seconds}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {timeline.tracks.map((track) => (
          <TrackRow key={track.id} track={track} timeline={timeline} copy={copy} />
        ))}
      </div>
    </div>
  );
}

function TrackRow({
  track,
  timeline,
  copy,
}: {
  track: TimelineTrack;
  timeline: KiikisTimeline;
  copy: CopyObj;
}) {
  const label =
    track.kind === "video"
      ? copy.videoTrack
      : track.kind === "voice"
        ? copy.voiceTrack
        : copy.captionsTrack;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 28,
      }}
    >
      <div
        style={{
          width: 80,
          fontSize: 10,
          color: "rgba(255,255,255,0.6)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          flex: 1,
          position: "relative",
          height: 24,
          background: "rgba(255,255,255,0.02)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        {track.clips.length === 0 ? (
          <div
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.3)",
              padding: "4px 8px",
            }}
          >
            {copy.noClips}
          </div>
        ) : (
          track.clips.map((clip) => {
            const left =
              timeline.durationSeconds > 0
                ? (clip.start / timeline.durationSeconds) * 100
                : 0;
            const width =
              timeline.durationSeconds > 0
                ? (clip.duration / timeline.durationSeconds) * 100
                : 0;
            return (
              <div
                key={clip.id}
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  width: `${Math.max(2, width)}%`,
                  top: 2,
                  bottom: 2,
                  background:
                    track.kind === "video"
                      ? "rgba(120,180,255,0.4)"
                      : track.kind === "voice"
                        ? "rgba(180,120,255,0.4)"
                        : "rgba(180,255,120,0.4)",
                  borderRadius: 2,
                  fontSize: 9,
                  color: "rgba(255,255,255,0.9)",
                  padding: "1px 4px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={clip.label || clip.text}
              >
                {clip.label || clip.text || clip.shotId}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PropertiesPanel({
  data,
  copy,
}: {
  data: EditorTimelineResponse;
  copy: CopyObj;
}) {
  return (
    <div
      style={{
        width: 240,
        background: "rgba(0,0,0,0.3)",
        padding: 12,
        overflowY: "auto",
      }}
    >
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
        {copy.properties}
      </div>

      <PropertyRow label={copy.schemaVersion} value={data.timeline.schemaVersion} />
      <PropertyRow
        label={copy.duration}
        value={`${data.timeline.durationSeconds.toFixed(1)}${copy.seconds}`}
      />
      <PropertyRow
        label={copy.tracks}
        value={String(data.timeline.tracks.length)}
      />
      <PropertyRow
        label="Aspect Ratio"
        value={data.timeline.aspectRatio}
      />
      <PropertyRow
        label={copy.serializedAt}
        value={data.timeline.serializedAt?.slice(0, 19).replace("T", " ") || "-"}
      />

      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
          {copy.opencutStatus}
        </div>
        <div
          style={{
            fontSize: 11,
            color: data.opencutStatus.available
              ? "rgba(120,255,180,0.9)"
              : "rgba(255,180,120,0.9)",
            marginBottom: 8,
          }}
        >
          {data.opencutStatus.available ? "✓" : "⏳"}{" "}
          {data.opencutStatus.reason || "OK"}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
          {copy.opencutReason}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          disabled={!data.exportAvailable}
          style={{
            width: "100%",
            padding: "8px 12px",
            background: data.exportAvailable
              ? "rgba(120,180,255,0.2)"
              : "rgba(255,255,255,0.05)",
            border: data.exportAvailable
              ? "1px solid rgba(120,180,255,0.4)"
              : "1px solid rgba(255,255,255,0.1)",
            color: data.exportAvailable
              ? "rgba(255,255,255,0.9)"
              : "rgba(255,255,255,0.4)",
            borderRadius: 4,
            fontSize: 12,
            cursor: data.exportAvailable ? "pointer" : "not-allowed",
          }}
          title={data.exportUnavailableReason || ""}
        >
          {data.exportAvailable ? copy.exportBtn : copy.exportUnavailable}
        </button>
        {!data.exportAvailable && data.exportUnavailableReason && (
          <div
            style={{
              fontSize: 10,
              color: "rgba(255,180,120,0.7)",
              marginTop: 4,
              textAlign: "center",
            }}
          >
            {data.exportUnavailableReason}
          </div>
        )}
      </div>
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        fontSize: 11,
      }}
    >
      <span style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
      <span style={{ color: "rgba(255,255,255,0.8)" }}>{value}</span>
    </div>
  );
}
