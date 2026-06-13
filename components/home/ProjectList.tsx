import Link from "next/link";
import { Clock, FolderPlus, Trash2 } from "lucide-react";
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
  groups: string[];
  loaded: boolean;
  projectCount: number;
  onAddGroup: () => void;
  onMoveProject: (projectId: string, group: string) => void;
  onRemoveProject: (projectId: string, title: string) => void;
};

function getProjectStatus(project: DramaProject, completed: number, total: number) {
  if (total > 0 && completed >= total) return "completed";
  if (project.status === "generating") return "active";
  return "draft";
}

export function ProjectList({
  groupedProjects,
  groups,
  loaded,
  onAddGroup,
  onMoveProject,
  onRemoveProject,
  projectCount,
}: ProjectListProps) {
  return (
    <section className="kk-section kk-project-section" id="projects" aria-labelledby="kk-projects-title">
      <div className="kk-section-head kk-project-head">
        <div>
          <span>Projects</span>
          <h2 id="kk-projects-title">Recent projects</h2>
        </div>
        <div className="kk-project-tools">
          <strong>{projectCount}</strong>
          <button className="kk-secondary-button" type="button" onClick={onAddGroup}>
            <FolderPlus size={16} />
            New Group
          </button>
        </div>
      </div>

      <div className="kk-project-groups">
        {loaded && projectCount === 0 ? (
          <div className="kk-empty-projects">
            <span>No projects yet</span>
            <p>Start with a workflow above to create your first KiisKiis project.</p>
          </div>
        ) : null}

        {groupedProjects.map(({ group, projects }) => (
          <div className="kk-project-group" key={group}>
            <div className="kk-project-group-title">
              <span>{group || DEFAULT_PROJECT_GROUP}</span>
              <small>{projects.length}</small>
            </div>

            <div className="kk-project-list">
              {projects.map((project) => {
                const completed = getCompletedStepCount(project);
                const total = getWorkflowSteps(project).length;
                const status = getProjectStatus(project, completed, total);

                return (
                  <article className="kk-project-row" data-status={status} key={project.id}>
                    <Link
                      className="kk-project-main"
                      href={`/projects/${project.id}`}
                    >
                      <div>
                        <span>{project.workflowType === "continuation" ? "Continuation" : "Original"}</span>
                        <h3>{project.title || "Untitled Project"}</h3>
                      </div>
                      <div className="kk-project-meta">
                        <small>{status}</small>
                        <small>
                          <Clock size={13} />
                          {completed}/{total}
                        </small>
                      </div>
                    </Link>

                    <div className="kk-project-actions">
                      <select
                        aria-label="Move project group"
                        value={project.projectGroup || DEFAULT_PROJECT_GROUP}
                        onChange={(event) => onMoveProject(project.id, event.target.value)}
                      >
                        {groups.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                      <button
                        className="kk-row-icon-button"
                        type="button"
                        title="Delete project"
                        onClick={() => onRemoveProject(project.id, project.title)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
