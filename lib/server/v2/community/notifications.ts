/**
 * KIIKIS 2.1 Phase 5 — 社区通知服务 (Task 5.2, CM-006)
 *
 * CM-006: 通知由 creative_events 生成 (复用 Phase 1 EV 架构)
 *
 * 设计:
 *   - 社区通知通过 creative_events 的 event_type=notification_* 写入
 *     (与 Phase 4 collab 通知共用前缀)
 *   - read 状态用单独的 storyflow_notification_reads 表 (creative_events append-only)
 *   - 通知类型: follow / comment / reaction / apply_use / moderation_result
 *   - 同一事件不重复通知 (idempotency_key 唯一约束)
 *
 * 与 Phase 4 collab/notifications.ts 区别:
 *   - Phase 4 用 notification: 前缀, payload.read 字段 (会破坏 append-only)
 *   - Phase 5 用 notification_ 前缀 + 独立 read 状态表 (不破坏 append-only)
 */
import {
  parseNotification,
  isCommunityNotificationType,
  type CommunityNotification,
  type CommunityNotificationRow,
  type CommunityNotificationType,
} from "../../../contracts/v2/comments.ts";
import { CommunityServiceError, type CommunityFetcher } from "./publications.ts";

/**
 * CM-006: 列出当前用户的通知
 * - 从 creative_events 读取 event_type like 'notification_*'
 * - LEFT JOIN storyflow_notification_reads 获取 read 状态
 */
export async function listNotifications(
  fetcher: CommunityFetcher,
  recipientId: string,
  options: { limit?: number; offset?: number; unreadOnly?: boolean } = {},
): Promise<CommunityNotification[]> {
  if (!recipientId) {
    throw new CommunityServiceError("unauthenticated", "recipientId is required", 401);
  }
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const params = new URLSearchParams();
  params.set("owner_id", `eq.${encodeURIComponent(recipientId)}`);
  // CM-006: 查询所有 community 通知 (notification_*)
  params.set("event_type", `like(notification_*)`);
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  // 只读事件基本字段；read 状态由单独查询 storyflow_notification_reads 补齐
  // (creative_events append-only，不能 PATCH payload.read，故分离 read 表)
  params.set(
    "select",
    "id,owner_id,event_type,actor_type,actor_id,payload,created_at",
  );

  const rows = await fetcher<Array<Omit<CommunityNotificationRow, "read_at">>>(
    `/rest/v1/storyflow_creative_events?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to list notifications", 503, err);
  });

  if (!rows || rows.length === 0) return [];

  // 查询这些 event 的 read 状态
  const eventIds = rows.map((r) => r.id);
  const readParams = new URLSearchParams();
  readParams.set("user_id", `eq.${encodeURIComponent(recipientId)}`);
  readParams.set("event_id", `in.(${eventIds.join(",")})`);
  readParams.set("select", "event_id,read_at");

  const readRows = await fetcher<Array<{ event_id: string; read_at: string }>>(
    `/rest/v1/storyflow_notification_reads?${readParams.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch(() => [] as Array<{ event_id: string; read_at: string }>);

  const readMap = new Map<string, string>();
  for (const r of readRows ?? []) {
    readMap.set(r.event_id, r.read_at);
  }

  const notifications = rows.map((r) =>
    parseNotification({
      ...r,
      read_at: readMap.get(r.id) ?? null,
    } as CommunityNotificationRow),
  );

  if (options.unreadOnly) {
    return notifications.filter((n) => !n.read);
  }
  return notifications;
}

/**
 * CM-006: 标记单条通知已读 (幂等)
 * - 写入 storyflow_notification_reads
 * - 已读的不重复标记 (ON CONFLICT DO NOTHING)
 */
export async function markNotificationRead(
  fetcher: CommunityFetcher,
  eventId: string,
  recipientId: string,
): Promise<void> {
  if (!eventId) {
    throw new CommunityServiceError("validation_failed", "eventId is required", 400);
  }
  if (!recipientId) {
    throw new CommunityServiceError("unauthenticated", "recipientId is required", 401);
  }

  // 直接 POST 到 notification_reads 表 (RLS: 只能写自己的)
  await fetcher(`/rest/v1/storyflow_notification_reads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: recipientId,
      event_id: eventId,
    }),
  }).catch((err: unknown) => {
    // ON CONFLICT DO NOTHING 由 DB 处理; 409 也是幂等成功
    if (err && typeof err === "object" && "status" in err) {
      const status = (err as { status: number }).status;
      if (status === 409) return; // 已存在, 幂等
    }
    throw new CommunityServiceError("service_unavailable", "failed to mark notification read", 503, err);
  });
}

/**
 * CM-006: 批量标记已读
 */
export async function markAllNotificationsRead(
  fetcher: CommunityFetcher,
  recipientId: string,
): Promise<{ marked: number }> {
  if (!recipientId) {
    throw new CommunityServiceError("unauthenticated", "recipientId is required", 401);
  }

  // 查询所有未读通知
  const params = new URLSearchParams();
  params.set("owner_id", `eq.${encodeURIComponent(recipientId)}`);
  params.set("event_type", `like(notification_*)`);
  params.set("limit", "200");
  params.set("select", "id");

  const rows = await fetcher<Array<{ id: string }>>(
    `/rest/v1/storyflow_creative_events?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch(() => [] as Array<{ id: string }>);

  const eventIds = (rows ?? []).map((r) => r.id);
  if (eventIds.length === 0) return { marked: 0 };

  // 查询已读的 event_id (避免重复)
  const readParams = new URLSearchParams();
  readParams.set("user_id", `eq.${encodeURIComponent(recipientId)}`);
  readParams.set("event_id", `in.(${eventIds.join(",")})`);
  readParams.set("select", "event_id");
  const readRows = await fetcher<Array<{ event_id: string }>>(
    `/rest/v1/storyflow_notification_reads?${readParams.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch(() => [] as Array<{ event_id: string }>);

  const alreadyRead = new Set((readRows ?? []).map((r) => r.event_id));
  const toMark = eventIds.filter((id) => !alreadyRead.has(id));

  if (toMark.length === 0) return { marked: 0 };

  // 批量插入 (PostgREST 支持数组 POST)
  const payload = toMark.map((eventId) => ({
    user_id: recipientId,
    event_id: eventId,
  }));

  await fetcher(`/rest/v1/storyflow_notification_reads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  }).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to mark all read", 503, err);
  });

  return { marked: toMark.length };
}

