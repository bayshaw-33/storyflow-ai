"use client";

/**
 * KIIKIS 2.1 Phase 3 — Task 3.5 高风险动作确认对话框 (K21-KK-012)
 *
 * 行为契约：
 *   1. 显示 proposeAction 返回的 KkProposedAction 摘要 + 影响说明 + 倒计时
 *   2. 用户点击「确认」→ 调用 onConfirm(actionId)；LLM 无法绕过此 UI 直接执行
 *   3. 用户点击「取消」→ 调用 onCancel(actionId)；executor 不会被调用，业务状态不变
 *   4. 过期的 action 自动禁用「确认」按钮，引导用户重新发起
 *   5. 锁定状态：confirming / cancelling 中禁用两个按钮，防止重复提交
 *   6. 国际化：zh-CN / en，跟随 useI18n locale
 *
 * 不实现：
 *   - 直接执行 — 必须由调用方注入 onConfirm 回调，回调内部走 server confirmAction
 *   - 倒计时精确到秒 — 显示分钟+秒，过期显示 "已过期"
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clock, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "./kk.module.css";

// ============================================================
// 类型 (与 lib/server/v2/kk/actions.ts 保持形状一致)
// ============================================================

/** 高风险动作类型 (K21-KK-012)。 */
export type KkHighRiskActionType =
  | "publish"
  | "authorize"
  | "payment"
  | "delete"
  | "override_canon";

export type KkProposedActionStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "expired"
  | "executed"
  | "failed";

export interface KkProposedActionView {
  readonly actionId: string;
  readonly actionType: KkHighRiskActionType | string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly risk: "low" | "high";
  readonly summary: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly status: KkProposedActionStatus;
}

export interface KkConfirmationDialogProps {
  /** 待确认动作；为 null 时不渲染 */
  action: KkProposedActionView | null;
  /** confirm 进行中（按钮 loading、禁用） */
  confirming?: boolean;
  /** cancel 进行中（按钮 loading、禁用） */
  cancelling?: boolean;
  /** 错误信息（如服务端拒绝 confirm） */
  error?: string | null;
  /** 用户点击确认 */
  onConfirm: (actionId: string) => void;
  /** 用户点击取消 */
  onCancel: (actionId: string) => void;
  /** 关闭对话框（不触发 confirm/cancel） */
  onClose?: () => void;
}

// ============================================================
// 国际化文案
// ============================================================

const COPY = {
  "zh-CN": {
    title: "确认执行高风险操作",
    warning: "此操作需要你明确确认后才会执行，KK 不会替你自动完成。",
    actionTypeLabel: "操作类型",
    resourceLabel: "目标对象",
    riskLabel: "风险等级",
    riskHigh: "高",
    riskLow: "低",
    summaryLabel: "操作摘要",
    expiryLabel: "剩余时间",
    expired: "已过期",
    seconds: "秒",
    confirmBtn: "确认执行",
    cancelBtn: "取消",
    closeBtn: "关闭",
    confirming: "执行中…",
    cancelling: "取消中…",
    statusPending: "待确认",
    statusConfirmed: "已确认",
    statusCancelled: "已取消",
    statusExpired: "已过期",
    statusExecuted: "已执行",
    statusFailed: "执行失败",
    expiredHint: "此确认已过期，请重新发起操作。",
    errorHint: "执行出错：",
  },
  en: {
    title: "Confirm high-risk action",
    warning: "This action will only run after you explicitly confirm. KK will not auto-execute on your behalf.",
    actionTypeLabel: "Action type",
    resourceLabel: "Target",
    riskLabel: "Risk",
    riskHigh: "High",
    riskLow: "Low",
    summaryLabel: "Summary",
    expiryLabel: "Time left",
    expired: "Expired",
    seconds: "s",
    confirmBtn: "Confirm",
    cancelBtn: "Cancel",
    closeBtn: "Close",
    confirming: "Running…",
    cancelling: "Cancelling…",
    statusPending: "Pending",
    statusConfirmed: "Confirmed",
    statusCancelled: "Cancelled",
    statusExpired: "Expired",
    statusExecuted: "Executed",
    statusFailed: "Failed",
    expiredHint: "This confirmation has expired. Please propose the action again.",
    errorHint: "Error: ",
  },
} as const;

function useCopy() {
  const { locale } = useI18n();
  return COPY[locale === "zh-CN" ? "zh-CN" : "en"];
}

// ============================================================
// 倒计时 hook
// ============================================================

function useRemainingSeconds(expiresAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt) - now;
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor(ms / 1000));
}

