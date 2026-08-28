"use client";

import { RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "./community.module.css";

/**
 * /community 服务未配置状态。
 * 不提供演示内容，避免把配置问题伪装成空 Feed。
 */
export function CommunityPlaceholderClient() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  return (
    <main className={`cosmic-page ${styles.shell}`}>
      <section className={styles.unavailableCard} role="status">
        <span className={styles.unavailableKicker}>{isZh ? "社区连接" : "Community connection"}</span>
        <h1 className={styles.title}>{isZh ? "社区暂时无法加载" : "Community is unavailable"}</h1>
        <p className={styles.unavailableBody}>
          {isZh ? "当前环境还没有配置社区服务。刷新不会创建或覆盖任何作品。" : "The community service is not configured in this environment. Refreshing will not create or overwrite any work."}
        </p>
        <button type="button" className={styles.retryButton} onClick={() => window.location.reload()}>
          <RefreshCw size={14} />
          {isZh ? "重试连接" : "Retry connection"}
        </button>
      </section>
    </main>
  );
}

export default CommunityPlaceholderClient;
