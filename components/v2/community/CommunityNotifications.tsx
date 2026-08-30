"use client";

import { Bell, CheckCheck, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CommunityNotification } from "@/lib/contracts/v2/comments";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "@/app/community/community.module.css";

interface CommunityNotificationsProps {
  viewerId: string | null;
}

type NotificationsResponse = {
  success?: boolean;
  items?: CommunityNotification[];
  unreadCount?: number;
  nextOffset?: number | null;
  hasMore?: boolean;
  error?: string;
};

const NOTIFICATION_PAGE_SIZE = 20;

export function CommunityNotifications({ viewerId }: CommunityNotificationsProps) {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CommunityNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(Boolean(viewerId));
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const itemsRef = useRef<CommunityNotification[]>([]);
  const nextOffsetRef = useRef<number | null>(0);
  const requestInFlightRef = useRef(false);

  const loadNotifications = useCallback(async (append = false) => {
    if (!viewerId) {
      setItems([]);
      itemsRef.current = [];
      setUnreadCount(0);
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
        `/api/v2/community/notifications?limit=${NOTIFICATION_PAGE_SIZE}&offset=${offset}`,
      );
      const json = (await response.json().catch(() => ({}))) as NotificationsResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.error || (isZh ? "通知暂时无法加载。" : "Notifications are temporarily unavailable."));
      }
      const incoming = json.items ?? [];
      const merged = append ? appendUnique(itemsRef.current, incoming) : incoming;
      itemsRef.current = merged;
      setItems(merged);
      setUnreadCount(merged.filter((item) => !item.read).length);
      const resolvedNextOffset = json.hasMore ? (json.nextOffset ?? offset + incoming.length) : null;
      setNextOffset(resolvedNextOffset);
      nextOffsetRef.current = resolvedNextOffset;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isZh ? "通知暂时无法加载。" : "Notifications are temporarily unavailable."));
    } finally {
      requestInFlightRef.current = false;
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [isZh, viewerId]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  async function markRead(notification: CommunityNotification) {
    if (notification.read || busyId) {
      if (notification.linkUrl) router.push(notification.linkUrl);
      return;
    }
    setBusyId(notification.id);
    setError(null);
    try {
      const response = await fetchWithAuthRetry("/api/v2/community/notifications", {
        method: "POST",
        body: JSON.stringify({ action: "read", eventId: notification.id }),
      });
      const json = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !json.success) throw new Error(json.error || (isZh ? "标记已读失败。" : "Unable to mark as read."));
      const nextItems = itemsRef.current.map((item) => item.id === notification.id ? { ...item, read: true, readAt: new Date().toISOString() } : item);
      itemsRef.current = nextItems;
      setItems(nextItems);
      setUnreadCount(nextItems.filter((item) => !item.read).length);
      if (notification.linkUrl) router.push(notification.linkUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isZh ? "标记已读失败，请重试。" : "Unable to mark as read. Please retry."));
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    if (!viewerId || unreadCount === 0 || busyId) return;
    setBusyId("all");
    setError(null);
    try {
      const response = await fetchWithAuthRetry("/api/v2/community/notifications", {
        method: "POST",
        body: JSON.stringify({ action: "read_all" }),
      });
      const json = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !json.success) throw new Error(json.error || (isZh ? "全部标记已读失败。" : "Unable to mark all as read."));
      await loadNotifications();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isZh ? "全部标记已读失败，请重试。" : "Unable to mark all as read. Please retry."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.notificationWrap}>
      <button
        type="button"
        className={styles.notificationButton}
        aria-label={isZh ? "通知" : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={16} />
        <span>{isZh ? "通知" : "Notifications"}</span>
        {unreadCount > 0 ? <strong className={styles.notificationBadge}>{unreadCount > 99 ? "99+" : unreadCount}</strong> : null}
      </button>

      {open ? (
        <section className={styles.notificationPanel} aria-label={isZh ? "社区通知" : "Community notifications"}>
          <header className={styles.notificationHeader}>
            <div>
              <span className={styles.panelKicker}>CREATIVE EVENTS</span>
              <h2>{isZh ? "通知" : "Notifications"}</h2>
            </div>
            {viewerId ? (
              <button type="button" className={styles.notificationReadAll} onClick={() => void markAllRead()} disabled={busyId !== null || unreadCount === 0}>
                <CheckCheck size={13} />{isZh ? "全部已读" : "Mark all read"}
              </button>
            ) : null}
          </header>

          {!viewerId ? <p className={styles.notificationStatus}>{isZh ? "登录后查看社区通知。" : "Sign in to view community notifications."}</p> : null}
          {viewerId && loading ? <p className={styles.notificationStatus}>{isZh ? "正在加载通知…" : "Loading notifications…"}</p> : null}
          {viewerId && !loading && !error && items.length === 0 ? <p className={styles.notificationStatus}>{isZh ? "还没有新的社区回应。" : "No community activity yet."}</p> : null}
          {viewerId && !loading && items.length > 0 ? (
            <div className={styles.notificationList}>
              {items.map((notification) => (
                <button
                  type="button"
                  key={notification.id}
                  className={`${styles.notificationItem} ${notification.read ? "" : styles.notificationItemUnread}`}
                  onClick={() => void markRead(notification)}
                  disabled={busyId !== null}
                >
                  <span className={styles.notificationItemDot} aria-hidden="true" />
                  <span className={styles.notificationItemBody}>
                    <strong>{notification.title || notification.type}</strong>
                    <span>{notification.body}</span>
                    <small>{formatNotificationDate(notification.createdAt, isZh)}</small>
                  </span>
                  {notification.linkUrl ? <ExternalLink size={13} aria-hidden="true" /> : null}
                </button>
              ))}
              {nextOffset !== null ? (
                <button
                  type="button"
                  className={styles.loadMoreBtn}
                  onClick={() => void loadNotifications(true)}
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? (isZh ? "加载中…" : "Loading…")
                    : (isZh ? "加载更多通知" : "Load more notifications")}
                </button>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <div className={styles.notificationError} role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => void loadNotifications()}><RefreshCw size={12} />{isZh ? "重试" : "Retry"}</button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function appendUnique(current: CommunityNotification[], incoming: CommunityNotification[]): CommunityNotification[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

function formatNotificationDate(value: string, isZh: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return isZh ? "刚刚" : "Just now";
  return new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default CommunityNotifications;
