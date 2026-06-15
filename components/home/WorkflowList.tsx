"use client";

import type { WorkflowType } from "@/lib/projects";

const workflowEntries = [
  {
    title: "Short Drama",
    description: "Fast vertical episodes with hooks, cliffhangers, and delivery assets.",
    steps: 9,
    difficulty: "Focused",
    mode: "creation" as WorkflowType,
  },
  {
    title: "Novel",
    description: "Long-form arcs, chapter engines, canon, and serialized pacing.",
    steps: 12,
    difficulty: "Deep",
    mode: "creation" as WorkflowType,
  },
  {
    title: "Film Script",
    description: "Feature treatments, scenes, rewrites, and final draft support.",
    steps: 10,
    difficulty: "Pro",
    mode: "creation" as WorkflowType,
  },
  {
    title: "MV Concept",
    description: "Visual story frames, mood, symbolic sequences, and direction.",
    steps: 6,
    difficulty: "Beta",
    mode: "creation" as WorkflowType,
  },
];

type WorkflowListProps = {
  onSelectWorkflow: (workflowType: WorkflowType) => void;
};

export function WorkflowList({ onSelectWorkflow }: WorkflowListProps) {
  return (
    <section className="dashboard-panel workflow-worlds" id="workflows" aria-labelledby="dashboard-workflows-title">
      <div className="dashboard-panel-head">
        <div>
          <span>WORKFLOWS</span>
          <h2 id="dashboard-workflows-title">Templates for the next world</h2>
        </div>
      </div>
      <div className="workflow-template-grid">
        {workflowEntries.map((entry) => (
          <article className="workflow-template-card" key={entry.title}>
            <span className="workflow-thumb" />
            <div>
              <h3>{entry.title}</h3>
              <p>{entry.description}</p>
            </div>
            <div className="workflow-template-meta">
              <span>{entry.steps} steps</span>
              <span>{entry.difficulty}</span>
            </div>
            <button type="button" onClick={() => onSelectWorkflow(entry.mode)}>
              Start
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
