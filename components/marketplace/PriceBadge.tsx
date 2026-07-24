"use client";

import { useI18n } from "@/lib/i18n/useI18n";
import styles from "./marketplace.module.css";

type PriceBadgeProps = {
  /** 演员价格（KK 币）；null 表示免费。 */
  priceKk: number | null;
  /** 是否使用「无背景」的静态变体（用于详情页购买卡等不需要叠加在图片上的场景）。 */
  variant?: "overlay" | "muted";
  className?: string;
};

/**
 * 价格徽标。
 * - 免费：绿色徽标 "免费"
 * - 付费：cyan 徽标 "XX KK"
 */
export function PriceBadge({ priceKk, variant = "overlay", className }: PriceBadgeProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const isFree = priceKk === null || priceKk === 0;

  const label = isFree
    ? isZh ? "免费" : "Free"
    : `${priceKk} KK`;

  const cls = [
    styles.priceBadge,
    isFree ? styles.priceFree : styles.pricePaid,
    variant === "muted" ? styles.priceBadgeMuted : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={cls}>{label}</span>;
}
