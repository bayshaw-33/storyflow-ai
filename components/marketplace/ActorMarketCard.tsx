"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/useI18n";
import type { MarketActorCard as MarketActorCardModel } from "./types";
import { PriceBadge } from "./PriceBadge";
import styles from "./marketplace.module.css";

type ActorMarketCardProps = {
  actor: MarketActorCardModel;
  onClick?: () => void;
};

/**
 * 市场卡片（用于市场列表）。
 * 复用现有 ActorCard 视觉：3:4 白底特写 + 常驻身份条。
 * 底部叠加：演员名 + PriceBadge。点击跳 `/actors/[actorId]`。
 */
export function ActorMarketCard({ actor, onClick }: ActorMarketCardProps) {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const name = actor.name?.trim() || (isZh ? "未命名演员" : "Untitled actor");
  const initials = (actor.name?.trim()?.slice(0, 2) || "·").toUpperCase();

  const ownerDisplayName =
    actor.owner.display_name?.trim() ||
    actor.owner.username?.trim() ||
    (isZh ? "匿名创作者" : "Anonymous creator");
  const ownerInitial = ownerDisplayName.slice(0, 1).toUpperCase();

  function handleClick() {
    if (onClick) {
      onClick();
      return;
    }
    router.push(`/actors/${actor.id}`);
  }

  return (
    <article
      className={styles.marketCard}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleClick();
        }
      }}
      aria-label={name}
    >
      <div className={styles.marketMedia}>
        <div className={styles.marketPriceWrap}>
          <PriceBadge priceKk={actor.listing_price_kk} />
        </div>
        {actor.primary_asset_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={actor.primary_asset_url} alt={name} loading="lazy" />
        ) : (
          <span className={styles.marketInitials}>{initials}</span>
        )}
      </div>
      <div className={styles.marketIdentity}>
        <h3 className={styles.marketName}>{name}</h3>
        {actor.tagline ? <p className={styles.marketTagline}>{actor.tagline}</p> : null}
        <div className={styles.marketOwner}>
          {actor.owner.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={actor.owner.avatar_url} alt={ownerDisplayName} loading="lazy" />
          ) : (
            <span className={styles.marketOwnerFallback}>{ownerInitial}</span>
          )}
          <span>{ownerDisplayName}</span>
        </div>
      </div>
    </article>
  );
}
