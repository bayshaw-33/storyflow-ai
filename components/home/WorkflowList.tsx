"use client";

import type { WorkflowType } from "@/lib/projects";
import { useI18n } from "@/lib/i18n/useI18n";

type WorkflowEntry = {
  titleKey: string;
  descriptionKey: string;
  mode: WorkflowType;
  beta?: boolean;
};

const workflowEntries: WorkflowEntry[] = [
  {
    titleKey: "home.workflow.shortDrama",
    descriptionKey: "home.workflow.shortDrama.desc",
    mode: "creation",
  },
  {
    titleKey: "home.workflow.novel",
    descriptionKey: "home.workflow.novel.desc",
    mode: "creation",
  },
  {
    titleKey: "home.workflow.film",
    descriptionKey: "home.workflow.film.desc",
    mode: "creation",
  },
  {
    titleKey: "home.workflow.mv",
    descriptionKey: "home.workflow.mv.desc",
    mode: "creation",
    beta: true,
  },
];

type WorkflowListProps = {
  onSelectWorkflow: (workflowType: WorkflowType) => void;
};

export function WorkflowList({ onSelectWorkflow }: WorkflowListProps) {
  const { t } = useI18n();

  return (
    <section className="kk-section" id="workflows" aria-labelledby="kk-workflows-title">
      <div className="kk-section-head">
        <span>{t("home.workflows.kicker")}</span>
        <h2 id="kk-workflows-title">{t("home.workflows.title")}</h2>
      </div>
      <div className="kk-workflow-list">
        {workflowEntries.map((entry) => (
          <div className="kk-workflow-row" key={entry.titleKey}>
            <div>
              <h3>
                {t(entry.titleKey)}
                {entry.beta ? <span>{t("home.workflow.beta")}</span> : null}
              </h3>
              <p>{t(entry.descriptionKey)}</p>
            </div>
            <button type="button" onClick={() => onSelectWorkflow(entry.mode)}>
              {t("home.workflow.start")}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
