"use client";

// 交付物 8：健康度面板
// 六维度详情，每个维度提供具体待办入口。

import { HeartPulse, ArrowRight } from "lucide-react";
import type { UniverseBundleV2 } from "@/lib/client/v2/universe/types";
import styles from "./universe.module.css";
import { GuideHint } from "./shared";

type TabKey = "overview" | "bible" | "assets" | "works" | "canon" | "inbox" | "relationships" | "health" | "impact";

// 健康度维度详情配置。
type DimensionConfig = {
  key: "canonCompleteness" | "characterCompleteness" | "relationshipTimeline" | "assetCoverage" | "pendingProposals" | "conflicts";
  label: string;
  description: string;
  // 目标 tab + 待办建议。
  targetTab: TabKey;
  actionLabel: string;
  actionHint: string;
};

const DIMENSIONS: DimensionConfig[] = [
  {
    key: "canonCompleteness",
    label: "Canon 完整性",
    description: "已锁定的 Canon Fact 占比，反映世界观稳定程度。",
    targetTab: "canon",
    actionLabel: "查看 Canon Facts",
    actionHint: "建议把核心世界观设定升级为锁定状态，避免被作品继承流程自动覆盖。",
  },
  {
    key: "characterCompleteness",
    label: "角色完整度",
    description: "Canon 状态角色占比，反映主角群稳定程度。",
    targetTab: "assets",
    actionLabel: "查看角色资产",
    actionHint: "把草稿状态的主角升级为 Canon，或拒绝长期备选方案以提升完整度。",
  },
  {
    key: "relationshipTimeline",
    label: "关系时间线",
    description: "Canon 状态关系与时间线事件占比，反映故事脉络清晰度。",
    targetTab: "relationships",
    actionLabel: "查看关系时间线",
    actionHint: "补全主要角色之间的关系，并为关键事件标注 Canon 状态。",
  },
  {
    key: "assetCoverage",
    label: "资产覆盖",
    description: "Canon 状态地点/组织/道具/概念占资产总数比例。",
    targetTab: "assets",
    actionLabel: "查看资产总览",
    actionHint: "审查 draft 与 alternative 资产，确认后升级或拒绝，避免长期悬挂。",
  },
  {
    key: "pendingProposals",
    label: "待处理候选",
    description: "Inbox 中待审与草稿状态候选数量。",
    targetTab: "inbox",
    actionLabel: "进入 Inbox 处理",
    actionHint: "及时处理候选可避免 Canon 漂移。批量操作前请阅读影响摘要。",
  },
  {
    key: "conflicts",
    label: "冲突 / 过期快照",
    description: "Canon Check 发现的冲突数与过期项目快照数之和。",
    targetTab: "impact",
    actionLabel: "查看影响分析",
    actionHint: "对冲突项运行 Canon Check，必要时解锁 Canon Fact 后修订。",
  },
];

export function HealthPanel({
  bundle,
  onNavigate,
}: {
  bundle: UniverseBundleV2;
  onNavigate: (tab: TabKey) => void;
}) {
  const { healthSummary } = bundle;

  return (
    <div>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <HeartPulse size={16} />
            健康度面板
          </h2>
        </div>

        <GuideHint>
          Kiikis 2.0 不使用单一总分，而是从六个独立维度评估 Universe 健康度（对齐 PRD §7.8）。每个维度都有对应的待办入口，点击即可进入处理。
        </GuideHint>

        <div className={styles.healthGrid} style={{ marginTop: 16 }}>
          {DIMENSIONS.map((dim) => {
            const value = healthSummary[dim.key];
            const isPending = dim.key === "pendingProposals" || dim.key === "conflicts";
            const displayValue = isPending ? String(value) : `${Math.round(value * 100)}%`;
            const barWidth = isPending ? Math.min(value * 25, 100) : value * 100;
            const barCls = isPending
              ? value > 3 ? styles.healthBarDanger : value > 0 ? styles.healthBarWarn : styles.healthBarFill
              : value < 0.5 ? styles.healthBarDanger : value < 0.75 ? styles.healthBarWarn : styles.healthBarFill;
            return (
              <div key={dim.key} className={styles.healthCard}>
                <p className={styles.healthLabel}>{dim.label}</p>
                <p className={styles.healthValue}>{displayValue}</p>
                <div className={styles.healthBar}>
                  <div className={`${styles.healthBarFill} ${barCls}`} style={{ width: `${barWidth}%` }} />
                </div>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "10px 0 8px", lineHeight: 1.5 }}>
                  {dim.description}
                </p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: "0 0 10px", lineHeight: 1.5 }}>
                  {dim.actionHint}
                </p>
                <button
                  type="button"
                  className={styles.healthAction}
                  onClick={() => onNavigate(dim.targetTab)}
                >
                  {dim.actionLabel} <ArrowRight size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
