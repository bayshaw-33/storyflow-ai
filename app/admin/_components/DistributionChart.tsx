"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import styles from "../admin-shell.module.css";

type DistributionChartProps = {
  title: string;
  data: { label: string; count: number }[];
  noDataText: string;
};

const BAR_COLORS = ["#6de7df", "#ffd166", "#ff6b6b", "#a78bfa", "#34d399", "#fb923c"];

export function DistributionChart({ title, data, noDataText }: DistributionChartProps) {
  return (
    <div className={styles.chartCard}>
      <div className={styles.sectionTitle} style={{ margin: "0 0 8px" }}>{title}</div>
      {data.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, textAlign: "center", padding: 24 }}>
          {noDataText}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="rgba(255,255,255,0.5)" fontSize={11} />
            <YAxis stroke="rgba(255,255,255,0.5)" fontSize={11} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "#1a1a1a",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "rgba(255,255,255,0.7)" }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((_, idx) => (
                <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
