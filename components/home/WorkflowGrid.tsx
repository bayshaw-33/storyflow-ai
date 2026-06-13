import { Clapperboard, FileText, Music2, ScrollText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WorkflowType } from "@/lib/projects";

type WorkflowEntry = {
  title: string;
  label: string;
  description: string;
  mode: WorkflowType;
  beta?: boolean;
  icon: LucideIcon;
};

const workflowEntries: WorkflowEntry[] = [
  {
    title: "Short Drama",
    label: "Series sprint",
    description: "Vertical drama setup, episodes, hooks, scripts, and delivery.",
    mode: "creation",
    icon: Clapperboard,
  },
  {
    title: "Novel / Web Fiction",
    label: "Narrative engine",
    description: "Long-form story worlds, arcs, chapters, and serialized rhythm.",
    mode: "creation",
    icon: ScrollText,
  },
  {
    title: "Film Script",
    label: "Screen structure",
    description: "Feature concepts, character pressure, treatment, and scene flow.",
    mode: "creation",
    icon: FileText,
  },
  {
    title: "MV Concept",
    label: "Visual concept",
    description: "Music video story frames, tone, imagery, and production intent.",
    mode: "creation",
    beta: true,
    icon: Music2,
  },
];

type WorkflowGridProps = {
  onSelectWorkflow: (workflowType: WorkflowType) => void;
};

export function WorkflowGrid({ onSelectWorkflow }: WorkflowGridProps) {
  return (
    <section className="kk-section" id="workflows" aria-labelledby="kk-workflows-title">
      <div className="kk-section-head">
        <span>Workflows</span>
        <h2 id="kk-workflows-title">Choose a creative entry point</h2>
      </div>
      <div className="kk-workflow-grid">
        {workflowEntries.map((entry) => {
          const Icon = entry.icon;

          return (
            <button
              className="kk-workflow-card"
              key={entry.title}
              type="button"
              onClick={() => onSelectWorkflow(entry.mode)}
            >
              <div className="kk-card-icon">
                <Icon size={22} />
              </div>
              <div>
                <div className="kk-card-title-row">
                  <h3>{entry.title}</h3>
                  {entry.beta ? <span>Beta</span> : null}
                </div>
                <strong>{entry.label}</strong>
                <p>{entry.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
