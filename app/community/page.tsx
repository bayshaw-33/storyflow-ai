"use client";

import { useI18n } from "@/lib/i18n/useI18n";
import styles from "./community.module.css";

/**
 * /community 静态占位页（阶段 B）。
 * 社区入口暂未开放，仅显示"社区即将开放"提示。
 * 后续阶段（C/D/E）会在此路由接入真正的社区功能。
 */
export default function CommunityComingSoonPage() {
  const { t } = useI18n();
  return (
    <main className={`cosmic-page ${styles.shell}`}>
      <section className={styles.card}>
        <h1 className={styles.title}>{t("community.comingSoon")}</h1>
      </section>
    </main>
  );
}
