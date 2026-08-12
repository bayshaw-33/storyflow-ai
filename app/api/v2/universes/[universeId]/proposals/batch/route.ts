import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { createProposalBatch, ProposalError } from "@/lib/server/v2/proposals";
import { proposalErrorResponse } from "@/lib/server/v2/proposals/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ universeId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new ProposalError("service_unavailable", "Cloud data service is not configured.");
    const { universeId } = await context.params;
    const body = await request.json();
    const result = await createProposalBatch({ fetcher: serviceFetch, userId: user.id, universeId, inputs: body?.inputs, proposalIds: body?.proposalIds, action: body?.action || "create" });
    return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...result });
  } catch (error) {
    if (error instanceof Error && /MISSING_AUTH_TOKEN|INVALID_AUTH_TOKEN/.test(error.message)) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
    return proposalErrorResponse(error, "Unable to process proposal batch.");
  }
}
