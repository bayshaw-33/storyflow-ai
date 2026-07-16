"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Film, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import {
  buildAssemblyPlan,
  productionStateToEDL,
  productionStateToFCPXML,
  type AssemblyTransition,
} from "@/lib/production/state";
import type { ProductionProjectState } from "@/lib/production/types";
import { formatSeconds } from "@/lib/production/state";

type Props = {
  state: ProductionProjectState;
};

export function AutoAssemblyPanel({ state }: Props) {
  const [transition, setTransition] = useState<AssemblyTransition>("cut");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const plan = buildAssemblyPlan(state, transition);
  const readyClips = plan.clips.filter((c) => c.videoUrl || c.imageUrl);
  const currentClip = plan.clips[currentIndex] || readyClips[0] || plan.clips[0];

  const playNext = useCallback(() => {
    const readyIndices = plan.clips
      .map((c, i) => ({ clip: c, index: i }))
      .filter((item) => item.clip.videoUrl || item.clip.imageUrl);

    const currentReadyIdx = readyIndices.findIndex((item) => item.index === currentIndex);
    if (currentReadyIdx >= 0 && currentReadyIdx < readyIndices.length - 1) {
      setCurrentIndex(readyIndices[currentReadyIdx + 1].index);
    } else {
      setIsPlaying(false);
      setCurrentIndex(readyIndices[0]?.index ?? 0);
    }
  }, [plan.clips, currentIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => {
        // Autoplay might be blocked
      });
    } else {
      video.pause();
    }
  }, [isPlaying, currentIndex]);

  function handleClipEnded() {
    playNext();
  }

  function togglePlay() {
    if (!currentClip?.videoUrl) {
      // For image-only clips, advance after duration
      if (isPlaying) {
        setIsPlaying(false);
      } else {
        setIsPlaying(true);
        setTimeout(() => playNext(), Math.max(1000, currentClip.durationSeconds * 1000));
      }
      return;
    }
    setIsPlaying(!isPlaying);
  }

  function skipPrev() {
    const readyIndices = plan.clips
      .map((c, i) => ({ clip: c, index: i }))
      .filter((item) => item.clip.videoUrl || item.clip.imageUrl);
    const currentReadyIdx = readyIndices.findIndex((item) => item.index === currentIndex);
    if (currentReadyIdx > 0) {
      setCurrentIndex(readyIndices[currentReadyIdx - 1].index);
    }
  }

  function skipNext() {
    playNext();
  }

  function exportEDL() {
    const content = productionStateToEDL(state);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.title || "production"}.edl`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportFCPXML() {
    const content = productionStateToFCPXML(state);
    const blob = new Blob([content], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.title || "production"}.fcpxml`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={containerStyle}>
      <div style={previewSectionStyle}>
        <div style={previewFrameStyle}>
          {currentClip?.videoUrl ? (
            <video
              ref={videoRef}
              src={currentClip.videoUrl}
              onEnded={handleClipEnded}
              style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
              controls={false}
              playsInline
            />
          ) : currentClip?.imageUrl ? (
            <img src={currentClip.imageUrl} alt={currentClip.title} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
          ) : (
            <div style={emptyPreviewStyle}>
              <Film size={48} color="#333" />
              <p style={{ color: "#666", fontSize: "13px", marginTop: "8px" }}>暂无可用素材</p>
            </div>
          )}
        </div>

        <div style={controlsBarStyle}>
          <button style={btnStyle} onClick={skipPrev} aria-label="上一个"><SkipBack size={16} /></button>
          <button style={playBtnStyle} onClick={togglePlay} aria-label="播放/暂停">
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button style={btnStyle} onClick={skipNext} aria-label="下一个"><SkipForward size={16} /></button>
          <div style={infoStyle}>
            <span style={{ color: "#75dbc6", fontSize: "13px", fontWeight: 600 }}>
              {currentClip ? `分镜 ${currentClip.index}` : "—"}
            </span>
            <span style={{ color: "#888", fontSize: "11px" }}>
              {currentClip?.title || ""}
            </span>
          </div>
          <div style={progressStyle}>
            <div style={{ ...progressFillStyle, width: `${plan.totalClips > 0 ? ((currentIndex + 1) / plan.totalClips) * 100 : 0}%` }} />
          </div>
        </div>
      </div>

      <div style={sidePanelStyle}>
        <div style={sectionHeaderStyle}>
          <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#e0e0e0", margin: 0 }}>顺片配置</h3>
        </div>

        <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1d1f" }}>
          <label style={labelStyle}>转场效果</label>
          <select
            style={selectStyle}
            value={transition}
            onChange={(e) => setTransition(e.target.value as AssemblyTransition)}
          >
            <option value="cut">硬切 (Cut)</option>
            <option value="crossfade">交叉淡化 (Crossfade)</option>
            <option value="dissolve">溶解 (Dissolve)</option>
          </select>

          <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
            <button style={exportBtnStyle} onClick={exportEDL}><Download size={14} /> EDL</button>
            <button style={exportBtnStyle} onClick={exportFCPXML}><Download size={14} /> FCPXML</button>
          </div>
        </div>

        <div style={sectionHeaderStyle}>
          <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#e0e0e0", margin: 0 }}>
            分镜列表 ({readyClips.length}/{plan.totalClips} 就绪)
          </h3>
        </div>

        <div style={clipListStyle}>
          {plan.clips.map((clip) => {
            const isCurrent = clip.index === currentClip?.index;
            const hasMedia = clip.videoUrl || clip.imageUrl;
            return (
              <button
                key={clip.shotId}
                style={{
                  ...clipItemStyle,
                  borderColor: isCurrent ? "#75dbc6" : "#2a2d30",
                  background: isCurrent ? "rgba(117,219,198,0.06)" : "transparent",
                  opacity: hasMedia ? 1 : 0.4,
                }}
                onClick={() => setCurrentIndex(plan.clips.findIndex((c) => c.shotId === clip.shotId))}
              >
                <div style={clipThumbStyle}>
                  {clip.imageUrl ? (
                    <img src={clip.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <Film size={16} color="#444" />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#e0e0e0" }}>
                    {clip.index}. {clip.title}
                  </div>
                  <div style={{ fontSize: "10px", color: "#888" }}>
                    {formatSeconds(clip.durationSeconds)}
                    {clip.videoUrl ? " · 视频" : clip.imageUrl ? " · 图片" : " · 缺失"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div style={statsStyle}>
          <span style={{ color: "#888", fontSize: "11px" }}>总时长 {formatSeconds(plan.totalDuration)}</span>
          <span style={{ color: "#888", fontSize: "11px" }}>{plan.readyClips}/{plan.totalClips} 就绪</span>
        </div>
      </div>
    </div>
  );
}

/* ---- inline styles (dark theme) ---- */
const containerStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 320px",
  height: "100%",
  gap: "0",
};

const previewSectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  gap: "16px",
};

const previewFrameStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "420px",
  aspectRatio: "9 / 16",
  borderRadius: "12px",
  overflow: "hidden",
  border: "1px solid #2a2d30",
  background: "#000",
};

const emptyPreviewStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
};

const controlsBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  width: "100%",
  maxWidth: "420px",
};

const btnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "36px",
  height: "36px",
  borderRadius: "8px",
  border: "1px solid #2a2d30",
  background: "#141618",
  color: "#ccc",
  cursor: "pointer",
};

