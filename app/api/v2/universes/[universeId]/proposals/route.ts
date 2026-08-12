import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { createProposal, createProposalBatch, listProposals, ProposalError } from "@/lib/server/v2/proposals";
import { proposalErrorResponse } from "@/lib/server/v2/proposals/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ universeId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new ProposalError("service_unavailable", "Cloud data service is not configured.");
    const { universeId } = await context.params;
    return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...(await listProposals({ fetcher: serviceFetch, userId: user.id, universeId, status: request.nextUrl.searchParams.get("status") || undefined })) });
  } catch (error) {
    if (error instanceof Error && /MISSING_AUTH_TOKEN|INVALID_AUTH_TOKEN/.test(error.message)) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
    return proposalErrorResponse(error, "Unable to list change proposals.");
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ universeId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new ProposalError("service_unavailable", "Cloud data service is not configured.");
    const { universeId } = await context.params;
    const body = await request.json();
    const result = Array.isArray(body?.inputs)
      ? await createProposalBatch({ fetcher: serviceFetch, userId: user.id, universeId, inputs: body.inputs, action: body.action || "create" })
      : await createProposal({ fetcher: serviceFetch, userId: user.id, universeId, input: body });
    return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...result }, { status: "created" in result && result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof Error && /MISSING_AUTH_TOKEN|INVALID_AUTH_TOKEN/.test(error.message)) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
    return proposalErrorResponse(error, "Unable to create change proposal.");
  }
}
