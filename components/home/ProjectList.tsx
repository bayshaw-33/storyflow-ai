"use client";

import Link from "next/link";
import {
  DEFAULT_PROJECT_GROUP,
  type DramaProject,
  getCompletedStepCount,
  getWorkflowSteps,
} from "@/lib/projects";
import { useI18n } from "@/lib/i18n/useI18n";

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

function formatUpdatedAt(value: string, locale: string, t: (key: string) => string) {
  const updatedAt = new Date(value).getTime();
  if (Number.isNaN(updatedAt)) return t("home.projects.updated.unknown");

  const diffMs = Date.now() - updatedAt;
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return locale === "zh-CN" ? `${minutes}${t("home.projects.updated.minute")}` : `${minutes}${t("home.projects.updated.minute")}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === "zh-CN" ? `${hours}${t("home.projects.updated.hour")}` : `${hours}${t("home.projects.updated.hour")}`;

  const days = Math.floor(hours / 24);
  if (days < 30) return locale === "zh-CN" ? `${days}${t("home.projects.updated.day")}` : `${days}${t("home.projects.updated.day")}`;

  return new Date(value).toLocaleDateString(locale);
}

export function ProjectList({
  groupedProjects,
  loaded,
  onAddGroup,
  projectCount,
}: ProjectListProps) {
  const { locale, t } = useI18n();

  return (
    <section className="kk-section kk-project-section" id="projects" aria-labelledby="kk-projects-title">
      <div className="kk-section-head kk-project-head">
        <div>
          <span>{t("home.projects.kicker")}</span>
          <h2 id="kk-projects-title">{t("home.projects.title")}</h2>
        </div>
        <button className="kk-secondary-button" type="button" onClick={onAddGroup}>
          {t("home.projects.newGroup")}
        </button>
      </div>

      {loaded && projectCount === 0 ? (
        <div className="kk-empty-projects">
          <span>{t("home.projects.emptyTitle")}</span>
          <p>{t("home.projects.emptyBody")}</p>
        </div>
      ) : (
        <div className="kk-project-table" role="table" aria-label={t("home.projects.title")}>
          <div className="kk-project-table-head" role="row">
            <span role="columnheader">{t("home.projects.column.name")}</span>
            <span role="columnheader">{t("home.projects.column.status")}</span>
            <span role="columnheader">{t("home.projects.column.updated")}</span>
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
                      <strong>{project.title || t("home.projects.untitled")}</strong>
                      <span>{project.workflowType === "continuation" ? t("home.projects.continuation") : t("home.projects.original")}</span>
                    </Link>
                    <span className="kk-status-cell" role="cell">
                      <i aria-hidden="true" />
                      {t(`home.projects.status.${status}`)}
                    </span>
                    <span className="kk-updated-cell" role="cell">
                      {formatUpdatedAt(project.updatedAt, locale, t)}
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
