/**
 * KIIKIS 2.1 Phase 4 — 通知服务 (Task 4.2, CO-007)
 *
 * CO-007: 重要事件触发通知, 复用 Phase 1 creative_events。
 * 通知可读、已读、去重。
 *
 * 实现: 通过 append_creative_event (Phase 1 RPC) 写入事件流,
 *       消费者过滤 recipient_id 后投影为通知。
 */
import {
  NOTIFICATION_TYPES,
  type Notification,
  type NotificationType,
} from "../../../contracts/v2/collab.ts";
import { CollabServiceError } from "./index.ts";
import type { CollabFetcher } from "./comments.ts";
import { isResourceType } from "../../../contracts/v2/grants.ts";

/** CO-007: 创建通知 (通过 creative_events 事件流) */
export async function sendNotification(
  fetcher: CollabFetcher,
  params: {
    recipientId: string;
    type: NotificationType;
    title: string;
    body: string;
    resourceType?: string | null;
    resourceId?: string | null;
    idempotencyKey: string;
  },
): Promise<{ sent: boolean; eventId: string | null }> {
  if (!params.recipientId) {
    throw new CollabServiceError("validation_failed", "recipientId is required", 400);
  }
  if (!NOTIFICATION_TYPES.includes(params.type)) {
    throw new CollabServiceError(
      "validation_failed",
      `invalid notification type: ${params.type}`,
      400,
    );
  }
  if (!params.title?.trim()) {
    throw new CollabServiceError("validation_failed", "title is required", 400);
  }
  if (!params.idempotencyKey?.trim()) {
    throw new CollabServiceError("validation_failed", "idempotencyKey is required", 400);
  }

  // 通过 Phase 1 RPC append_creative_event 写入事件流
  // 事件 payload 包含通知详情
  const result = await fetcher<{ p_inserted: boolean; p_event_id: string | null }>(
    `/rest/v1/rpc/append_creative_event`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_owner_id: params.recipientId,
        p_event_type: `notification:${params.type}`,
        p_payload: {
          title: params.title,
          body: params.body,
          resource_type: params.resourceType ?? null,
          resource_id: params.resourceId ?? null,
          read: false,
        },
        p_idempotency_key: params.idempotencyKey,
      }),
    },
  ).catch((err: unknown) => {
    throw new CollabServiceError("service_unavailable", "failed to send notification", 503, err);
  });

  return {
    sent: result.p_inserted === true,
    eventId: result.p_event_id ?? null,
  };
}

/** CO-007: 列出用户的通知 (从 creative_events 读取 notification:* 类型) */
export async function listNotifications(
  fetcher: CollabFetcher,
  recipientId: string,
  options: { limit?: number; offset?: number; unreadOnly?: boolean } = {},
): Promise<Notification[]> {
  if (!recipientId) {
    throw new CollabServiceError("unauthenticated", "recipientId is required", 401);
  }
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  // 查询事件类型以 notification: 开头的事件
  const params = new URLSearchParams();
  params.set("owner_id", `eq.${encodeURIComponent(recipientId)}`);
  params.set("event_type", `like(notification:*)`);
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const rows = await fetcher<Array<{
    id: string;
    owner_id: string;
    event_type: string;
    payload: { title: string; body: string; resource_type: string | null; resource_id: string | null; read: boolean } | null;
    created_at: string;
  }>>(
    `/rest/v1/storyflow_creative_events?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CollabServiceError("service_unavailable", "failed to list notifications", 503, err);
  });

  let notifications = (rows ?? []).map((r): Notification => ({
    id: r.id,
    recipientId: r.owner_id,
    type: r.event_type.replace(/^notification:/, "") as NotificationType,
    title: r.payload?.title ?? "",
    body: r.payload?.body ?? "",
    resourceType:
      r.payload?.resource_type && isResourceType(r.payload.resource_type)
        ? r.payload.resource_type
        : null,
    resourceId: r.payload?.resource_id ?? null,
    read: r.payload?.read ?? false,
    readAt: null,
    createdAt: r.created_at,
  }));

  if (options.unreadOnly) {
    notifications = notifications.filter((n) => !n.read);
  }

  return notifications;
}

/** CO-007: 标记通知已读 (去重: 已读的不再重复标记) */
export async function markNotificationRead(
  fetcher: CollabFetcher,
  notificationId: string,
  recipientId: string,
): Promise<void> {
  if (!notificationId) {
    throw new CollabServiceError("validation_failed", "notificationId is required", 400);
  }
  if (!recipientId) {
    throw new CollabServiceError("unauthenticated", "recipientId is required", 401);
  }

  // 更新事件 payload.read = true
  // 注意: 这里需要先读取再更新, 因为 PostgREST 不支持部分 JSON 更新
  const existing = await fetcher<{ payload: { read: boolean } } | null>(
    `/rest/v1/storyflow_creative_events?id=eq.${encodeURIComponent(notificationId)}&limit=1`,
    { headers: { Accept: "application/vnd.pgrst.object+json" } },
  ).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err && err.status === 406) return null;
    throw new CollabServiceError("service_unavailable", "failed to fetch notification", 503, err);
  });

  if (!existing) return; // 通知不存在或已删除, 幂等返回
  if (existing.payload?.read === true) return; // 已读, 去重不重复标记

  await fetcher(
    `/rest/v1/storyflow_creative_events?id=eq.${encodeURIComponent(notificationId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: { ...existing.payload, read: true, read_at: new Date().toISOString() },
      }),
    },
  ).catch((err: unknown) => {
    throw new CollabServiceError("service_unavailable", "failed to mark notification read", 503, err);
  });
}

/** CO-007: 批量标记已读 */
export async function markAllNotificationsRead(
  fetcher: CollabFetcher,
  recipientId: string,
): Promise<void> {
  if (!recipientId) {
    throw new CollabServiceError("unauthenticated", "recipientId is required", 401);
  }

  // 查询所有未读通知
  const unread = await fetcher<Array<{ id: string; payload: { read: boolean } }>>(
    `/rest/v1/storyflow_creative_events?owner_id=eq.${encodeURIComponent(recipientId)}&event_type=like(notification:*)&limit=200`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CollabServiceError("service_unavailable", "failed to fetch unread notifications", 503, err);
  });

  const now = new Date().toISOString();
  for (const n of unread ?? []) {
    if (n.payload?.read === true) continue;
    await fetcher(
      `/rest/v1/storyflow_creative_events?id=eq.${encodeURIComponent(n.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: { ...n.payload, read: true, read_at: now },
        }),
      },
    ).catch(() => {
      // 单条失败不阻塞其他
    });
  }
}
