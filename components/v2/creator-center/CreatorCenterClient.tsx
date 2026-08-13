"use client";

/**
 * K2-T-10 创建者中心入口客户端。
 *
 * 聚合：
 * - 创建者收益账本（EarningsLedger）
 * - 跳转到资产发布、订单管理、举报争议等入口
 */
import { useRouter } from "next/navigation";
import {
  HandCoins,
  Package,
  ShieldAlert,
  ShoppingBag,
  Plus,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { EarningsLedger } from "./EarningsLedger";
import styles from "./creator-center.module.css";

export function CreatorCenterClient() {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return (
    <>
      {/* 入口卡片网格 */}
      <div
        className={`${styles.shell}`}
        style={{ paddingBottom: 0 }}
      >
        <div className={styles.container}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>Kiikis 2.0 · Creator Center</p>
            <h1 className={styles.title}>
              {isZh ? "创建者中心" : "Creator center"}
            </h1>
            <p className={styles.subtitle}>
              {isZh
                ? "管理你的资产、订单、收益与争议。"
                : "Manage your assets, orders, earnings and disputes."}
            </p>
          </header>

          <div className={styles.entryGrid}>
            <button
              type="button"
              className={styles.entryCard}
              onClick={() => router.push("/business/marketplace/publish")}
            >
              <Plus size={18} className={styles.entryIcon} />
              <h3 className={styles.entryTitle}>
                {isZh ? "发布新资产" : "Publish asset"}
              </h3>
              <p className={styles.entryDesc}>
                {isZh
                  ? "在市场中发布资产，准备授权。"
                  : "Publish assets in marketplace for licensing."}
              </p>
            </button>
            <button
              type="button"
              className={styles.entryCard}
              onClick={() => router.push("/business/marketplace")}
            >
              <Package size={18} className={styles.entryIcon} />
              <h3 className={styles.entryTitle}>
                {isZh ? "我的资产" : "My assets"}
              </h3>
              <p className={styles.entryDesc}>
                {isZh
                  ? "查看市场中的资产与发布状态。"
                  : "View your assets in marketplace."}
              </p>
            </button>
            <button
              type="button"
              className={styles.entryCard}
              onClick={() => router.push("/business/licensing/orders")}
            >
              <ShoppingBag size={18} className={styles.entryIcon} />
              <h3 className={styles.entryTitle}>
                {isZh ? "订单管理" : "Order management"}
              </h3>
              <p className={styles.entryDesc}>
                {isZh
                  ? "查看订单支付与退款状态。"
                  : "View order payment and refund status."}
              </p>
            </button>
            <button
              type="button"
              className={styles.entryCard}
              onClick={() => router.push("/business/licensing/disputes")}
            >
              <ShieldAlert size={18} className={styles.entryIcon} />
              <h3 className={styles.entryTitle}>
                {isZh ? "举报与争议" : "Reports & disputes"}
              </h3>
              <p className={styles.entryDesc}>
                {isZh
                  ? "提交举报，查看争议处理状态。"
                  : "Submit reports, view dispute resolution."}
              </p>
            </button>
          </div>

          {/* 收益账本标题 */}
          <div style={{ marginBottom: 12 }}>
            <p className={styles.sectionEyebrow}>
              <HandCoins size={11} style={{ display: "inline", marginRight: 4 }} />
              {isZh ? "收益账本" : "Earnings ledger"}
            </p>
            <h2 className={styles.sectionTitle} style={{ marginTop: 4 }}>
              {isZh ? "你的收入与结算" : "Your earnings & settlements"}
            </h2>
          </div>
        </div>
      </div>

      {/* 收益账本组件 */}
      <EarningsLedger />
    </>
  );
}
