import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { listUniverses, V2UniverseError } from "@/lib/server/v2/universe";
import { universeErrorResponse } from "@/lib/server/v2/universe/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new V2UniverseError("service_unavailable", "Cloud data service is not configured.");
    const url = request.nextUrl;
    const result = await listUniverses({
      fetcher: serviceFetch,
      userId: user.id,
      search: url.searchParams.get("search") || undefined,
      page: parsePositiveInt(url.searchParams.get("page"), 1),
      limit: parsePositiveInt(url.searchParams.get("limit"), 20),
    });
    return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...result });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))) {
      return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
    }
    return universeErrorResponse(error, "Unable to read universes.");
  }
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
