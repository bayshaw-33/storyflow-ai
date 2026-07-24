"use client";

import { zh } from "@/lib/admin/zh";
import { StatCard } from "./StatCard";
import { TrendChart } from "./TrendChart";
import { DistributionChart } from "./DistributionChart";
import styles from "../admin-shell.module.css";

type GenerationsData = {
  textTotal: number;
  textCompleted: number;
  textFailed: number;
  successRate: number;
  jobTypeDistribution: { label: string; count: number }[];
  generationTrend: { date: string; count: number }[];
};

export function GenerationsSection({ data, failed }: { data: GenerationsData | null; failed?: boolean }) {
  if (failed) {
    return (
      <section>
        <h2 className={styles.sectionTitle}>{zh.overview.textTasksTotal}</h2>
        <div className={styles.errorText}>{zh.overview.loadFailed}</div>
      </section>
    );
  }
  if (!data) return null;
  return (
    <section>
      <h2 className={styles.sectionTitle}>{zh.overview.textTasksTotal}</h2>
      <div className={styles.overviewGrid}>
        <StatCard label={zh.overview.textTasksTotal} value={data.textTotal} />
        <StatCard label={zh.overview.successRate} value={`${data.successRate}%`} subText={`${data.textCompleted} 完成`} />
        <StatCard label={zh.overview.failureRate} value={`${data.successRate < 100 ? 100 - data.successRate : 0}%`} subText={`${data.textFailed} 失败`} />
      </div>
      <TrendChart
        title={zh.overview.generationTrend}
        data={data.generationTrend}
        color="#ffd166"
        noDataText={zh.overview.noData}
      />
      <DistributionChart
        title={zh.overview.jobTypeDistribution}
        data={data.jobTypeDistribution}
        noDataText={zh.overview.noData}
      />
    </section>
  );
}
