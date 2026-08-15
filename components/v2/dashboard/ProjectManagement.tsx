"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Clock3,
  FileText,
  Globe2,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { fetchJobs } from "@/lib/client/v2/jobs/api";
import type { UnifiedJob } from "@/lib/client/v2/jobs/types";
import { fetchKkRuntime } from "@/lib/client/v2/kk/api";
import type { KkPendingConfirmation } from "@/lib/client/v2/kk/types";
import { readProjectsFromStorage, type DramaProject } from "@/lib/projects";
import { readProjectsFromSupabase } from "@/lib/supabase/projects";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  filterAndSortProjects,
  getProjectProgress,
  getProjectWorkbenchHref,
  type ProjectLibraryFilters,
} from "@/lib/client/v2/project-library/helpers";

import styles from "./dashboard.module.css";

type ProjectManagementProps = {
  accessToken: string;
};

type LoadStatus = "loading" | "ready" | "error";

const EMPTY_FILTERS: ProjectLibraryFilters = {
  query: "",
  workflow: "all",
  status: "all",
  universe: "all",
  sort: "updated",
};

const WORKFLOW_LABELS: Record<string, string> = {
  creation: "剧本",
  continuation: "剧本续作",
  song: "歌曲",
  art: "美术",
  storyboard: "分镜",
  video: "视频",
  voice: "配音",
  editing: "剪辑",
  viral: "改编",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  generating: "生成中",
  ready: "已完成",
  error: "需要处理",
};

const JOB_STAGE_LABELS: Record<string, string> = {
  draft: "草稿",
  pending_confirm: "待确认",
  queued: "排队中",
  running: "运行中",
  result_ingesting: "结果入库",
  completed: "已完成",
  partial_failure: "部分失败",
  failed: "失败",
  cancelled: "已取消",
};