/**
 * CM-006: 投递通知 (通过 creative_events)
 * - 由评论/关注/反应服务内部调用 (RPC 内已写事件)
 * - 此函数用于服务层显式补发通知 (如申请使用)
 */
export async function sendNotification(
  fetcher: CommunityFetcher,
  params: {
    recipientId: string;
    type: CommunityNotificationType;
    actorId: string | null;
    title: string;
    body: string;
    resourceType?: string | null;
    resourceId?: string | null;
    linkUrl?: string | null;
    sourceUrl?: string | null;
    idempotencyKey: string;
  },
): Promise<{ sent: boolean; eventId: string | null }> {
  if (!params.recipientId) {
    throw new CommunityServiceError("validation_failed", "recipientId is required", 400);
  }
  if (!isCommunityNotificationType(params.type)) {
    throw new CommunityServiceError(
      "validation_failed",
      `invalid notification type: ${params.type}`,
      400,
    );
  }
  if (!params.title?.trim()) {
    throw new CommunityServiceError("validation_failed", "title is required", 400);
  }
  if (!params.idempotencyKey?.trim()) {
    throw new CommunityServiceError("validation_failed", "idempotencyKey is required", 400);
  }

  // 直接 INSERT 到 creative_events (event_type=notification_<type>)
  // 幂等: (owner_id, idempotency_key) ON CONFLICT DO NOTHING
  const resourceType = params.resourceType ?? null;
  const resourceId = params.resourceId ?? null;
  const linkUrl =
    params.linkUrl ??
    (resourceType === "publication" && resourceId
      ? `/community/${encodeURIComponent(resourceId)}`
      : null);
  const result = await fetcher<{ id: string } | null>(
    `/rest/v1/storyflow_creative_events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation,resolution=ignore-duplicates",
      },
      body: JSON.stringify({
        event_type: `notification_${params.type}`,
        schema_version: 1,
        actor_type: params.actorId ? "user" : "system",
        actor_id: params.actorId ?? null,
        owner_id: params.recipientId,
        resource_type: params.resourceType ?? "notification",
        resource_id: params.resourceId ?? params.idempotencyKey,
        idempotency_key: params.idempotencyKey,
        visibility: "private",
        payload: {
          title: params.title,
          body: params.body,
          resource_type: resourceType,
          resource_id: resourceId,
          link_url: linkUrl,
          source_url: params.sourceUrl ?? null,
        },
        occurred_at: new Date().toISOString(),
      }),
    },
  ).catch((err: unknown) => {
    throw new CommunityServiceError("service_unavailable", "failed to send notification", 503, err);
  });

  return {
    sent: result?.id != null,
    eventId: result?.id ?? null,
  };
}
