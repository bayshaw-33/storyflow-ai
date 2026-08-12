"use client";

// 交付物 1：概览页
// Universe 基本信息、健康度六维度摘要、最近活动、待处理候选数量。

import { Activity, ArrowRight, Clock, Inbox as InboxIcon } from "lucide-react";
import type { UniverseBundleV2 } from "@/lib/client/v2/universe/types";
import { HEALTH_DIMENSION_KEYS } from "@/lib/client/v2/universe/types";
import styles from "./universe.module.css";
import { GuideHint } from "./shared";

type TabKey = "overview" | "bible" | "assets" | "works" | "canon" | "inbox" | "relationships" | "health" | "impact";

// 健康度维度中文标签映射。
const HEALTH_LABELS_ZH: Record<string, string> = {
  canonCompleteness: "Canon 完整性",
  characterCompleteness: "角色完整度",
  relationshipTimeline: "关系时间线",
  assetCoverage: "资产覆盖",
  pendingProposals: "待处理候选",
  conflicts: "冲突/过期快照",
};

const HEALTH_LABELS_EN: Record<string, string> = {
  canonCompleteness: "Canon completeness",
  characterCompleteness: "Character completeness",
  relationshipTimeline: "Relationship timeline",
  assetCoverage: "Asset coverage",
  pendingProposals: "Pending proposals",
  conflicts: "Conflicts / stale snapshots",
};

// 健康度维度的目标 tab（点击跳转）。
const HEALTH_TARGET_TAB: Record<string, TabKey> = {
  canonCompleteness: "canon",
  characterCompleteness: "assets",
  relationshipTimeline: "relationships",
  assetCoverage: "assets",
  pendingProposals: "inbox",
  conflicts: "health",
};

export function OverviewPanel({
  bundle,
  onNavigate,
}: {
  bundle: UniverseBundleV2;
  onNavigate: (tab: TabKey) => void;
}) {
  const isZh = true; // 默认中文，i18n 由上层 locale 决定，这里简化
  const labels = isZh ? HEALTH_LABELS_ZH : HEALTH_LABELS_EN;
  const { universe, healthSummary, recentActivity, proposals } = bundle;
  const pendingCount = proposals.filter((p) => p.status === "pending_review" || p.status === "draft").length;

  return (
    <div>
      {/* 基本信息卡 */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <Activity size={16} />
            {isZh ? "宇宙基本信息" : "Universe overview"}
          </h2>
        </div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: "0 0 4px" }}>{isZh ? "所有者" : "Owner"}</p>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{universe.owner}</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: "0 0 4px" }}>{isZh ? "创建时间" : "Created"}</p>
            <p style={{ fontSize: 13, margin: 0 }}>{universe.createdAt}</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: "0 0 4px" }}>{isZh ? "最近更新" : "Updated"}</p>
            <p style={{ fontSize: 13, margin: 0 }}>{universe.updatedAt}</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: "0 0 4px" }}>{isZh ? "待处理候选" : "Pending proposals"}</p>
            <p style={{ fontSize: 14, fontWeight: 800, color: pendingCount > 0 ? "#ffd166" : "#6de7df", margin: 0 }}>
              {pendingCount}
            </p>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: "0 0 4px" }}>{isZh ? "核心命题" : "Core premise"}</p>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, color: "#f4f7f8" }}>{universe.corePremise}</p>
        </div>
      </div>

      {/* 健康度摘要 */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            {isZh ? "健康度摘要（六维度）" : "Health summary (6 dimensions)"}
          </h2>
          <button type="button" className={styles.cardLink} onClick={() => onNavigate("health")}>
            {isZh ? "查看详情" : "View details"} <ArrowRight size={12} />
          </button>
        </div>
        <div className={styles.healthGrid}>
          {HEALTH_DIMENSION_KEYS.map((key) => {
            const value = healthSummary[key];
            const isPending = key === "pendingProposals" || key === "conflicts";
            const displayValue = isPending ? String(value) : `${Math.round(value * 100)}%`;
            const barWidth = isPending ? Math.min(value * 25, 100) : value * 100;
            const barCls = isPending
              ? value > 3 ? styles.healthBarDanger : value > 0 ? styles.healthBarWarn : styles.healthBarFill
              : value < 0.5 ? styles.healthBarDanger : value < 0.75 ? styles.healthBarWarn : styles.healthBarFill;
            return (
              <div key={key} className={styles.healthCard}>
                <p className={styles.healthLabel}>{labels[key]}</p>
                <p className={styles.healthValue}>{displayValue}</p>
                <div className={styles.healthBar}>
                  <div className={`${styles.healthBarFill} ${barCls}`} style={{ width: `${barWidth}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <GuideHint>
          {isZh
            ? "点击维度对应的「查看详情」进入健康度面板，每个维度都有具体的待办入口。"
            : "Click 'View details' to open the health panel, where each dimension has its own action entry."}
        </GuideHint>
      </div>

      {/* 最近活动 + 待处理候选入口 */}
      <div className={`${styles.grid} ${styles.gridTwo}`}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <Clock size={16} />
              {isZh ? "最近活动" : "Recent activity"}
            </h2>
          </div>
          <ul className={styles.list}>
            {recentActivity.map((act) => (
              <li key={act.id} className={styles.row}>
                <div className={styles.rowHeader}>
                  <p className={styles.rowTitle} style={{ fontSize: 13 }}>{act.message}</p>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{act.at}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <InboxIcon size={16} />
              {isZh ? "待处理候选" : "Pending proposals"}
            </h2>
            <button type="button" className={styles.cardLink} onClick={() => onNavigate("inbox")}>
              {isZh ? "进入 Inbox" : "Open Inbox"} <ArrowRight size={12} />
            </button>
          </div>
          {pendingCount === 0 ? (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: 0 }}>
              {isZh ? "Inbox 已清空。" : "Inbox is clear."}
            </p>
          ) : (
            <ul className={styles.list}>
              {proposals
                .filter((p) => p.status === "pending_review" || p.status === "draft")
                .slice(0, 4)
                .map((p) => (
                  <li key={p.id} className={styles.row}>
                    <div className={styles.rowHeader}>
                      <p className={styles.rowTitle} style={{ fontSize: 13 }}>{p.title}</p>
                      <span style={{ fontSize: 11, color: "#6de7df" }}>
                        {Math.round(p.confidence * 100)}%
                      </span>
                    </div>
                    <div className={styles.rowMeta}>
                      <span>{p.sourceProject}</span>
                      <span>{p.sourceStep}</span>
                    </div>
                  </li>
                ))}
            </ul>
          )}
          <GuideHint>
            {isZh
              ? "批量接受前会在工具条显示影响摘要，避免一次性引入过多变更。"
              : "Bulk actions show an impact summary in the toolbar before applying."}
          </GuideHint>
        </div>
      </div>
    </div>
  );
}
