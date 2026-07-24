"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/useI18n";
import type { Universe } from "./types";
import styles from "./profile.module.css";

type UniversesGridProps = {
  universes: Universe[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
};

/**
 * 宇宙网格：复用 UniverseCard 视觉风格（16:9 封面 + 名称 + 摘要 + 标签）。
 */
export function UniversesGrid({ universes, loading, hasMore, onLoadMore }: UniversesGridProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  if (loading && universes.length === 0) {
    return (
      <div className={styles.loadingState}>
        <span className={styles.spinner} />
        {isZh ? "加载中…" : "Loading…"}
      </div>
    );
  }

  if (universes.length === 0) {
    return (
      <div className={styles.emptyState}>
        <strong>{isZh ? "暂无宇宙" : "No universes yet"}</strong>
        <p>{isZh ? "建立的第一个宇宙会显示在这里。" : "Your first universe will appear here."}</p>
      </div>
    );
  }

  return (
    <div>
      <div className={`${styles.grid} ${styles.universesGrid}`}>
        {universes.map((universe) => {
          const isActive = universe.status === "active";
          const initial = (universe.name.trim()[0] || "·").toUpperCase();
          const dateLabel = universe.updated_at
            ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(universe.updated_at))
            : null;
          return (
            <Link key={universe.id} href={`/universes/${universe.id}`} className={styles.universeCard}>
              <div className={styles.cover}>
                {universe.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={universe.cover_url} alt={universe.name} loading="lazy" />
                ) : (
                  <div className={styles.coverPlaceholder} aria-hidden="true">{initial}</div>
                )}
                <span className={`${styles.statusPill} ${isActive ? styles.statusPillActive : ""}`}>
                  {isActive ? (isZh ? "活跃" : "Active") : (isZh ? "已归档" : "Archived")}
                </span>
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>{universe.name}</h3>
                {universe.card_summary ? <p className={styles.cardSummary}>{universe.card_summary}</p> : null}
                {universe.tags?.length ? (
                  <div className={styles.tags}>
                    {universe.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className={styles.cardTag}>{tag}</span>
                    ))}
                  </div>
                ) : null}
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
