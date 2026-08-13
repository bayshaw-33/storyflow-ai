import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { getHandoff, confirmHandoff, ScreenplayHandoffError } from "@/lib/server/v2/screenplay-handoffs";
import { screenplayHandoffErrorResponse } from "@/lib/server/v2/screenplay-handoffs/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; handoffId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    ensureConfig();
    const { handoffId } = await context.params;
    const handoff = await getHandoff({
      fetcher: serviceFetch,
      userId: user.id,
      handoffId,
    });
    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.screenplay-handoff/1",
      handoff,
    });
  } catch (error) {
    return routeError(error, "Unable to fetch screenplay handoff.");
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; handoffId: string }> }
) {
  try {
    const user = await authenticateRequest(request);
    ensureConfig();
    const { handoffId } = await context.params;
    const body = await request.json().catch(() => ({}));

    // 只支持 confirm 动作
    if (body.action !== "confirm") {
      return NextResponse.json(
        {
          success: false,
          error: 'Only action="confirm" is supported for handoff PATCH.',
          code: "validation_failed",
        },
        { status: 422 }
      );
    }

    const handoff = await confirmHandoff({
      fetcher: serviceFetch,
      userId: user.id,
      handoffId,
    });
    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.screenplay-handoff/1",
      handoff,
    });
  } catch (error) {
    return routeError(error, "Unable to confirm screenplay handoff.");
  }
}

function ensureConfig() {
  if (!hasServiceRoleConfig()) {
    throw new ScreenplayHandoffError("service_unavailable", "Cloud data service is not configured.");
  }
}

function routeError(error: unknown, fallback: string) {
  if (
    error instanceof Error &&
    (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))
  ) {
    return NextResponse.json(
      { success: false, error: "Authentication is required.", code: "unauthenticated" },
      { status: 401 }
    );
  }
  return screenplayHandoffErrorResponse(error, fallback);
}
