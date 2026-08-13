"use client";

import { useI18n } from "@/lib/i18n/useI18n";
import styles from "./community.module.css";

/**
 * /community 占位组件 (CM-010)。
 * 在 Gate 4 未通过、feature flag communityBeta=false 或服务未配置时显示。
 */
export function CommunityPlaceholderClient() {
  const { t } = useI18n();
  return (
    <main className={`cosmic-page ${styles.shell}`}>
      <section className={styles.card}>
        <h1 className={styles.title}>{t("community.comingSoon")}</h1>
      </section>
    </main>
  );
}

export default CommunityPlaceholderClient;
