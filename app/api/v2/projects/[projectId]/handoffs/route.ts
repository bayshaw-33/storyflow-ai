import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { createHandoff, listHandoffs, ScreenplayHandoffError } from "@/lib/server/v2/screenplay-handoffs";
import { screenplayHandoffErrorResponse } from "@/lib/server/v2/screenplay-handoffs/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    ensureConfig();
    const { projectId } = await context.params;
    const result = await listHandoffs({
      fetcher: serviceFetch,
      userId: user.id,
      projectId,
    });
    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.screenplay-handoff/1",
      ...result,
    });
  } catch (error) {
    return routeError(error, "Unable to list screenplay handoffs.");
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    ensureConfig();
    const { projectId } = await context.params;
    const body = await request.json();

    if (body.projectId && body.projectId !== projectId) {
      return NextResponse.json(
        { success: false, error: "projectId in body must match URL.", code: "validation_failed" },
        { status: 422 }
      );
    }

    const result = await createHandoff({
      fetcher: serviceFetch,
      userId: user.id,
      input: { ...body, projectId },
    });
    return NextResponse.json(
      {
        success: true,
        contractVersion: "kiikis.screenplay-handoff/1",
        handoff: result.handoff,
        created: result.created,
      },
      { status: result.created ? 201 : 200 }
    );
  } catch (error) {
    return routeError(error, "Unable to create screenplay handoff.");
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
