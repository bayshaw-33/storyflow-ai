"use client";

import { useRouter } from "next/navigation";
import type { WorkflowType } from "@/lib/projects";
import { useI18n } from "@/lib/i18n/useI18n";
import { WORKFLOW_ENTRY_POINTS, type WorkflowEntryId } from "@/components/workflow/workflow-data";

type DramaWorkflowType = Extract<WorkflowType, "creation" | "continuation">;

type WorkflowListProps = {
  onSelectWorkflow: (workflowType: DramaWorkflowType) => void;
};

export function WorkflowList({ onSelectWorkflow }: WorkflowListProps) {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  function startWorkflow(id: WorkflowEntryId, href: string) {
    if (id === "script") {
      onSelectWorkflow("creation");
      return;
    }

    router.push(href);
  }

  return (
    <section className="dashboard-panel workflow-worlds" id="workflows" aria-labelledby="dashboard-workflows-title">
      <div className="dashboard-panel-head">
        <div>
          <span>{isZh ? "工作流" : "WORKFLOWS"}</span>
          <h2 id="dashboard-workflows-title">{isZh ? "选择下一个故事入口" : "Templates for the next world"}</h2>
        </div>
      </div>
      <div className="workflow-template-grid">
        {WORKFLOW_ENTRY_POINTS.map((entry) => (
          <article className="workflow-template-card" key={entry.id}>
            <span className="workflow-thumb" />
            <div>
              <h3>{isZh ? entry.titleZh : entry.title}</h3>
              <p>{isZh ? entry.descriptionZh : entry.description}</p>
            </div>
            <div className="workflow-template-meta">
              <span>{entry.steps} {isZh ? "步" : "steps"}</span>
              <span>{isZh ? entry.difficultyZh : entry.difficulty}</span>
            </div>
            <button
              type="button"
              onClick={() => startWorkflow(entry.id, entry.href)}
            >
              {isZh ? "开始" : "Start"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
