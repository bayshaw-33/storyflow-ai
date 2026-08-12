"use client";

// 交付物 5：Canon 页
// Canon Fact 列表，支持锁定/解锁，显示 Canon Check 结果入口。

import { useMemo, useState } from "react";
import { Lock, Unlock, ShieldCheck, Loader2, CheckCircle2 } from "lucide-react";
import type { UniverseBundleV2 } from "@/lib/client/v2/universe/types";
import { toggleCanonFactLock } from "@/lib/client/v2/universe/api";
import styles from "./universe.module.css";
import { LockBadge, GuideHint } from "./shared";

type TabKey = "overview" | "bible" | "assets" | "works" | "canon" | "inbox" | "relationships" | "health" | "impact";

export function CanonPanel({
  bundle,
  onNavigate,
}: {
  bundle: UniverseBundleV2;
  onNavigate: (tab: TabKey) => void;
}) {
  const { canonFacts } = bundle;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  // 本地状态副本，用于即时反馈。
  const [localLocks, setLocalLocks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(canonFacts.map((f) => [f.id, f.locked])),
  );

  const lockedCount = useMemo(() => Object.values(localLocks).filter(Boolean).length, [localLocks]);

  async function handleToggle(factId: string, currentLocked: boolean) {
    setPendingId(factId);
    setNotice(null);
    try {
      const result = await toggleCanonFactLock(bundle.universe.id, factId, !currentLocked);
      if (result.success) {
        setLocalLocks((prev) => ({ ...prev, [factId]: !currentLocked }));
        setNotice({ kind: "success", msg: result.message });
      } else {
        setNotice({ kind: "error", msg: result.message });
      }
    } catch (err) {
      setNotice({
        kind: "error",
        msg: err instanceof Error ? err.message : "操作失败",
      });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      {notice ? (
        <div className={`${styles.notice} ${notice.kind === "success" ? styles.noticeSuccess : styles.noticeError}`}>
          {notice.kind === "success" ? <CheckCircle2 size={14} /> : null}
          {notice.msg}
        </div>
      ) : null}

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <Lock size={16} />
            Canon Facts
            <span className={styles.cardCount}>共 {canonFacts.length} 条 · 已锁定 {lockedCount}</span>
          </h2>
          <button
            type="button"
            className={styles.cardLink}
            onClick={() => onNavigate("impact")}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <ShieldCheck size={12} />
            修改前查看影响
          </button>
        </div>

        <GuideHint>
          锁定的 Canon Fact 不可被作品继承流程自动覆盖，必须显式解锁后才能修改。建议对核心世界观设定保持锁定。
        </GuideHint>

        <ul className={styles.list} style={{ marginTop: 12 }}>
          {canonFacts.map((fact) => {
            const locked = localLocks[fact.id] ?? fact.locked;
            return (
              <li key={fact.id} className={styles.row}>
                <div className={styles.rowHeader}>
                  <p className={styles.rowTitle} style={{ flex: 1 }}>{fact.statement}</p>
                  <LockBadge locked={locked} />
                </div>
                <div className={styles.rowMeta}>
                  <span>来源：{fact.source}</span>
                  {fact.references.length > 0 ? (
                    <span>引用 {fact.references.length} 个实体</span>
                  ) : null}
                </div>
                {fact.references.length > 0 ? (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {fact.references.map((ref) => (
                      <span key={ref} className={styles.impactChip}>{ref}</span>
                    ))}
                  </div>
                ) : null}
                <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.buttonSmall}`}
                    onClick={() => void handleToggle(fact.id, locked)}
                    disabled={pendingId === fact.id}
                  >
                    {pendingId === fact.id ? (
                      <Loader2 size={12} className="spin" />
                    ) : locked ? (
                      <Unlock size={12} />
                    ) : (
                      <Lock size={12} />
                    )}
                    {locked ? "解锁" : "锁定"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
