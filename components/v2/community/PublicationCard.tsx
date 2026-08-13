"use client";

import { Bookmark, Heart, MessageCircle, Users } from "lucide-react";
import { useState } from "react";
import type { PublicationProjection } from "@/lib/contracts/v2/community";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "@/app/community/community.module.css";

interface PublicationCardProps {
  publication: PublicationProjection;
  /** 当前查看者 ID（匿名则 null，CM-009 权限矩阵） */
  viewerId: string | null;
}

/**
 * Publication 卡片 (Phase 5, CM-005)
 *
 * - CM-005: 展示来源类型/ID、owner、互动计数和允许动作
 * - 不暴露私有 storage path 或敏感信息
 * - CM-003: 关注/反应/收藏幂等 toggle
 * - CM-009: 匿名只读，认证用户可互动
 */
export function PublicationCard({ publication, viewerId }: PublicationCardProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [following, setFollowing] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [reacted, setReacted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canInteract = Boolean(viewerId);

  async function callToggle(endpoint: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; code?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error || (isZh ? "操作失败" : "Action failed"));
      }
      return json;
    } finally {
      setBusy(false);
    }
  }

  async function onToggleFollow() {
    if (!canInteract) return;
    try {
      const json = (await callToggle("/api/v2/community/follows", {
        targetType: "publication",
        targetId: publication.id,
      })) as { following?: boolean };
      setFollowing(json.following === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function onToggleReaction() {
    if (!canInteract) return;
    try {
      const json = (await callToggle("/api/v2/community/reactions", {
        publicationId: publication.id,
        reactionType: "like",
      })) as { reacted?: boolean };
      setReacted(json.reacted === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function onToggleBookmark() {
    if (!canInteract) return;
    try {
      const json = (await callToggle("/api/v2/community/bookmarks", {
        publicationId: publication.id,
      })) as { bookmarked?: boolean };
      setBookmarked(json.bookmarked === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <article className={styles.card}>
      <div className={styles.cardCover}>
        {publication.coverUrl ? (
          // CM-005: cover_url 是发布者公开的封面，非私有 storage path
          <img
            className={styles.cardCoverImg}
            src={publication.coverUrl}
            alt={publication.title}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <span>{isZh ? "无封面" : "No cover"}</span>
        )}
      </div>

      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{publication.title}</h3>
        {publication.summary ? (
          <p className={styles.cardSummary}>{publication.summary}</p>
        ) : null}

        {/* CM-005: 互动计数 */}
        <div className={styles.cardMeta}>
          <span className={styles.metaItem}>
            <Users size={11} />
            {publication.followCount}
          </span>
          <span className={styles.metaItem}>
            <Heart size={11} />
            {publication.reactionCount}
          </span>
          <span className={styles.metaItem}>
            <Bookmark size={11} />
            {publication.bookmarkCount}
          </span>
          <span className={styles.metaItem}>
            <MessageCircle size={11} />
            {publication.commentCount}
          </span>
        </div>
      </div>

      {/* CM-009 权限矩阵: 匿名只读提示；认证用户可互动 */}
      {canInteract ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.actionBtn} ${following ? styles.actionBtnActive : ""}`}
            onClick={onToggleFollow}
            disabled={busy}
            aria-pressed={following}
          >
            <Users size={12} />
            {following ? (isZh ? "已关注" : "Following") : isZh ? "关注" : "Follow"}
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${reacted ? styles.actionBtnActive : ""}`}
            onClick={onToggleReaction}
            disabled={busy}
            aria-pressed={reacted}
          >
            <Heart size={12} />
            {reacted ? (isZh ? "已赞" : "Liked") : isZh ? "赞" : "Like"}
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${bookmarked ? styles.actionBtnActive : ""}`}
            onClick={onToggleBookmark}
            disabled={busy}
            aria-pressed={bookmarked}
          >
            <Bookmark size={12} />
            {bookmarked ? (isZh ? "已收藏" : "Saved") : isZh ? "收藏" : "Save"}
          </button>
        </div>
      ) : (
        <p className={styles.signedOutHint}>
          {isZh ? "登录后可关注、点赞、收藏" : "Sign in to follow, like, and bookmark"}
        </p>
      )}

      {error ? (
        <p className={styles.signedOutHint} role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}

export default PublicationCard;
