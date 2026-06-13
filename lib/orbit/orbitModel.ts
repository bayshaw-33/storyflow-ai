import type { DramaProject, WorkflowStep } from "@/lib/projects";
import { getCompletedStepCount, getWorkflowSteps } from "@/lib/projects";

export type OrbitVisualState = "dormant" | "focused" | "active" | "complete" | "blocked";

export type OrbitNode = {
  id: string;
  projectId: string;
  label: string;
  workflowType: DramaProject["workflowType"];
  visualState: OrbitVisualState;
  completedSteps: number;
  totalSteps: number;
};

export type OrbitPathStep = {
  id: string;
  projectId: string;
  stepKey: string;
  label: string;
  shortLabel: string;
  index: number;
  visualState: OrbitVisualState;
};

export function mapProjectToOrbitNode(project: DramaProject, focusedProjectId?: string | null): OrbitNode {
  const completedSteps = getCompletedStepCount(project);
  const totalSteps = getWorkflowSteps(project).length;
  const isComplete = totalSteps > 0 && completedSteps >= totalSteps;

  return {
    id: `orbit-node:${project.id}`,
    projectId: project.id,
    label: project.title,
    workflowType: project.workflowType,
    visualState: project.id === focusedProjectId ? "focused" : isComplete ? "complete" : "dormant",
    completedSteps,
    totalSteps,
  };
}

export function mapWorkflowStepsToOrbitPath(
  project: DramaProject,
  focusedStepKey?: string | null,
): OrbitPathStep[] {
  return getWorkflowSteps(project).map((step: WorkflowStep, index) => {
    const fieldValue = project[step.field];
    const hasContent = Array.isArray(fieldValue)
      ? fieldValue.length > 0
      : typeof fieldValue === "string"
        ? fieldValue.trim().length > 0
        : Boolean(fieldValue);

    return {
      id: `orbit-path:${project.id}:${step.key}`,
      projectId: project.id,
      stepKey: step.key,
      label: step.label,
      shortLabel: step.short,
      index,
      visualState: step.key === focusedStepKey ? "focused" : hasContent ? "complete" : "dormant",
    };
  });
}
