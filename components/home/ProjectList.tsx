"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
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
  onCreateProject?: () => void;
};

function getProjectStatus(project: DramaProject, completed: number, total: number) {
  if (total > 0 && completed >= total) return "Lit";
  if (project.finalScript?.trim()) return "Final Script";
  if (project.status === "generating" || completed > 0) return "In Progress";
  return "Draft";
}

function getProgress(completed: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
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
  return `${days}d ago`;
}

export function ProjectList({
  groupedProjects,
  loaded,
  onAddGroup,
  onCreateProject,
  projectCount,
}: ProjectListProps) {
  return (
    <section className="dashboard-panel project-worlds" id="projects" aria-labelledby="dashboard-projects-title">
      <div className="dashboard-panel-head">
        <div>
          <span>PROJECT WORLDS</span>
          <h2 id="dashboard-projects-title">Your story planets</h2>
        </div>
        <button className="ghost-button" type="button" onClick={onAddGroup}>
          New group
        </button>
      </div>

      <div className="planet-card-grid">
        <button className="project-planet-card new-world-card" type="button" onClick={onCreateProject}>
          <span className="new-world-plus">+</span>
          <strong>New World</strong>
          <small>Start a new story</small>
        </button>

        {loaded && projectCount === 0 ? (
          <article className="project-planet-card empty-world-card">
            <span className="project-planet dim" />
            <strong>No story planets yet</strong>
            <small>Enter the Writer's Room to create the first one.</small>
          </article>
        ) : null}

        {groupedProjects.map(({ group, projects }) =>
          projects.map((project, index) => {
            const completed = getCompletedStepCount(project);
            const total = getWorkflowSteps(project).length;
            const status = getProjectStatus(project, completed, total);
            const progress = getProgress(completed, total);

            return (
              <Link
                className="project-planet-card"
                data-status={status.toLowerCase().replace(/\s+/g, "-")}
                href={`/projects/${project.id}`}
                key={project.id}
              >
                <span className={`project-planet planet-tone-${index % 4}`} />
                <span className="planet-orbit" style={{ "--progress": `${progress}%` } as CSSProperties} />
                <div>
                  <strong>{project.title || "Untitled World"}</strong>
                  <small>{project.genre || "Genre TBD"} · {project.workflowType === "continuation" ? "Continuation" : "Original"}</small>
                </div>
                <div className="planet-meta">
                  <span>{status}</span>
                  <span>{progress}%</span>
                </div>
                <div className="planet-progress">
                  <i style={{ width: `${progress}%` }} />
                </div>
                <small className="planet-updated">{group || DEFAULT_PROJECT_GROUP} · {formatUpdatedAt(project.updatedAt)}</small>
              </Link>
            );
          }),
        )}
      </div>
    </section>
  );
}
