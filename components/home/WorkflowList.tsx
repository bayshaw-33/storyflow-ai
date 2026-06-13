import type { WorkflowType } from "@/lib/projects";

type WorkflowEntry = {
  title: string;
  description: string;
  mode: WorkflowType;
  beta?: boolean;
};

const workflowEntries: WorkflowEntry[] = [
  {
    title: "Short Drama",
    description: "Vertical drama scripts, episodes, hooks, and delivery.",
    mode: "creation",
  },
  {
    title: "Novel",
    description: "Long-form story arcs, chapters, and serialized fiction.",
    mode: "creation",
  },
  {
    title: "Film Script",
    description: "Feature concepts, treatments, scenes, and rewrites.",
    mode: "creation",
  },
  {
    title: "MV Concept",
    description: "Music video concepts, story frames, and visual direction.",
    mode: "creation",
    beta: true,
  },
];

type WorkflowListProps = {
  onSelectWorkflow: (workflowType: WorkflowType) => void;
};

export function WorkflowList({ onSelectWorkflow }: WorkflowListProps) {
  return (
    <section className="kk-section" id="workflows" aria-labelledby="kk-workflows-title">
      <div className="kk-section-head">
        <span>Workflows</span>
        <h2 id="kk-workflows-title">Start a workflow</h2>
      </div>
      <div className="kk-workflow-list">
        {workflowEntries.map((entry) => (
          <div className="kk-workflow-row" key={entry.title}>
            <div>
              <h3>
                {entry.title}
                {entry.beta ? <span>Beta</span> : null}
              </h3>
              <p>{entry.description}</p>
            </div>
            <button type="button" onClick={() => onSelectWorkflow(entry.mode)}>
              Start
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
