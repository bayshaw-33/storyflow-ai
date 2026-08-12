import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { readUniverseHealth, V2UniverseError } from "@/lib/server/v2/universe";
import { universeErrorResponse } from "@/lib/server/v2/universe/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ universeId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new V2UniverseError("service_unavailable", "Cloud data service is not configured.");
    const { universeId } = await context.params;
    return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...(await readUniverseHealth({ fetcher: serviceFetch, userId: user.id, universeId })) });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))) {
      return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
    }
    return universeErrorResponse(error, "Unable to read universe health.");
  }
}
