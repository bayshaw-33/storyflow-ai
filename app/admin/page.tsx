"use client";

import { useCallback, useEffect, useState } from "react";
import { zh } from "@/lib/admin/zh";
import styles from "./admin-shell.module.css";
import { UsersSection } from "./_components/UsersSection";
import { GenerationsSection } from "./_components/GenerationsSection";
import { CreditsSection } from "./_components/CreditsSection";
import { ContentSection } from "./_components/ContentSection";
import { AdminSection } from "./_components/AdminSection";

type StatsData = {
  users: { total: number; newToday: number; banned: number; planDistribution: { label: string; count: number }[]; registrationTrend: { date: string; count: number }[] } | null;
  generations: { textTotal: number; textCompleted: number; textFailed: number; successRate: number; jobTypeDistribution: { label: string; count: number }[]; generationTrend: { date: string; count: number }[] } | null;
  credits: { totalBalance: number; avgBalance: number; lowBalanceUsers: number; monthlyLimitDistribution: { label: string; count: number }[] } | null;
  content: { projectsTotal: number; projectStatusDistribution: { label: string; count: number }[]; episodes: number; scenes: number; characters: number } | null;
  admin: { adminCount: number; roleDistribution: { label: string; count: number }[]; auditLogLast24h: number; aiPromptsCount: number; aiPromptsLastUpdated: string | null } | null;
};

export default function AdminOverviewPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState<7 | 30>(7);

  const getToken = async () => {
    const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
    const { data: sessionData } = await client?.auth.getSession() ?? {};
    return sessionData?.session?.access_token || "";
  };

  const load = useCallback(async (r: 7 | 30) => {
    setLoading(true);
    setFailed(false);
    try {
      const token = await getToken();
      const res = await fetch(`/admin/api/stats?range=${r}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const payload = await res.json();
      setData(payload);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(range); }, [load, range]);

  return (
    <main>
      <div className={styles.dashboardHeader}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{zh.overview.title}</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className={styles.rangeToggle}>
            <button
              type="button"
              className={`${styles.rangeButton} ${range === 7 ? styles.rangeButtonActive : ""}`}
              onClick={() => setRange(7)}
            >
              {zh.overview.range7days}
            </button>
            <button
              type="button"
              className={`${styles.rangeButton} ${range === 30 ? styles.rangeButtonActive : ""}`}
              onClick={() => setRange(30)}
            >
              {zh.overview.range30days}
            </button>
          </div>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void load(range)}
          >
            {zh.overview.refresh}
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.overviewGrid}>
          {[0, 1, 2].map((i) => <div key={i} className={styles.skeletonCard} />)}
        </div>
      ) : failed ? (
        <div className={styles.errorText}>{zh.overview.loadFailed}</div>
      ) : data ? (
        <>
          <UsersSection data={data.users} />
          <GenerationsSection data={data.generations} />
          <CreditsSection data={data.credits} />
          <ContentSection data={data.content} />
          {data.admin ? <AdminSection data={data.admin} /> : null}
        </>
      ) : null}
    </main>
  );
}
