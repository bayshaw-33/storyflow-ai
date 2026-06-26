"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { Pencil, Trash2 } from "lucide-react";
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
  groups: string[];
  loaded: boolean;
  projectCount: number;
  onAddGroup: () => void;
  onRenameGroup: (group: string) => void;
  onDeleteGroup: (group: string) => void;
  onCreateProject?: () => void;
  onDeleteProject: (projectId: string) => void;
  onMoveProject: (projectId: string, group: string) => void;
};

function getProjectStatus(project: DramaProject, completed: number, total: number) {
  if (total > 0 && completed >= total) return "Lit";
  if (project.finalScript?.trim()) return "Final Script";
  if (project.status === "generating" || completed > 0) return "In Progress";
  return "Draft";
}

function localizeStatus(status: string, isZh: boolean) {
  if (!isZh) return status;
  if (status === "Lit") return "已点亮";
  if (status === "Final Script") return "最终剧本";
  if (status === "In Progress") return "进行中";
  return "草稿";
}

function getProgress(completed: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

function getWorkflowBadge(project: DramaProject, isZh: boolean) {
  if (project.workflowType === "song") return isZh ? "歌曲" : "Song";
  if (project.workflowType === "viral") return isZh ? "爆款" : "Viral";
  if (project.workflowType === "novel") return isZh ? "小说" : "Novel";
  return isZh ? "短剧" : "Drama";
}

function getWorkflowDetail(project: DramaProject, isZh: boolean) {
  if (project.workflowType === "continuation") return isZh ? "续写" : "Continuation";
  if (project.workflowType === "song") return isZh ? "歌曲" : "Song";
  if (project.workflowType === "viral") return isZh ? "爆款" : "Viral";
  if (project.workflowType === "novel") return isZh ? "小说创作" : "Novel Creation";
  return isZh ? "原创" : "Original";
}

function getProjectHref(project: DramaProject) {
  if (project.workflowType === "song") return `/song-workbench?projectId=${encodeURIComponent(project.id)}`;
  if (project.workflowType === "viral") return "/viral-workbench";
  if (project.workflowType === "novel") return `/novel-workbench?projectId=${encodeURIComponent(project.id)}`;
  return `/projects/${project.id}`;
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
  groups,
  loaded,
  onDeleteProject,
  onRenameGroup,
  onDeleteGroup,
  onAddGroup,
  onCreateProject,
  onMoveProject,
  projectCount,
}: ProjectListProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return (
    <section className="dashboard-panel project-worlds" id="projects" aria-labelledby="dashboard-projects-title">
      <div className="dashboard-panel-head">
        <div>
          <span>{isZh ? "项目世界" : "PROJECT WORLDS"}</span>
          <h2 id="dashboard-projects-title">{isZh ? "你的故事星球" : "Your story planets"}</h2>
        </div>
        <button className="ghost-button" type="button" onClick={onAddGroup}>
          {isZh ? "新分组" : "New group"}
        </button>
      </div>

      <div className="planet-group-stack">
        {groupedProjects.map(({ group, projects }, groupIndex) => (
          <section className="planet-group-section" key={group || DEFAULT_PROJECT_GROUP}>
            <div className="planet-group-header">
              <div>
                <strong>{group || DEFAULT_PROJECT_GROUP}</strong>
                <span>{projects.length} {isZh ? "个项目" : "projects"}</span>
              </div>
              {(group || DEFAULT_PROJECT_GROUP) !== DEFAULT_PROJECT_GROUP ? (
                <div className="planet-group-actions">
                  <button className="icon-button subtle" type="button" onClick={() => onRenameGroup(group || DEFAULT_PROJECT_GROUP)} title={isZh ? "编辑分组" : "Edit group"}>
                    <Pencil size={15} />
                  </button>
                  <button className="icon-button subtle" type="button" onClick={() => onDeleteGroup(group || DEFAULT_PROJECT_GROUP)} title={isZh ? "删除分组" : "Delete group"}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ) : null}
            </div>
            <div className="planet-card-grid">
              {groupIndex === 0 ? (
                <button className="project-planet-card new-world-card" type="button" onClick={onCreateProject}>
                  <span className="new-world-plus">+</span>
                  <strong>{isZh ? "新世界" : "New World"}</strong>
                  <small>{isZh ? "开始一个新故事" : "Start a new story"}</small>
                </button>
              ) : null}

              {projects.length === 0 ? (
                <article className="project-planet-card empty-world-card">
                  <span className="project-planet dim" />
                  <strong>{loaded && projectCount === 0 ? (isZh ? "还没有故事星球" : "No story planets yet") : (isZh ? "空分组" : "Empty group")}</strong>
                  <small>{loaded && projectCount === 0 ? (isZh ? "进入创作室创建第一个项目。" : "Enter the Studio to create the first one.") : (isZh ? "可把项目移动到这里。" : "Move projects here when ready.")}</small>
                </article>
              ) : null}

              {projects.map((project, index) => {
                const completed = getCompletedStepCount(project);
                const total = getWorkflowSteps(project).length;
                const status = getProjectStatus(project, completed, total);
                const progress = getProgress(completed, total);

                return (
                  <article
                    className="project-planet-card"
                    data-status={status.toLowerCase().replace(/\s+/g, "-")}
                    key={project.id}
                  >
                    <Link className="project-card-main" href={getProjectHref(project)}>
                      <span className={`project-planet planet-tone-${index % 4}`} />
                      <span className="planet-orbit" style={{ "--progress": `${progress}%` } as CSSProperties} />
                      <div>
                        <div className="planet-title-row">
                          <strong>{project.title || (isZh ? "未命名世界" : "Untitled World")}</strong>
                          <span className="planet-workflow-badge" data-workflow={project.workflowType}>
                            {getWorkflowBadge(project, isZh)}
                          </span>
                        </div>
                        <small>{project.genre || (isZh ? "题材待定" : "Genre TBD")} / {getWorkflowDetail(project, isZh)}</small>
                      </div>
                      <div className="planet-meta">
                        <span>{localizeStatus(status, isZh)}</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="planet-progress">
                        <i style={{ width: `${progress}%` }} />
                      </div>
                      <small className="planet-updated">{group || DEFAULT_PROJECT_GROUP} · {formatUpdatedAt(project.updatedAt)}</small>
                    </Link>
                    <div className="project-card-actions">
                      <label>
                        <span>{isZh ? "分组" : "Group"}</span>
                        <select value={project.projectGroup || DEFAULT_PROJECT_GROUP} onChange={(event) => onMoveProject(project.id, event.target.value)}>
                          {groups.map((item) => (
                            <option key={item} value={item}>{item}</option>
                          ))}
                        </select>
                      </label>
                      <button className="icon-button subtle" type="button" onClick={() => onDeleteProject(project.id)} title={isZh ? "删除项目" : "Delete project"}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
