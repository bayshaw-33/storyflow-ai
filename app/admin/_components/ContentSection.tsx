"use client";

import { zh } from "@/lib/admin/zh";
import { StatCard } from "./StatCard";
import { DistributionChart } from "./DistributionChart";
import styles from "../admin-shell.module.css";

type ContentData = {
  projectsTotal: number;
  projectStatusDistribution: { label: string; count: number }[];
  episodes: number;
  scenes: number;
  characters: number;
};

export function ContentSection({ data, failed }: { data: ContentData | null; failed?: boolean }) {
  if (failed) {
    return (
      <section>
        <h2 className={styles.sectionTitle}>{zh.overview.projectsTotal}</h2>
        <div className={styles.errorText}>{zh.overview.loadFailed}</div>
      </section>
    );
  }
  if (!data) return null;
  return (
    <section>
      <h2 className={styles.sectionTitle}>{zh.overview.projectsTotal}</h2>
      <div className={styles.overviewGrid}>
        <StatCard label={zh.overview.projectsTotal} value={data.projectsTotal} />
        <StatCard label={zh.overview.episodesTotal} value={data.episodes} />
        <StatCard label={zh.overview.scenesTotal} value={data.scenes} />
        <StatCard label={zh.overview.charactersTotal} value={data.characters} />
      </div>
      <DistributionChart
        title={zh.overview.projectStatusDistribution}
        data={data.projectStatusDistribution}
        noDataText={zh.overview.noData}
      />
    </section>
  );
}
