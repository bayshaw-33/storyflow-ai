"use client";

import { zh } from "@/lib/admin/zh";
import { StatCard } from "./StatCard";
import { TrendChart } from "./TrendChart";
import { DistributionChart } from "./DistributionChart";
import styles from "../admin-shell.module.css";

type UsersData = {
  total: number;
  newToday: number;
  banned: number;
  planDistribution: { label: string; count: number }[];
  registrationTrend: { date: string; count: number }[];
};

export function UsersSection({ data, failed }: { data: UsersData | null; failed?: boolean }) {
  if (failed) {
    return (
      <section>
        <h2 className={styles.sectionTitle}>{zh.overview.totalUsers}</h2>
        <div className={styles.errorText}>{zh.overview.loadFailed}</div>
      </section>
    );
  }
  if (!data) return null;
  return (
    <section>
      <h2 className={styles.sectionTitle}>{zh.overview.totalUsers}</h2>
      <div className={styles.overviewGrid}>
        <StatCard label={zh.overview.totalUsers} value={data.total} />
        <StatCard label={zh.overview.newUsersToday} value={data.newToday} />
        <StatCard label={zh.overview.bannedUsers} value={data.banned} />
      </div>
      <TrendChart
        title={zh.overview.registrationTrend}
        data={data.registrationTrend}
        noDataText={zh.overview.noData}
      />
      <DistributionChart
        title={zh.overview.planDistribution}
        data={data.planDistribution}
        noDataText={zh.overview.noData}
      />
    </section>
  );
}
