"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Eye, GitCompare, RotateCcw, X } from "lucide-react";
import type { TextDiffOperation, JsonDiffOperation } from "@/lib/diff";

export type VersionRecord = {
  id: string;
  versionNo: number | null;
  source: string;
  entityType: string;
  entityId: string;
  stepKey: string | null;
  snapshotText: string | null;
  snapshotJson: unknown;
  diffJson: unknown;
  createdAt: string;
};

export type VersionDiffResult = {
  text: { type: string; oldLineCount: number; newLineCount: number; changeCount: number; changes: TextDiffOperation[] };
  json: { type: string; changeCount: number; changes: JsonDiffOperation[] };
};

type Props = {
  versions: VersionRecord[];
  loading: boolean;
  error: string | null;
  onSelect: (versionId: string) => void;
  onRestore: (versionId: string) => Promise<void> | void;
  onCompare: (versionA: string, versionB: string) => Promise<void> | void;
  diff: VersionDiffResult | null;
  selectedVersionId: string | null;
  onClose: () => void;
};

const sourceLabels: Record<string, string> = {
  ai: "AI 生成",
  manual: "手动保存",
  import: "导入",
  restore: "恢复",
  demo: "示例",
  optimize: "优化",
};

const entityTypeLabels: Record<string, string> = {
  production_workbench: "制作工作台",
  project_step: "项目步骤",
  story_bible: "故事圣经",
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function VersionHistory({
  versions,
  loading,
  error,
  onSelect,
  onRestore,
  onCompare,
  diff,
  selectedVersionId,
  onClose,
}: Props) {
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  const handleRestore = useCallback(async (versionId: string) => {
    if (!confirm("确定恢复到此版本？当前工作台状态将被覆盖。")) return;
    setRestoring(versionId);
    try {
      await onRestore(versionId);
    } finally {
      setRestoring(null);
    }
  }, [onRestore]);

  const handleCompare = useCallback(() => {
    if (compareA && compareB) {
      onCompare(compareA, compareB);
    }
  }, [compareA, compareB, onCompare]);

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Clock size={18} color="#75dbc6" />
            <span style={{ fontSize: "16px", fontWeight: 600, color: "#e0e0e0" }}>版本历史</span>
            <span style={{ fontSize: "12px", color: "#888" }}>{versions.length} 个版本</span>
          </div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="关闭">
            <X size={16} color="#aaa" />
          </button>
        </div>

        {loading && <div style={msgStyle}>加载中...</div>}
        {error && <div style={{ ...msgStyle, color: "#ff6b6b" }}>{error}</div>}
        {!loading && versions.length === 0 && <div style={msgStyle}>暂无版本记录。保存工作台时会自动创建版本快照。</div>}

        <div style={listStyle}>
          {versions.map((v) => {
            const isSelected = v.id === selectedVersionId;
            const isCompareA = v.id === compareA;
            const isCompareB = v.id === compareB;
            return (
              <div
                key={v.id}
                style={{
                  ...itemStyle,
                  borderColor: isSelected ? "#75dbc6" : "#2a2d30",
                  background: isSelected ? "rgba(117,219,198,0.05)" : "transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={versionNoStyle}>v{v.versionNo ?? "?"}</span>
                  <span style={tagStyle}>{sourceLabels[v.source] || v.source}</span>
                  <span style={tagStyle}>{entityTypeLabels[v.entityType] || v.entityType}</span>
                  <span style={{ fontSize: "12px", color: "#888" }}>{formatTime(v.createdAt)}</span>
                </div>
                <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                  <button onClick={() => onSelect(v.id)} style={miniBtnStyle} title="查看快照">
                    <Eye size={12} /> 查看
                  </button>
                  <button
                    onClick={() => setCompareA(isCompareA ? null : v.id)}
                    style={{ ...miniBtnStyle, borderColor: isCompareA ? "#75dbc6" : "#333" }}
                  >
                    对比 A
                  </button>
                  <button
                    onClick={() => setCompareB(isCompareB ? null : v.id)}
                    style={{ ...miniBtnStyle, borderColor: isCompareB ? "#75dbc6" : "#333" }}
                  >
                    对比 B
                  </button>
                  <button
                    onClick={() => handleRestore(v.id)}
                    disabled={restoring === v.id}
                    style={{ ...miniBtnStyle, color: "#ff6b6b", borderColor: "#5a2222" }}
                  >
                    <RotateCcw size={12} /> {restoring === v.id ? "恢复中..." : "恢复"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {compareA && compareB && (
          <div style={{ padding: "8px 16px", borderTop: "1px solid #2a2d30" }}>
            <button onClick={handleCompare} style={compareBtnStyle}>
              <GitCompare size={14} /> 对比 v{versions.find((v) => v.id === compareA)?.versionNo} ↔ v{versions.find((v) => v.id === compareB)?.versionNo}
            </button>
          </div>
        )}

        {diff && (
          <div style={diffPanelStyle}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#e0e0e0", marginBottom: "8px" }}>
              差异对比（文本变更 {diff.text?.changeCount ?? 0} 处，JSON 变更 {diff.json?.changeCount ?? 0} 处）
            </div>
            <div style={diffListStyle}>
              {diff.text?.changes?.filter((c) => c.type !== "equal").slice(0, 30).map((c, i) => (
                <div key={`t${i}`} style={diffItemStyle(c.type)}>
                  <span style={{ opacity: 0.6, minWidth: "60px" }}>{c.type}</span>
                  {c.oldText && <span style={{ textDecoration: "line-through", color: "#ff6b6b" }}>{c.oldText.slice(0, 120)}</span>}
                  {c.newText && <span style={{ color: "#75dbc6" }}>{c.newText.slice(0, 120)}</span>}
                </div>
              ))}
              {diff.json?.changes?.slice(0, 30).map((c, i) => (
                <div key={`j${i}`} style={diffItemStyle(c.type === "add" ? "insert" : c.type === "remove" ? "delete" : "replace")}>
                  <span style={{ opacity: 0.6, minWidth: "60px" }}>{c.type}</span>
                  <span style={{ color: "#88ccff" }}>{c.path}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- inline styles (dark theme, matches ShotCardParts) ---- */
const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const panelStyle: React.CSSProperties = {
  width: "min(640px, 92vw)",
  maxHeight: "85vh",
  display: "flex",
  flexDirection: "column",
  background: "#0d0f10",
  border: "1px solid #2a2d30",
  borderRadius: "12px",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 16px",
  borderBottom: "1px solid #2a2d30",
};

const closeBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: "4px",
  borderRadius: "6px",
};

const msgStyle: React.CSSProperties = {
  padding: "24px 16px",
  textAlign: "center",
  color: "#888",
  fontSize: "13px",
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px",
};

const itemStyle: React.CSSProperties = {
  border: "1px solid #2a2d30",
  borderRadius: "8px",
  padding: "10px 12px",
  marginBottom: "6px",
};

const versionNoStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#75dbc6",
  minWidth: "32px",
};

const tagStyle: React.CSSProperties = {
  fontSize: "11px",
  padding: "2px 6px",
  borderRadius: "4px",
  background: "#1a1d1f",
  color: "#aaa",
};

const miniBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  fontSize: "11px",
  padding: "3px 8px",
  border: "1px solid #333",
  borderRadius: "5px",
  background: "#141618",
  color: "#ccc",
  cursor: "pointer",
};

const compareBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "13px",
  padding: "6px 14px",
  border: "1px solid #75dbc6",
  borderRadius: "6px",
  background: "rgba(117,219,198,0.1)",
  color: "#75dbc6",
  cursor: "pointer",
};

const diffPanelStyle: React.CSSProperties = {
  borderTop: "1px solid #2a2d30",
  padding: "12px 16px",
  maxHeight: "240px",
  overflowY: "auto",
  background: "#08090a",
};

const diffListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "3px",
};

function diffItemStyle(type: string): React.CSSProperties {
  return {
    fontSize: "11px",
    fontFamily: "monospace",
    padding: "3px 6px",
    borderRadius: "3px",
    background: type === "insert" ? "rgba(117,219,198,0.08)" : type === "delete" ? "rgba(255,107,107,0.08)" : "rgba(255,193,7,0.06)",
    display: "flex",
    gap: "8px",
    alignItems: "baseline",
  };
}
