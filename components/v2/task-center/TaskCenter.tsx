"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  cancelJob,
  fetchJobs,
  retryJob,
  USE_FIXTURE,
  type JobsResult,
} from "@/lib/client/v2/jobs/api";
import type {
  JobActionType,
  JobStats,
  JobType,
  UnifiedJob,
} from "@/lib/client/v2/jobs/types";
import {
  ALL_JOB_TYPES,
  STAGE_COLORS,
  STAGE_ORDER,
  groupJobsByStage,
  groupJobsByType,
  isActiveStage,
  jobTypeLabel,
  stageLabel,
} from "@/lib/client/v2/jobs/grouping";
import {
  resolveJobDetailUrl,
} from "@/lib/client/v2/navigation/resolver";
import { TaskCard } from "./TaskCard";
import { TaskFilters, type GroupingDimension } from "./TaskFilters";

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
  letterSpacing: 1,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(24px, 2vw, 34px)",
  fontWeight: 900,
};

const subtitleStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "rgba(255,255,255,0.6)",
  fontSize: 13,
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const sectionStyle: React.CSSProperties = {
  maxWidth: 1760,
  margin: "0 auto",
};

const sectionCardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: 16,
};

const sectionTitleStyle = (color: string): React.CSSProperties => ({
  margin: "0 0 12px",
  fontSize: 15,
  color,
  display: "flex",
  alignItems: "center",
  gap: 8,
});

const listStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
  gap: 12,
};

const noticeStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 10,
  background: "rgba(255,255,255,0.05)",
  color: "#f4f7f8",
  fontSize: 14,
};

const emptyStyle: React.CSSProperties = {
  padding: "48px 24px",
  textAlign: "center",
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  border: "1px dashed rgba(255,255,255,0.12)",
  color: "rgba(255,255,255,0.6)",
};

const sourceBadgeStyle = (source: string): React.CSSProperties => ({
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  border:
    source === "fixture"
      ? "1px solid rgba(255,209,102,0.4)"
      : "1px solid rgba(125,209,129,0.4)",
  color: source === "fixture" ? "#ffd166" : "#7dd181",
});

const skeletonCardStyle: React.CSSProperties = {
  height: 140,
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const retryButtonStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "6px 14px",
  borderRadius: 6,
  border: "1px solid #6de7df",
  background: "transparent",
  color: "#6de7df",
  cursor: "pointer",
  fontSize: 13,
};

const statsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
  fontSize: 12,
  color: "rgba(255,255,255,0.7)",
  marginTop: 4,
};

function statItem(label: string, value: number, color: string): React.ReactNode {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, display: "inline-block" }} />
      {label} <strong style={{ color: "#f4f7f8" }}>{value}</strong>
    </span>
  );
}

