import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { listUnifiedJobs, V2JobsError } from "@/lib/server/v2/jobs";
import { jobsErrorResponse } from "@/lib/server/v2/jobs/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new V2JobsError("service_unavailable", "Cloud data service is not configured.");
    const params = request.nextUrl.searchParams;
    const result = await listUnifiedJobs({ fetcher: serviceFetch, userId: user.id, projectId: params.get("projectId"), jobType: params.get("jobType"), status: params.get("status"), includeArchived: params.get("includeArchived") === "true" });
    return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...result });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
    return jobsErrorResponse(error, "Unable to read jobs.");
  }
}
