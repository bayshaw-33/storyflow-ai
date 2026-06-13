import Link from "next/link";
import {
  DEFAULT_PROJECT_GROUP,
  type DramaProject,
  getCompletedStepCount,
  getWorkflowSteps,
} from "@/lib/projects";

type ProjectListProps = {
  groupedProjects: Array<{
    group: string;
    projects: DramaProject[];
  }>;
  loaded: boolean;
  projectCount: number;
  onAddGroup: () => void;
};

function getProjectStatus(project: DramaProject, completed: number, total: number) {
  if (total > 0 && completed >= total) return "completed";
  if (project.status === "generating") return "active";
  return "draft";
}

function formatUpdatedAt(value: string) {
  const updatedAt = new Date(value).getTime();
  if (Number.isNaN(updatedAt)) return "Unknown";

  const diffMs = Date.now() - updatedAt;
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(value).toLocaleDateString();
}

export function ProjectList({
  groupedProjects,
  loaded,
  onAddGroup,
  projectCount,
}: ProjectListProps) {
  return (
    <section className="kk-section kk-project-section" id="projects" aria-labelledby="kk-projects-title">
      <div className="kk-section-head kk-project-head">
        <div>
          <span>Projects</span>
          <h2 id="kk-projects-title">Recent projects</h2>
        </div>
        <button className="kk-secondary-button" type="button" onClick={onAddGroup}>
          New group
        </button>
      </div>

      {loaded && projectCount === 0 ? (
        <div className="kk-empty-projects">
          <span>No projects yet</span>
          <p>Start a workflow to create your first KiisKiis project.</p>
        </div>
      ) : (
        <div className="kk-project-table" role="table" aria-label="Recent projects">
          <div className="kk-project-table-head" role="row">
            <span role="columnheader">Project Name</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Updated</span>
          </div>

          {groupedProjects.map(({ group, projects }) => (
            <div className="kk-project-group" key={group}>
              <div className="kk-project-group-title">
                <span>{group || DEFAULT_PROJECT_GROUP}</span>
                <small>{projects.length}</small>
              </div>

              {projects.map((project) => {
                const completed = getCompletedStepCount(project);
                const total = getWorkflowSteps(project).length;
                const status = getProjectStatus(project, completed, total);

                return (
                  <div className="kk-project-row" role="row" data-status={status} key={project.id}>
                    <Link className="kk-project-name" href={`/projects/${project.id}`} role="cell">
                      <strong>{project.title || "Untitled Project"}</strong>
                      <span>{project.workflowType === "continuation" ? "Continuation" : "Original"}</span>
                    </Link>
                    <span className="kk-status-cell" role="cell">
                      <i aria-hidden="true" />
                      {status}
                    </span>
                    <span className="kk-updated-cell" role="cell">
                      {formatUpdatedAt(project.updatedAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
