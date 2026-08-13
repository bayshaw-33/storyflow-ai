import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { revokeUsageGrant, LicensingError } from "@/lib/server/v2/licensing";
import { licensingErrorResponse } from "@/lib/server/v2/licensing/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PATCH(request: NextRequest, context: { params: Promise<{ grantId: string }> }) { try { const user = await authenticateRequest(request); if (!hasServiceRoleConfig()) throw new LicensingError("service_unavailable", "Cloud data service is not configured."); const { grantId } = await context.params; const body = await request.json().catch(() => ({})); const result = await revokeUsageGrant({ fetcher: serviceFetch, userId: user.id, grantId, reason: body.reason }); return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...result }); } catch (error) { if (error instanceof Error && (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 }); return licensingErrorResponse(error, "Unable to revoke usage grant."); } }
