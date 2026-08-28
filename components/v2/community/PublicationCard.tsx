"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Bookmark,
  Heart,
  MessageCircle,
  Music2,
  Users,
} from "lucide-react";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { CommunityFeedProjection } from "@/lib/contracts/v2/community";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
import {
  getCommunityContentKind,
  getCommunityContentLabel,
  getPublicationDetailHref,
  getPublicationObjectHref,
} from "@/lib/client/v2/community/view-model";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "@/app/community/community.module.css";

interface PublicationCardProps {
  publication: CommunityFeedProjection;
  viewerId: string | null;
}

export function PublicationCard({ publication, viewerId }: PublicationCardProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const kind = getCommunityContentKind(publication.subjectType);
  const detailHref = getPublicationDetailHref(publication.id);
  const objectHref = getPublicationObjectHref(publication);
  const rightsSummary = publication.rightsSummary || "权利状态未声明";
  const contributionSummary = publication.contributionSummary || "暂无贡献记录";
  const allowedActions = publication.allowedActions;
  const canInteract = Boolean(viewerId);

  const [following, setFollowing] = useState(allowedActions.includes("unfollow"));
  const [bookmarked, setBookmarked] = useState(allowedActions.includes("remove_bookmark"));
  const [reacted, setReacted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function callToggle(endpoint: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchWithAuthRetry(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        following?: boolean;
        reacted?: boolean;
        bookmarked?: boolean;
      };
      if (!response.ok || !json.success) {
        throw new Error(json.error || (isZh ? "操作失败，请重试。" : "Action failed. Please retry."));
      }
      return json;
    } finally {
      setBusy(false);
    }
  }

  async function onToggleFollow() {
    if (!canInteract || !allowedActions.some((action) => action === "follow" || action === "unfollow")) return;
    try {
      const json = await callToggle("/api/v2/community/follows", {
        targetType: "publication",
        targetId: publication.id,
      });
      setFollowing(json.following === true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : isZh ? "关注失败。" : "Follow failed.");
    }
  }

  async function onToggleReaction() {
    if (!canInteract || !allowedActions.includes("react")) return;
    try {
      const json = await callToggle("/api/v2/community/reactions", {
        publicationId: publication.id,
        reactionType: "like",
      });
      setReacted(json.reacted === true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : isZh ? "反应失败。" : "Reaction failed.");
    }
  }

  async function onToggleBookmark() {
    if (!canInteract || !allowedActions.some((action) => action === "bookmark" || action === "remove_bookmark")) return;
    try {
      const json = await callToggle("/api/v2/community/bookmarks", {
        publicationId: publication.id,
      });
      setBookmarked(json.bookmarked === true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : isZh ? "收藏失败。" : "Save failed.");
    }
  }

  return (
    <article className={styles.publicationCard} data-publication-id={publication.id}>
      <div className={styles.cardMedia}>
        <Link
          href={detailHref}
          className={styles.cardMediaLink}
          aria-label={isZh ? `查看 ${publication.title}` : `View ${publication.title}`}
        >
          {publication.coverUrl ? (
            <img
              className={styles.cardCoverImg}
              src={publication.coverUrl}
              alt={publication.title}
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className={styles.coverFallback} aria-hidden="true">
              <Music2 size={24} strokeWidth={1.5} />
              <span>{isZh ? "待展开" : "Open this work"}</span>
            </div>
          )}
          <span className={styles.cardKindBadge}>{getCommunityContentLabel(kind, locale)}</span>
        </Link>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardEyebrow}>
          <span>{isZh ? "公开版本" : "Public version"}</span>
          <time dateTime={publication.createdAt}>{formatDate(publication.createdAt, locale)}</time>
        </div>

        <h2 className={styles.cardTitle}>
          <Link href={detailHref}>{publication.title}</Link>
        </h2>
        {publication.summary ? <p className={styles.cardSummary}>{publication.summary}</p> : null}

        <dl className={styles.cardContext} aria-label={isZh ? "作品上下文" : "Publication context"}>
          <div className={styles.cardContextItem}>
            <dt>{isZh ? "来源工作台" : "Workbench"}</dt>
            <dd>{publication.sourceWorkbench}</dd>
          </div>
          <div className={styles.cardContextItem}>
            <dt>{isZh ? "权利摘要" : "Rights"}</dt>
            <dd>{rightsSummary}</dd>
          </div>
          <div className={styles.cardContextItemWide}>
            <dt>{isZh ? "贡献摘要" : "Contribution"}</dt>
            <dd>{contributionSummary}</dd>
          </div>
        </dl>

        <div className={styles.sourceLine}>
          <span className={styles.sourceMarker} aria-hidden="true" />
          {objectHref ? (
            <Link href={objectHref} className={styles.sourceLink}>
              {sourceLabel(publication.sourceType, isZh)}
              {publication.sourceVersion ? ` · ${publication.sourceVersion}` : ""}
              <ArrowUpRight size={13} />
            </Link>
          ) : (
            <button
              type="button"
              className={styles.sourceDisabled}
              disabled
              title={sourceDisabledReason(publication, isZh)}
            >
              {isZh ? "暂无合法入口" : "No valid source route"}
              {publication.sourceVersion ? ` · ${publication.sourceVersion}` : ""}
            </button>
          )}
        </div>

        <div className={styles.creatorLine}>
          <span className={styles.creatorAvatar} aria-hidden="true">
            {publication.publisherId.slice(0, 1).toUpperCase()}
          </span>
          <span>{isZh ? "创作者" : "Creator"}</span>
          <strong>{publication.publisherId.slice(0, 8)}</strong>
        </div>
      </div>

      <footer className={styles.cardFooter}>
        <div className={styles.cardStats} aria-label={isZh ? "互动数据" : "Engagement metrics"}>
          <span><Heart size={13} />{publication.reactionCount}</span>
          <span><Bookmark size={13} />{publication.bookmarkCount}</span>
          <span><MessageCircle size={13} />{publication.commentCount}</span>
        </div>
        {canInteract ? (
          <div className={styles.cardActions}>
            {allowedActions.some((action) => action === "follow" || action === "unfollow") ? (
              <button type="button" className={following ? styles.actionBtnActive : styles.actionBtn} onClick={() => void onToggleFollow()} disabled={busy} aria-pressed={following}>
                <Users size={13} />{following ? (isZh ? "已关注" : "Following") : isZh ? "关注" : "Follow"}
              </button>
            ) : null}
            {allowedActions.includes("react") ? (
              <button type="button" className={reacted ? styles.actionBtnActive : styles.actionBtn} onClick={() => void onToggleReaction()} disabled={busy} aria-pressed={reacted}>
                <Heart size={13} />{reacted ? (isZh ? "已赞" : "Liked") : isZh ? "赞" : "Like"}
              </button>
            ) : null}
            {allowedActions.some((action) => action === "bookmark" || action === "remove_bookmark") ? (
              <button type="button" className={bookmarked ? styles.actionBtnActive : styles.actionBtn} onClick={() => void onToggleBookmark()} disabled={busy} aria-pressed={bookmarked}>
                <Bookmark size={13} />{bookmarked ? (isZh ? "已收藏" : "Saved") : isZh ? "收藏" : "Save"}
              </button>
            ) : null}
          </div>
        ) : (
          <span className={styles.signInHint}>{isZh ? "登录后可互动" : "Sign in to interact"}</span>
        )}
      </footer>
      {error ? <p className={styles.cardError} role="alert">{error}</p> : null}
    </article>
  );
}

function sourceLabel(sourceType: CommunityFeedProjection["sourceType"], isZh: boolean): string {
  if (sourceType === "universe") return "Universe";
  if (sourceType === "actor") return isZh ? "演员市场" : "Actor market";
  if (sourceType === "asset") return isZh ? "资产市场" : "Asset market";
  return isZh ? "来源作品" : "Source work";
}

function sourceDisabledReason(publication: CommunityFeedProjection, isZh: boolean): string {
  if (publication.subjectType === "milestone" || publication.subjectType === "kk_showcase") {
    return isZh ? "该内容类型暂未建立公开源对象入口。" : "This content type has no public source route yet.";
  }
  return isZh ? "缺少真实 Work 上下文，暂不生成跳转。" : "The real Work context is unavailable, so navigation is disabled.";
}

function formatDate(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale === "zh-CN" ? "刚刚" : "Just now";
  return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export default PublicationCard;
