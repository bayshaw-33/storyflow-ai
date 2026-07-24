"use client";

import { useEffect, useState } from "react";
import { zh } from "@/lib/admin/zh";
import styles from "./admin-shell.module.css";

type Stats = {
  totalUsers: number;
  newUsersToday: number;
  totalGenerations: number;
} | null;

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = (await import("@/lib/supabase/client")).getSupabaseBrowserClient();
        const { data } = await client?.auth.getSession() ?? {};
        const token = data?.session?.access_token;
        if (!token) { if (active) setLoading(false); return; }
        // 概览数据复用 users 列表 meta（Task 6 实现 /admin/api/users 返回 total）
        const res = await fetch("/admin/api/users?page=1&pageSize=1", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!active) return;
        if (res.ok) {
          const payload = await res.json();
          setStats({
            totalUsers: payload.total ?? 0,
            newUsersToday: payload.newToday ?? 0,
            totalGenerations: payload.totalGenerations ?? 0,
          });
        }
      } catch {
        // ignore
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <main>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 8px" }}>{zh.overview.title}</h1>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: "0 0 16px" }}>
        {zh.overview.comingSoon}
      </p>
      {loading ? (
        <p className="subtle">{zh.common.loading}</p>
      ) : stats ? (
        <div className={styles.overviewGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{zh.overview.totalUsers}</div>
            <div className={styles.statValue}>{stats.totalUsers}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{zh.overview.newUsersToday}</div>
            <div className={styles.statValue}>{stats.newUsersToday}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{zh.overview.totalGenerations}</div>
            <div className={styles.statValue}>{stats.totalGenerations}</div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
