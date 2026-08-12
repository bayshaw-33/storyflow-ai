import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { diffInheritanceSnapshot, InheritanceError } from "@/lib/server/v2/inheritance";
import { inheritanceErrorResponse } from "@/lib/server/v2/inheritance/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new InheritanceError("service_unavailable", "Cloud data service is not configured.");
    const { projectId } = await context.params;
    return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...(await diffInheritanceSnapshot({ fetcher: serviceFetch, userId: user.id, projectId })) });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
    return inheritanceErrorResponse(error, "Unable to diff snapshot.");
  }
}
