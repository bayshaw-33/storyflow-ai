"use client";

import { zh } from "@/lib/admin/zh";
import { StatCard } from "./StatCard";
import { DistributionChart } from "./DistributionChart";
import styles from "../admin-shell.module.css";

type CreditsData = {
  totalBalance: number;
  avgBalance: number;
  lowBalanceUsers: number;
  monthlyLimitDistribution: { label: string; count: number }[];
};

export function CreditsSection({ data, failed }: { data: CreditsData | null; failed?: boolean }) {
  if (failed) {
    return (
      <section>
        <h2 className={styles.sectionTitle}>{zh.overview.totalBalance}</h2>
        <div className={styles.errorText}>{zh.overview.loadFailed}</div>
      </section>
    );
  }
  if (!data) return null;
  return (
    <section>
      <h2 className={styles.sectionTitle}>{zh.overview.totalBalance}</h2>
      <div className={styles.overviewGrid}>
        <StatCard label={zh.overview.totalBalance} value={data.totalBalance.toLocaleString()} />
        <StatCard label={zh.overview.avgBalance} value={data.avgBalance.toLocaleString()} />
        <StatCard label={zh.overview.lowBalanceUsers} value={data.lowBalanceUsers} />
      </div>
      <DistributionChart
        title={zh.overview.monthlyLimitDistribution}
        data={data.monthlyLimitDistribution}
        noDataText={zh.overview.noData}
      />
    </section>
  );
}
