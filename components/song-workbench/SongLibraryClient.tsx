"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, FolderOpen, Loader2, Music2, RefreshCw } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { SongWorkbenchNav } from "@/components/song-workbench/SongWorkbenchNav";
import { fetchProjectLibrary } from "@/lib/client/v2/project-library/api";
import type { ProjectLibraryProject } from "@/lib/client/v2/project-library/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type MusicFilter = "all" | "song" | "instrumental" | "sfx";
type StatusFilter = "all" | "completed" | "generating" | "failed";
type MusicJob = {
  id: string;
  jobId: string;
  label: "A" | "B";
  status: "queued" | "reconciling" | "generating" | "result_ingesting" | "completed" | "failed" | "provider_timeout";
  resultUrl: string | null;
  provider: string | null;
  model: string | null;
  musicMode?: "vocal" | "instrumental" | "sfx";
  title?: string;
  error: string | null;
  createdAt: string;
};

const statusLabels: Record<StatusFilter, string> = { all: "全部状态", completed: "已完成", generating: "生成中", failed: "失败" };
const modeLabels: Record<MusicFilter, string> = { all: "全部类型", song: "歌曲", instrumental: "纯音乐", sfx: "音效" };

function getDisplayMode(mode: MusicJob["musicMode"]): Exclude<MusicFilter, "all"> {
  return mode === "instrumental" || mode === "sfx" ? mode : "song";
}