function mergeProjects(localProjects: DramaProject[], cloudProjects: DramaProject[]) {
  const byId = new Map<string, DramaProject>();
  for (const project of [...localProjects, ...cloudProjects]) {
    const current = byId.get(project.id);
    if (!current || new Date(project.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
      byId.set(project.id, project);
    }
  }
  return Array.from(byId.values());
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "时间未知";
  return parsed.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function formatJobProgress(job: UnifiedJob) {
  if (job.total > 0) return `${job.completed}/${job.total}`;
  return "处理中";
}

function projectStage(project: DramaProject) {
  if (project.finalScript?.trim()) return "剧本定稿";
  if (project.episodes?.trim()) return "分集与场景";
  if (project.outline?.trim()) return "故事大纲";
  if (project.characters?.trim() || project.characterCards?.length) return "角色设计";
  if (project.idea?.trim() || project.brief?.trim()) return "创意整理";
  return "尚未开始";
}

function activeJobs(jobs: UnifiedJob[]) {
  return jobs.filter((job) => !["completed", "failed", "cancelled"].includes(job.stage));
}

export function ProjectManagement({ accessToken }: ProjectManagementProps) {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [filters, setFilters] = useState<ProjectLibraryFilters>(EMPTY_FILTERS);
  const [projects, setProjects] = useState<DramaProject[]>([]);
  const [jobs, setJobs] = useState<UnifiedJob[]>([]);
  const [confirmations, setConfirmations] = useState<ReadonlyArray<KkPendingConfirmation>>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [projectError, setProjectError] = useState("");
  const [secondaryNotice, setSecondaryNotice] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setProjectError("");
    setSecondaryNotice("");
    const localProjects = readProjectsFromStorage();
    const [cloudResult, jobsResult, kkResult] = await Promise.allSettled([
      readProjectsFromSupabase({ accessToken }),
      fetchJobs(accessToken),
      fetchKkRuntime(accessToken),
    ]);

    if (cloudResult.status === "fulfilled") {
      setProjects(mergeProjects(localProjects, cloudResult.value));
    } else {
      setProjects(localProjects);
      setProjectError(localProjects.length > 0
        ? "云端项目暂时无法读取，当前显示本地缓存。"
        : "项目数据暂时无法读取，请重试。\n");
    }

    if (jobsResult.status === "fulfilled" && jobsResult.value.source === "api") {
      setJobs(jobsResult.value.jobs);
    } else {
      setJobs([]);
      setSecondaryNotice("任务状态暂时不可用，页面不会显示演示任务。");
    }

    if (kkResult.status === "fulfilled" && kkResult.value.source === "api") {
      setConfirmations(kkResult.value.pendingConfirmations);
    } else {
      setConfirmations([]);
      setSecondaryNotice((current) => current || "待确认事项暂时不可用，页面不会显示演示数据。");
    }

    setStatus(cloudResult.status === "fulfilled" || localProjects.length > 0 ? "ready" : "error");
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleProjects = useMemo(
    () => filterAndSortProjects(projects, filters),
    [filters, projects],
  );
  const runningJobs = useMemo(() => activeJobs(jobs), [jobs]);

  function setFilter<K extends keyof ProjectLibraryFilters>(key: K, value: ProjectLibraryFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.projectManagementHeader}>
          <div>
            <p className={styles.eyebrow}>KIIKIS WORKSPACE</p>
            <h1 className={styles.title}>{isZh ? "项目管理" : "Project library"}</h1>
            <p className={styles.subtitle}>
              {isZh ? "找到你做过的每一个项目，继续创作，而不是只看一条进度。" : "Find every project you have made and continue creating."}
            </p>
          </div>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            onClick={() => router.push("/projects/new-v2")}
          >
            <Plus size={16} />
            {isZh ? "新建项目" : "New project"}
          </button>
        </header>

        <section className={styles.projectToolbar} aria-label={isZh ? "项目筛选" : "Project filters"}>
          <label className={styles.projectSearch}>
            <Search size={16} aria-hidden="true" />
            <input
              value={filters.query}
              onChange={(event) => setFilter("query", event.target.value)}
              placeholder={isZh ? "搜索项目名称、题材或 ID" : "Search title, genre, or ID"}
              aria-label={isZh ? "搜索项目" : "Search projects"}
            />
          </label>
          <label className={styles.filterControl}>
            <SlidersHorizontal size={14} aria-hidden="true" />
            <span className={styles.srOnly}>{isZh ? "类型" : "Type"}</span>
            <select value={filters.workflow} onChange={(event) => setFilter("workflow", event.target.value)}>
              <option value="all">全部类型</option>
              {Object.entries(WORKFLOW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className={styles.filterControl}>
            <span className={styles.srOnly}>{isZh ? "状态" : "Status"}</span>
            <select value={filters.status} onChange={(event) => setFilter("status", event.target.value)}>
              <option value="all">全部状态</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className={styles.filterControl}>
            <span className={styles.srOnly}>{isZh ? "Universe" : "Universe"}</span>
            <select value={filters.universe} onChange={(event) => setFilter("universe", event.target.value as ProjectLibraryFilters["universe"])}>
              <option value="all">Universe：全部</option>
              <option value="bound">已绑定 Universe</option>
              <option value="unbound">未绑定 Universe</option>
            </select>
          </label>
          <label className={styles.filterControl}>
            <span className={styles.srOnly}>{isZh ? "排序" : "Sort"}</span>
            <select value={filters.sort} onChange={(event) => setFilter("sort", event.target.value as ProjectLibraryFilters["sort"])}>
              <option value="updated">最近编辑</option>
              <option value="created">创建时间</option>
              <option value="title">项目名称</option>
            </select>
          </label>
        </section>

        <section className={styles.projectLibrarySection} aria-labelledby="project-library-title">
          <div className={styles.projectSectionHeader}>
            <div>
              <p className={styles.sectionKicker}>PROJECTS</p>
              <h2 id="project-library-title" className={styles.sectionTitle}>{isZh ? "我的项目" : "My projects"}</h2>
            </div>
            <span className={styles.cardCount}>{visibleProjects.length} / {projects.length}</span>
          </div>

          {status === "loading" ? (
            <div className={styles.libraryNotice}><Loader2 size={18} className={styles.spin} />正在读取项目…</div>
          ) : status === "error" ? (
            <div className={styles.libraryNotice} role="alert">
              <span>{projectError || "项目数据加载失败。"}</span>
              <button type="button" className={styles.inlineButton} onClick={() => void load()}>重试</button>
            </div>
          ) : visibleProjects.length === 0 ? (
            <div className={styles.libraryNotice}>
              <FileText size={18} />
              <span>{projects.length === 0 ? "还没有可显示的项目。" : "没有符合筛选条件的项目。"}</span>
              {projects.length === 0 ? <button type="button" className={styles.inlineButton} onClick={() => router.push("/projects/new-v2")}>创建第一个项目</button> : null}
            </div>
          ) : (
            <div className={styles.projectGrid}>
              {visibleProjects.map((project) => {
                const progress = getProjectProgress(project);
                return (
                  <Link key={project.id} href={getProjectWorkbenchHref(project)} className={styles.projectCard}>
                    <div className={styles.projectCardTop}>
                      <span className={styles.projectType}>{WORKFLOW_LABELS[project.workflowType] || project.workflowType}</span>
                      <span className={`${styles.statusBadge} ${styles[`status_${project.status}`] || ""}`}>
                        {STATUS_LABELS[project.status] || project.status}
                      </span>
                    </div>
                    <h3 className={styles.projectCardTitle}>{project.title || "未命名项目"}</h3>
                    <p className={styles.projectCardStage}>{projectStage(project)}</p>
                    <div className={styles.projectCardMeta}>
                      <span>{project.universeId ? <><Globe2 size={13} />已绑定 Universe</> : "未绑定 Universe"}</span>
                      <span><Clock3 size={13} />{formatDate(project.updatedAt)}</span>
                    </div>
                    <div className={styles.projectCardProgress}>
                      <span>{progress === null ? "暂无可计算进度" : `${progress}% 已完成`}</span>
                      {progress !== null ? <span className={styles.progressTrack}><i style={{ width: `${progress}%` }} /></span> : null}
                    </div>
                    <span className={styles.projectCardAction}>打开项目 <ArrowRight size={14} /></span>
                  </Link>
                );
              })}
            </div>
          )}
          {projectError && status === "ready" ? <p className={styles.syncNotice}>{projectError}</p> : null}
        </section>

        <section className={styles.secondaryGrid} aria-label={isZh ? "项目辅助信息" : "Project activity"}>
          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <div>
                <p className={styles.sectionKicker}>ACTIVITY</p>
                <h2 className={styles.sectionTitle}>运行中任务</h2>
              </div>
              <Link href="/job-center" className={styles.tableHeaderLink}>任务中心 <ArrowRight size={13} /></Link>
            </div>
            <table className={styles.dataTable}>
              <thead><tr><th>任务</th><th>项目</th><th>状态</th><th>进度</th></tr></thead>
              <tbody>
                {runningJobs.length === 0 ? <tr><td colSpan={4} className={styles.tableEmpty}>暂无运行中任务</td></tr> : runningJobs.slice(0, 8).map((job) => (
                  <tr key={job.id}>
                    <td><Link href={`/job-center/${encodeURIComponent(job.id)}`} className={styles.tablePrimary}>{job.name}</Link></td>
                    <td>{job.projectName || "未命名项目"}</td>
                    <td><span className={styles.tableStatus}>{JOB_STAGE_LABELS[job.stage] || job.stage}</span></td>
                    <td>{formatJobProgress(job)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <div>
                <p className={styles.sectionKicker}>REVIEW</p>
                <h2 className={styles.sectionTitle}>待确认事项</h2>
              </div>
              <Link href="/kk" className={styles.tableHeaderLink}>查看 KK <ArrowRight size={13} /></Link>
            </div>
            <table className={styles.dataTable}>
              <thead><tr><th>事项</th><th>类型</th><th>截止时间</th><th>操作</th></tr></thead>
              <tbody>
                {confirmations.length === 0 ? <tr><td colSpan={4} className={styles.tableEmpty}>暂无待确认事项</td></tr> : confirmations.slice(0, 8).map((item) => (
                  <tr key={item.actionId}>
                    <td className={styles.tablePrimary}>{item.summary}</td>
                    <td>{item.actionType}</td>
                    <td>{formatDate(item.expiresAt)}</td>
                    <td><Link href="/kk" className={styles.tableAction}>去处理</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {secondaryNotice ? <p className={styles.syncNotice}>{secondaryNotice}</p> : null}
      </div>
    </main>
  );
}
