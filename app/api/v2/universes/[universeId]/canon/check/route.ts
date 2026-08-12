import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { CanonError, runCanonCheck, validateCanonCheckInput } from "@/lib/server/v2/canon";
import { canonErrorResponse } from "@/lib/server/v2/canon/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ universeId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new CanonError("service_unavailable", "Cloud data service is not configured.");
    const { universeId } = await context.params;
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON body.", code: "validation_failed" }, { status: 422 }); }
    return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...(await runCanonCheck({ fetcher: serviceFetch, userId: user.id, universeId, input: validateCanonCheckInput(body) })) });
  } catch (error) {
    if (error instanceof Error && /MISSING_AUTH_TOKEN|INVALID_AUTH_TOKEN/.test(error.message)) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
    return canonErrorResponse(error, "Unable to run Canon Check.");
  }
}
