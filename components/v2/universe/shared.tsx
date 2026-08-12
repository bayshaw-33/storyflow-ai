"use client";

// Kiikis 2.0 Universe 工作台共享小组件
// 状态徽章 + 折叠区段（渐进式展开） + 字段差异表。

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { UniverseObjectStatus, ProposalFieldDiff } from "@/lib/client/v2/universe/types";
import styles from "./universe.module.css";

// 状态徽章：根据 UniverseObjectStatus 渲染对应颜色。
export function StatusBadge({ status }: { status: UniverseObjectStatus }) {
  const cls = {
    canon: styles.statusCanon,
    draft: styles.statusDraft,
    alternative: styles.statusAlternative,
    deprecated: styles.statusDeprecated,
  }[status];
  return <span className={`${styles.statusBadge} ${cls}`}>{status}</span>;
}

// Canon Fact 锁定状态徽章。
export function LockBadge({ locked }: { locked: boolean }) {
  return (
    <span className={`${styles.statusBadge} ${locked ? styles.statusLocked : styles.statusUnlocked}`}>
      {locked ? "LOCKED" : "UNLOCKED"}
    </span>
  );
}

// 折叠区段：长文内容默认折叠，点击展开。
// 满足"长文内容不直接铺满首页，采用渐进式展开"要求。
export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  count,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        className={styles.collapsibleTrigger}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <ChevronRight size={14} className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} />
          {title}
          {typeof count === "number" ? (
            <span className={styles.tabCount}>{count}</span>
          ) : null}
        </span>
      </button>
      {open ? <div className={styles.collapsibleContent}>{children}</div> : null}
    </div>
  );
}

// 字段差异表（Inbox 候选项的 fieldDiff 渲染）。
export function FieldDiffTable({ diffs }: { diffs: ProposalFieldDiff[] }) {
  if (!diffs.length) {
    return <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>无字段差异。</p>;
  }
  return (
    <table className={styles.diffTable}>
      <thead>
        <tr>
          <th>字段</th>
          <th>原值</th>
          <th>新值</th>
        </tr>
      </thead>
      <tbody>
        {diffs.map((d, i) => (
          <tr key={`${d.path}-${i}`}>
            <td style={{ fontFamily: "ui-monospace, monospace" }}>{d.path}</td>
            <td className={styles.diffBefore}>{String(d.before)}</td>
            <td className={styles.diffAfter}>{String(d.after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 引导提示块。
export function GuideHint({ children }: { children: ReactNode }) {
  return <div className={styles.guideHint}>{children}</div>;
}
