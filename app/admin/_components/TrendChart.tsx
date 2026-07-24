"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import styles from "../admin-shell.module.css";

type TrendChartProps = {
  title: string;
  data: { date: string; count: number }[];
  color?: string;
  noDataText: string;
};

export function TrendChart({ title, data, color = "#6de7df", noDataText }: TrendChartProps) {
  return (
    <div className={styles.chartCard}>
      <div className={styles.sectionTitle} style={{ margin: "0 0 8px" }}>{title}</div>
      {data.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, textAlign: "center", padding: 24 }}>
          {noDataText}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              stroke="rgba(255,255,255,0.5)"
              fontSize={11}
              tickFormatter={(v: string) => v.slice(5)}
            />
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
            <Line type="monotone" dataKey="count" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
