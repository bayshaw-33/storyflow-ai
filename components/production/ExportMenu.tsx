"use client";

import { useState } from "react";
import { ChevronDown, Download, FileJson, FileText, Film, Table } from "lucide-react";
import type { ExportFormat } from "@/lib/production/state";
import { productionStateToExport } from "@/lib/production/state";
import type { ProductionProjectState } from "@/lib/production/types";
import { downloadBlob } from "@/lib/client/download";

type Props = {
  state: ProductionProjectState;
};

type FormatOption = {
  id: ExportFormat;
  label: string;
  description: string;
  icon: typeof FileText;
};

const formatOptions: FormatOption[] = [
  { id: "markdown", label: "Markdown", description: "完整剧本文档（.md）", icon: FileText },
  { id: "json", label: "JSON 档案", description: "完整项目档案（.json）", icon: FileJson },
  { id: "srt", label: "SRT 字幕", description: "对白字幕文件（.srt）", icon: Film },
  { id: "csv", label: "CSV 分镜表", description: "分镜表格（.csv）", icon: Table },
];

export function ExportMenu({ state }: Props) {
  const [open, setOpen] = useState(false);

  function handleExport(format: ExportFormat) {
    const { content, mimeType, extension } = productionStateToExport(state, format);
    const blob = new Blob([content], { type: mimeType });
    downloadBlob(blob, `${state.title || "production-workbench"}.${extension}`);
    setOpen(false);
  }

  return (
    <div style={containerStyle}>
      <button
        type="button"
        style={triggerStyle}
        onClick={() => setOpen(!open)}
        aria-label="导出"
      >
        <Download size={16} /> 导出
        <ChevronDown size={12} style={{ opacity: 0.6 }} />
      </button>

      {open ? (
        <>
          <div style={overlayStyle} onClick={() => setOpen(false)} />
          <div style={menuStyle}>
            {formatOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  style={itemStyle}
                  onClick={() => handleExport(option.id)}
                >
                  <span style={iconWrapStyle}>
                    <Icon size={16} color="#75dbc6" />
                  </span>
                  <span style={textWrapStyle}>
                    <span style={labelStyle}>{option.label}</span>
                    <span style={descStyle}>{option.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ---- inline styles (dark theme) ---- */
const containerStyle: React.CSSProperties = {
  position: "relative",
  display: "inline-block",
};

const triggerStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 16px",
  borderRadius: "8px",
  border: "1px solid #75dbc6",
  background: "rgba(117,219,198,0.12)",
  color: "#75dbc6",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 998,
};

const menuStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: "6px",
  minWidth: "240px",
  background: "#0d0f10",
  border: "1px solid #2a2d30",
  borderRadius: "10px",
  padding: "4px",
  zIndex: 999,
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  width: "100%",
  padding: "10px 12px",
  border: "none",
  background: "transparent",
  borderRadius: "6px",
  cursor: "pointer",
  textAlign: "left",
  color: "#e0e0e0",
};

const iconWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "24px",
};

const textWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const labelStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
};

const descStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#888",
};
