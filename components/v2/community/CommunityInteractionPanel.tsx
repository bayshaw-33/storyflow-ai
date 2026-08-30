"use client";

import { MessageCircle, Reply, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Comment, CommentProjection } from "@/lib/contracts/v2/comments";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "@/app/community/community.module.css";

interface CommunityInteractionPanelProps {
  publicationId: string;
  viewerId: string | null;
  canComment: boolean;
}

type CommentsResponse = {
  success?: boolean;
  items?: CommentProjection[];
  nextOffset?: number | null;
  hasMore?: boolean;
  error?: string;
};

type CommentResponse = {
  success?: boolean;
  comment?: Comment;
  error?: string;
};

const COMMENT_PAGE_SIZE = 20;

export function CommunityInteractionPanel({
  publicationId,
  viewerId,
  canComment,
}: CommunityInteractionPanelProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [comments, setComments] = useState<CommentProjection[]>([]);
  const [loading, setLoading] = useState(Boolean(viewerId));
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<CommentProjection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pendingKeyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const nextOffsetRef = useRef<number | null>(0);
  const requestInFlightRef = useRef(false);

  const loadComments = useCallback(async (append = false) => {
    if (!viewerId) {
      setComments([]);
      setNextOffset(null);
      nextOffsetRef.current = null;
      setLoading(false);
      return;
    }
    if (requestInFlightRef.current) return;
    const offset = append ? nextOffsetRef.current : 0;
    if (offset === null) return;

    requestInFlightRef.current = true;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuthRetry(
        `/api/v2/community/publications/${encodeURIComponent(publicationId)}/comments?limit=${COMMENT_PAGE_SIZE}&offset=${offset}`,
      );
      const json = (await response.json().catch(() => ({}))) as CommentsResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.error || (isZh ? "评论暂时无法加载。" : "Comments are temporarily unavailable."));
      }
      const incoming = json.items ?? [];
      setComments((current) => append ? appendUnique(current, incoming) : incoming);
      const resolvedNextOffset = json.hasMore ? (json.nextOffset ?? offset + incoming.length) : null;
      setNextOffset(resolvedNextOffset);
      nextOffsetRef.current = resolvedNextOffset;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isZh ? "评论暂时无法加载。" : "Comments are temporarily unavailable."));
    } finally {
      requestInFlightRef.current = false;
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [isZh, publicationId, viewerId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const childrenByParent = useMemo(() => {
    const groups = new Map<string, CommentProjection[]>();
    for (const comment of comments) {
      if (!comment.parentCommentId) continue;
      const children = groups.get(comment.parentCommentId) ?? [];
      children.push(comment);
      groups.set(comment.parentCommentId, children);
    }
    return groups;
  }, [comments]);

  const rootComments = useMemo(
    () => comments.filter((comment) => !comment.parentCommentId),
    [comments],
  );

  function beginReply(comment: CommentProjection) {
    setReplyTo(comment);
    pendingKeyRef.current = null;
  }

  function clearReply() {
    setReplyTo(null);
    pendingKeyRef.current = null;
  }

  async function submitComment() {
    const body = draft.trim();
    if (!viewerId || !canComment || !body || submitting) return;

    const fingerprint = `${replyTo?.id ?? "root"}:${body}`;
    const pending = pendingKeyRef.current;
    const idempotencyKey = pending?.fingerprint === fingerprint ? pending.key : crypto.randomUUID();
    pendingKeyRef.current = { fingerprint, key: idempotencyKey };
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetchWithAuthRetry(
        `/api/v2/community/publications/${encodeURIComponent(publicationId)}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            body,
            parentCommentId: replyTo?.id ?? null,
            idempotencyKey,
          }),
        },
      );
      const json = (await response.json().catch(() => ({}))) as CommentResponse;
      if (!response.ok || !json.success || !json.comment) {
        throw new Error(json.error || "评论发送失败，请重试。");
      }
      setComments((current) => appendUnique(current, [toProjection(json.comment!)]));
      setDraft("");
      clearReply();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "评论发送失败，请重试。");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteComment(comment: CommentProjection) {
    if (!viewerId || comment.authorId !== viewerId || deletingId) return;
    setDeletingId(comment.id);
    setError(null);
    try {
      const response = await fetchWithAuthRetry(
        `/api/v2/community/comments/${encodeURIComponent(comment.id)}`,
        { method: "DELETE", body: JSON.stringify({}) },
      );
      const json = (await response.json().catch(() => ({}))) as CommentResponse;
      if (!response.ok || !json.success || !json.comment) {
        throw new Error(json.error || "删除评论失败，请重试。");
      }
      setComments((current) => current.map((item) => item.id === comment.id ? toProjection(json.comment!) : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除评论失败，请重试。");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className={styles.interactionPanel} aria-label={isZh ? "社区互动" : "Community interactions"}>
      <div className={styles.interactionHeading}>
        <div>
          <span className={styles.panelKicker}>COMMUNITY LOOP</span>
          <h2><MessageCircle size={17} />{isZh ? "评论与回应" : "Comments and replies"}</h2>
        </div>
        <span className={styles.interactionCount}>{comments.length}</span>
      </div>

      {loading ? <p className={styles.interactionStatus}>{isZh ? "正在加载评论…" : "Loading comments…"}</p> : null}
      {!loading && !viewerId ? (
        <div className={styles.interactionLogin}>
          <p>{isZh ? "登录后参与评论和回复。" : "Sign in to comment and reply."}</p>
          <a href="/login" className={styles.interactionLoginLink}>{isZh ? "去登录" : "Sign in"}</a>
        </div>
      ) : null}
      {!loading && viewerId && rootComments.length === 0 ? (
        <p className={styles.interactionStatus}>{isZh ? "还没有回应，留下第一条。" : "No replies yet. Start the conversation."}</p>
      ) : null}
      {!loading && viewerId ? (
        <div className={styles.commentList}>
          {rootComments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              replies={childrenByParent.get(comment.id) ?? []}
              viewerId={viewerId}
              deletingId={deletingId}
              isZh={isZh}
              onReply={beginReply}
              onDelete={deleteComment}
            />
          ))}
          {nextOffset !== null ? (
            <button
              type="button"
              className={styles.loadMoreBtn}
              onClick={() => void loadComments(true)}
              disabled={loadingMore}
            >
              {loadingMore
                ? (isZh ? "加载中…" : "Loading…")
                : (isZh ? "加载更多评论" : "Load more comments")}
            </button>
          ) : null}
        </div>
      ) : null}

      {viewerId && canComment ? (
        <div className={styles.commentComposer}>
          {replyTo ? (
            <div className={styles.replyContext}>
              <span>{isZh ? "回复" : "Reply to"} {replyTo.authorId.slice(0, 8)}</span>
              <button type="button" onClick={clearReply}>{isZh ? "取消回复" : "Cancel"}</button>
            </div>
          ) : null}
          <textarea
            aria-label={isZh ? "评论" : "Comment"}
            value={draft}
            maxLength={2000}
            onChange={(event) => {
              setDraft(event.target.value);
              pendingKeyRef.current = null;
            }}
            placeholder={isZh ? "说点什么，继续这件作品…" : "Add to the conversation…"}
          />
          <div className={styles.commentComposerFooter}>
            <span>{draft.length}/2000</span>
            <button type="button" onClick={() => void submitComment()} disabled={submitting || !draft.trim()}>
              <Send size={14} />{submitting ? (isZh ? "发送中…" : "Sending…") : (isZh ? "发送评论" : "Send comment")}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className={styles.interactionError} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void loadComments()}>{isZh ? "重试" : "Retry"}</button>
        </div>
      ) : null}
    </section>
  );
}

function CommentThread(props: {
  comment: CommentProjection;
  replies: CommentProjection[];
  viewerId: string;
  deletingId: string | null;
  isZh: boolean;
  onReply: (comment: CommentProjection) => void;
  onDelete: (comment: CommentProjection) => Promise<void>;
}) {
  return (
    <div className={styles.commentThread}>
      <CommentRow {...props} comment={props.comment} />
      {props.replies.length > 0 ? (
        <div className={styles.commentReplies}>
          {props.replies.map((reply) => <CommentRow {...props} key={reply.id} comment={reply} />)}
        </div>
      ) : null}
    </div>
  );
}

function CommentRow(props: {
  comment: CommentProjection;
  replies?: CommentProjection[];
  viewerId: string;
  deletingId: string | null;
  isZh: boolean;
  onReply: (comment: CommentProjection) => void;
  onDelete: (comment: CommentProjection) => Promise<void>;
}) {
  const { comment, viewerId, deletingId, isZh, onReply, onDelete } = props;
  return (
    <article className={styles.commentRow} data-comment-id={comment.id}>
      <div className={styles.commentAvatar}>{comment.authorId.slice(0, 1).toUpperCase()}</div>
      <div className={styles.commentContent}>
        <div className={styles.commentMeta}>
          <strong>{comment.authorId.slice(0, 8)}</strong>
          <time dateTime={comment.createdAt}>{formatCommentDate(comment.createdAt, isZh)}</time>
        </div>
        <p className={comment.deleted ? styles.commentDeleted : undefined}>
          {comment.deleted ? (isZh ? "评论已删除" : "Comment deleted") : comment.body}
        </p>
        {!comment.deleted ? (
          <div className={styles.commentActions}>
            <button type="button" onClick={() => onReply(comment)}><Reply size={12} />{isZh ? "回复" : "Reply"}</button>
            {comment.authorId === viewerId ? (
              <button type="button" onClick={() => void onDelete(comment)} disabled={deletingId === comment.id}>
                <Trash2 size={12} />{deletingId === comment.id ? (isZh ? "删除中…" : "Deleting…") : (isZh ? "删除" : "Delete")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function toProjection(comment: Comment): CommentProjection {
  return {
    id: comment.id,
    publicationId: comment.publicationId,
    parentCommentId: comment.parentCommentId,
    authorId: comment.authorId,
    body: comment.deletedAt ? "" : comment.body,
    deleted: comment.deletedAt !== null,
    frozen: comment.frozenAt !== null,
    frozenReason: comment.frozenReason,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

function appendUnique(current: CommentProjection[], incoming: CommentProjection[]): CommentProjection[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

function formatCommentDate(value: string, isZh: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return isZh ? "刚刚" : "Just now";
  return new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", { month: "short", day: "numeric" }).format(date);
}

export default CommunityInteractionPanel;
