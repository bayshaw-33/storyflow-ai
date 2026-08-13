"use client";

// 交付物 6：Inbox 页
// Change Proposal 列表，支持接受/编辑后接受/拒绝/暂缓，批量操作前显示影响摘要。

import { useMemo, useState } from "react";
import { Inbox as InboxIcon, Check, Edit3, X, Clock, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import type { UniverseBundleV2, ChangeProposalEntry, ChangeProposalStatus } from "@/lib/client/v2/universe/types";
import { applyInboxAction, type InboxActionKind } from "@/lib/client/v2/universe/api";
import styles from "./universe.module.css";
import { FieldDiffTable, CollapsibleSection, GuideHint } from "./shared";

type TabKey = "overview" | "bible" | "assets" | "works" | "canon" | "inbox" | "relationships" | "health" | "impact";

const STATUS_LABELS: Record<ChangeProposalStatus, { label: string; color: string }> = {
  draft: { label: "草稿", color: "#ffd166" },
  pending_review: { label: "待审", color: "#6de7df" },
  accepted: { label: "已接受", color: "#6de7df" },
  edited_and_accepted: { label: "编辑后接受", color: "#c792ea" },
  rejected: { label: "已拒绝", color: "#ff8a8a" },
  deferred: { label: "已暂缓", color: "rgba(255,255,255,0.5)" },
};

const STATUS_FILTERS: Array<{ value: "active" | "all" | ChangeProposalStatus; label: string }> = [
  { value: "active", label: "待处理（草稿+待审）" },
  { value: "all", label: "全部" },
  { value: "accepted", label: "已接受" },
  { value: "edited_and_accepted", label: "编辑后接受" },
  { value: "rejected", label: "已拒绝" },
  { value: "deferred", label: "已暂缓" },
];

export function InboxPanel({
  bundle,
  onNavigate,
}: {
  bundle: UniverseBundleV2;
  onNavigate: (tab: TabKey) => void;
}) {
  const { proposals } = bundle;
  const [statusFilter, setStatusFilter] = useState<"active" | "all" | ChangeProposalStatus>("active");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingBulk, setPendingBulk] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  // 本地状态副本，用于即时反馈。
  const [localStatus, setLocalStatus] = useState<Record<string, ChangeProposalStatus>>(() =>
    Object.fromEntries(proposals.map((p) => [p.id, p.status])),
  );

  const filtered = useMemo(() => {
    return proposals.filter((p) => {
      const s = localStatus[p.id] ?? p.status;
      if (statusFilter === "active") return s === "pending_review" || s === "draft";
      if (statusFilter === "all") return true;
      return s === statusFilter;
    });
  }, [proposals, localStatus, statusFilter]);

  const activeCount = proposals.filter((p) => {
    const s = localStatus[p.id] ?? p.status;
    return s === "pending_review" || s === "draft";
  }).length;

  // 批量操作影响摘要：聚合所有选中项的 impactSummary。
  const bulkImpactSummary = useMemo(() => {
    if (selectedIds.size === 0) return "";
    const items = proposals.filter((p) => selectedIds.has(p.id));
    return items.map((p) => `· ${p.title}：${p.impactSummary}`).join("\n");
  }, [selectedIds, proposals]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAction(proposal: ChangeProposalEntry, action: InboxActionKind) {
    setPendingId(proposal.id);
    setNotice(null);
    try {
      const result = await applyInboxAction(bundle.universe.id, proposal.id, action);
      if (result.success) {
        // 本地更新状态：accept → accepted；edit_accept → edited_and_accepted；
        // reject → rejected；defer → deferred。
        const nextStatus: ChangeProposalStatus =
          action === "accept" ? "accepted"
          : action === "edit_accept" ? "edited_and_accepted"
          : action === "reject" ? "rejected"
          : "deferred";
        setLocalStatus((prev) => ({ ...prev, [proposal.id]: nextStatus }));
        setNotice({ kind: "success", msg: result.message });
        // 从选中集合移除。
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(proposal.id);
          return next;
        });
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

  async function handleBulkAction(action: InboxActionKind) {
    if (selectedIds.size === 0) return;
    setPendingBulk(true);
    setNotice(null);
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.all(
        ids.map((id) => {
          const p = proposals.find((x) => x.id === id);
          if (!p) return Promise.resolve({ proposalId: id, action, success: false, message: "未找到" });
          return applyInboxAction(bundle.universe.id, id, action);
        }),
      );
      const failed = results.filter((r) => !r.success);
      const nextStatus: ChangeProposalStatus =
        action === "accept" ? "accepted"
        : action === "edit_accept" ? "edited_and_accepted"
        : action === "reject" ? "rejected"
        : "deferred";
      setLocalStatus((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.success) next[r.proposalId] = nextStatus;
        }
        return next;
      });
      setSelectedIds(new Set());
      if (failed.length === 0) {
        setNotice({
          kind: "success",
          msg: `批量${actionLabel(action)} ${results.length} 项成功（fixture 预览模式）。`,
        });
      } else {
        setNotice({
          kind: "error",
          msg: `${results.length - failed.length} 项成功，${failed.length} 项失败。`,
        });
      }
    } finally {
      setPendingBulk(false);
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
            <InboxIcon size={16} />
            Change Proposals
            <span className={styles.cardCount}>{activeCount} 项待处理 · 共 {proposals.length} 项</span>
          </h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "active" | "all" | ChangeProposalStatus)}
            className={styles.button}
            style={{ padding: "6px 10px", fontSize: 12 }}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value} style={{ background: "#070808" }}>{s.label}</option>
            ))}
          </select>
        </div>

        <GuideHint>
          接受：直接写入 Canon；编辑后接受：先修改字段差异再写入；拒绝：丢弃候选；暂缓：保留待后续处理。批量操作前请仔细阅读影响摘要。
        </GuideHint>

        {/* 批量操作工具条 */}
        {selectedIds.size > 0 ? (
          <div className={styles.bulkBar}>
            <span className={styles.bulkCount}>已选 {selectedIds.size} 项</span>
            <div className={styles.bulkImpact}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <AlertTriangle size={12} style={{ color: "#ffd166" }} />
                <span style={{ color: "#ffd166", fontWeight: 700, fontSize: 11 }}>影响摘要</span>
              </div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 11, color: "rgba(255,255,255,0.7)", fontFamily: "inherit" }}>
                {bulkImpactSummary}
              </pre>
            </div>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonSmall}`}
              onClick={() => void handleBulkAction("accept")}
              disabled={pendingBulk}
            >
              {pendingBulk ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
              批量接受
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonSmall}`}
              onClick={() => void handleBulkAction("defer")}
              disabled={pendingBulk}
            >
              <Clock size={12} />
              批量暂缓
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonDanger} ${styles.buttonSmall}`}
              onClick={() => void handleBulkAction("reject")}
              disabled={pendingBulk}
            >
              <X size={12} />
              批量拒绝
            </button>
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>没有匹配的候选项</p>
            <p className={styles.emptyHint}>尝试切换状态筛选，或前往作品页抽取新的候选项。</p>
          </div>
        ) : (
          <ul className={styles.list}>
            {filtered.map((p) => {
              const s = localStatus[p.id] ?? p.status;
              const sMeta = STATUS_LABELS[s];
              const isSelected = selectedIds.has(p.id);
              const isActive = s === "pending_review" || s === "draft";
              return (
                <li key={p.id} className={styles.row}>
                  <div className={styles.rowHeader}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" }}>
                      {isActive ? (
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                        />
                      ) : null}
                      <p className={styles.rowTitle} style={{ flex: 1 }}>{p.title}</p>
                      <span
                        className={styles.statusBadge}
                        style={{ color: sMeta.color, background: `${sMeta.color}1a`, borderColor: sMeta.color }}
                      >
                        {sMeta.label}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: "#6de7df", fontWeight: 700 }}>
                      {Math.round(p.confidence * 100)}%
                    </span>
                  </div>
                  <div className={styles.rowMeta}>
                    <span>类型：{p.type}</span>
                    <span>来源项目：{p.sourceProject}</span>
                    <span>来源步骤：{p.sourceStep}</span>
                    <span>{p.createdAt}</span>
                  </div>
                  <p className={styles.rowSummary}>{p.originalContent}</p>

                  {/* 影响摘要 */}
                  <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 6, background: "rgba(255,209,102,0.05)", border: "1px solid rgba(255,209,102,0.2)" }}>
                    <p style={{ fontSize: 11, color: "#ffd166", fontWeight: 700, margin: "0 0 4px" }}>影响摘要</p>
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: 0 }}>{p.impactSummary}</p>
                  </div>

                  {/* 字段差异表（折叠） */}
                  <div style={{ marginTop: 8 }}>
                    <CollapsibleSection title="字段差异" count={p.fieldDiff.length}>
                      <FieldDiffTable diffs={p.fieldDiff} />
                    </CollapsibleSection>
                  </div>

                  {/* 操作按钮 */}
                  {isActive ? (
                    <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonSmall}`}
                        onClick={() => void handleAction(p, "accept")}
                        disabled={pendingId === p.id}
                      >
                        {pendingId === p.id ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                        接受
                      </button>
                      <button
                        type="button"
                        className={`${styles.button} ${styles.buttonSmall}`}
                        onClick={() => void handleAction(p, "edit_accept")}
                        disabled={pendingId === p.id}
                      >
                        <Edit3 size={12} />
                        编辑后接受
                      </button>
                      <button
                        type="button"
                        className={`${styles.button} ${styles.buttonSmall}`}
                        onClick={() => void handleAction(p, "defer")}
                        disabled={pendingId === p.id}
                      >
                        <Clock size={12} />
                        暂缓
                      </button>
                      <button
                        type="button"
                        className={`${styles.button} ${styles.buttonDanger} ${styles.buttonSmall}`}
                        onClick={() => void handleAction(p, "reject")}
                        disabled={pendingId === p.id}
                      >
                        <X size={12} />
                        拒绝
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className={`${styles.button} ${styles.buttonSmall}`}
                        onClick={() => void handleAction(p, "defer")}
                      >
                        <Clock size={12} />
                        重新打开
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div style={{ marginTop: 16 }}>
          <GuideHint>
            想从作品抽取新的候选项？在 1.0 视图中选择项目运行「Extract」即可，抽取结果会进入此 Inbox。
          </GuideHint>
        </div>
      </div>
    </div>
  );
}

function actionLabel(action: InboxActionKind): string {
  switch (action) {
    case "accept": return "接受";
    case "edit_accept": return "编辑后接受";
    case "reject": return "拒绝";
    case "defer": return "暂缓";
  }
}