const playBtnStyle: React.CSSProperties = {
  ...btnStyle,
  width: "44px",
  height: "44px",
  border: "1px solid #75dbc6",
  background: "rgba(117,219,198,0.12)",
  color: "#75dbc6",
};

const infoStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  flex: 1,
};

const progressStyle: React.CSSProperties = {
  flex: 1,
  height: "4px",
  background: "#1a1d1f",
  borderRadius: "2px",
  overflow: "hidden",
  maxWidth: "80px",
};

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  background: "#75dbc6",
  borderRadius: "2px",
  transition: "width 0.3s ease",
};

const sidePanelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  borderLeft: "1px solid #2a2d30",
  background: "#0a0b0c",
  overflow: "hidden",
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #1a1d1f",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  color: "#888",
  marginBottom: "4px",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: "6px",
  border: "1px solid #2a2d30",
  background: "#141618",
  color: "#e0e0e0",
  fontSize: "13px",
};

const exportBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  fontSize: "11px",
  padding: "5px 10px",
  border: "1px solid #333",
  borderRadius: "5px",
  background: "#141618",
  color: "#ccc",
  cursor: "pointer",
};

const clipListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px",
};

const clipItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  width: "100%",
  padding: "8px",
  border: "1px solid #2a2d30",
  borderRadius: "8px",
  marginBottom: "4px",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
};

const clipThumbStyle: React.CSSProperties = {
  width: "36px",
  height: "48px",
  borderRadius: "4px",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#1a1d1f",
  flexShrink: 0,
};

const statsStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "10px 16px",
  borderTop: "1px solid #1a1d1f",
};
