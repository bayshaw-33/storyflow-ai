"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";
import { fetchDashboard, isUnauthenticatedError, type FetchDashboardOptions } from "@/lib/client/v2/dashboard/api";
import type { DashboardData, DashboardStatus } from "@/lib/client/v2/dashboard/types";
import type { FixtureName } from "@/lib/client/v2/dashboard/fixtures";
import {
  ContinueCreatingSection,
  KKEntrySection,
  NextStepHint,
  PendingConfirmationsSection,
  QuickStartSection,
  RecentUniversesSection,
  RecentWorksSection,
  RunningJobsSection,
} from "./DashboardSections";
import {
  DashboardSkeleton,
  EmptyDashboard,
  ErrorDashboard,
  UnauthenticatedDashboard,
} from "./DashboardStates";
import { ProjectManagement } from "./ProjectManagement";
import styles from "./dashboard.module.css";

const VALID_FIXTURES: FixtureName[] = ["dashboard", "dashboard-empty", "dashboard-error"];

// 把 URL ?fixture= 参数解析为合法 FixtureName。
function resolveFixtureParam(raw: string | null): FixtureName | null {
  if (!raw) return null;
  return (VALID_FIXTURES as string[]).includes(raw) ? (raw as FixtureName) : null;
}

// 判断 DashboardData 是否为空（所有列表为空）。
function isDashboardEmpty(data: DashboardData): boolean {
  return (
    data.recentProjects.length === 0 &&
    data.pendingConfirmations.length === 0 &&
    data.runningJobs.length === 0 &&
    data.recentUniverses.length === 0 &&
    data.recentWorks.length === 0
  );
}

export function DashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const preview = searchParams.get("preview") === "1";
  const fixtureParam = resolveFixtureParam(searchParams.get("fixture"));
  const previewMode = preview || Boolean(fixtureParam);

  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState<DashboardStatus>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // 监听 Supabase 登录态。
  useEffect(() => {
    if (preview) {
      setSessionLoaded(true);
      return;
    }
    const client = getSupabaseBrowserClient();
    if (!client) {
      setSessionLoaded(true);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const { data: authData } = await client.auth.getSession();
        if (!active) return;
        setSession(authData.session);
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
  }, [preview]);

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const options: FetchDashboardOptions = fixtureParam ? { fixture: fixtureParam } : {};
      const result = await fetchDashboard(session?.access_token || null, options);
      setData(result);
      setStatus(isDashboardEmpty(result) ? "empty" : "ready");
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        setStatus("unauthenticated");
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : isZh ? "加载首页数据失败。" : "Failed to load dashboard.");
      setStatus("error");
    }
  }, [session, fixtureParam, isZh]);

  // 登录态或 fixture 参数变化后触发加载。
  useEffect(() => {
    if (!sessionLoaded) return;
    if (!previewMode && !session) {
      setStatus("unauthenticated");
      return;
    }
    if (!previewMode) {
      setData(null);
      setStatus("ready");
      return;
    }
    void load();
  }, [session, sessionLoaded, previewMode, load]);

  const accountName = useMemo(() => {
    const meta = session?.user?.user_metadata as Record<string, unknown> | undefined;
    const metaName = meta?.display_name || meta?.full_name || meta?.name;
    return (
      (typeof metaName === "string" ? metaName.trim() : "") ||
      session?.user?.email?.split("@")[0] ||
      (isZh ? "作者" : "Writer")
    );
  }, [session, isZh]);

  // 加载中：骨架屏。
  if (status === "loading") {
    return (
      <main className={styles.shell}>
        <DashboardSkeleton />
      </main>
    );
  }

  // 未登录：登录引导。
  if (status === "unauthenticated") {
    return (
      <main className={styles.shell}>
        <UnauthenticatedDashboard onLogin={() => router.push("/login")} />
        <KKEntrySection />
      </main>
    );
  }

  // 错误：错误信息 + 重试。
  if (status === "error") {
    return (
      <main className={styles.shell}>
        <ErrorDashboard message={errorMsg} onRetry={() => void load()} />
        <KKEntrySection />
      </main>
    );
  }

  // 正常工作区使用真实项目库；fixture 只服务显式预览模式。
  if (!previewMode) {
    return <ProjectManagement accessToken={session?.access_token || ""} />;
  }

  // 空数据：首次使用引导。
  if (status === "empty" || !data) {
    return (
      <main className={styles.shell}>
        <EmptyDashboard onCreate={() => router.push("/projects/new-v2")} />
        <KKEntrySection />
      </main>
    );
  }

  // ready：渲染指挥中心。
  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Kiikis 2.0 · Command</p>
            <h1 className={styles.title}>
              {isZh ? "欢迎回来" : "Welcome back"}, {accountName}.
            </h1>
            <p className={styles.subtitle}>
              {isZh ? "你正在做什么、下一步做什么，一目了然。" : "What you're working on and what's next — at a glance."}
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary}`}
              onClick={() => router.push("/projects/new-v2")}
            >
              {isZh ? "新建项目" : "New project"}
            </button>
          </div>
        </header>

        <NextStepHint hint={data.nextStepHint} />

        <div className={styles.grid}>
          <ContinueCreatingSection projects={data.recentProjects} />
          <RunningJobsSection jobs={data.runningJobs} />
          <PendingConfirmationsSection items={data.pendingConfirmations} />
          <RecentUniversesSection universes={data.recentUniverses} />
          <RecentWorksSection works={data.recentWorks} />
          <QuickStartSection />
        </div>
      </div>
      <KKEntrySection />
    </main>
  );
}
