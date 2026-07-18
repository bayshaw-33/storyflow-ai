"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import type { ActorCardModel } from "./actor-view-model";
import type { ActorLibraryCopy } from "./actor-copy";
import styles from "./actors.module.css";

type Props = {
  card: ActorCardModel;
  copy: ActorLibraryCopy;
};

// 模特公司式卡片：3:4 白底正面特写 + 常驻身份条（姓名 / 状态 / Team/Private / 参演数 / 标签）。
// PRD §7.1：姓名与状态在桌面、键盘焦点、触摸设备上必须可见；hover 仅显示「查看详情」快捷。
export function ActorCard({ card, copy }: Props) {
  const isReady = card.status === "ready";
  const isTeam = card.visibility === "team";
  const statusLabel = isReady ? copy.statusReady : copy.statusDraft;
  const visibilityLabel = isTeam ? copy.teamBadge : copy.privateBadge;
  return (
    <li>
      <Link className={styles.card} href={`/actors/${card.id}`} aria-label={card.name}>
        <span className={styles.cardBadges}>
          <span className={isTeam ? `${styles.badge} ${styles.badgeAccent}` : styles.badge}>{visibilityLabel}</span>
          <span className={isReady ? `${styles.badge} ${styles.badgeReady}` : `${styles.badge} ${styles.badgeDraft}`}>
            {statusLabel}
          </span>
        </span>
        <span className={styles.cardMedia}>
          {card.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.avatarUrl} alt={card.name} loading="lazy" />
          ) : (
            <span className={styles.cardInitials}>{card.initials}</span>
          )}
          <span className={styles.cardQuickAction} aria-hidden="true">
            <Eye size={12} />
            {copy.viewOpen}
          </span>
        </span>
        <span className={styles.cardIdentity}>
          <strong className={styles.cardName}>{card.name}</strong>
          {card.subtitle ? <span className={styles.cardMeta}>{card.subtitle}</span> : null}
          {card.tags.length ? (
            <span className={styles.tagRow}>
              {card.tags.slice(0, 3).map((tag) => (
                <span className={styles.tag} key={tag}>
                  {tag}
                </span>
              ))}
            </span>
          ) : null}
          <span className={styles.cardStatRow}>
            <span className={styles.cardStat}>
              {copy.portrayalsKicker}: <strong>{card.portrayalCount}</strong>
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}
