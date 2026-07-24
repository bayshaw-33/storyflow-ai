"use client";

import styles from "../admin-shell.module.css";

type StatCardProps = {
  label: string;
  value: string | number;
  subText?: string;
};

export function StatCard({ label, value, subText }: StatCardProps) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {subText ? (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
          {subText}
        </div>
      ) : null}
    </div>
  );
}
