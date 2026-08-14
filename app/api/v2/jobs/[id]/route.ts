import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { readUnifiedJob, transitionJob, V2JobsError } from "@/lib/server/v2/jobs";
import { jobsErrorResponse } from "@/lib/server/v2/jobs/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new V2JobsError("service_unavailable", "Cloud data service is not configured.");
    const { id } = await context.params;
    return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...(await readUnifiedJob({ fetcher: serviceFetch, userId: user.id, jobId: id })) });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
    return jobsErrorResponse(error, "Unable to read the job.");
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new V2JobsError("service_unavailable", "Cloud data service is not configured.");
    const { id } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new V2JobsError("validation_failed", "Request body must be valid JSON.");
    }
    const action = (body as { action?: unknown })?.action;
    if (action !== "cancel" && action !== "retry") {
      throw new V2JobsError("validation_failed", `Invalid action "${String(action)}". Only "cancel" or "retry" are accepted.`);
    }

    const result = await transitionJob({ fetcher: serviceFetch, userId: user.id, jobId: id, action });
    return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", job: result.job });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
    return jobsErrorResponse(error, "Unable to update the job.");
  }
}