export function TaskCenter() {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [jobs, setJobs] = useState<UnifiedJob[]>([]);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string>("fixture");
  const [dimension, setDimension] = useState<GroupingDimension>("stage");
  const [typeFilter, setTypeFilter] = useState<"all" | JobType>("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ jobId: string; action: JobActionType } | null>(null);

  useEffect(() => {
    document.title = isZh ? "任务中心 | Kiikis" : "Task Center | Kiikis";
  }, [isZh]);

  // 认证：未登录跳转 /login
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
    setLoading(true);
    setError(null);
    try {
      const result: JobsResult = await fetchJobs(session?.access_token ?? null);
      setJobs(result.jobs);
      setStats(result.stats);
      setSource(result.source);
      setLastUpdatedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "加载任务列表失败。" : "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, [session, isZh]);

  useEffect(() => {
    if (session) void refresh();
  }, [session, refresh]);

  // 自动刷新：存在活跃任务时每 10s 轮询
  const hasActive = useMemo(() => jobs.some((j) => isActiveStage(j.stage)), [jobs]);
  useEffect(() => {
    if (!session || !hasActive) return;
    const id = setInterval(() => {
      void refresh();
    }, 10000);
    return () => clearInterval(id);
  }, [session, hasActive, refresh]);

  const handleAction = useCallback(
    async (job: UnifiedJob, action: JobActionType) => {
      if (action === "view_detail") {
        // Task 0.3: always navigate to the stable job detail page
        router.push(resolveJobDetailUrl(job.id));
        return;
      }
      setPendingAction({ jobId: job.id, action });
      try {
        if (USE_FIXTURE) {
          // fixture mode: keep legacy local functions
          if (action === "cancel") {
            await cancelJob(job.id, session?.access_token ?? null);
          } else if (action === "retry") {
            await retryJob(job.id, session?.access_token ?? null);
          }
        } else {
          // real mode: PATCH /api/v2/jobs/:id with { action }
          const response = await fetchWithAuthRetry(`/api/v2/jobs/${encodeURIComponent(job.id)}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({ action }),
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(payload?.error || (isZh ? "操作失败。" : "Action failed."));
          }
        }
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : isZh ? "操作失败。" : "Action failed.");
      } finally {
        setPendingAction(null);
      }
    },
    [refresh, router, session, isZh],
  );

  const filteredJobs = useMemo(() => {
    let list = jobs;
    if (typeFilter !== "all") list = list.filter((j) => j.type === typeFilter);
    if (activeOnly) list = list.filter((j) => isActiveStage(j.stage));
    return list;
  }, [jobs, typeFilter, activeOnly]);

  interface GroupSection {
    key: string;
    label: string;
    color: string;
    items: UnifiedJob[];
  }

  const grouped = useMemo<GroupSection[]>(() => {
    if (dimension === "stage") {
      const map = groupJobsByStage(filteredJobs);
      return STAGE_ORDER.filter((s) => map[s].length > 0).map((s) => ({
        key: s,
        label: `${stageLabel(s, locale)} · ${map[s].length}`,
        color: STAGE_COLORS[s],
        items: map[s],
      }));
    }
    if (dimension === "type") {
      const map = groupJobsByType(filteredJobs);
      return ALL_JOB_TYPES.filter((t) => map[t].length > 0).map((t) => ({
        key: t,
        label: `${jobTypeLabel(t, locale)} · ${map[t].length}`,
        color: "#6de7df",
        items: map[t],
      }));
    }
    const map = new Map<string, UnifiedJob[]>();
    for (const j of filteredJobs) {
      const arr = map.get(j.projectName) || [];
      arr.push(j);
      map.set(j.projectName, arr);
    }
    return Array.from(map.entries()).map(([name, list]) => ({
      key: name,
      label: `${name} · ${list.length}`,
      color: "#6de7df",
      items: list,
    }));
  }, [filteredJobs, dimension, locale]);

  // 四种状态
  if (!sessionLoaded || (!session && loading)) {
    return (
      <main className="app-shell" style={shellStyle}>
        <style>{`@keyframes tc-spin { to { transform: rotate(360deg); } } .tc-spin { animation: tc-spin 1s linear infinite; }`}</style>
        <header style={headerStyle}>
          <p style={eyebrowStyle}>Kiikis Task Center</p>
          <h1 style={titleStyle}>{isZh ? "全局任务中心" : "Task Center"}</h1>
        </header>
        <section style={sectionStyle}>
          <div style={listStyle}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={skeletonCardStyle} />
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="app-shell" style={shellStyle}>
        <header style={headerStyle}>
          <h1 style={titleStyle}>{isZh ? "请先登录" : "Please sign in"}</h1>
          <p style={subtitleStyle}>{isZh ? "正在跳转到登录页..." : "Redirecting to login..."}</p>
        </header>
      </main>
    );
  }

  return (
    <main className="app-shell" style={shellStyle}>
      <style>{`@keyframes tc-spin { to { transform: rotate(360deg); } } .tc-spin { animation: tc-spin 1s linear infinite; }`}</style>
      <header style={headerStyle}>
        <p style={eyebrowStyle}>Kiikis Task Center</p>
        <h1 style={titleStyle}>{isZh ? "全局任务中心" : "Global Task Center"}</h1>
        <p style={subtitleStyle}>
          <span>
            {isZh ? "共" : "Total"} <strong style={{ color: "#f4f7f8" }}>{stats?.total ?? jobs.length}</strong> {isZh ? "个任务" : "tasks"}
          </span>
          <span style={sourceBadgeStyle(source)}>
            {source === "fixture" ? (isZh ? "演示数据" : "Fixture") : (isZh ? "实时" : "Live")}
          </span>
          <span>
            {lastUpdatedAt
              ? `${isZh ? "最后更新" : "Last updated"} ${new Date(lastUpdatedAt).toLocaleTimeString(isZh ? "zh-CN" : "en-US")}`
              : isZh ? "等待首次同步" : "Waiting for first sync"}
          </span>
          {USE_FIXTURE && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              {isZh ? "（fixture 模式，不调用真实 API）" : "(fixture mode)"}
            </span>
          )}
        </p>
        {stats && (
          <div style={statsRowStyle}>
            {statItem(isZh ? "生成中" : "Running", stats.byStatus.running || 0, "#6de7df")}
            {statItem(isZh ? "排队" : "Queued", stats.byStatus.queued || 0, "#ffd166")}
            {statItem(isZh ? "已完成" : "Completed", stats.byStatus.completed || 0, "#7dd181")}
            {statItem(isZh ? "部分失败" : "Partial", stats.byStatus.partial_failure || 0, "#ff8b8b")}
            {statItem(isZh ? "失败" : "Failed", stats.byStatus.failed || 0, "#ff8b8b")}
            {statItem(isZh ? "已取消" : "Cancelled", stats.byStatus.cancelled || 0, "rgba(255,255,255,0.5)")}
          </div>
        )}
      </header>

      <section style={sectionStyle}>
        <TaskFilters
          locale={locale}
          dimension={dimension}
          onDimensionChange={setDimension}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          activeOnly={activeOnly}
          onActiveOnlyChange={setActiveOnly}
          onRefresh={() => void refresh()}
          refreshing={loading}
        />

        {error && (
          <div style={{ ...noticeStyle, color: "#ff8b8b", marginBottom: 16 }}>
            {error}
            <div>
              <button type="button" style={retryButtonStyle} onClick={() => void refresh()}>
                {isZh ? "重试" : "Retry"}
              </button>
            </div>
          </div>
        )}

        {loading && jobs.length === 0 ? (
          <div style={listStyle}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={skeletonCardStyle} />
            ))}
          </div>
        ) : filteredJobs.length === 0 && !error ? (
          <div style={emptyStyle}>
            <div style={{ fontSize: 16, marginBottom: 8, color: "#f4f7f8" }}>
              {isZh ? "暂无任务" : "No tasks yet"}
            </div>
            <div>
              {isZh
                ? "创建项目后，生成任务会出现在这里。任务中心跨工作台聚合，离开工作台也可继续查看。"
                : "After you create a project, generation tasks will appear here. The task center aggregates across workbenches."}
            </div>
          </div>
        ) : (
          grouped.map((section) => (
            <div key={section.key} style={sectionCardStyle}>
              <h2 style={sectionTitleStyle(section.color)}>{section.label}</h2>
              <div style={listStyle}>
                {section.items.map((job) => (
                  <TaskCard
                    key={job.id}
                    job={job}
                    locale={locale}
                    onAction={handleAction}
                    pendingAction={pendingAction}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
