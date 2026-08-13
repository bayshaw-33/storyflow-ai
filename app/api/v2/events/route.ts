import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  hasServiceRoleConfig,
  serviceFetch,
} from "@/lib/supabase/server";
import {
  appendCreativeEvent,
  listCreativeEvents,
  CreativeEventsError,
} from "@/lib/server/v2/events";
import { creativeEventsErrorResponse } from "@/lib/server/v2/events/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTRACT_VERSION = "2.1.0-alpha.1";

function parseAfterSequence(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CreativeEventsError(
      "validation_failed",
      "afterSequence must be a non-negative integer."
    );
  }
  return parsed;
}

function parseLimit(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CreativeEventsError(
      "validation_failed",
      "limit must be a positive integer."
    );
  }
  return parsed;
}

function ensureConfig() {
  if (!hasServiceRoleConfig()) {
    throw new CreativeEventsError(
      "service_unavailable",
      "Cloud data service is not configured."
    );
  }
}

function routeError(error: unknown, fallback: string) {
  if (
    error instanceof Error &&
    (error.message.includes("MISSING_AUTH_TOKEN") ||
      error.message.includes("INVALID_AUTH_TOKEN"))
  ) {
    return NextResponse.json(
      { success: false, error: "Authentication is required.", code: "unauthenticated" },
      { status: 401 }
    );
  }
  return creativeEventsErrorResponse(error, fallback);
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    ensureConfig();
    const params = request.nextUrl.searchParams;
    const result = await listCreativeEvents({
      fetcher: serviceFetch,
      userId: user.id,
      afterSequence: parseAfterSequence(params.get("afterSequence")),
      resourceType: params.get("resourceType"),
      resourceId: params.get("resourceId"),
      limit: parseLimit(params.get("limit")),
    });
    return NextResponse.json({
      success: true,
      contractVersion: CONTRACT_VERSION,
      ...result,
    });
  } catch (error) {
    return routeError(error, "Unable to list creative events.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    ensureConfig();
    const body = await request.json();
    const event = await appendCreativeEvent({
      fetcher: serviceFetch,
      userId: user.id,
      input: body,
    });
    return NextResponse.json(
      { success: true, contractVersion: CONTRACT_VERSION, event },
      { status: 201 }
    );
  } catch (error) {
    return routeError(error, "Unable to append creative event.");
  }
}
