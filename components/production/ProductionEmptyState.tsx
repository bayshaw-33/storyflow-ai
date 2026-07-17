"use client";

/**
 * ProductionEmptyState — 制作工作台需求墙（任务 1.3）。
 *
 * 直接访问 /production 无参数时，落地页改为需求墙（撤掉原"三选一"空状态墙）。
 * 复用 Dashboard 的 3 张需求卡设计，子项直达对应工作台。
 *
 * 若 URL 带 mode（如 mode=planning 从 Dashboard 分镜入口来），高亮对应入口。
 */

import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  WORKFLOW_CATEGORIES,
  WORKFLOW_ENTRY_POINTS,
  type WorkflowCategory,
} from "@/components/workflow/workflow-data";

export type EntryMode = "planning" | "editor" | "art" | "dub" | "edit";

type Props = {
  /** URL 携带的 mode，用于高亮对应入口（planning→分镜 / editor→视频 / art→美术） */
  entryMode?: string;
};

/** mode → entryId 映射，用于高亮 */
const MODE_TO_ENTRY: Record<string, string> = {
  planning: "storyboard",
  editor: "video",
  art: "art",
  dub: "dub",
  edit: "edit",
};

export function ProductionEmptyState({ entryMode }: Props) {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [expanded, setExpanded] = useState<WorkflowCategory | null>("produce");
  const highlightEntryId = entryMode ? MODE_TO_ENTRY[entryMode] : undefined;

  function toggleCategory(id: WorkflowCategory) {
    setExpanded((current) => (current === id ? null : id));
  }

  return (
    <main style={shellStyle}>
      <div style={containerStyle}>
        <header style={headerStyle}>
          <span style={eyebrowStyle}>{isZh ? "制作工作台" : "Production Workbench"}</span>
          <h1 style={titleStyle}>{isZh ? "选择一个入口开始" : "Choose an entry to begin"}</h1>
          <p style={subtitleStyle}>
            {isZh
              ? "未选择项目。选择以下入口进入对应工作台；进入后可立即开始创作，保存时再归档。"
              : "No project selected. Pick an entry below — start creating immediately, archive on save."}
          </p>
        </header>

        <div className="workflow-requirement-wall" style={wallStyle}>
          {WORKFLOW_CATEGORIES.map((cat) => {
            const isOpen = expanded === cat.id;
            const entries = WORKFLOW_ENTRY_POINTS.filter((e) => e.category === cat.id);
            return (
              <article
                key={cat.id}
                className={`workflow-requirement-card ${isOpen ? "is-open" : ""}`}
              >
                <button
                  type="button"
                  className="workflow-requirement-head"
                  onClick={() => toggleCategory(cat.id)}
                  aria-expanded={isOpen}
                >
                  <div className="workflow-requirement-titles">
                    <h3>{isZh ? cat.titleZh : cat.title}</h3>
                    <p>{isZh ? cat.subtitleZh : cat.subtitle}</p>
                  </div>
                  <ChevronDown
                    size={20}
                    className="workflow-requirement-chevron"
                    style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }}
                  />
                </button>

                {isOpen ? (
                  <div className="workflow-requirement-children">
                    {entries.map((entry) => {
                      const Icon = entry.icon;
                      const isHighlight = highlightEntryId === entry.id;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          className={`workflow-requirement-child ${entry.placeholder ? "is-placeholder" : ""}`}
                          style={isHighlight ? highlightStyle : undefined}
                          onClick={() => router.push(entry.href)}
                          disabled={entry.placeholder}
                        >
                          <span className="workflow-requirement-child-icon">
                            <Icon size={18} />
                          </span>
                          <span className="workflow-requirement-child-text">
                            <span className="workflow-requirement-child-title">
                              {isZh ? entry.titleZh : entry.title}
                              {entry.placeholder ? (
                                <em className="workflow-requirement-placeholder-tag">
                                  {isZh ? "即将上线" : "Soon"}
                                </em>
                              ) : null}
                              {isHighlight ? (
                                <em className="workflow-requirement-placeholder-tag" style={tagStyle}>
                                  {isZh ? "当前入口" : "Current"}
                                </em>
                              ) : null}
                            </span>
                            <span className="workflow-requirement-child-desc">
                              {isZh ? entry.descriptionZh : entry.description}
                            </span>
                          </span>
                          {!entry.placeholder ? (
                            <ChevronRight size={16} className="workflow-requirement-child-arrow" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}

const shellStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "var(--bg-void)",
  color: "var(--ink-primary)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px 24px",
};

const containerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 920,
  display: "flex",
  flexDirection: "column",
  gap: 32,
};

const headerStyle: CSSProperties = {
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  alignItems: "center",
};

const eyebrowStyle: CSSProperties = {
  color: "var(--ink-muted)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 800,
  letterSpacing: "-0.01em",
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  color: "var(--ink-secondary)",
  fontSize: 14,
  lineHeight: 1.6,
  maxWidth: 560,
};

const wallStyle: CSSProperties = {
  marginTop: 0,
};

const highlightStyle: CSSProperties = {
  borderColor: "var(--accent-blue)",
  background: "var(--text-hover-bg)",
};

const tagStyle: CSSProperties = {
  background: "rgba(0, 107, 255, 0.15)",
  borderColor: "rgba(0, 107, 255, 0.4)",
  color: "var(--accent-blue-bright)",
};
