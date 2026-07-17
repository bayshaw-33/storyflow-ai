"use client";

/**
 * Storyboard four-zone panels.
 *
 * Task card: KIIKIS-P1-TRAE-002 §3 (任务 2-5)
 *
 * ProductionWorkbench 收敛为 4 个 tab：
 *   1. ScriptInputPanel     — 剧本输入（项目+集+剧本来源+上传+分析）
 *   2. StoryboardTablePanel — 分镜表（Scene/Shot 字段编辑+锁定+增删+拆合+排序+单场重分析+409）
 *   3. ArtAssetsPanel       — 美术物料（人物/场景/道具 Tab+4 候选+主参考+重新生成+上传替换+关联 Shot）
 *   4. ShotFramesPanel      — 分镜图与即梦提示词（主参考+分镜图+提示词+复制+生成/重试+confirmed）
 *
 * 所有 API 调用由主壳 (ProductionWorkbench) 持有；panel 仅通过 props 接收回调与状态。
 * 这层只负责展示与编辑，避免重复 fetch/状态机。
 */

import { type ChangeEvent, useMemo, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileText,
  Film,
  ImagePlus,
  Loader2,
  Lock,
  LockOpen,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
  Upload,
  Wand2,
} from "lucide-react";
import type {
  AnalyzeResponse,
  StoryboardAssetUsage,
  StoryboardScene,
  StoryboardShot,
} from "@/lib/storyboard/contracts";
import type { ProductionSourceFile } from "@/lib/production/types";
import { ShotVideoPanel, BatchVideoProgressBar, type VideoJobMap, type VideoJobState, type BatchVideoProgress } from "./ShotVideoPanel";

// ---------------------------------------------------------------------------
// 共享类型与工具
// ---------------------------------------------------------------------------

export type AssetCandidate = {
  imageUrl: string;
  provider: string;
  model: string;
  inputHash: string;
};

export type AssetCandidateMap = Record<string, AssetCandidate[]>;

export type ShotFrameMap = Record<string, { imageUrl: string; provider: string; model: string; inputHash: string }>;

export type PromptResultMap = Record<string, {
  imagePrompt: string;
  jimengVideoPrompt: string;
  negativePrompt: string;
  referenceVersionIds: string[];
  inputHash: string;
}>;

const neutralBg = "#0d0f10";
const borderColor = "rgba(255, 255, 255, 0.08)";
const accentColor = "#75dbc6";
const mutedColor = "#aeb8be";

const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: "20px 24px",
  color: "#e0e0e0",
  fontSize: 14,
  minHeight: "60vh",
};

const cardStyle: CSSProperties = {
  background: neutralBg,
  border: `1px solid ${borderColor}`,
  borderRadius: 12,
  padding: 16,
};

const fieldStyle: CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  background: "rgba(255, 255, 255, 0.04)",
  border: `1px solid ${borderColor}`,
  borderRadius: 8,
  color: "#e0e0e0",
  fontSize: 13,
  fontFamily: "inherit",
};

const textareaStyle: CSSProperties = {
  ...fieldStyle,
  minHeight: 64,
  resize: "vertical",
  lineHeight: 1.5,
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  borderRadius: 10,
  border: `1px solid rgba(117, 219, 198, 0.45)`,
  background: "rgba(117, 219, 198, 0.16)",
  color: accentColor,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 999,
  border: `1px solid rgba(255, 255, 255, 0.12)`,
  background: "rgba(255, 255, 255, 0.06)",
  color: "#e0e0e0",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  borderColor: "rgba(248, 113, 113, 0.45)",
  background: "rgba(248, 113, 113, 0.10)",
  color: "#f87171",
};

const disabledButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  opacity: 0.45,
  cursor: "not-allowed",
};

const badgeStyle: CSSProperties = {
  padding: "2px 8px",
  borderRadius: 999,
  background: "rgba(255, 255, 255, 0.08)",
  color: mutedColor,
  fontSize: 11,
  fontWeight: 700,
};

const mutedStyle: CSSProperties = { color: mutedColor, fontSize: 12 };

