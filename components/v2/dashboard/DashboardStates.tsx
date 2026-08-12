"use client";

import { AlertCircle, CheckCircle2, RefreshCw, Sparkles } from "lucide-react";
import styles from "./dashboard.module.css";
import { useI18n } from "@/lib/i18n/useI18n";

// 加载中：骨架屏。
export function DashboardSkeleton() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Kiikis 2.0 · Command</p>
          <h1 className={styles.title}>{isZh ? "指挥中心" : "Command center"}</h1>
          <p className={styles.subtitle}>{isZh ? "正在加载最近创作与下一步..." : "Loading recent work and next steps..."}</p>
        </div>
      </header>
      <div className={styles.skeleton}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.skeletonCard}>
            <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
            <div className={`${styles.skeletonLine} ${styles.skeletonLineMedium}`} />
            <div className={`${styles.skeletonLine} ${styles.skeletonLineMedium}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

// 空数据：首次使用引导。
export function EmptyDashboard({ onCreate }: { onCreate: () => void }) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Kiikis 2.0 · Command</p>
          <h1 className={styles.title}>{isZh ? "指挥中心" : "Command center"}</h1>
        </div>
      </header>
      <div className={`${styles.card} ${styles.emptyBox}`}>
        <Sparkles size={32} color="#6de7df" />
        <h2 className={styles.emptyTitle}>
          {isZh ? "还没有项目，从这里开始" : "No projects yet — start here"}
        </h2>
        <p className={styles.emptyText}>
          {isZh
            ? "从一个想法、一份剧本或一个制作任务开始。系统会自动建立或绑定 Universe，让作品随创作自然生长。"
            : "Start from an idea, a script, or a production task. Kiikis auto-creates or binds a Universe so your work compounds."}
        </p>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          onClick={onCreate}
        >
          {isZh ? "创建第一个项目" : "Create your first project"}
        </button>
      </div>
    </div>
  );
}

// 错误状态：显示错误信息 + 重试按钮。
export function ErrorDashboard({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Kiikis 2.0 · Command</p>
          <h1 className={styles.title}>{isZh ? "指挥中心" : "Command center"}</h1>
        </div>
      </header>
      <div className={`${styles.card} ${styles.errorBox}`}>
        <AlertCircle size={32} color="#ff8b8b" />
        <h2 className={styles.errorTitle}>
          {isZh ? "首页数据加载失败" : "Failed to load dashboard"}
        </h2>
        <p className={styles.errorMessage}>{message}</p>
        <button type="button" className={styles.button} onClick={onRetry}>
          <RefreshCw size={14} />
          {isZh ? "重试" : "Retry"}
        </button>
      </div>
    </div>
  );
}

// 未登录：显示登录引导。
export function UnauthenticatedDashboard({ onLogin }: { onLogin: () => void }) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Kiikis 2.0 · Command</p>
          <h1 className={styles.title}>{isZh ? "指挥中心" : "Command center"}</h1>
        </div>
      </header>
      <div className={`${styles.card} ${styles.emptyBox}`}>
        <CheckCircle2 size={32} color="#6de7df" />
        <h2 className={styles.emptyTitle}>
          {isZh ? "登录后查看指挥中心" : "Sign in to see your command center"}
        </h2>
        <p className={styles.emptyText}>
          {isZh
            ? "登录后这里会显示你正在做的项目、待确认项、运行中任务和下一步建议。"
            : "After signing in, see your ongoing projects, pending confirmations, running jobs and next steps here."}
        </p>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          onClick={onLogin}
        >
          {isZh ? "去登录" : "Sign in"}
        </button>
      </div>
    </div>
  );
}
