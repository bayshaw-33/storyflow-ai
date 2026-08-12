import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { readProposal, updateProposal, ProposalError } from "@/lib/server/v2/proposals";
import { proposalErrorResponse } from "@/lib/server/v2/proposals/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ universeId: string; proposalId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new ProposalError("service_unavailable", "Cloud data service is not configured.");
    const params = await context.params;
    return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...(await readProposal({ fetcher: serviceFetch, userId: user.id, ...params })) });
  } catch (error) {
    if (error instanceof Error && /MISSING_AUTH_TOKEN|INVALID_AUTH_TOKEN/.test(error.message)) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
    return proposalErrorResponse(error, "Unable to read change proposal.");
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ universeId: string; proposalId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new ProposalError("service_unavailable", "Cloud data service is not configured.");
    const params = await context.params;
    const body = await request.json();
    return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...(await updateProposal({ fetcher: serviceFetch, userId: user.id, universeId: params.universeId, proposalId: params.proposalId, action: body?.action, editedPayload: body?.editedPayload })) });
  } catch (error) {
    if (error instanceof Error && /MISSING_AUTH_TOKEN|INVALID_AUTH_TOKEN/.test(error.message)) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
    return proposalErrorResponse(error, "Unable to update change proposal.");
  }
}
