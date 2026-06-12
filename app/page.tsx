"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  FilePlus2,
  FolderPlus,
  LogIn,
  PenLine,
  Settings,
  Sparkles,
  Trash2,
  UserPlus,
  WandSparkles,
} from "lucide-react";
import {
  createContinuationProject,
  createProject,
  DEFAULT_PROJECT_GROUP,
  deleteProject,
  DramaProject,
  getCompletedStepCount,
  getWorkflowSteps,
  readProjectGroupsFromStorage,
  readProjectsFromStorage,
  saveProjectGroupsToStorage,
  saveProjectsToStorage,
} from "@/lib/projects";
import {
  deleteProjectFromSupabase,
  saveProjectGroupsToSupabase,
  syncProjectsWithSupabase,
  upsertProjectToSupabase,
} from "@/lib/supabase/projects";

export default function ProjectListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<DramaProject[]>([]);
  const [groups, setGroups] = useState<string[]>([DEFAULT_PROJECT_GROUP]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const localProjects = readProjectsFromStorage();
    setProjects(localProjects);
    const storedGroups = readProjectGroupsFromStorage();
    const projectGroups = localProjects.map((project) => project.projectGroup || DEFAULT_PROJECT_GROUP);
    setGroups(Array.from(new Set([DEFAULT_PROJECT_GROUP, ...storedGroups, ...projectGroups])));
    setLoaded(true);

    void syncProjectsWithSupabase(localProjects).then((result) => {
      setProjects(result.projects);
      setGroups(result.groups);
    });
  }, []);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [projects],
  );

  const groupedProjects = useMemo(
    () =>
      groups
        .map((group) => ({
          group,
          projects: sortedProjects.filter((project) => (project.projectGroup || DEFAULT_PROJECT_GROUP) === group),
        }))
        .filter((item) => item.projects.length > 0 || item.group === DEFAULT_PROJECT_GROUP),
    [groups, sortedProjects],
  );

  function createAndOpen(type: "creation" | "continuation") {
    const project = type === "continuation" ? createContinuationProject() : createProject();
    router.push(`/projects/${project.id}?mode=${type === "continuation" ? "continuation" : "creation"}`);
  }

  function addGroup() {
    const name = window.prompt("请输入分组名称");
    const nextName = name?.trim();
    if (!nextName) return;

    const nextGroups = Array.from(new Set([DEFAULT_PROJECT_GROUP, ...groups, nextName]));
    setGroups(nextGroups);
    saveProjectGroupsToStorage(nextGroups);
    void saveProjectGroupsToSupabase(nextGroups);
  }

  function moveProject(projectId: string, group: string) {
    const nextProjects = projects.map((project) =>
      project.id === projectId
        ? { ...project, projectGroup: group, updatedAt: new Date().toISOString() }
        : project,
    );
    setProjects(nextProjects);
    saveProjectsToStorage(nextProjects);
    const moved = nextProjects.find((project) => project.id === projectId);
    if (moved) void upsertProjectToSupabase(moved);
  }

  function removeProject(projectId: string, title: string) {
    const confirmed = window.confirm(`确定删除「${title || "未命名项目"}」吗？此操作只会删除本机浏览器里的项目记录。`);
    if (!confirmed) return;

    deleteProject(projectId);
    void deleteProjectFromSupabase(projectId);
    setProjects(readProjectsFromStorage());
  }

  return (
    <main className="home-shell">
      <aside className="home-sidebar">
        <div className="sidebar-brand">
          <img className="brand-logo" src="/storyflow-logo-white.png" alt="StoryFlow" />
        </div>

        <section className="sidebar-projects">
          <div className="sidebar-section-title">
            <span>项目</span>
            <strong>{projects.length}</strong>
          </div>
          <button className="sidebar-group-button" onClick={addGroup}>
            <FolderPlus size={15} />
            新建分组
          </button>

          <div className="sidebar-project-list">
            {loaded && sortedProjects.length === 0 ? (
              <div className="sidebar-empty">
                <Sparkles size={18} />
                <span>暂无项目</span>
              </div>
            ) : null}

            {groupedProjects.map(({ group, projects: groupProjects }) => (
              <div className="sidebar-project-group" key={group}>
                <div className="sidebar-group-title">
                  <span>{group}</span>
                  <small>{groupProjects.length}</small>
                </div>

                {groupProjects.map((project) => {
                  const completed = getCompletedStepCount(project);
                  const total = getWorkflowSteps(project).length;

                  return (
                    <div className="sidebar-project-item" key={project.id}>
                      <Link className="sidebar-project-link" href={`/projects/${project.id}`}>
                        <div>
                          <span>{project.workflowType === "continuation" ? "剧本续写" : "原创项目"}</span>
                          <strong>{project.title}</strong>
                        </div>
                        <small>
                          <Clock size={13} />
                          {completed}/{total}
                        </small>
                      </Link>
                      <div className="sidebar-project-actions">
                        <select
                          aria-label="移动项目分组"
                          value={project.projectGroup || DEFAULT_PROJECT_GROUP}
                          onChange={(event) => moveProject(project.id, event.target.value)}
                        >
                          {groups.map((item) => (
                            <option key={item} value={item}>{item}</option>
                          ))}
                        </select>
                        <button className="sidebar-delete-button" onClick={() => removeProject(project.id, project.title)} title="删除项目">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <nav className="sidebar-footer">
          <Link className="sidebar-link" href="/projects/demo?template=demo">
            <WandSparkles size={17} /> 演示案例
          </Link>
          <Link className="sidebar-link" href="/settings">
            <Settings size={17} /> 设置
          </Link>
        </nav>
      </aside>

      <section className="home-main">
        <div className="home-auth">
          <button className="icon-button" title="注册">
            <UserPlus size={18} />
          </button>
          <button className="icon-button" title="登录">
            <LogIn size={18} />
          </button>
        </div>

        <div className="home-actions-center">
          <button className="home-action-card" onClick={() => createAndOpen("creation")}>
            <FilePlus2 size={28} />
            <span>新建项目</span>
          </button>
          <button className="home-action-card" onClick={() => createAndOpen("continuation")}>
            <PenLine size={28} />
            <span>剧本续写</span>
          </button>
        </div>

        <footer className="creator-footer">
          <div>
            <span>制作者：萧锦澄</span>
          </div>
          <img src="/wechat-qr.svg" alt="微信二维码" />
        </footer>
      </section>
    </main>
  );
}
