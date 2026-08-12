"use client";

// 交付物 2：Bible 页
// 核心命题、世界摘要、世界规则列表（可展开详情）。

import { BookOpen } from "lucide-react";
import type { UniverseBundleV2 } from "@/lib/client/v2/universe/types";
import styles from "./universe.module.css";
import { CollapsibleSection, StatusBadge, GuideHint } from "./shared";

export function BiblePanel({ bundle }: { bundle: UniverseBundleV2 }) {
  const { universe, rules } = bundle;
  return (
    <div>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <BookOpen size={16} />
            核心命题
          </h2>
        </div>
        <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0, color: "#f4f7f8" }}>
          {universe.corePremise}
        </p>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>世界摘要</h2>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0, color: "rgba(255,255,255,0.8)" }}>
          {universe.summary}
        </p>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            世界规则
            <span className={styles.cardCount}>共 {rules.length} 条</span>
          </h2>
        </div>
        <ul className={styles.list}>
          {rules.map((rule) => (
            <li key={rule.id} className={styles.row}>
              <div className={styles.rowHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <p className={styles.rowTitle}>{rule.name}</p>
                  <StatusBadge status={rule.status} />
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{rule.mainVersion}</span>
              </div>
              <p className={styles.rowSummary}>{rule.summary}</p>
              <div className={styles.rowMeta}>
                <span>来源：{rule.source}</span>
                {rule.usedBy.length > 0 ? (
                  <span>被 {rule.usedBy.length} 个作品引用</span>
                ) : (
                  <span style={{ color: "rgba(255,209,102,0.7)" }}>暂无作品引用</span>
                )}
              </div>
              {rule.usedBy.length > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <CollapsibleSection title="引用作品列表" count={rule.usedBy.length}>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {rule.usedBy.map((id) => (
                        <li key={id} style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", color: "rgba(255,255,255,0.7)" }}>
                          {id}
                        </li>
                      ))}
                    </ul>
                  </CollapsibleSection>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <GuideHint>
          规则状态为 deprecated 时表示已被新版本替换，不应在新作品中引用；alternative 表示备选方案，需评估后再采用。
        </GuideHint>
      </div>
    </div>
  );
}
