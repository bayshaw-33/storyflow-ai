"use client";

/**
 * K2-T-10 交付物 4：订单状态页。
 *
 * 功能：
 * - 订单列表和详情
 * - 支付状态：pending / paid / refunded / cancelled / failed
 * - 退款和取消入口
 * - 订单证据查看（生成与人工确认记录）
 * - 用 fixture 模拟订单数据（C-09 未完成）
 *
 * 关键约束（PRD §9.6 验收）：
 * - 订单 failed / cancelled / pending 时 Grant 状态不为 active
 * - 详情页显示 grantStatus 字段，便于人工核对
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  cancelOrder,
  fetchOrders,
  isUnauthenticatedError,
  requestRefund,
} from "@/lib/client/v2/licensing/api";
import type {
  LicensingStatus,
  Order,
  OrderStatus,
} from "@/lib/client/v2/licensing/types";
import { ALL_ORDER_STATUSES } from "@/lib/client/v2/licensing/types";
import {
  formatAmount,
  formatTime,
  orderStatusClass,
  orderStatusLabel,
  paymentMethodLabel,
} from "./format";
import styles from "./licensing.module.css";

export function OrderStatus() {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<LicensingStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    setActionError(null);
    try {
      const result = await fetchOrders(session?.access_token || null);
      setOrders(result.orders);
      setStatus(result.orders.length === 0 ? "empty" : "ready");
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        setStatus("unauthenticated");
        return;
      }
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isZh
            ? "加载订单失败。"
            : "Failed to load orders.",
      );
      setStatus("error");
    }
  }, [session, isZh]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredOrders = useMemo(() => {
    if (statusFilter === "all") return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const handleRefund = async (orderId: string) => {
    setActionError(null);
    setActionLoading(orderId);
    try {
      const result = await requestRefund(
        session?.access_token || null,
        orderId,
      );
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? result.order : o)),
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : isZh
            ? "申请退款失败。"
            : "Failed to request refund.",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (orderId: string) => {
    setActionError(null);
    setActionLoading(orderId);
    try {
      const result = await cancelOrder(
        session?.access_token || null,
        orderId,
      );
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? result.order : o)),
      );
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : isZh
            ? "取消订单失败。"
            : "Failed to cancel order.",
      );
    } finally {
      setActionLoading(null);
    }
  };

  if (status === "loading") {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <div className={styles.loading}>
            {isZh ? "加载订单..." : "Loading orders..."}
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
            {isZh ? "请先登录后查看订单。" : "Please log in to view orders."}
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
          <p className={styles.eyebrow}>Kiikis 2.0 · Orders</p>
          <h1 className={styles.title}>
            {isZh ? "订单状态" : "Order status"}
          </h1>
          <p className={styles.subtitle}>
            {isZh
              ? "查看订单状态、支付方式、退款与取消入口、订单证据。"
              : "View order status, payment, refund & cancel, evidence."}
          </p>
          <div className={styles.headerActions} style={{ marginTop: 12 }}>
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

        {/* PRD §9.6 提示 */}
        <div className={styles.noticeBox}>
          {isZh
            ? "PRD §9.6 强制：订单失败不会错误创建 Active Grant。下表中 grantStatus 列显示对应授权状态，仅 paid 订单的 Grant 为 active。"
            : "PRD §9.6: Failed orders do not create Active Grants. The grantStatus column shows the corresponding grant status; only paid orders have active grants."}
        </div>

        {/* 状态筛选 */}
        <div className={styles.filterBar}>
          <button
            type="button"
            className={`${styles.chip} ${statusFilter === "all" ? styles.chipActive : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            {isZh ? "全部" : "All"}
          </button>
          {ALL_ORDER_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.chip} ${statusFilter === s ? styles.chipActive : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {orderStatusLabel(s, locale)}
            </button>
          ))}
        </div>

        {actionError && (
          <div className={styles.errorBox} style={{ marginBottom: 12 }}>
            {actionError}
          </div>
        )}

        {/* 订单列表 */}
        {filteredOrders.length === 0 ? (
          <div className={styles.empty}>
            {isZh ? "没有匹配的订单。" : "No matching orders."}
          </div>
        ) : (
          <div className={styles.cardList}>
            {filteredOrders.map((order) => {
              const expanded = expandedId === order.id;
              const canRefund = order.status === "paid";
              const canCancel = order.status === "pending";
              const grantSafe =
                order.status !== "paid"
                  ? order.grantStatus !== "active"
                  : true;
              return (
                <div key={order.id} className={styles.card}>
                  <div className={styles.cardRow}>
                    <div className={styles.cardHead}>
                      <h3 className={styles.cardTitle}>
                        {isZh ? "订单" : "Order"} #{order.id.slice(-8)}
                      </h3>
                      <p className={styles.cardSubtitle}>
                        {order.assetName}
                      </p>
                    </div>
                    <span
                      className={`${styles.statusTag} ${styles[orderStatusClass(order.status)]}`}
                    >
                      {orderStatusLabel(order.status, locale)}
                    </span>
                  </div>
                  <div className={styles.cardMeta}>
                    <span className={styles.cardMetaItem}>
                      <span className={styles.cardMetaKey}>
                        {isZh ? "金额" : "Amount"}:
                      </span>
                      <span className={styles.cardMetaVal}>
                        {formatAmount(order.amount, order.currency, locale)}
                      </span>
                    </span>
                    <span className={styles.cardMetaItem}>
                      <span className={styles.cardMetaKey}>
                        {isZh ? "支付方式" : "Payment"}:
                      </span>
                      <span className={styles.cardMetaVal}>
                        {paymentMethodLabel(order.paymentMethod, locale)}
                      </span>
                    </span>
                    <span className={styles.cardMetaItem}>
                      <span className={styles.cardMetaKey}>
                        {isZh ? "创建时间" : "Created"}:
                      </span>
                      <span className={styles.cardMetaVal}>
                        {formatTime(order.createdAt, locale)}
                      </span>
                    </span>
                  </div>

                  {/* Grant 状态显示（PRD §9.6 验收点） */}
                  <div className={styles.cardMeta}>
                    <span className={styles.cardMetaItem}>
                      <span className={styles.cardMetaKey}>
                        {isZh ? "授权状态" : "Grant"}:
                      </span>
                      <span
                        className={styles.cardMetaVal}
                        style={{
                          color:
                            order.grantStatus === "active"
                              ? "#7dd181"
                              : order.grantStatus === "cancelled"
                                ? "#ff8b8b"
                                : "#ffd166",
                        }}
                      >
                        {order.grantStatus}
                      </span>
                    </span>
                    {!grantSafe && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "#ff8b8b",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <ShieldAlert size={10} />
                        {isZh
                          ? "数据异常：违反 PRD §9.6"
                          : "Data anomaly: PRD §9.6 violation"}
                      </span>
                    )}
                  </div>

                  {/* 展开详情 */}
                  {expanded && (
                    <div
                      className={styles.summaryBox}
                      style={{ marginTop: 8 }}
                    >
                      <div>
                        <strong>{isZh ? "订单 ID" : "Order ID"}:</strong>{" "}
                        {order.id}
                      </div>
                      <div>
                        <strong>{isZh ? "资产 ID" : "Asset ID"}:</strong>{" "}
                        {order.assetId}
                      </div>
                      <div>
                        <strong>{isZh ? "授权 ID" : "Grant ID"}:</strong>{" "}
                        {order.grantId}
                      </div>
                      <div>
                        <strong>{isZh ? "支付时间" : "Paid at"}:</strong>{" "}
                        {formatTime(order.paidAt, locale)}
                      </div>
                      <div>
                        <strong>{isZh ? "退款时间" : "Refunded at"}:</strong>{" "}
                        {formatTime(order.refundedAt, locale)}
                      </div>
                      <div>
                        <strong>{isZh ? "取消时间" : "Cancelled at"}:</strong>{" "}
                        {formatTime(order.cancelledAt, locale)}
                      </div>
                      <div>
                        <strong>{isZh ? "失败时间" : "Failed at"}:</strong>{" "}
                        {formatTime(order.failedAt, locale)}
                      </div>

                      {/* 订单证据（PRD §9.3：生成与人工确认记录） */}
                      <div style={{ marginTop: 8 }}>
                        <strong>{isZh ? "订单证据" : "Evidence"}:</strong>
                      </div>
                      <div style={{ marginLeft: 8 }}>
                        <div>
                          {isZh ? "支付凭据" : "Payment proof"}:{" "}
                          {order.evidence.paymentProof === "manual_confirmed"
                            ? isZh
                              ? "已人工确认"
                              : "Manual confirmed"
                            : order.evidence.paymentProof === "generated"
                              ? isZh
                                ? "已生成"
                                : "Generated"
                              : isZh
                                ? "缺失"
                                : "Missing"}
                        </div>
                        <div>
                          {isZh ? "生成时间" : "Generated at"}:{" "}
                          {formatTime(order.evidence.generatedAt, locale)}
                        </div>
                        <div>
                          {isZh ? "人工确认时间" : "Manual confirmed at"}:{" "}
                          {formatTime(order.evidence.manualConfirmedAt, locale)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 操作按钮 */}
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() =>
                        setExpandedId(expanded ? null : order.id)
                      }
                    >
                      {expanded
                        ? isZh
                          ? "收起详情"
                          : "Collapse"
                        : isZh
                          ? "展开详情"
                          : "Expand"}
                    </button>
                    {canRefund && (
                      <button
                        type="button"
                        className={styles.buttonDanger}
                        disabled={actionLoading === order.id}
                        onClick={() => {
                          if (
                            window.confirm(
                              isZh
                                ? "确认申请退款？退款后授权将被取消。"
                                : "Request refund? The grant will be cancelled.",
                            )
                          ) {
                            void handleRefund(order.id);
                          }
                        }}
                      >
                        <RotateCcw size={12} />
                        {actionLoading === order.id
                          ? isZh
                            ? "处理中..."
                            : "Processing..."
                          : isZh
                            ? "申请退款"
                            : "Request refund"}
                      </button>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        className={styles.buttonDanger}
                        disabled={actionLoading === order.id}
                        onClick={() => {
                          if (
                            window.confirm(
                              isZh
                                ? "确认取消订单？取消后授权不激活。"
                                : "Cancel order? The grant will not be activated.",
                            )
                          ) {
                            void handleCancel(order.id);
                          }
                        }}
                      >
                        <Ban size={12} />
                        {actionLoading === order.id
                          ? isZh
                            ? "处理中..."
                            : "Processing..."
                          : isZh
                            ? "取消订单"
                            : "Cancel order"}
                      </button>
                    )}
                    {order.status === "paid" && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "#7dd181",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <CheckCircle2 size={10} />
                        {isZh ? "已支付，授权已激活" : "Paid, grant activated"}
                      </span>
                    )}
                    {order.status === "failed" && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "#ff8b8b",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <XCircle size={10} />
                        {isZh
                          ? "失败，授权未激活"
                          : "Failed, grant not activated"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
