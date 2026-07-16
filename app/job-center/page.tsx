"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  useGenerationJobs,
  type GenerationJob,
  type GenerationJobStatus,
} from "@/lib/production/hooks";

const shellStyle: React.CSSProperties = {
  minHeight: "100dvh",
  padding: 24,
  background: "#070808",
  color: "#f4f7f8",
};

const headerStyle: React.CSSProperties = {
  maxWidth: 1760,
  margin: "0 auto 18px",
};

const eyebrowStyle: React.CSSProperties = {
  margin: "0 0 6px",
  color: "#6de7df",
  fontSize: 13,
  fontWeight: 800,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(24px, 2vw, 34px)",
  fontWeight: 900,
};

const sectionStyle: React.CSSProperties = {
  maxWidth: 1760,
  margin: "0 auto",
};

const cardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: 16,
};

const noticeStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 8,
  background: "rgba(255,255,255,0.05)",
  color: "#f4f7f8",
};

const buttonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "transparent",
  color: "#f4f7f8",
  cursor: "pointer",
  fontSize: 13,
};

const statusOrder: GenerationJobStatus[] = [
  "draft", "pending_confirm", "queued", "generating", "result_ingesting",
  "cancel_requested", "completed", "partial_failure", "failed", "cancelled",
  "moderation_blocked", "expired", "needs_user_action", "provider_timeout",
];

const statusLabels: Record<GenerationJobStatus, string> = {
  draft: "草稿",
  pending_confirm: "待确认",
  queued: "排队中",
  generating: "生成中",
  result_ingesting: "结果入库",
  completed: "已完成",
  partial_failure: "部分失败",
  failed: "已失败",
  cancel_requested: "取消请求中",
  cancelled: "已取消",
  moderation_blocked: "审核拦截",
  expired: "已过期",
  needs_user_action: "需用户操作",
  provider_timeout: "提供商超时",
};

const statusColors: Record<GenerationJobStatus, string> = {
  draft: "rgba(255,255,255,0.4)",
  pending_confirm: "#ffd166",
  queued: "#ffd166",
  generating: "#6de7df",
  result_ingesting: "#6d9eeb",
  cancel_requested: "#ff9f43",
  completed: "#7dd181",
  partial_failure: "#ff8b8b",
  failed: "#ff8b8b",
  cancelled: "rgba(255,255,255,0.5)",
  moderation_blocked: "#c77dff",
  expired: "rgba(255,255,255,0.3)",
  needs_user_action: "#ff9f43",
  provider_timeout: "#ff6b6b",
};

export default function JobCenterPage() {
  return (
    <Suspense fallback={<main style={shellStyle}>加载中...</main>}>
      <JobCenterContent />
    </Suspense>
  );
}

function JobCenterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "draft";
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const jobsApi = useGenerationJobs(session, projectId);

  useEffect(() => {
    document.title = "任务中心 | Kiikis";
  }, []);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setSessionLoaded(true);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const { data } = await client.auth.getSession();
        if (!active) return;
        setSession(data.session);
        setSessionLoaded(true);
      } catch {
        if (active) setSessionLoaded(true);
      }
    })();
    const { data: sub } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (sessionLoaded && !session) {
      router.push("/login");
    }
  }, [sessionLoaded, session, router]);

  const refresh = useCallback(async () => {
    if (!session) return;
    setListError(null);
    try {
      const list = await jobsApi.listJobs({ limit: 100 });
      setJobs(list);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "加载任务列表失败。");
    }
  }, [session, jobsApi]);

  useEffect(() => {
    if (session) void refresh();
  }, [session, refresh]);

  const handleCancel = useCallback(
    async (jobId: string) => {
      setCancellingId(jobId);
      try {
        await jobsApi.cancelJob(jobId);
        await refresh();
      } catch (err) {
        setListError(err instanceof Error ? err.message : "取消任务失败。");
      } finally {
        setCancellingId(null);
      }
    },
    [jobsApi, refresh],
  );

  const handlePollActive = useCallback(async () => {
    if (!session) return;
    setListError(null);
    try {
      await jobsApi.pollActiveJobs();
      await refresh();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "轮询任务失败。");
    }
  }, [session, jobsApi, refresh]);

  const grouped = useMemo(() => {
    const map: Record<GenerationJobStatus, GenerationJob[]> = {
      draft: [],
      pending_confirm: [],
      queued: [],
      generating: [],
      result_ingesting: [],
      completed: [],
      partial_failure: [],
      failed: [],
      cancel_requested: [],
      cancelled: [],
      moderation_blocked: [],
      expired: [],
      needs_user_action: [],
      provider_timeout: [],
    };
    for (const job of jobs) {
      if (map[job.status]) map[job.status].push(job);
    }
    return map;
  }, [jobs]);

  if (!sessionLoaded) {
    return <main style={shellStyle}>加载中...</main>;
  }
  if (!session) {
    return <main style={shellStyle}>请先登录，正在跳转...</main>;
  }

  return (
    <main style={shellStyle}>
      <header style={headerStyle}>
        <p style={eyebrowStyle}>Kiikis Production</p>
        <h1 style={titleStyle}>生成任务中心</h1>
        <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
          项目 ID：{projectId} · 共 {jobs.length} 个任务
        </p>
      </header>
      <section style={sectionStyle}>
        <div style={{ ...cardStyle, display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" style={buttonStyle} onClick={() => void refresh()}>
            刷新列表
          </button>
          <button type="button" style={buttonStyle} onClick={() => void handlePollActive()}>
            轮询进行中任务
          </button>
          {jobsApi.loading && <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>处理中...</span>}
        </div>

        {listError && <div style={{ ...noticeStyle, color: "#ff8b8b", marginBottom: 16 }}>{listError}</div>}
        {jobsApi.error && <div style={{ ...noticeStyle, color: "#ff8b8b", marginBottom: 16 }}>{jobsApi.error}</div>}

        {jobs.length === 0 && !listError && (
          <div style={noticeStyle}>暂无生成任务。</div>
        )}

        {statusOrder.map((status) => {
          const list = grouped[status];
          if (list.length === 0) return null;
          return (
            <div key={status} style={cardStyle}>
              <h2 style={{ margin: "0 0 12px", fontSize: 16, color: statusColors[status] }}>
                {statusLabels[status]} · {list.length}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {list.map((job) => (
                  <div
                    key={job.id}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                      <strong style={{ fontSize: 14 }}>{job.jobType} · {job.provider}</strong>
                      <span style={{ fontSize: 12, color: statusColors[status] }}>{statusLabels[job.status]}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                      {job.prompt.slice(0, 120) || "（无 prompt）"}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                      {job.model ? `模型 ${job.model} · ` : ""}
                      {job.targetType ? `目标 ${job.targetType}` : ""}
                      {job.targetId ? ` ${job.targetId}` : ""}
                      {job.createdAt ? ` · 创建于 ${new Date(job.createdAt).toLocaleString()}` : ""}
                    </div>
                    {job.error && (
                      <div style={{ fontSize: 12, color: "#ff8b8b", marginTop: 4 }}>{job.error}</div>
                    )}
                    {job.resultUrl && (
                      <a
                        href={job.resultUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#6de7df", fontSize: 12, textDecoration: "none", display: "inline-block", marginTop: 4 }}
                      >
                        查看结果 →
                      </a>
                    )}
                    {(job.status === "queued" || job.status === "generating" || job.status === "result_ingesting" || job.status === "pending_confirm") && (
                      <button
                        type="button"
                        style={{ ...buttonStyle, marginTop: 8 }}
                        onClick={() => void handleCancel(job.id)}
                        disabled={cancellingId === job.id}
                      >
                        {cancellingId === job.id ? "取消中..." : "取消任务"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
