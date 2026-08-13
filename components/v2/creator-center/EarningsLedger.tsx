"use client";

/**
 * K2-T-10 交付物 5：创建者收益账本。
 *
 * 功能：
 * - 收入记录列表
 * - 平台服务费明细
 * - 净收入汇总
 * - 人工结算状态（明确标注为人工结算，不显示为自动到账）—— PRD §9.6 强制
 * - 结算状态：pending_manual / processing / completed_manual
 * - 用 fixture 模拟收益数据
 *
 * 关键约束（PRD §9.6 强制）：
 * - 所有结算状态均标注为人工结算
 * - manualSettlement 标记恒为 true，UI 显示人工结算标记
 * - 不显示为自动到账
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HandCoins, RefreshCw } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  fetchEarnings,
  isUnauthenticatedError,
} from "@/lib/client/v2/licensing/api";
import type {
  EarningRecord,
  EarningsSummary,
  LicensingStatus,
  SettlementStatus,
} from "@/lib/client/v2/licensing/types";
import { ALL_SETTLEMENT_STATUSES } from "@/lib/client/v2/licensing/types";
import {
  formatAmount,
  formatTime,
  manualSettlementBadge,
  settlementStatusClass,
  settlementStatusLabel,
} from "../licensing/format";
import styles from "./creator-center.module.css";

export function EarningsLedger() {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [session, setSession] = useState<Session | null>(null);
  const [earnings, setEarnings] = useState<EarningRecord[]>([]);
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [status, setStatus] = useState<LicensingStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [statusFilter, setStatusFilter] = useState<SettlementStatus | "all">("all");

  // 监听登录态
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setStatus("empty");
      return;
    }
    let active = true;
    void (async () => {
      try {
        const { data: authData } = await client.auth.getSession();
        if (!active) return;
        setSession(authData.session);
      } catch {
        // ignore
      }
    })();
    const { data: sub } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const result = await fetchEarnings(session?.access_token || null);
      setEarnings(result.earnings);
      setSummary(result.summary);
      setStatus(result.earnings.length === 0 ? "empty" : "ready");
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        setStatus("unauthenticated");
        return;
      }
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isZh
            ? "加载收益账本失败。"
            : "Failed to load earnings.",
      );
      setStatus("error");
    }
  }, [session, isZh]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredEarnings = useMemo(() => {
    if (statusFilter === "all") return earnings;
    return earnings.filter((e) => e.settlementStatus === statusFilter);
  }, [earnings, statusFilter]);

  if (status === "loading") {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <div className={styles.loading}>
            {isZh ? "加载收益账本..." : "Loading earnings..."}
          </div>
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
            {isZh ? "请先登录后查看收益账本。" : "Please log in to view earnings."}
          </p>
          <button
            type="button"
            className={styles.buttonPrimary}
            onClick={() => router.push("/login")}
            style={{ marginTop: 12 }}
          >
            {isZh ? "去登录" : "Log in"}
          </button>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <div className={styles.errorBox}>{errorMsg}</div>
          <button
            type="button"
            className={styles.buttonPrimary}
            onClick={() => void load()}
          >
            <RefreshCw size={12} />
            {isZh ? "重试" : "Retry"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Kiikis 2.0 · Creator Earnings</p>
          <h1 className={styles.title}>
            {isZh ? "创建者收益账本" : "Creator earnings ledger"}
          </h1>
          <p className={styles.subtitle}>
            {isZh
              ? "查看收入记录、平台服务费明细与净收入汇总。"
              : "View earnings records, platform fees and net income summary."}
          </p>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.button}
              onClick={() => void load()}
            >
              <RefreshCw size={12} />
              {isZh ? "刷新" : "Refresh"}
            </button>
          </div>
        </header>

        {/* 人工结算强制标记（PRD §9.6） */}
        <div className={styles.manualBanner}>
          <HandCoins size={14} style={{ flexShrink: 0, marginTop: 1, color: "#ffd166" }} />
          <span>
            <strong>{isZh ? "人工结算" : "Manual settlement"}: </strong>
            {isZh
              ? "所有结算均由人工处理，不显示为自动到账（PRD §9.6 强制）。结算状态包括待人工结算、人工结算处理中、人工结算已完成。"
              : "All settlements are processed manually, never shown as automatic (PRD §9.6). Statuses include pending manual settlement, manual processing, and manual settlement completed."}
          </span>
        </div>

        {/* 汇总卡 */}
        {summary && (
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>
                {isZh ? "总收入" : "Total gross"}
              </p>
              <p className={styles.summaryValue}>
                {formatAmount(summary.totalGross, summary.currency, locale)}
              </p>
              <p className={styles.summaryHint}>
                {isZh ? "所有订单总金额" : "Sum of all order amounts"}
              </p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>
                {isZh ? "平台服务费" : "Platform fee"}
              </p>
              <p
                className={`${styles.summaryValue} ${styles.summaryValueWarning}`}
              >
                -{formatAmount(summary.totalPlatformFee, summary.currency, locale)}
              </p>
              <p className={styles.summaryHint}>
                {isZh ? "已扣除的平台分成" : "Deducted platform share"}
              </p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>
                {isZh ? "净收入" : "Net income"}
              </p>
              <p
                className={`${styles.summaryValue} ${styles.summaryValueSuccess}`}
              >
                {formatAmount(summary.totalNet, summary.currency, locale)}
              </p>
              <p className={styles.summaryHint}>
                {isZh ? "总收入 - 平台服务费" : "Gross - platform fee"}
              </p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>
                {isZh ? "待人工结算" : "Pending manual"}
              </p>
              <p
                className={`${styles.summaryValue} ${styles.summaryValueWarning}`}
              >
                {formatAmount(summary.pendingManualAmount, summary.currency, locale)}
              </p>
              <p className={styles.summaryHint}>
                {isZh ? "等待人工审核入账" : "Awaiting manual confirmation"}
              </p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>
                {isZh ? "人工处理中" : "Processing"}
              </p>
              <p
                className={`${styles.summaryValue} ${styles.summaryValueAccent}`}
              >
                {formatAmount(summary.processingAmount, summary.currency, locale)}
              </p>
              <p className={styles.summaryHint}>
                {isZh ? "人工结算处理中" : "Manual settlement in progress"}
              </p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>
                {isZh ? "人工结算已完成" : "Manual completed"}
              </p>
              <p
                className={`${styles.summaryValue} ${styles.summaryValueSuccess}`}
              >
                {formatAmount(summary.completedManualAmount, summary.currency, locale)}
              </p>
              <p className={styles.summaryHint}>
                {isZh ? "人工结算已完成入账" : "Manually settled"}
              </p>
            </div>
          </div>
        )}

        {/* 状态筛选 */}
        <div className={styles.filterBar}>
          <button
            type="button"
            className={`${styles.chip} ${statusFilter === "all" ? styles.chipActive : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            {isZh ? "全部" : "All"}
            <span className={styles.tabCount}>
              {earnings.length}
            </span>
          </button>
          {ALL_SETTLEMENT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.chip} ${statusFilter === s ? styles.chipActive : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {settlementStatusLabel(s, locale)}
            </button>
          ))}
        </div>

        {/* 收益记录列表 */}
        {filteredEarnings.length === 0 ? (
          <div className={styles.empty}>
            {isZh ? "没有匹配的收益记录。" : "No matching earnings."}
          </div>
        ) : (
          <div className={styles.list}>
            {filteredEarnings.map((earning) => (
              <div key={earning.id} className={styles.card}>
                <div className={styles.cardRow}>
                  <div className={styles.cardHead}>
                    <h3 className={styles.cardTitle}>
                      {earning.assetName}
                    </h3>
                    <p className={styles.cardSubtitle}>
                      {isZh ? "订单" : "Order"}: {earning.orderId}
                      {" · "}
                      {isZh ? "资产" : "Asset"}: {earning.assetId}
                    </p>
                  </div>
                  <span
                    className={`${styles.statusTag} ${styles[settlementStatusClass(earning.settlementStatus)]}`}
                  >
                    {settlementStatusLabel(earning.settlementStatus, locale)}
                    <span className={styles.manualBadge}>
                      {manualSettlementBadge(locale)}
                    </span>
                  </span>
                </div>
                <div className={styles.cardMeta}>
                  <span className={styles.cardMetaItem}>
                    <span className={styles.cardMetaKey}>
                      {isZh ? "总收入" : "Gross"}:
                    </span>
                    <span className={styles.cardMetaVal}>
                      {formatAmount(earning.grossAmount, "CNY", locale)}
                    </span>
                  </span>
                  <span className={styles.cardMetaItem}>
                    <span className={styles.cardMetaKey}>
                      {isZh ? "平台服务费" : "Platform fee"}:
                    </span>
                    <span className={`${styles.cardMetaVal} ${styles.cardMetaValWarning}`}>
                      -{formatAmount(earning.platformFee, "CNY", locale)}
                    </span>
                  </span>
                  <span className={styles.cardMetaItem}>
                    <span className={styles.cardMetaKey}>
                      {isZh ? "净收入" : "Net"}:
                    </span>
                    <span className={`${styles.cardMetaVal} ${styles.cardMetaValSuccess}`}>
                      {formatAmount(earning.netAmount, "CNY", locale)}
                    </span>
                  </span>
                  <span className={styles.cardMetaItem}>
                    <span className={styles.cardMetaKey}>
                      {isZh ? "记录时间" : "Created"}:
                    </span>
                    <span className={styles.cardMetaVal}>
                      {formatTime(earning.createdAt, locale)}
                    </span>
                  </span>
                  {earning.settledAt && (
                    <span className={styles.cardMetaItem}>
                      <span className={styles.cardMetaKey}>
                        {isZh ? "结算时间" : "Settled"}:
                      </span>
                      <span className={styles.cardMetaVal}>
                        {formatTime(earning.settledAt, locale)}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 人工结算再次说明 */}
        <div className={styles.noticeBox}>
          {isZh
            ? "PRD §9.6 强制：本账本所有结算状态均为人工处理，不显示为自动到账。如对结算有疑问，请联系平台。"
            : "PRD §9.6: All settlements in this ledger are processed manually, never shown as automatic. Contact the platform for settlement questions."}
        </div>
      </div>
    </main>
  );
}
