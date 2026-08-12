import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { CanonError, readCanonImpact } from "@/lib/server/v2/canon";
import { canonErrorResponse } from "@/lib/server/v2/canon/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ universeId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new CanonError("service_unavailable", "Cloud data service is not configured.");
    const { universeId } = await context.params;
    const entityId = request.nextUrl.searchParams.get("entity") || "";
    return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...(await readCanonImpact({ fetcher: serviceFetch, userId: user.id, universeId, entityId })) });
  } catch (error) {
    if (error instanceof Error && /MISSING_AUTH_TOKEN|INVALID_AUTH_TOKEN/.test(error.message)) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
    return canonErrorResponse(error, "Unable to calculate Canon impact.");
  }
}
