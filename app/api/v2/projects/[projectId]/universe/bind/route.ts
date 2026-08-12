import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { bindUniverse, createInheritanceSnapshot, InheritanceError } from "@/lib/server/v2/inheritance";
import { inheritanceErrorResponse } from "@/lib/server/v2/inheritance/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new InheritanceError("service_unavailable", "Cloud data service is not configured.");
    const { projectId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const universeId = typeof body?.universeId === "string" ? body.universeId.trim() : "";
    if (!universeId) throw new InheritanceError("validation_failed", "universeId is required.");
    const binding = await bindUniverse({ fetcher: serviceFetch, userId: user.id, projectId, universeId });
    const snapshot = await createInheritanceSnapshot({ fetcher: serviceFetch, userId: user.id, projectId });
    return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", binding, snapshot });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
    return inheritanceErrorResponse(error, "Unable to bind Universe.");
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new InheritanceError("service_unavailable", "Cloud data service is not configured.");
    const { projectId } = await context.params;
    const { unbindUniverse } = await import("@/lib/server/v2/inheritance");
    return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...(await unbindUniverse({ fetcher: serviceFetch, userId: user.id, projectId })) });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
    return inheritanceErrorResponse(error, "Unable to unbind Universe.");
  }
}
