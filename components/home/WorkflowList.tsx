"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  WORKFLOW_CATEGORIES,
  WORKFLOW_ENTRY_POINTS,
  type WorkflowCategory,
} from "@/components/workflow/workflow-data";

/**
 * WorkflowList — Dashboard WORKFLOWS 区（任务 1：三层导航与需求墙）。
 *
 * 改为 3 张需求卡（我要原创 / 我要制作 / 我要改编），点击展开子项墙。
 * 子项直达目标工作台对应功能页（router.push），不再触发创建向导。
 */
export function WorkflowList() {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [expanded, setExpanded] = useState<WorkflowCategory | null>("create");

  function toggleCategory(id: WorkflowCategory) {
    setExpanded((current) => (current === id ? null : id));
  }

  function startEntry(href: string) {
    router.push(href);
  }

  return (
    <section className="dashboard-panel workflow-worlds" id="workflows" aria-labelledby="dashboard-workflows-title">
      <div className="dashboard-panel-head">
        <div>
          <span>{isZh ? "工作流" : "WORKFLOWS"}</span>
          <h2 id="dashboard-workflows-title">{isZh ? "选择一个入口" : "Choose an entry point"}</h2>
        </div>
      </div>

      <div className="workflow-requirement-wall">
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
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={`workflow-requirement-child ${entry.placeholder ? "is-placeholder" : ""}`}
                        onClick={() => startEntry(entry.href)}
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
    </section>
  );
}
