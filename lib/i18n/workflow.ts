import type { TaskType } from "@/lib/ai/prompts";
import type { WorkflowPhase, WorkflowStep } from "@/lib/projects";
import { translate, type Locale } from "@/lib/i18n/dictionaries";

export function localizeWorkflowStep(locale: Locale, step: WorkflowStep): WorkflowStep {
  return {
    ...step,
    short: translate(locale, `workflow.step.${step.key}.short`),
    label: translate(locale, `workflow.step.${step.key}.label`),
  };
}

export function localizeWorkflowPhase(locale: Locale, phase: WorkflowPhase): WorkflowPhase {
  return {
    ...phase,
    title: translate(locale, `workflow.phase.${phase.key}.title`),
    description: translate(locale, `workflow.phase.${phase.key}.description`),
  };
}

export function getLocalizedStepName(locale: Locale, taskType: TaskType) {
  return translate(locale, `workflow.step.${taskType}.short`);
}
