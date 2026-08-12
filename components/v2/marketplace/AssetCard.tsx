"use client";

import { Image as ImageIcon, Star, Users } from "lucide-react";
import type { MarketplaceAsset } from "@/lib/client/v2/marketplace/types";
import {
  assetTypeLabel,
  formatPrice,
  isLicenseFree,
  isLicensePaid,
} from "@/lib/client/v2/marketplace/filtering";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "./marketplace.module.css";

interface AssetCardProps {
  asset: MarketplaceAsset;
  onClick: (id: string) => void;
}

export function AssetCard({ asset, onClick }: AssetCardProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const free = isLicenseFree(asset.licenseOffer);
  const paid = isLicensePaid(asset.licenseOffer);
  const suspended = asset.status === "suspended";
  const recommended = asset.recommended === true;
  const portraitWarn = asset.portraitBased && asset.rightsStatus !== "confirmed";

  return (
    <div
      className={[
        styles.card,
        suspended ? styles.cardSuspended : "",
        recommended ? styles.cardRecommended : "",
      ].join(" ")}
      onClick={() => onClick(asset.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(asset.id);
        }
      }}
    >
      {/* 缩略图 */}
      <div className={styles.thumb}>
        {asset.thumbnail ? (
          // 占位预览：实际环境加载真实缩略图
          <img
            className={styles.thumbImg}
            src={asset.thumbnail}
            alt={asset.name}
            onError={(e) => {
              (e.currentTarget.style.display = "none");
            }}
          />
        ) : (
          <span>
            <ImageIcon size={20} />
          </span>
        )}
      </div>

      {/* 头部：名称 + 类型 */}
      <div className={styles.cardHead}>
        <h3 className={styles.cardName}>{asset.name}</h3>
        <span className={styles.cardType}>{assetTypeLabel(asset.type, locale)}</span>
      </div>

      {/* 创建者 */}
      <p className={styles.cardCreator}>
        {isZh ? "创建者" : "Creator"}: <strong>{asset.creator.name}</strong>
      </p>

      {/* 标签 */}
      {asset.tags.length > 0 && (
        <div className={styles.cardTags}>
          {asset.tags.slice(0, 4).map((tag) => (
            <span key={tag} className={styles.cardTag}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 推荐与权利标识 */}
      {(recommended || portraitWarn) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {recommended && (
            <span className={styles.recommendTag}>
              <Star size={10} />
              {isZh ? "推荐" : "Recommended"}
            </span>
          )}
          {portraitWarn && (
            <span className={styles.rightsWarn}>
              {isZh ? "肖像待授权" : "Rights pending"}
            </span>
          )}
        </div>
      )}

      {/* 底部：授权方式 + 使用次数 */}
      <div className={styles.cardFoot}>
        <span className={`${styles.priceBadge} ${free ? styles.priceFree : styles.pricePaid}`}>
          {formatPrice(asset.licenseOffer, locale)}
        </span>
        <span className={styles.cardMeta}>
          <Users size={11} />
          {asset.usageCount}
          {isZh ? "次" : " uses"}
        </span>
      </div>

      {/* 状态标识（非 published 时显示） */}
      {asset.status !== "published" && (
        <span
          className={`${styles.statusTag} ${
            asset.status === "ready"
              ? styles.statusReady
              : asset.status === "suspended"
                ? styles.statusSuspended
                : ""
          }`}
        >
          {asset.status}
        </span>
      )}
    </div>
  );
}
