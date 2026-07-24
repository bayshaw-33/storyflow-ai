"use client";

import { zh } from "@/lib/admin/zh";
import { StatCard } from "./StatCard";
import { DistributionChart } from "./DistributionChart";
import styles from "../admin-shell.module.css";

type AdminData = {
  adminCount: number;
  roleDistribution: { label: string; count: number }[];
  auditLogLast24h: number;
  aiPromptsCount: number;
  aiPromptsLastUpdated: string | null;
};

export function AdminSection({ data }: { data: AdminData | null }) {
  if (!data) return null;
  const lastUpdated = data.aiPromptsLastUpdated
    ? new Date(data.aiPromptsLastUpdated).toLocaleString("zh-CN", { hour12: false })
    : zh.overview.noData;
  return (
    <section>
      <h2 className={styles.sectionTitle}>{zh.overview.adminCount}</h2>
      <div className={styles.overviewGrid}>
        <StatCard label={zh.overview.adminCount} value={data.adminCount} />
        <StatCard label={zh.overview.auditLogLast24h} value={data.auditLogLast24h} />
        <StatCard label={zh.overview.aiPromptsCount} value={data.aiPromptsCount} />
        <StatCard label={zh.overview.aiPromptsLastUpdated} value={lastUpdated} />
      </div>
      <DistributionChart
        title={zh.overview.roleDistribution}
        data={data.roleDistribution}
        noDataText={zh.overview.noData}
      />
    </section>
  );
}