function CopyableText({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板被禁用，忽略
    }
  }
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ color: accentColor, fontSize: 11, fontWeight: 700 }}>{label}</span>
        <button type="button" style={secondaryButtonStyle} onClick={copy} aria-label={`复制${label}`}>
          <Copy size={12} /> {copied ? "已复制" : "复制"}
        </button>
      </div>
      {multiline ? (
        <pre style={{ margin: 0, padding: 8, background: "rgba(255,255,255,0.03)", borderRadius: 8, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "#cbd5da", lineHeight: 1.6 }}>{value || "—"}</pre>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: "#cbd5da", wordBreak: "break-word" }}>{value || "—"}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. ScriptInputPanel — 剧本输入
// ---------------------------------------------------------------------------

type ScriptInputPanelProps = {
  projectId: string;
  sourceUnitId: string;
  projectTitle: string;
  manuscript: string;
  sourceFiles: ProductionSourceFile[];
  analyzing: boolean;
  analyzeError: string;
  onUploadFile: (file: File) => void;
  onAnalyze: () => void;
  onClearAnalyzeError: () => void;
};

export function ScriptInputPanel({
  projectId,
  sourceUnitId,
  projectTitle,
  manuscript,
  sourceFiles,
  analyzing,
  analyzeError,
  onUploadFile,
  onAnalyze,
  onClearAnalyzeError,
}: ScriptInputPanelProps) {
  const fileInputId = "storyboard-script-upload";
  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onUploadFile(file);
    event.target.value = "";
  }

  return (
    <section style={panelStyle}>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", minWidth: 280 }}>
            <p style={{ color: accentColor, fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>CURRENT SCOPE</p>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#e0e0e0" }}>{projectTitle || "未命名项目"}</h2>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <span style={badgeStyle}>projectId: {projectId || "—"}</span>
              <span style={badgeStyle}>sourceUnitId: {sourceUnitId || "—"}</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <label htmlFor={fileInputId} style={secondaryButtonStyle}>
              <Upload size={14} /> 上传剧本 / 设定
              <input
                id={fileInputId}
                type="file"
                accept=".txt,.md,.doc,.docx,.pdf,.html"
                onChange={handleFile}
                style={{ display: "none" }}
              />
            </label>
            <button
              type="button"
              style={analyzing ? disabledButtonStyle : primaryButtonStyle}
              onClick={analyzing ? undefined : onAnalyze}
              disabled={analyzing}
            >
              {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              {analyzing ? "分析中..." : "分析剧本"}
            </button>
          </div>
        </div>
      </div>

      {analyzeError ? (
        <div style={{ ...cardStyle, borderColor: "rgba(248, 113, 113, 0.45)", background: "rgba(248, 113, 113, 0.08)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <AlertTriangle size={16} color="#f87171" style={{ marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, color: "#f87171", fontSize: 13, fontWeight: 700 }}>分析失败（已保留现有分镜，未清场）</p>
              <p style={{ margin: "4px 0 0", color: "#cbd5da", fontSize: 12, lineHeight: 1.6 }}>{analyzeError}</p>
            </div>
            <button type="button" style={secondaryButtonStyle} onClick={onClearAnalyzeError}>关闭</button>
          </div>
        </div>
      ) : null}

      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <FileText size={16} color={accentColor} />
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>剧本来源</h3>
        </div>
        {sourceFiles.length === 0 ? (
          <p style={{ ...mutedStyle, margin: 0 }}>尚未上传资料。可上传 .txt / .md / .doc / .docx / .pdf，或直接基于当前集 handoff 的剧本正文进行分析。</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {sourceFiles.map((file) => (
              <li key={file.id} style={{ padding: 10, background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{file.name}</span>
                  <span style={mutedStyle}>{Math.round(file.size / 1024)} KB · {file.mimeType || "未知"}</span>
                </div>
                {file.textPreview ? <p style={{ ...mutedStyle, margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{file.textPreview}</p> : null}
              </li>
            ))}
          </ul>
        )}
        {manuscript ? (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", color: accentColor, fontSize: 12, fontWeight: 700 }}>查看 handoff 剧本正文（{manuscript.length} 字）</summary>
            <pre style={{ margin: "8px 0 0", padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8, maxHeight: 320, overflow: "auto", whiteSpace: "pre-wrap", fontSize: 12, color: "#cbd5da", lineHeight: 1.6 }}>{manuscript}</pre>
          </details>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 2. StoryboardTablePanel — 分镜表
// ---------------------------------------------------------------------------

type StoryboardTablePanelProps = {
  scenes: StoryboardScene[];
  revision: number;
  analyzingSceneId: string | null;
  conflictRevision: number | null;
  onUpdateScene: (sceneId: string, patch: Partial<StoryboardScene>) => void;
  onUpdateShot: (sceneId: string, shotId: string, patch: Partial<StoryboardShot>) => void;
  onAddShot: (sceneId: string) => void;
  onDeleteShot: (sceneId: string, shotId: string) => void;
  onAddScene: () => void;
  onDeleteScene: (sceneId: string) => void;
  onSplitShot: (sceneId: string, shotId: string) => void;
  onMergeShot: (sceneId: string, shotId: string, intoShotId: string) => void;
  onMoveShot: (sceneId: string, shotId: string, direction: "up" | "down") => void;
  onToggleShotLock: (sceneId: string, shotId: string) => void;
  onToggleShotConfirm: (sceneId: string, shotId: string) => void;
  onReanalyzeScene: (sceneId: string) => void;
  onClearConflict: () => void;
};

export function StoryboardTablePanel(props: StoryboardTablePanelProps) {
  const {
    scenes,
    revision,
    analyzingSceneId,
    conflictRevision,
    onUpdateScene,
    onUpdateShot,
    onAddShot,
    onDeleteShot,
    onAddScene,
    onDeleteScene,
    onSplitShot,
    onMoveShot,
    onToggleShotLock,
    onToggleShotConfirm,
    onReanalyzeScene,
    onClearConflict,
  } = props;

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>分镜表</h2>
          <p style={{ ...mutedStyle, margin: "4px 0 0" }}>
            {scenes.length} 场 · 共 {scenes.reduce((n, s) => n + s.shots.length, 0)} 个分镜 · 当前 revision {revision}
          </p>
        </div>
        <button type="button" style={primaryButtonStyle} onClick={onAddScene}><Plus size={14} /> 新增场景</button>
      </div>

      {conflictRevision !== null ? (
        <div style={{ ...cardStyle, borderColor: "rgba(248, 113, 113, 0.45)", background: "rgba(248, 113, 113, 0.08)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <AlertTriangle size={16} color="#f87171" style={{ marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, color: "#f87171", fontSize: 13, fontWeight: 700 }}>REVISION_CONFLICT — 已阻止覆盖</p>
              <p style={{ margin: "4px 0 0", color: "#cbd5da", fontSize: 12, lineHeight: 1.6 }}>
                服务器当前 revision 为 {conflictRevision}，本地期望 {revision}。请刷新工作台或重新分析以同步服务端状态。
              </p>
            </div>
            <button type="button" style={secondaryButtonStyle} onClick={onClearConflict}>关闭</button>
          </div>
        </div>
      ) : null}

      {scenes.length === 0 ? (
        <div style={cardStyle}>
          <p style={{ ...mutedStyle, textAlign: "center", padding: 24 }}>尚无分镜数据。请到「剧本输入」tab 上传剧本并点击「分析剧本」。</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {scenes.map((scene) => (
            <SceneBlock
              key={scene.id ?? scene.clientId}
              scene={scene}
              analyzing={analyzingSceneId === (scene.id ?? scene.clientId)}
              onUpdateScene={(patch) => onUpdateScene(scene.id ?? scene.clientId ?? "", patch)}
              onUpdateShot={(shotId, patch) => onUpdateShot(scene.id ?? scene.clientId ?? "", shotId, patch)}
              onAddShot={() => onAddShot(scene.id ?? scene.clientId ?? "")}
              onDeleteShot={(shotId) => onDeleteShot(scene.id ?? scene.clientId ?? "", shotId)}
              onSplitShot={(shotId) => onSplitShot(scene.id ?? scene.clientId ?? "", shotId)}
              onMoveShot={(shotId, dir) => onMoveShot(scene.id ?? scene.clientId ?? "", shotId, dir)}
              onToggleShotLock={(shotId) => onToggleShotLock(scene.id ?? scene.clientId ?? "", shotId)}
              onToggleShotConfirm={(shotId) => onToggleShotConfirm(scene.id ?? scene.clientId ?? "", shotId)}
              onReanalyze={() => onReanalyzeScene(scene.id ?? scene.clientId ?? "")}
              onDeleteScene={() => onDeleteScene(scene.id ?? scene.clientId ?? "")}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type SceneBlockProps = {
  scene: StoryboardScene;
  analyzing: boolean;
  onUpdateScene: (patch: Partial<StoryboardScene>) => void;
  onUpdateShot: (shotId: string, patch: Partial<StoryboardShot>) => void;
  onAddShot: () => void;
  onDeleteShot: (shotId: string) => void;
  onSplitShot: (shotId: string) => void;
  onMoveShot: (shotId: string, direction: "up" | "down") => void;
  onToggleShotLock: (shotId: string) => void;
  onToggleShotConfirm: (shotId: string) => void;
  onReanalyze: () => void;
  onDeleteScene: () => void;
};

function SceneBlock(props: SceneBlockProps) {
  const { scene, analyzing, onUpdateScene, onUpdateShot, onAddShot, onDeleteShot, onSplitShot, onMoveShot, onToggleShotLock, onToggleShotConfirm, onReanalyze, onDeleteScene } = props;
  const sceneId = scene.id ?? scene.clientId ?? "";
  return (
    <div style={cardStyle}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 280px", display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={badgeStyle}>SCENE {scene.order}</span>
            {scene.locked ? <span style={{ ...badgeStyle, background: "rgba(245, 158, 11, 0.20)", color: "#fbbf24" }}>已锁定</span> : null}
            {scene.confirmed ? <span style={{ ...badgeStyle, background: "rgba(117, 219, 198, 0.20)", color: accentColor }}>已确认</span> : null}
          </div>
          <label style={{ fontSize: 12, color: mutedColor }}>场次标题
            <input style={fieldStyle} value={scene.heading} onChange={(e) => onUpdateScene({ heading: e.target.value })} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ fontSize: 12, color: mutedColor }}>地点
              <input style={fieldStyle} value={scene.location} onChange={(e) => onUpdateScene({ location: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: mutedColor }}>时间
              <input style={fieldStyle} value={scene.timeOfDay} onChange={(e) => onUpdateScene({ timeOfDay: e.target.value })} />
            </label>
          </div>
          <label style={{ fontSize: 12, color: mutedColor }}>本场概要
            <textarea style={textareaStyle} value={scene.summary} onChange={(e) => onUpdateScene({ summary: e.target.value })} />
          </label>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <button type="button" style={analyzing ? disabledButtonStyle : secondaryButtonStyle} onClick={analyzing ? undefined : onReanalyze} disabled={analyzing}>
            {analyzing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {analyzing ? "重分析中" : "单场重分析"}
          </button>
          <button type="button" style={secondaryButtonStyle} onClick={onAddShot}><Plus size={12} /> 新增分镜</button>
          <button type="button" style={dangerButtonStyle} onClick={onDeleteScene}><Trash2 size={12} /> 删除场景</button>
        </div>
      </header>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: "left", color: mutedColor, fontSize: 11, fontWeight: 700 }}>
              <th style={cellThStyle}>#</th>
              <th style={cellThStyle}>Source Text</th>
              <th style={cellThStyle}>Story Beat</th>
              <th style={cellThStyle}>Visual Description</th>
              <th style={cellThStyle}>Shot Size</th>
              <th style={cellThStyle}>Camera</th>
              <th style={cellThStyle}>Angle</th>
              <th style={cellThStyle}>Duration (s)</th>
              <th style={cellThStyle}>Dialogue</th>
              <th style={cellThStyle}>Emotion</th>
              <th style={cellThStyle}>Locked</th>
              <th style={cellThStyle}>Confirmed</th>
              <th style={cellThStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {scene.shots.map((shot, idx) => {
              const shotId = shot.id ?? shot.clientId ?? "";
              return (
                <tr key={shotId} style={{ borderTop: `1px solid ${borderColor}` }}>
                  <td style={cellTdStyle}>{shot.order ?? idx + 1}</td>
                  <td style={cellTdStyle}><textarea style={{ ...textareaStyle, minHeight: 44 }} value={shot.sourceText} disabled={shot.locked} onChange={(e) => onUpdateShot(shotId, { sourceText: e.target.value })} /></td>
                  <td style={cellTdStyle}><input style={fieldStyle} value={shot.storyBeat} disabled={shot.locked} onChange={(e) => onUpdateShot(shotId, { storyBeat: e.target.value })} /></td>
                  <td style={cellTdStyle}><textarea style={{ ...textareaStyle, minHeight: 44 }} value={shot.visualDescription} disabled={shot.locked} onChange={(e) => onUpdateShot(shotId, { visualDescription: e.target.value })} /></td>
                  <td style={cellTdStyle}><input style={fieldStyle} value={shot.shotSize} disabled={shot.locked} onChange={(e) => onUpdateShot(shotId, { shotSize: e.target.value })} /></td>
                  <td style={cellTdStyle}><input style={fieldStyle} value={shot.cameraMovement} disabled={shot.locked} onChange={(e) => onUpdateShot(shotId, { cameraMovement: e.target.value })} /></td>
                  <td style={cellTdStyle}><input style={fieldStyle} value={shot.angle} disabled={shot.locked} onChange={(e) => onUpdateShot(shotId, { angle: e.target.value })} /></td>
                  <td style={cellTdStyle}><input style={{ ...fieldStyle, width: 60 }} type="number" min={1} max={20} value={shot.durationSeconds} disabled={shot.locked} onChange={(e) => onUpdateShot(shotId, { durationSeconds: Number(e.target.value) || 0 })} /></td>
                  <td style={cellTdStyle}><textarea style={{ ...textareaStyle, minHeight: 44 }} value={shot.dialogue} disabled={shot.locked} onChange={(e) => onUpdateShot(shotId, { dialogue: e.target.value })} /></td>
                  <td style={cellTdStyle}><input style={fieldStyle} value={shot.emotion} disabled={shot.locked} onChange={(e) => onUpdateShot(shotId, { emotion: e.target.value })} /></td>
                  <td style={cellTdStyle}>
                    <button type="button" style={shot.locked ? { ...secondaryButtonStyle, borderColor: "rgba(245, 158, 11, 0.45)", color: "#fbbf24" } : secondaryButtonStyle} onClick={() => onToggleShotLock(shotId)} aria-label={shot.locked ? "解锁" : "锁定"}>
                      {shot.locked ? <Lock size={12} /> : <LockOpen size={12} />}
                    </button>
                  </td>
                  <td style={cellTdStyle}>
                    <button type="button" style={shot.confirmed ? { ...secondaryButtonStyle, borderColor: "rgba(117, 219, 198, 0.45)", color: accentColor } : secondaryButtonStyle} onClick={() => onToggleShotConfirm(shotId)} aria-label="确认">
                      {shot.confirmed ? <CheckCircle2 size={12} /> : "待确认"}
                    </button>
                  </td>
                  <td style={cellTdStyle}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <button type="button" style={{ ...secondaryButtonStyle, padding: "4px 8px" }} onClick={() => onMoveShot(shotId, "up")} aria-label="上移">↑</button>
                      <button type="button" style={{ ...secondaryButtonStyle, padding: "4px 8px" }} onClick={() => onMoveShot(shotId, "down")} aria-label="下移">↓</button>
                      <button type="button" style={{ ...secondaryButtonStyle, padding: "4px 8px" }} onClick={() => onSplitShot(shotId)} aria-label="拆分">⤖</button>
                      <button type="button" style={{ ...dangerButtonStyle, padding: "4px 8px" }} onClick={() => onDeleteShot(shotId)} aria-label="删除" disabled={shot.locked}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const cellThStyle: CSSProperties = { padding: "8px 6px", borderBottom: `1px solid ${borderColor}`, fontWeight: 700 };
const cellTdStyle: CSSProperties = { padding: "4px 6px", verticalAlign: "top", maxWidth: 220 };

// ---------------------------------------------------------------------------
// 3. ArtAssetsPanel — 美术物料
// ---------------------------------------------------------------------------

type ArtAssetsPanelProps = {
  assets: {
    characters: StoryboardAssetUsage[];
    locations: StoryboardAssetUsage[];
    props: StoryboardAssetUsage[];
  };
  candidates: AssetCandidateMap;
  generatingAssetId: string | null;
  onGenerateCandidates: (assetId: string) => void;
  onSelectMainVersion: (assetId: string, candidateImageUrl: string) => void;
  onUploadReplacement: (assetId: string, file: File) => void;
  onAssetClick: (assetId: string) => void;
};

export function ArtAssetsPanel({
  assets,
  candidates,
  generatingAssetId,
  onGenerateCandidates,
  onSelectMainVersion,
  onUploadReplacement,
  onAssetClick,
}: ArtAssetsPanelProps) {
  const [tab, setTab] = useState<"character" | "location" | "prop">("character");
  const list = assets[tab === "character" ? "characters" : tab === "location" ? "locations" : "props"];

  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", gap: 8, borderBottom: `1px solid ${borderColor}`, paddingBottom: 8 }}>
        {(["character", "location", "prop"] as const).map((k) => (
          <button
            key={k}
            type="button"
            style={tab === k ? { ...primaryButtonStyle, padding: "6px 14px" } : { ...secondaryButtonStyle, padding: "6px 14px" }}
            onClick={() => setTab(k)}
          >
            {k === "character" ? "人物" : k === "location" ? "场景" : "道具"} ({assets[k === "character" ? "characters" : k === "location" ? "locations" : "props"].length})
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div style={cardStyle}><p style={{ ...mutedStyle, textAlign: "center", padding: 24 }}>暂无{tab === "character" ? "人物" : tab === "location" ? "场景" : "道具"}物料。请先到「剧本输入」tab 分析剧本，系统会自动提取资产。</p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {list.map((asset) => (
            <AssetCard
              key={asset.assetId}
              asset={asset}
              candidates={candidates[asset.assetId] ?? []}
              generating={generatingAssetId === asset.assetId}
              onGenerate={() => onGenerateCandidates(asset.assetId)}
              onSelectMain={(url) => onSelectMainVersion(asset.assetId, url)}
              onUpload={(file) => onUploadReplacement(asset.assetId, file)}
              onClick={() => onAssetClick(asset.assetId)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type AssetCardProps = {
  asset: StoryboardAssetUsage;
  candidates: AssetCandidate[];
  generating: boolean;
  onGenerate: () => void;
  onSelectMain: (imageUrl: string) => void;
  onUpload: (file: File) => void;
  onClick: () => void;
};

function AssetCard({ asset, candidates, generating, onGenerate, onSelectMain, onUpload, onClick }: AssetCardProps) {
  const fileInputId = `asset-upload-${asset.assetId}`;
  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onUpload(file);
    event.target.value = "";
  }
  const selectedVersionUrl = asset.selectedVersionId;
  return (
    <div style={cardStyle}>
      <header style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{asset.name}</h3>
          <span style={badgeStyle}>{asset.kind}</span>
        </div>
        <p style={{ ...mutedStyle, margin: "4px 0 0", lineHeight: 1.5 }}>{asset.description}</p>
        {asset.visualKeywords.length > 0 ? (
          <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
            {asset.visualKeywords.map((kw) => <span key={kw} style={badgeStyle}>{kw}</span>)}
          </div>
        ) : null}
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, marginBottom: 10 }}>
        {candidates.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", padding: 24, textAlign: "center", background: "rgba(255,255,255,0.03)", borderRadius: 8, color: mutedColor, fontSize: 12 }}>
            尚无候选图。点击下方「生成 4 候选」开始。
          </div>
        ) : (
          candidates.map((c, i) => {
            const isSelected = selectedVersionUrl === c.imageUrl;
            return (
              <button
                key={`${c.imageUrl}-${i}`}
                type="button"
                onClick={() => onSelectMain(c.imageUrl)}
                style={{
                  position: "relative",
                  padding: 0,
                  border: isSelected ? `2px solid ${accentColor}` : `1px solid ${borderColor}`,
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "#000",
                  cursor: "pointer",
                  aspectRatio: asset.kind === "prop" ? "1 / 1" : "9 / 16",
                }}
                title={isSelected ? "已选为主参考" : "点击选为主参考"}
              >
                <img src={c.imageUrl} alt={`candidate ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <span style={{ position: "absolute", left: 4, bottom: 4, padding: "2px 6px", background: "rgba(0,0,0,0.6)", color: isSelected ? accentColor : "#cbd5da", fontSize: 10, fontWeight: 700, borderRadius: 4 }}>
                  {isSelected ? "✓ 主参考" : `候选 ${i + 1}`}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" style={generating ? disabledButtonStyle : primaryButtonStyle} onClick={generating ? undefined : onGenerate} disabled={generating}>
          {generating ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
          {generating ? "生成中" : candidates.length === 0 ? "生成 4 候选" : "重新生成"}
        </button>
        <label htmlFor={fileInputId} style={secondaryButtonStyle}>
          <Upload size={12} /> 上传替换
          <input id={fileInputId} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
        </label>
        <button type="button" style={secondaryButtonStyle} onClick={onClick}>查看关联 Shot</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. ShotFramesPanel — 分镜图与即梦提示词
// ---------------------------------------------------------------------------

type ShotFramesPanelProps = {
  scenes: StoryboardScene[];
  assets: {
    characters: StoryboardAssetUsage[];
    locations: StoryboardAssetUsage[];
    props: StoryboardAssetUsage[];
  };
  frames: ShotFrameMap;
  prompts: PromptResultMap;
  generatingShotId: string | null;
  generatingPromptsForShots: string[] | null;
  onGenerateFrame: (shotId: string) => void;
  onGeneratePrompts: (shotIds: string[]) => void;
  onToggleConfirm: (shotId: string) => void;
  onUpdateShot: (sceneId: string, shotId: string, patch: Partial<StoryboardShot>) => void;
  // 视频区（任务 1）
  videoJobs: VideoJobMap;
  submittingVideoShotId: string | null;
  onGenerateVideo: (shotId: string) => void;
  onPollVideo: (shotId: string) => void;
  // 批量（任务 2）
  batchProgress: BatchVideoProgress | null;
  onBatchAll: () => void;
  onBatchScene: (sceneId: string) => void;
  onBatchUnfinished: () => void;
  onBatchRetryFailed: () => void;
  batchRunning: boolean;
};

export function ShotFramesPanel(props: ShotFramesPanelProps) {
  const {
    scenes, frames, prompts, generatingShotId, generatingPromptsForShots,
    onGenerateFrame, onGeneratePrompts, onToggleConfirm, onUpdateShot,
    videoJobs, submittingVideoShotId, onGenerateVideo, onPollVideo,
    batchProgress, onBatchAll, onBatchScene, onBatchUnfinished, onBatchRetryFailed, batchRunning,
  } = props;
  const allShots = useMemo(() => scenes.flatMap((s) => s.shots.map((shot) => ({ scene: s, shot }))), [scenes]);

  return (
    <section style={panelStyle}>
      {/* 任务 2：批量视频按钮区（吸顶） */}
      <div style={{ position: "sticky", top: 64, zIndex: 10, marginBottom: 12, padding: "10px 12px", border: `1px solid ${borderColor}`, borderRadius: 8, background: "rgba(24, 24, 27, 0.92)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: batchProgress ? 8 : 0, flexWrap: "wrap" }}>
          <button type="button" style={secondaryButtonStyle} onClick={onBatchAll} disabled={batchRunning}>
            生成全部视频
          </button>
          <button type="button" style={secondaryButtonStyle} onClick={() => {
            const firstSceneId = scenes[0]?.id ?? scenes[0]?.clientId ?? "";
            if (firstSceneId) onBatchScene(firstSceneId);
          }} disabled={batchRunning || scenes.length === 0}>
            生成当前场景视频
          </button>
          <button type="button" style={secondaryButtonStyle} onClick={onBatchUnfinished} disabled={batchRunning}>
            生成未完成项
          </button>
          <button type="button" style={secondaryButtonStyle} onClick={onBatchRetryFailed} disabled={batchRunning}>
            重试失败项
          </button>
        </div>
        {batchProgress ? <BatchVideoProgressBar progress={batchProgress} /> : null}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>分镜图与即梦提示词</h2>
          <p style={{ ...mutedStyle, margin: "4px 0 0" }}>共 {allShots.length} 个分镜 · 已生成 {Object.keys(frames).length} 张图 · 已生成 {Object.keys(prompts).length} 组提示词</p>
        </div>
        <button
          type="button"
          style={generatingPromptsForShots ? disabledButtonStyle : primaryButtonStyle}
          onClick={generatingPromptsForShots ? undefined : () => onGeneratePrompts(allShots.map((s) => s.shot.id ?? s.shot.clientId ?? ""))}
          disabled={Boolean(generatingPromptsForShots)}
        >
          {generatingPromptsForShots ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          {generatingPromptsForShots ? `生成中 (${generatingPromptsForShots.length})` : "为所有分镜生成提示词"}
        </button>
      </div>

      {allShots.length === 0 ? (
        <div style={cardStyle}><p style={{ ...mutedStyle, textAlign: "center", padding: 24 }}>尚无分镜。请先在「剧本输入」tab 分析剧本。</p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
          {allShots.map(({ scene, shot }) => {
            const shotId = shot.id ?? shot.clientId ?? "";
            const frame = frames[shotId];
            const prompt = prompts[shotId];
            const isGeneratingFrame = generatingShotId === shotId;
            return (
              <ShotFrameCard
                key={shotId}
                scene={scene}
                shot={shot}
                frame={frame}
                prompt={prompt}
                generatingFrame={isGeneratingFrame}
                onGenerateFrame={() => onGenerateFrame(shotId)}
                onToggleConfirm={() => onToggleConfirm(shotId)}
                onUpdateShot={(patch) => onUpdateShot(scene.id ?? scene.clientId ?? "", shotId, patch)}
                videoState={videoJobs[shotId]}
                submittingVideo={submittingVideoShotId === shotId}
                onGenerateVideo={() => onGenerateVideo(shotId)}
                onPollVideo={() => onPollVideo(shotId)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

type ShotFrameCardProps = {
  scene: StoryboardScene;
  shot: StoryboardShot;
  frame?: { imageUrl: string; provider: string; model: string; inputHash: string };
  prompt?: PromptResultMap[string];
  generatingFrame: boolean;
  onGenerateFrame: () => void;
  onToggleConfirm: () => void;
  onUpdateShot: (patch: Partial<StoryboardShot>) => void;
  // 视频区
  videoState?: VideoJobState;
  submittingVideo: boolean;
  onGenerateVideo: () => void;
  onPollVideo: () => void;
};

function ShotFrameCard({ scene, shot, frame, prompt, generatingFrame, onGenerateFrame, onToggleConfirm, onUpdateShot, videoState, submittingVideo, onGenerateVideo, onPollVideo }: ShotFrameCardProps) {
  const shotId = shot.id ?? shot.clientId ?? "";
  return (
    <div style={cardStyle}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <div>
          <span style={badgeStyle}>SCENE {scene.order} · SHOT {shot.order}</span>
          <h3 style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 700, color: "#e0e0e0" }}>{shot.shotSize} · {shot.cameraMovement} · {shot.durationSeconds}s</h3>
        </div>
        <button
          type="button"
          style={shot.confirmed ? { ...secondaryButtonStyle, borderColor: "rgba(117, 219, 198, 0.45)", color: accentColor } : secondaryButtonStyle}
          onClick={onToggleConfirm}
        >
          {shot.confirmed ? <CheckCircle2 size={12} /> : "待确认"}
        </button>
      </header>

      <div style={{ position: "relative", width: "100%", aspectRatio: "9 / 16", background: "#000", borderRadius: 8, overflow: "hidden", border: `1px solid ${borderColor}`, marginBottom: 10 }}>
        {frame?.imageUrl ? (
          <img src={frame.imageUrl} alt={`shot ${shot.order}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: mutedColor, fontSize: 12 }}>
            {generatingFrame ? <Loader2 size={20} className="animate-spin" /> : <Film size={20} />}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <button type="button" style={generatingFrame ? disabledButtonStyle : primaryButtonStyle} onClick={generatingFrame ? undefined : onGenerateFrame} disabled={generatingFrame}>
          {generatingFrame ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
          {generatingFrame ? "生成中" : frame ? "重新生成" : "生成分镜图"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {prompt ? (
          <>
            <CopyableText label="IMAGE PROMPT (EN)" value={prompt.imagePrompt} multiline />
            <CopyableText label="即梦 PROMPT (ZH)" value={prompt.jimengVideoPrompt} multiline />
            <CopyableText label="NEGATIVE PROMPT" value={prompt.negativePrompt} />
            <div>
              <span style={{ color: accentColor, fontSize: 11, fontWeight: 700 }}>REFERENCE VERSION IDS</span>
              <p style={{ ...mutedStyle, margin: "2px 0 0" }}>{prompt.referenceVersionIds.length > 0 ? prompt.referenceVersionIds.join(", ") : "—"}</p>
            </div>
            <div>
              <span style={{ color: accentColor, fontSize: 11, fontWeight: 700 }}>INPUT HASH</span>
              <p style={{ ...mutedStyle, margin: "2px 0 0", fontFamily: "monospace", fontSize: 11 }}>{prompt.inputHash}</p>
            </div>
          </>
        ) : (
          <p style={{ ...mutedStyle, textAlign: "center", padding: 8 }}>尚未生成提示词。点击上方「为所有分镜生成提示词」。</p>
        )}
      </div>

      {/* 任务 1：视频区 */}
      <ShotVideoPanel
        scene={scene}
        shot={shot}
        videoState={videoState}
        hasFirstframe={Boolean(frame?.imageUrl)}
        submitting={submittingVideo}
        onGenerate={onGenerateVideo}
        onPoll={onPollVideo}
      />
    </div>
  );
}
