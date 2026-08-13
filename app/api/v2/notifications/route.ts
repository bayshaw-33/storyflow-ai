import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/server/v2/collab/notifications";
import { CollabServiceError } from "@/lib/server/v2/collab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/notifications — 列出当前用户的通知 (CO-007)
 *   query: limit (默认 50), offset, unreadOnly
 *
 * PATCH /api/v2/notifications — 标记通知已读 (CO-007: 去重)
 *   body: { notificationId? (单条), action?: "mark_all_read" (全部已读) }
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Notification service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";

    const notifications = await listNotifications(serviceFetch, user.id, { limit, offset, unreadOnly });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.collab/1",
      notifications,
    });
  } catch (error) {
    return collabErrorResponse(error, "Unable to list notifications.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Notification service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const body = await request.json().catch(() => ({}));

    if (body.action === "mark_all_read") {
      // CO-007: 批量标记已读
      await markAllNotificationsRead(serviceFetch, user.id);
      return NextResponse.json({
        success: true,
        contractVersion: "kiikis.collab/1",
        marked: "all_read",
      });
    }

    if (body.notificationId) {
      // CO-007: 单条标记已读 (去重: 已读的不重复)
      await markNotificationRead(serviceFetch, body.notificationId, user.id);
      return NextResponse.json({
        success: true,
        contractVersion: "kiikis.collab/1",
        marked: "read",
        notificationId: body.notificationId,
      });
    }

    return NextResponse.json(
      { success: false, error: "notificationId or action=mark_all_read is required.", code: "validation_failed" },
      { status: 422 },
    );
  } catch (error) {
    return collabErrorResponse(error, "Unable to mark notification.");
  }
}

function collabErrorResponse(error: unknown, fallback: string) {
  if (error instanceof CollabServiceError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
  }
  return NextResponse.json({ success: false, error: fallback, code: "service_unavailable" }, { status: 503 });
}
