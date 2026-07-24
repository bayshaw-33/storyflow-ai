"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/useI18n";
import type { Work } from "./types";
import styles from "./profile.module.css";

type WorksGridProps = {
  works: Work[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
};

/**
 * 作品网格：复用 UniverseCard 视觉风格（16:9 封面 + 标题 + 状态）。
 * 3 列（auto-fill minmax 300px，宽屏自然铺满 3+ 列）。
 */
export function WorksGrid({ works, loading, hasMore, onLoadMore }: WorksGridProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  if (loading && works.length === 0) {
    return (
      <div className={styles.loadingState}>
        <span className={styles.spinner} />
        {isZh ? "加载中…" : "Loading…"}
      </div>
    );
  }

  if (works.length === 0) {
    return (
      <div className={styles.emptyState}>
        <strong>{isZh ? "暂无作品" : "No works yet"}</strong>
        <p>{isZh ? "发布的第一部作品会显示在这里。" : "Your first published work will appear here."}</p>
      </div>
    );
  }

  return (
    <div>
      <div className={`${styles.grid} ${styles.worksGrid}`}>
        {works.map((work) => {
          const isActive = work.status === "active" || work.status === "published";
          const initial = (work.title.trim()[0] || "·").toUpperCase();
          const dateLabel = work.updated_at
            ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(work.updated_at))
            : null;
          return (
            <Link key={work.id} href={`/production/${work.id}`} className={styles.workCard}>
              <div className={styles.cover}>
                {work.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={work.cover_url} alt={work.title} loading="lazy" />
                ) : (
                  <div className={styles.coverPlaceholder} aria-hidden="true">{initial}</div>
                )}
                <span className={`${styles.statusPill} ${isActive ? styles.statusPillActive : ""}`}>
                  {isActive ? (isZh ? "已发布" : "Published") : (isZh ? "草稿" : "Draft")}
                </span>
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>{work.title}</h3>
              </div>
              {dateLabel ? (
                <div className={styles.cardFooter}>
                  <span>{isZh ? "更新于" : "Updated"}</span>
                  <span className={styles.updatedAt}>{dateLabel}</span>
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>

      {hasMore ? (
        <div className={styles.loadMoreRow}>
          <button
            type="button"
            className={styles.loadMoreButton}
            onClick={onLoadMore}
            disabled={loading}
          >
            {loading ? (isZh ? "加载中…" : "Loading…") : (isZh ? "加载更多" : "Load more")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