export function SongLibraryClient() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [projects, setProjects] = useState<ProjectLibraryProject[]>([]);
  const [jobs, setJobs] = useState<MusicJob[]>([]);
  const [mode, setMode] = useState<MusicFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");

  async function loadLibrary(accessToken: string) {
    setLoading(true);
    setError("");
    try {
      const [library, jobsResponse] = await Promise.all([
        fetchProjectLibrary(accessToken, "active"),
        fetch("/api/audio/jobs", { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      const jobsPayload = await jobsResponse.json().catch(() => ({})) as { jobs?: MusicJob[]; error?: string };
      if (!jobsResponse.ok) throw new Error(jobsPayload.error || `音频历史加载失败 (HTTP ${jobsResponse.status})`);
      setProjects(library.filter((project) => project.workflowType === "song"));
      setJobs(Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "音乐作品加载失败，请重试。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setSessionLoaded(true);
      return;
    }
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionLoaded(true);
      if (data.session?.access_token) void loadLibrary(data.session.access_token);
    }).catch(() => { if (active) setSessionLoaded(true); });
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.access_token) void loadLibrary(nextSession.access_token);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return projects.filter((project) => !normalized || `${project.title} ${project.genre || ""}`.toLocaleLowerCase().includes(normalized));
  }, [projects, query]);

  const visibleJobs = useMemo(() => jobs.filter((job) => {
    const jobMode = job.musicMode || "song";
    const matchesMode = mode === "all" || jobMode === mode;
    const matchesStatus = status === "all"
      || status === "completed" && job.status === "completed"
      || status === "generating" && ["queued", "reconciling", "generating", "result_ingesting"].includes(job.status)
      || status === "failed" && ["failed", "provider_timeout"].includes(job.status);
    const matchesQuery = !query.trim() || `${job.title || ""} ${job.model || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return matchesMode && matchesStatus && matchesQuery;
  }), [jobs, mode, query, status]);

  async function downloadJob(job: MusicJob) {
    if (!session?.access_token || !job.jobId) return;
    setDownloadError("");
    try {
      const response = await fetch(`/api/audio/jobs/${encodeURIComponent(job.jobId)}/download`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const payload = await response.json().catch(() => ({})) as { downloadUrl?: string; filename?: string; error?: string };
      if (!response.ok || !payload.downloadUrl) throw new Error(payload.error || "下载链接生成失败，请重试。");
      const audioResponse = await fetch(payload.downloadUrl);
      if (!audioResponse.ok) throw new Error("音频文件读取失败，请重试。");
      const objectUrl = URL.createObjectURL(await audioResponse.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = payload.filename || `kiikis-${job.title || "music"}.mp3`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (downloadFailure) {
      setDownloadError(downloadFailure instanceof Error ? downloadFailure.message : "音乐下载失败，请重试。");
    }
  }

  if (!sessionLoaded) return <main className="song-product-page"><div className="song-product-loading">正在打开音乐作品…</div></main>;
  if (!session) return <main className="song-product-page"><SongWorkbenchNav active="library" /><div className="song-product-empty"><h1>请先登录</h1><p>登录后可以查看你的歌曲、纯音乐和音效作品。</p><Link className="primary-button" href="/login">去登录</Link></div></main>;

  return (
    <main className="song-product-page">
      <SongWorkbenchNav active="library" />
      <section className="song-product-content">
        <header className="song-product-heading">
          <div><span className="song-product-kicker">MUSIC LIBRARY</span><h1>我的作品</h1><p>歌曲、纯音乐和音效，都在这里继续创作。</p></div>
          <Link className="primary-button" href="/song-workbench?new=1"><Music2 size={16} />开始创作</Link>
        </header>
        <div className="song-product-filters">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索作品或模型" aria-label="搜索作品或模型" />
          <select value={mode} onChange={(event) => setMode(event.target.value as MusicFilter)} aria-label="筛选音乐类型">{Object.entries(modeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
          <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} aria-label="筛选生成状态">{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
          <button className="secondary-button" type="button" onClick={() => session.access_token && void loadLibrary(session.access_token)} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""} />刷新</button>
        </div>
        {error ? <div className="song-product-notice error" role="alert">{error}</div> : null}
        {downloadError ? <div className="song-product-notice warning" role="alert">{downloadError}</div> : null}
        <section className="song-product-section"><div className="song-product-section-head"><div><span>PROJECTS</span><h2>歌曲项目</h2></div><strong>{visibleProjects.length}</strong></div>
          {loading && !projects.length ? <div className="song-product-empty-inline"><Loader2 className="spin" size={18} />正在加载歌曲项目…</div> : visibleProjects.length ? <div className="song-project-grid">{visibleProjects.map((project) => <article className="song-project-card" key={project.libraryKey || project.id}><div className="song-project-card-art"><Music2 size={24} /></div><div className="song-project-card-copy"><span>{project.genre || "歌曲创作"}</span><h3>{project.title}</h3><p>{new Date(project.updatedAt).toLocaleString()}</p></div><Link className="secondary-button" href={`/song-workbench?projectId=${encodeURIComponent(project.id)}`}><FolderOpen size={15} />继续创作</Link></article>)}</div> : <div className="song-product-empty-inline">还没有歌曲项目，先从一个想法开始。</div>}
        </section>
        <section className="song-product-section"><div className="song-product-section-head"><div><span>GENERATED AUDIO</span><h2>生成音频</h2></div><strong>{visibleJobs.length}</strong></div>
          {loading && !jobs.length ? <div className="song-product-empty-inline"><Loader2 className="spin" size={18} />正在加载生成历史…</div> : visibleJobs.length ? <div className="song-generated-list">{visibleJobs.map((job) => <article className="song-generated-row" key={job.id}><div className="song-generated-icon"><Music2 size={19} /></div><div className="song-generated-copy"><strong>{job.title || `候选 ${job.label}`}</strong><span>{modeLabels[getDisplayMode(job.musicMode)]} · {job.model || "Atlas Cloud"} · {new Date(job.createdAt).toLocaleString()}</span>{job.status === "completed" && job.resultUrl ? <audio controls preload="none" src={job.resultUrl} /> : <small>{job.error || (job.status === "completed" ? "音频文件暂不可用" : "任务处理中")}</small>}</div><div className="song-generated-actions">{job.status === "completed" && job.jobId ? <button className="icon-button" type="button" onClick={() => void downloadJob(job)} title="下载" aria-label={`下载${job.title || `候选 ${job.label}`}`}><Download size={17} /></button> : null}</div></article>)}</div> : <div className="song-product-empty-inline">还没有生成音频。完成内容文档后，在音乐工作台提交生成。</div>}
        </section>
      </section>
    </main>
  );
}
