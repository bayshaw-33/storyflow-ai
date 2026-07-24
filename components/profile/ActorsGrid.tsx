"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/useI18n";
import type { Actor } from "./types";
import styles from "./profile.module.css";

type ActorsGridProps = {
  actors: Actor[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
};

/**
 * 演员网格：复用 ActorCard 视觉风格（3:4 白底正面特写 + 常驻身份条）。
 * 4 列（auto-fill minmax 200px）。
 */
export function ActorsGrid({ actors, loading, hasMore, onLoadMore }: ActorsGridProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  if (loading && actors.length === 0) {
    return (
      <div className={styles.loadingState}>
        <span className={styles.spinner} />
        {isZh ? "加载中…" : "Loading…"}
      </div>
    );
  }

  if (actors.length === 0) {
    return (
      <div className={styles.emptyState}>
        <strong>{isZh ? "暂无演员" : "No actors yet"}</strong>
        <p>{isZh ? "创建的第一个演员会显示在这里。" : "Your first actor will appear here."}</p>
      </div>
    );
  }

  return (
    <div>
      <ul className={`${styles.grid} ${styles.actorsGrid}`}>
        {actors.map((actor) => {
          const isReady = actor.status === "ready";
          const isTeam = actor.visibility === "team";
          const initials = actor.name.trim().slice(0, 2).toUpperCase() || "·";
          return (
            <li key={actor.id}>
              <Link href={`/actors/${actor.id}`} className={styles.actorCard} aria-label={actor.name}>
                <span className={styles.actorBadges}>
                  <span className={`${styles.actorBadge} ${isTeam ? styles.actorBadgeAccent : ""}`}>
                    {isTeam ? (isZh ? "团队" : "Team") : (isZh ? "私有" : "Private")}
                  </span>
                  <span className={`${styles.actorBadge} ${isReady ? styles.actorBadgeAccent : ""}`}>
                    {isReady ? (isZh ? "就绪" : "Ready") : (isZh ? "草稿" : "Draft")}
                  </span>
                </span>
                <span className={styles.actorMedia}>
                  {actor.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={actor.avatar_url} alt={actor.name} loading="lazy" />
                  ) : (
                    <span className={styles.actorInitials}>{initials}</span>
                  )}
                </span>
                <span className={styles.actorIdentity}>
                  <strong className={styles.actorName}>{actor.name}</strong>
                  {actor.subtitle ? <span className={styles.actorMeta}>{actor.subtitle}</span> : null}
                  <span className={styles.actorStatRow}>
                    <span className={styles.actorStat}>
                      {isZh ? "参演" : "Roles"}: <strong>{actor.portrayal_count}</strong>
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

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
