import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/server/v2/community/notifications";
import { CommunityServiceError } from "@/lib/server/v2/community/publications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/community/notifications — 当前登录用户的社区通知。
 * POST /api/v2/community/notifications — 标记单条或全部通知已读。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    ensureConfigured();
    const url = new URL(request.url);
    const limit = parseInteger(url.searchParams.get("limit"), 50, 1, 200);
    const offset = parseInteger(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true" || url.searchParams.get("unreadOnly") === "1";
    const items = await listNotifications(serviceFetch, user.id, { limit, offset, unreadOnly });

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.notification/1",
      items,
      unreadCount: items.filter((item) => !item.read).length,
    });
  } catch (error) {
    return notificationErrorResponse(error, "Unable to list notifications.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    ensureConfigured();
    const body = await request.json().catch(() => ({}));

    if (body.action === "read") {
      if (typeof body.eventId !== "string" || !body.eventId.trim()) {
        return NextResponse.json(
          { success: false, error: "eventId is required.", code: "validation_failed" },
          { status: 400 },
        );
      }
      await markNotificationRead(serviceFetch, body.eventId.trim(), user.id);
      return NextResponse.json({
        success: true,
        contractVersion: "kiikis.community.notification/1",
        marked: 1,
      });
    }

    if (body.action === "read_all") {
      const result = await markAllNotificationsRead(serviceFetch, user.id);
      return NextResponse.json({
        success: true,
        contractVersion: "kiikis.community.notification/1",
        marked: result.marked,
      });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported notification action.", code: "validation_failed" },
      { status: 400 },
    );
  } catch (error) {
    return notificationErrorResponse(error, "Unable to update notifications.");
  }
}

function ensureConfigured() {
  if (!hasServiceRoleConfig()) {
    throw new CommunityServiceError("service_unavailable", "Community service not configured.", 503);
  }
}

function parseInteger(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new CommunityServiceError("validation_failed", "Invalid notification pagination.", 400);
  }
  return parsed;
}

function notificationErrorResponse(error: unknown, fallback: string) {
  if (error instanceof CommunityServiceError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
  }
  return NextResponse.json(
    { success: false, error: fallback, code: "service_unavailable" },
    { status: 503 },
  );
}
