"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FilePlus2, FolderOpen, PenLine, Settings, Trash2, WandSparkles } from "lucide-react";
import {
  createContinuationProject,
  createProject,
  deleteProject,
  DramaProject,
  getCompletedStepCount,
  getWorkflowSteps,
  readProjectsFromStorage,
  upsertProject,
} from "@/lib/projects";

export default function ProjectListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<DramaProject[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProjects(readProjectsFromStorage());
    setLoaded(true);
  }, []);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [projects],
  );

  function removeProject(id: string) {
    deleteProject(id);
    setProjects(readProjectsFromStorage());
  }

  function createAndOpen(type: "creation" | "continuation") {
    const project = type === "continuation" ? createContinuationProject() : createProject();
    upsertProject(project);
    setProjects(readProjectsFromStorage());
    router.push(`/projects/${project.id}`);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <img className="brand-logo" src="/storyflow-logo-white.png" alt="StoryFlow" />
          <div>
            <span className="kicker">StoryFlow AI</span>
            <h1>项目列表</h1>
          </div>
        </div>
        <nav className="header-actions">
          <Link className="icon-button" href="/settings" title="设置">
            <Settings size={18} />
          </Link>
          <Link className="secondary-button" href="/projects/demo?template=demo">
            <WandSparkles size={18} /> 一键填入演示案例
          </Link>
          <button className="secondary-button" onClick={() => createAndOpen("continuation")}>
            <PenLine size={18} /> 剧本续写
          </button>
          <button className="primary-button" onClick={() => createAndOpen("creation")}>
            <FilePlus2 size={18} /> 新建项目
          </button>
        </nav>
      </header>

      <section className="project-toolbar">
        <div>
          <strong>{projects.length}</strong>
          <span>项目总数</span>
        </div>
      </section>

      <section className="project-grid">
        {loaded && sortedProjects.length === 0 ? (
          <div className="empty-state">
            <FolderOpen size={30} />
            <h2>还没有项目</h2>
            <p>创建一个项目，或先填入演示案例，直接进入 StoryFlow AI 创作工作台。</p>
            <Link className="primary-button" href="/projects/demo?template=demo">
              <WandSparkles size={18} /> 使用演示案例
            </Link>
          </div>
        ) : null}

        {sortedProjects.map((project) => {
          const completed = getCompletedStepCount(project);

          return (
            <article className="project-card" key={project.id}>
              <div className="card-top">
                <div>
                  <span>{project.genre}</span>
                  <h2>{project.title}</h2>
                </div>
                <button className="icon-button subtle" title="删除" onClick={() => removeProject(project.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="project-meta">
                <span>{project.workflowType === "continuation" ? "剧本续写" : "原创项目"}</span>
                <span>{project.market}</span>
                <span>{project.episodeCount} 集</span>
                <span>{project.episodeDuration}</span>
                <span>{completed}/{getWorkflowSteps(project).length} 步已完成</span>
                <span>{project.status}</span>
                <span>{new Date(project.updatedAt).toLocaleString("zh-CN")}</span>
              </div>
              <Link className="open-link" href={`/projects/${project.id}`}>
                进入工作台 <ArrowRight size={16} />
              </Link>
            </article>
          );
        })}
      </section>
    </main>
  );
}
