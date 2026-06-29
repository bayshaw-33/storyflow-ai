"use client";

import { WorkflowCard, type WorkflowCardData } from "@/components/workflow/workflow-card";
import { WORKFLOW_ENTRY_POINTS } from "@/components/workflow/workflow-data";

type WorkflowGridProps = {
  isZh: boolean;
  onNavigate?: () => void;
};

export function WorkflowGrid({ isZh, onNavigate }: WorkflowGridProps) {
  const workflows: WorkflowCardData[] = WORKFLOW_ENTRY_POINTS.map((workflow) => ({
    id: workflow.id,
    title: isZh ? workflow.titleZh : workflow.title,
    description: isZh ? workflow.descriptionZh : workflow.description,
    href: workflow.href,
    tier: workflow.tier,
    icon: workflow.icon,
  }));

  return (
    <div className="workspace-workflow-grid" aria-label={isZh ? "工作流入口" : "Workflow entry points"}>
      {workflows.map((workflow) => (
        <WorkflowCard key={workflow.id} workflow={workflow} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
