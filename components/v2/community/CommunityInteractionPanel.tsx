"use client";

import { MessageCircle, Reply, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Comment, CommentProjection } from "@/lib/contracts/v2/comments";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
import styles from "@/app/community/community.module.css";

interface CommunityInteractionPanelProps {
  publicationId: string;
  viewerId: string | null;
  canComment: boolean;
}

type CommentsResponse = {
  success?: boolean;
  items?: CommentProjection[];
  error?: string;
};

type CommentResponse = {
  success?: boolean;
  comment?: Comment;
  error?: string;
};

export function CommunityInteractionPanel({
  publicationId,
  viewerId,
  canComment,
}: CommunityInteractionPanelProps) {
  const [comments, setComments] = useState<CommentProjection[]>([]);
  const [loading, setLoading] = useState(Boolean(viewerId));
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<CommentProjection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pendingKeyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const loadComments = useCallback(async () => {
    if (!viewerId) {
      setComments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuthRetry(
        `/api/v2/community/publications/${encodeURIComponent(publicationId)}/comments?limit=50&offset=0`,
      );
      const json = (await response.json().catch(() => ({}))) as CommentsResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.error || "评论暂时无法加载。");
      }
      setComments(json.items ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "评论暂时无法加载。");
    } finally {
      setLoading(false);
    }
  }, [publicationId, viewerId]);

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
      setComments((current) => [...current, toProjection(json.comment!)]);
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
    <section className={styles.interactionPanel} aria-label="社区互动">
      <div className={styles.interactionHeading}>
        <div>
          <span className={styles.panelKicker}>COMMUNITY LOOP</span>
          <h2><MessageCircle size={17} />评论与回应</h2>
        </div>
        <span className={styles.interactionCount}>{comments.length}</span>
      </div>

      {loading ? <p className={styles.interactionStatus}>正在加载评论…</p> : null}
      {!loading && !viewerId ? (
        <div className={styles.interactionLogin}>
          <p>登录后参与评论和回复。</p>
          <a href="/login" className={styles.interactionLoginLink}>去登录</a>
        </div>
      ) : null}
      {!loading && viewerId && rootComments.length === 0 ? (
        <p className={styles.interactionStatus}>还没有回应，留下第一条。</p>
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
              onReply={beginReply}
              onDelete={deleteComment}
            />
          ))}
        </div>
      ) : null}

      {viewerId && canComment ? (
        <div className={styles.commentComposer}>
          {replyTo ? (
            <div className={styles.replyContext}>
              <span>回复 {replyTo.authorId.slice(0, 8)}</span>
              <button type="button" onClick={clearReply}>取消回复</button>
            </div>
          ) : null}
          <textarea
            aria-label="评论"
            value={draft}
            maxLength={2000}
            onChange={(event) => {
              setDraft(event.target.value);
              pendingKeyRef.current = null;
            }}
            placeholder="说点什么，继续这件作品…"
          />
          <div className={styles.commentComposerFooter}>
            <span>{draft.length}/2000</span>
            <button type="button" onClick={() => void submitComment()} disabled={submitting || !draft.trim()}>
              <Send size={14} />{submitting ? "发送中…" : "发送评论"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className={styles.interactionError} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void loadComments()}>重试</button>
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
  onReply: (comment: CommentProjection) => void;
  onDelete: (comment: CommentProjection) => Promise<void>;
}) {
  const { comment, viewerId, deletingId, onReply, onDelete } = props;
  return (
    <article className={styles.commentRow} data-comment-id={comment.id}>
      <div className={styles.commentAvatar}>{comment.authorId.slice(0, 1).toUpperCase()}</div>
      <div className={styles.commentContent}>
        <div className={styles.commentMeta}>
          <strong>{comment.authorId.slice(0, 8)}</strong>
          <time dateTime={comment.createdAt}>{formatCommentDate(comment.createdAt)}</time>
        </div>
        <p className={comment.deleted ? styles.commentDeleted : undefined}>
          {comment.deleted ? "评论已删除" : comment.body}
        </p>
        {!comment.deleted ? (
          <div className={styles.commentActions}>
            <button type="button" onClick={() => onReply(comment)}><Reply size={12} />回复</button>
            {comment.authorId === viewerId ? (
              <button type="button" onClick={() => void onDelete(comment)} disabled={deletingId === comment.id}>
                <Trash2 size={12} />{deletingId === comment.id ? "删除中…" : "删除"}
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

function formatCommentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

export default CommunityInteractionPanel;
