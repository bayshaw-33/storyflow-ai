"use client";

/**
 * K2-T-10 授权管理主页入口客户端。
 *
 * 聚合 GrantManagement，并提供跳转到 License Offer 编辑器与下单的入口。
 */
import { useRouter } from "next/navigation";
import { Plus, ShoppingBag } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { GrantManagement } from "./GrantManagement";
import styles from "./licensing.module.css";

export function LicensingPageClient() {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return (
    <>
      {/* 快速入口 */}
      <div
        className={styles.container}
        style={{ marginBottom: 24, maxWidth: 1440 }}
      >
        <div className={styles.optionGrid} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          <button
            type="button"
            className={styles.optionCard}
            onClick={() => router.push("/business/marketplace")}
            style={{ minHeight: 80 }}
          >
            <Plus size={14} style={{ color: "#6de7df" }} />
            <div className={styles.optionCardTitle}>
              {isZh ? "发布新资产" : "Publish asset"}
            </div>
            <div className={styles.optionCardDesc}>
              {isZh
                ? "在市场中发布资产，准备授权。"
                : "Publish assets in marketplace for licensing."}
            </div>
          </button>
          <button
            type="button"
            className={styles.optionCard}
            onClick={() => router.push("/business/licensing/orders")}
            style={{ minHeight: 80 }}
          >
            <ShoppingBag size={14} style={{ color: "#6de7df" }} />
            <div className={styles.optionCardTitle}>
              {isZh ? "订单状态" : "Order status"}
            </div>
            <div className={styles.optionCardDesc}>
              {isZh
                ? "查看订单支付与退款状态。"
                : "View order payment and refund status."}
            </div>
          </button>
          <button
            type="button"
            className={styles.optionCard}
            onClick={() => router.push("/business/licensing/disputes")}
            style={{ minHeight: 80 }}
          >
            <Plus size={14} style={{ color: "#6de7df" }} />
            <div className={styles.optionCardTitle}>
              {isZh ? "举报与争议" : "Reports & disputes"}
            </div>
            <div className={styles.optionCardDesc}>
              {isZh
                ? "提交举报，查看争议处理状态。"
                : "Submit reports, view dispute resolution status."}
            </div>
          </button>
        </div>
      </div>
      <GrantManagement />
    </>
  );
}
