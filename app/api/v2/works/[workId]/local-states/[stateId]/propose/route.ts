import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  InheritanceLocalStateError,
  proposeLocalState,
} from "@/lib/server/v2/inheritance/local-states";
import { ProposalError } from "@/lib/server/v2/proposals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ workId: string; stateId: string }> }) {
  try {
    if (!hasServiceRoleConfig()) throw new InheritanceLocalStateError("service_unavailable", "Local override service is not configured.");
    const viewer = await getViewerFromRequest(request);
    if (!viewer) throw new InheritanceLocalStateError("unauthenticated", "Authentication required.");
    const { workId, stateId } = await context.params;
    const result = await proposeLocalState({ fetcher: serviceFetch, ownerId: viewer.id, workId, stateId });
    return NextResponse.json(
      { success: true, contractVersion: "2.2.0-alpha.1", ...result },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof InheritanceLocalStateError || error instanceof ProposalError) {
    const status = error.code === "unauthenticated" ? 401 : error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : error.code === "validation_failed" ? 422 : 503;
    return NextResponse.json({ success: false, error: error.message.replace(`${error.code}: `, ""), code: error.code }, { status });
  }
  return NextResponse.json({ success: false, error: "Unable to submit the Canon proposal.", code: "service_unavailable" }, { status: 503 });
}
