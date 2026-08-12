"use client";

// 交付物 4：作品页
// 关联作品列表，显示继承关系和衍生关系。

import { Film, GitBranch, Link2, Copy } from "lucide-react";
import type { UniverseBundleV2, WorkLink } from "@/lib/client/v2/universe/types";
import styles from "./universe.module.css";
import { GuideHint } from "./shared";

const RELATIONSHIP_META: Record<WorkLink["relationship"], { label: string; icon: typeof GitBranch; color: string }> = {
  inherited: { label: "继承", icon: GitBranch, color: "#6de7df" },
  derived: { label: "衍生", icon: Copy, color: "#c792ea" },
  referenced: { label: "引用", icon: Link2, color: "#ffd166" },
};

export function WorksPanel({ bundle }: { bundle: UniverseBundleV2 }) {
  const { works } = bundle;

  return (
    <div>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <Film size={16} />
            关联作品
            <span className={styles.cardCount}>共 {works.length} 个</span>
          </h2>
        </div>
        <ul className={styles.list}>
          {works.map((w) => {
            const meta = RELATIONSHIP_META[w.relationship];
            const Icon = meta.icon;
            return (
              <li key={w.id} className={styles.row}>
                <div className={styles.rowHeader}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <p className={styles.rowTitle}>{w.title}</p>
                    <span
                      className={styles.statusBadge}
                      style={{ color: meta.color, background: `${meta.color}1a`, borderColor: meta.color }}
                    >
                      <Icon size={11} />
                      {meta.label}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{w.type}</span>
                </div>
                <div className={styles.rowMeta}>
                  <span>作品 ID：{w.id}</span>
                  {w.snapshotId ? <span>快照：{w.snapshotId}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>

        <GuideHint>
          继承关系：作品直接使用 Universe 当前 Canon；衍生关系：作品基于某个快照衍生，可独立演化；引用关系：作品仅引用部分设定，不绑定 Canon 更新。
        </GuideHint>
      </div>
    </div>
  );
}
