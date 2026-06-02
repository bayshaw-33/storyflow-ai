"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  FilePlus2,
  LogIn,
  PenLine,
  Settings,
  Sparkles,
  UserPlus,
  WandSparkles,
} from "lucide-react";
import {
  createContinuationProject,
  createProject,
  DramaProject,
  getCompletedStepCount,
  getWorkflowSteps,
  readProjectsFromStorage,
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

  function createAndOpen(type: "creation" | "continuation") {
    const project = type === "continuation" ? createContinuationProject() : createProject();
    router.push(`/projects/${project.id}?mode=${type === "continuation" ? "continuation" : "creation"}`);
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

          <div className="sidebar-project-list">
            {loaded && sortedProjects.length === 0 ? (
              <div className="sidebar-empty">
                <Sparkles size={18} />
                <span>暂无项目</span>
              </div>
            ) : null}

            {sortedProjects.map((project) => {
              const completed = getCompletedStepCount(project);
              const total = getWorkflowSteps(project).length;

              return (
                <Link className="sidebar-project-item" href={`/projects/${project.id}`} key={project.id}>
                  <div>
                    <span>{project.workflowType === "continuation" ? "剧本续写" : "原创项目"}</span>
                    <strong>{project.title}</strong>
                  </div>
                  <small>
                    <Clock size={13} />
                    {completed}/{total}
                  </small>
                </Link>
              );
            })}
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
