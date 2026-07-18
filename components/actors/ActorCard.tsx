"use client";

import Link from "next/link";
import type { ActorCardModel } from "./actor-view-model";
import styles from "./actors.module.css";

// 模特公司式卡片：白底正面特写，悬停浮出名字 + 标签。
export function ActorCard({ card, badges }: { card: ActorCardModel; badges: { team: string; private: string } }) {
  return (
    <li>
      <Link className={styles.card} href={`/actors/${card.id}`} aria-label={card.name}>
        <span className={styles.cardBadges}>
          <span className={card.visibility === "team" ? `${styles.badge} ${styles.badgeAccent}` : styles.badge}>
            {card.visibility === "team" ? badges.team : badges.private}
          </span>
        </span>
        <span className={styles.cardMedia}>
          {card.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.avatarUrl} alt={card.name} loading="lazy" />
          ) : (
            <span className={styles.cardInitials}>{card.initials}</span>
          )}
        </span>
        <span className={styles.cardOverlay}>
          <strong className={styles.cardName}>{card.name}</strong>
          {card.subtitle ? <span className={styles.cardMeta}>{card.subtitle}</span> : null}
          {card.tags.length ? (
            <span className={styles.tagRow}>
              {card.tags.map((tag) => (
                <span className={styles.tag} key={tag}>
                  {tag}
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
