import type { TaskType } from "@/lib/ai/prompts";
import type { WorkflowPhase, WorkflowStep } from "@/lib/projects";
import { translate, type Locale } from "@/lib/i18n/dictionaries";

export function localizeWorkflowStep(locale: Locale, step: WorkflowStep): WorkflowStep {
  const lockedLabels: Partial<Record<TaskType, { short: string; label: string }>> = {
    market_analysis: { short: "Logline", label: "Logline" },
    script_import: { short: "Logline", label: "Logline" },
    brief: { short: "Outline", label: "Outline" },
    structure_model: { short: "World", label: "World" },
    characters: { short: "Characters", label: "Characters" },
    beat_cards: { short: "Scenes", label: "Scenes" },
    series_outline: { short: "Scenes", label: "Scenes" },
    chinese_script: { short: "Script", label: "Script" },
    existing_script: { short: "Script", label: "Script" },
    continuation_script: { short: "Script", label: "Script" },
    translation: { short: "Review", label: "Review" },
    localization: { short: "Review", label: "Review" },
    quality_evaluation: { short: "Review", label: "Review" },
    final_script: { short: "Final", label: "Final" },
    format_check: { short: "Final", label: "Final" },
    storyboard_script: { short: "Final", label: "Final" },
    final_delivery: { short: "Light the Planet", label: "Light the Planet" },
  };

  if (locale === "en-US" && lockedLabels[step.key]) {
    return { ...step, ...lockedLabels[step.key] };
  }

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
