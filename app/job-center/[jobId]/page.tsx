"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";
import type { GenerationJob } from "@/lib/contracts/v2";
import { JobDetail } from "@/components/v2/task-center/JobDetail";

const shellStyle: React.CSSProperties = {
  minHeight: "100dvh",
  padding: 24,
  background: "#070808",
  color: "#f4f7f8",
};

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const jobId = typeof params?.jobId === "string" ? params.jobId : Array.isArray(params?.jobId) ? params.jobId[0] : "";

  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = isZh ? "任务详情 | Kiikis" : "Job Detail | Kiikis";
  }, [isZh]);

  // Auth: redirect to /login if not signed in
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

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const response = await fetch(`/api/v2/jobs/${encodeURIComponent(jobId)}`, { headers });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || isZh ? "加载任务详情失败" : "Failed to load job detail");
      }
      setJob(payload.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "加载任务详情失败" : "Failed to load job detail");
    } finally {
      setLoading(false);
    }
  }, [jobId, session, isZh]);

  useEffect(() => {
    if (session) void fetchJob();
  }, [session, fetchJob]);

  if (!sessionLoaded || (!session && loading)) {
    return (
      <main className="app-shell" style={shellStyle}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <div style={{ height: 200, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="app-shell" style={shellStyle}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <h1 style={{ fontSize: 24, fontWeight: 900 }}>{isZh ? "请先登录" : "Please sign in"}</h1>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{isZh ? "正在跳转到登录页..." : "Redirecting to login..."}</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="app-shell" style={shellStyle}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <div style={{ height: 200, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
        </div>
      </main>
    );
  }

  if (error || !job) {
    return (
      <main className="app-shell" style={shellStyle}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <div style={{
            padding: 24,
            borderRadius: 12,
            background: "rgba(255,139,139,0.06)",
            border: "1px solid rgba(255,139,139,0.2)",
            color: "#ff8b8b",
            fontSize: 14,
            marginBottom: 16,
          }}>
            {error || (isZh ? "未找到该任务" : "Job not found")}
          </div>
          <button
            type="button"
            onClick={() => router.push("/job-center")}
            style={{
              padding: "7px 14px",
              borderRadius: 7,
              border: "1px solid #6de7df",
              background: "transparent",
              color: "#6de7df",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {isZh ? "返回任务中心" : "Back to task center"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <JobDetail
      job={job}
      locale={locale}
      accessToken={session.access_token}
      onUpdated={() => void fetchJob()}
      onBack={() => router.push("/job-center")}
    />
  );
}
