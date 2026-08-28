"use client";

import { Bell, CheckCheck, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CommunityNotification } from "@/lib/contracts/v2/comments";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
import styles from "@/app/community/community.module.css";

interface CommunityNotificationsProps {
  viewerId: string | null;
}

type NotificationsResponse = {
  success?: boolean;
  items?: CommunityNotification[];
  unreadCount?: number;
  error?: string;
};

export function CommunityNotifications({ viewerId }: CommunityNotificationsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CommunityNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(Boolean(viewerId));
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!viewerId) {
      setItems([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuthRetry("/api/v2/community/notifications?limit=50&offset=0");
      const json = (await response.json().catch(() => ({}))) as NotificationsResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.error || "通知暂时无法加载。");
      }
      setItems(json.items ?? []);
      setUnreadCount(json.unreadCount ?? (json.items ?? []).filter((item) => !item.read).length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "通知暂时无法加载。");
    } finally {
      setLoading(false);
    }
  }, [viewerId]);

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
      if (!response.ok || !json.success) throw new Error(json.error || "标记已读失败。");
      setItems((current) => current.map((item) => item.id === notification.id ? { ...item, read: true, readAt: new Date().toISOString() } : item));
      setUnreadCount((current) => Math.max(0, current - 1));
      if (notification.linkUrl) router.push(notification.linkUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "标记已读失败，请重试。");
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
      if (!response.ok || !json.success) throw new Error(json.error || "全部标记已读失败。");
      await loadNotifications();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "全部标记已读失败，请重试。");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.notificationWrap}>
      <button
        type="button"
        className={styles.notificationButton}
        aria-label="通知"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={16} />
        <span>通知</span>
        {unreadCount > 0 ? <strong className={styles.notificationBadge}>{unreadCount > 99 ? "99+" : unreadCount}</strong> : null}
      </button>

      {open ? (
        <section className={styles.notificationPanel} aria-label="社区通知">
          <header className={styles.notificationHeader}>
            <div>
              <span className={styles.panelKicker}>CREATIVE EVENTS</span>
              <h2>通知</h2>
            </div>
            {viewerId ? (
              <button type="button" className={styles.notificationReadAll} onClick={() => void markAllRead()} disabled={busyId !== null || unreadCount === 0}>
                <CheckCheck size={13} />全部已读
              </button>
            ) : null}
          </header>

          {!viewerId ? <p className={styles.notificationStatus}>登录后查看社区通知。</p> : null}
          {viewerId && loading ? <p className={styles.notificationStatus}>正在加载通知…</p> : null}
          {viewerId && !loading && !error && items.length === 0 ? <p className={styles.notificationStatus}>还没有新的社区回应。</p> : null}
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
                    <small>{formatNotificationDate(notification.createdAt)}</small>
                  </span>
                  {notification.linkUrl ? <ExternalLink size={13} aria-hidden="true" /> : null}
                </button>
              ))}
            </div>
          ) : null}
          {error ? (
            <div className={styles.notificationError} role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => void loadNotifications()}><RefreshCw size={12} />重试</button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function formatNotificationDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default CommunityNotifications;
