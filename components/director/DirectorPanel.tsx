"use client";

/**
 * TRAE-V2-04 AI Director Panel
 * 流程：输入剧本 → 分析 → Preview → Apply → 编辑/锁定
 */

import { memo, useCallback, useState } from "react";
import {
  Clapperboard,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type {
  DirectorBreakdownResponse,
  SceneBreakdownPreview,
  ShotBreakdownPreview,
} from "@/lib/director/types";

const COPY = {
  zh: {
    title: "AI 导演",
    subtitle: "Scene / Shot Breakdown",
    inputLabel: "剧本源文",
    placeholder: "粘贴剧本内容…",
    analyze: "分析剧本",
    analyzing: "分析中…",
    apply: "应用",
    applying: "应用中…",
    applied: "已应用",
    preview: "预览",
    scenes: "场",
    shots: "镜头",
    empty: "尚未分析",
    targetDuration: "目标总时长（秒）",
    visualStyle: "视觉风格",
    directorFields: "导演字段",
    sceneFunction: "场景功能",
    conflict: "冲突",
    emotion: "情绪",
    valueShift: "价值变化",
    blocking: "走位",
    focalLength: "焦段",
    cameraStart: "机位起点",
    movementPath: "运动路径",
    speedCurve: "速度曲线",
    parallax: "视差",
    focusChange: "焦点变化",
    endFrame: "落幅",
    transition: "转场",
    lighting: "光影",
    color: "色彩",
    soundEffects: "音效",
    storyBeat: "故事节拍",
    visualDesc: "画面描述",
    dialogue: "对白",
  },
  en: {
    title: "AI Director",
    subtitle: "Scene / Shot Breakdown",
    inputLabel: "Script Source",
    placeholder: "Paste script…",
    analyze: "Analyze",
    analyzing: "Analyzing…",
    apply: "Apply",
    applying: "Applying…",
    applied: "Applied",
    preview: "Preview",
    scenes: "Scenes",
    shots: "Shots",
    empty: "Not analyzed yet",
    targetDuration: "Target Duration (s)",
    visualStyle: "Visual Style",
    directorFields: "Director Fields",
    sceneFunction: "Scene Function",
    conflict: "Conflict",
    emotion: "Emotion",
    valueShift: "Value Shift",
    blocking: "Blocking",
    focalLength: "Focal Length",
    cameraStart: "Camera Start",
    movementPath: "Movement Path",
    speedCurve: "Speed Curve",
    parallax: "Parallax",
    focusChange: "Focus Change",
    endFrame: "End Frame",
    transition: "Transition",
    lighting: "Lighting",
    color: "Color",
    soundEffects: "Sound Effects",
    storyBeat: "Story Beat",
    visualDesc: "Visual Description",
    dialogue: "Dialogue",
  },
};

const CARD: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  background: "rgba(255,255,255,0.02)",
  padding: 16,
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "rgba(255,255,255,0.95)",
  marginBottom: 12,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const LABEL: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.5)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 4,
};

const VALUE: React.CSSProperties = {
  fontSize: 13,
  color: "rgba(255,255,255,0.9)",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 4,
  color: "inherit",
  fontSize: 13,
};

const TEXTAREA: React.CSSProperties = {
  ...INPUT,
  minHeight: 120,
  resize: "vertical" as const,
  fontFamily: "inherit",
};

const BUTTON_PRIMARY: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  background: "rgba(99,102,241,0.2)",
  border: "1px solid rgba(99,102,241,0.4)",
  borderRadius: 6,
  color: "#a5b4fc",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
};

const BUTTON_SUCCESS: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  background: "rgba(34,197,94,0.2)",
  border: "1px solid rgba(34,197,94,0.4)",
  borderRadius: 6,
  color: "#86efac",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
};

type DirectorPanelProps = {
  projectId: string;
  sourceUnitId: string;
  accessToken: string | null;
  isZh: boolean;
};