function formatRemaining(totalSeconds: number | null, c: typeof COPY["en"]): string {
  if (totalSeconds === null) return "—";
  if (totalSeconds <= 0) return c.expired;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m <= 0) return `${s}${c.seconds}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ============================================================
// 主组件
// ============================================================

export function KkConfirmationDialog({
  action,
  confirming = false,
  cancelling = false,
  error = null,
  onConfirm,
  onCancel,
  onClose,
}: KkConfirmationDialogProps) {
  const c = useCopy();
  const remaining = useRemainingSeconds(action?.expiresAt ?? null);

  // 状态派生
  const isExpired = useMemo(() => {
    if (!action) return false;
    if (action.status === "expired") return true;
    return remaining !== null && remaining <= 0;
  }, [action, remaining]);

  const isTerminal = useMemo(() => {
    if (!action) return false;
    return (
      action.status === "executed" ||
      action.status === "cancelled" ||
      action.status === "failed" ||
      action.status === "confirmed"
    );
  }, [action]);

  const isPending = action?.status === "pending" && !isExpired;
  const buttonsDisabled = confirming || cancelling;

  if (!action) return null;

  return (
    <div
      className={styles.confirmOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kk-confirm-title"
      onClick={(e) => {
        // 点击 overlay 不自动关闭，必须用户主动选 confirm/cancel/close
        e.stopPropagation();
      }}
    >
      <div className={styles.confirmDialog}>
        <header className={styles.confirmHeader}>
          <div className={styles.confirmHeaderLeft}>
            <AlertTriangle size={18} className={styles.confirmWarnIcon} />
            <div>
              <h2 id="kk-confirm-title" className={styles.confirmTitle}>
                {c.title}
              </h2>
              <p className={styles.confirmSub}>
                {statusLabel(action.status, c)} · {action.actionType}
              </p>
            </div>
          </div>
          {onClose ? (
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label={c.closeBtn}
            >
              <X size={16} />
            </button>
          ) : null}
        </header>

        <div className={styles.confirmBody}>
          <p className={styles.confirmWarning}>{c.warning}</p>

          <dl className={styles.confirmGrid}>
            <div className={styles.confirmRow}>
              <dt className={styles.confirmKey}>{c.actionTypeLabel}</dt>
              <dd className={styles.confirmVal}>{action.actionType}</dd>
            </div>
            <div className={styles.confirmRow}>
              <dt className={styles.confirmKey}>{c.resourceLabel}</dt>
              <dd className={styles.confirmVal}>
                <code className={styles.confirmCode}>
                  {action.resourceType}:{action.resourceId}
                </code>
              </dd>
            </div>
            <div className={styles.confirmRow}>
              <dt className={styles.confirmKey}>{c.riskLabel}</dt>
              <dd className={styles.confirmVal}>
                <span
                  className={`${styles.confirmRisk} ${
                    action.risk === "high" ? styles.confirmRiskHigh : styles.confirmRiskLow
                  }`}
                >
                  {action.risk === "high" ? c.riskHigh : c.riskLow}
                </span>
              </dd>
            </div>
            <div className={styles.confirmRow}>
              <dt className={styles.confirmKey}>{c.summaryLabel}</dt>
              <dd className={styles.confirmVal}>{action.summary}</dd>
            </div>
            <div className={styles.confirmRow}>
              <dt className={styles.confirmKey}>{c.expiryLabel}</dt>
              <dd className={styles.confirmVal}>
                <span
                  className={`${styles.confirmExpiry} ${
                    isExpired ? styles.confirmExpiryExpired : ""
                  }`}
                >
                  <Clock size={12} className={styles.confirmExpiryIcon} />
                  {formatRemaining(remaining, c)}
                </span>
              </dd>
            </div>
          </dl>

          {isExpired ? (
            <p className={styles.confirmHint}>{c.expiredHint}</p>
          ) : null}

          {error ? (
            <p className={styles.confirmError}>
              {c.errorHint}
              {error}
            </p>
          ) : null}
        </div>

        <footer className={styles.confirmFooter}>
          <button
            type="button"
            className={`${styles.confirmBtn} ${styles.confirmBtnSecondary}`}
            onClick={() => onCancel(action.actionId)}
            disabled={buttonsDisabled || !isPending}
            aria-label={c.cancelBtn}
          >
            {cancelling ? c.cancelling : c.cancelBtn}
          </button>
          <button
            type="button"
            className={`${styles.confirmBtn} ${styles.confirmBtnPrimary}`}
            onClick={() => onConfirm(action.actionId)}
            disabled={buttonsDisabled || !isPending}
            aria-label={c.confirmBtn}
            autoFocus
          >
            {confirming ? c.confirming : c.confirmBtn}
          </button>
        </footer>
      </div>
    </div>
  );
}

function statusLabel(status: KkProposedActionStatus, c: typeof COPY["en"]): string {
  switch (status) {
    case "pending":
      return c.statusPending;
    case "confirmed":
      return c.statusConfirmed;
    case "cancelled":
      return c.statusCancelled;
    case "expired":
      return c.statusExpired;
    case "executed":
      return c.statusExecuted;
    case "failed":
      return c.statusFailed;
  }
}

// ============================================================
// 批量渲染：多个 pending 一起展示（堆叠只显示第一个 + 计数）
// ============================================================

export interface KkConfirmationQueueProps {
  actions: ReadonlyArray<KkProposedActionView>;
  confirmingId?: string | null;
  cancellingId?: string | null;
  error?: string | null;
  onConfirm: (actionId: string) => void;
  onCancel: (actionId: string) => void;
  onDismiss?: (actionId: string) => void;
}

/**
 * 多个待确认动作时只显示最早的，并提示 "还有 N 个待确认"。
 * 用户处理完一个再切下一个，避免一次性弹 N 个对话框。
 */
export function KkConfirmationQueue({
  actions,
  confirmingId,
  cancellingId,
  error,
  onConfirm,
  onCancel,
  onDismiss,
}: KkConfirmationQueueProps) {
  const sorted = useMemo(() => {
    const pending = actions.filter((a) => a.status === "pending");
    pending.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
    return pending;
  }, [actions]);

  if (sorted.length === 0) return null;

  const head = sorted[0];
  const restCount = sorted.length - 1;

  return (
    <KkConfirmationDialog
      action={head}
      confirming={confirmingId === head.actionId}
      cancelling={cancellingId === head.actionId}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
      onClose={onDismiss ? () => onDismiss(head.actionId) : undefined}
    />
  );
}