export const DirectorPanel = memo(function DirectorPanel({
  projectId,
  sourceUnitId,
  accessToken,
  isZh,
}: DirectorPanelProps) {
  const copy = isZh ? COPY.zh : COPY.en;
  const [source, setSource] = useState("");
  const [targetDuration, setTargetDuration] = useState(60);
  const [visualStyle, setVisualStyle] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<DirectorBreakdownResponse | null>(null);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());

  const toggleScene = useCallback((sceneId: string) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!accessToken || !source.trim()) return;
    setAnalyzing(true);
    setError("");
    setPreview(null);
    setApplied(false);
    try {
      const res = await fetch("/api/director/analyze-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          projectId,
          sourceUnitId,
          source,
          aspectRatio: "9:16",
          targetDurationSeconds: targetDuration,
          visualStyle,
          outputLanguage: isZh ? "zh-CN" : "en",
          mode: "full",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "analyze failed");
      }
      setPreview(data as DirectorBreakdownResponse);
      const sceneIds = (data.scenes ?? []).map((s: SceneBreakdownPreview) => s.sceneId);
      setExpandedScenes(new Set(sceneIds));
    } catch (err) {
      setError(err instanceof Error ? err.message : "analyze failed");
    } finally {
      setAnalyzing(false);
    }
  }, [accessToken, source, projectId, sourceUnitId, targetDuration, visualStyle, isZh]);

  const handleApply = useCallback(async () => {
    if (!accessToken || !preview) return;
    setApplying(true);
    setError("");
    try {
      const res = await fetch("/api/director/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          projectId,
          sourceUnitId,
          scenes: preview.scenes,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "apply failed");
      }
      setApplied(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "apply failed");
    } finally {
      setApplying(false);
    }
  }, [accessToken, preview, projectId, sourceUnitId]);

  if (!accessToken) {
    return (
      <section style={CARD}>
        <h2 style={SECTION_TITLE}>
          <Clapperboard size={16} /> {copy.title}
        </h2>
        <p style={{ ...VALUE, color: "rgba(255,255,255,0.5)" }}>请先登录</p>
      </section>
    );
  }

  return (
    <section style={CARD}>
      <h2 style={SECTION_TITLE}>
        <Clapperboard size={16} /> {copy.title}
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>
          {copy.subtitle}
        </span>
      </h2>

      {error ? (
        <div style={{
          marginBottom: 12, padding: 8,
          background: "rgba(239,68,68,0.1)",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 4, fontSize: 12, color: "#fca5a5",
          display: "flex", gap: 6, alignItems: "center",
        }}>
          <AlertCircle size={12} /> {error}
        </div>
      ) : null}

      <div style={{ marginBottom: 12 }}>
        <div style={LABEL}>{copy.inputLabel}</div>
        <textarea
          style={TEXTAREA}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={copy.placeholder}
          disabled={analyzing}
        />
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <div style={LABEL}>{copy.targetDuration}</div>
          <input
            type="number"
            style={{ ...INPUT, width: 100 }}
            value={targetDuration}
            onChange={(e) => setTargetDuration(Number(e.target.value) || 60)}
            disabled={analyzing}
          />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={LABEL}>{copy.visualStyle}</div>
          <input
            type="text"
            style={INPUT}
            value={visualStyle}
            onChange={(e) => setVisualStyle(e.target.value)}
            disabled={analyzing}
            placeholder={isZh ? "现代短剧" : "Modern short drama"}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={handleAnalyze}
          disabled={analyzing || !source.trim()}
          style={BUTTON_PRIMARY}
        >
          {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {analyzing ? copy.analyzing : copy.analyze}
        </button>

        {preview && !applied ? (
          <button
            onClick={handleApply}
            disabled={applying}
            style={BUTTON_SUCCESS}
          >
            {applying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {applying ? copy.applying : copy.apply}
          </button>
        ) : null}

        {applied ? (
          <span style={{ ...VALUE, color: "#86efac", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <CheckCircle2 size={14} /> {copy.applied}
          </span>
        ) : null}
      </div>

      {preview ? (
        <div>
          <div style={{ ...LABEL, marginBottom: 8 }}>
            {copy.preview} · {preview.scenes.length} {copy.scenes}
          </div>
          {preview.scenes.map((scene) => (
            <ScenePreviewCard
              key={scene.sceneId}
              scene={scene}
              copy={copy}
              expanded={expandedScenes.has(scene.sceneId)}
              onToggle={() => toggleScene(scene.sceneId)}
            />
          ))}
        </div>
      ) : !analyzing ? (
        <div style={{ ...VALUE, color: "rgba(255,255,255,0.4)", textAlign: "center", padding: 24 }}>
          {copy.empty}
        </div>
      ) : null}
    </section>
  );
});

type ScenePreviewCardProps = {
  scene: SceneBreakdownPreview;
  copy: typeof COPY.zh;
  expanded: boolean;
  onToggle: () => void;
};

const ScenePreviewCard = memo(function ScenePreviewCard({
  scene,
  copy,
  expanded,
  onToggle,
}: ScenePreviewCardProps) {
  const meta = scene.directorMeta;
  return (
    <div style={{
      marginBottom: 8,
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 6,
      background: "rgba(255,255,255,0.015)",
      overflow: "hidden",
    }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", padding: "10px 12px",
          background: "transparent", border: "none",
          color: "rgba(255,255,255,0.9)", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 13, fontWeight: 500, textAlign: "left",
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{scene.heading}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          · {scene.shots.length} {copy.shots}
        </span>
      </button>

      {expanded ? (
        <div style={{ padding: "0 12px 12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 12 }}>
            <Field label={copy.sceneFunction} value={meta.scene_function} />
            <Field label={copy.conflict} value={meta.conflict} />
            <Field label={copy.emotion} value={meta.emotion} />
            <Field label={copy.valueShift} value={meta.value_shift} />
            <Field label={copy.blocking} value={meta.blocking} />
          </div>

          {scene.shots.map((shot, idx) => (
            <ShotPreviewCard key={shot.shotId} shot={shot} index={idx} copy={copy} />
          ))}
        </div>
      ) : null}
    </div>
  );
});

type ShotPreviewCardProps = {
  shot: ShotBreakdownPreview;
  index: number;
  copy: typeof COPY.zh;
};

const ShotPreviewCard = memo(function ShotPreviewCard({ shot, index, copy }: ShotPreviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = shot.directorMeta;
  return (
    <div style={{
      marginBottom: 6,
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 4,
      background: "rgba(255,255,255,0.01)",
    }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%", padding: "8px 10px",
          background: "transparent", border: "none",
          color: "rgba(255,255,255,0.8)", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 12, textAlign: "left",
        }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>#{index + 1}</span>
        <span style={{ color: "rgba(255,255,255,0.6)" }}>{shot.shotSize} · {shot.cameraMovement}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          {shot.durationSeconds}s
        </span>
      </button>

      {expanded ? (
        <div style={{ padding: "0 10px 10px", fontSize: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <div style={LABEL}>{copy.storyBeat}</div>
            <div style={VALUE}>{shot.storyBeat}</div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={LABEL}>{copy.visualDesc}</div>
            <div style={VALUE}>{shot.visualDescription}</div>
          </div>
          {shot.dialogue ? (
            <div style={{ marginBottom: 8 }}>
              <div style={LABEL}>{copy.dialogue}</div>
              <div style={{ ...VALUE, fontStyle: "italic" }}>{shot.dialogue}</div>
            </div>
          ) : null}

          <div style={{ ...LABEL, marginTop: 8 }}>{copy.directorFields}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 6 }}>
            <Field label={copy.focalLength} value={meta.focal_length} />
            <Field label={copy.cameraStart} value={meta.camera_start} />
            <Field label={copy.movementPath} value={meta.movement_path} />
            <Field label={copy.speedCurve} value={meta.speed_curve} />
            <Field label={copy.parallax} value={meta.parallax} />
            <Field label={copy.focusChange} value={meta.focus_change} />
            <Field label={copy.endFrame} value={meta.end_frame} />
            <Field label={copy.transition} value={meta.transition_interface} />
            <Field label={copy.lighting} value={meta.lighting} />
            <Field label={copy.color} value={meta.color} />
            <Field label={copy.soundEffects} value={meta.sound_effects} />
            <Field label={copy.blocking} value={meta.blocking} />
          </div>
        </div>
      ) : null}
    </div>
  );
});

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <div style={LABEL}>{label}</div>
      <div style={VALUE}>{value}</div>
    </div>
  );
}
