import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { createEvidenceEvent, listEvidenceEvents, EvidenceError } from "@/lib/server/v2/evidence";
import { evidenceErrorResponse } from "@/lib/server/v2/evidence/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { try { const user = await authenticateRequest(request); ensureConfig(); const params = request.nextUrl.searchParams; const result = await listEvidenceEvents({ fetcher: serviceFetch, userId: user.id, filters: { assetId: params.get("assetId"), projectId: params.get("projectId"), from: params.get("from"), to: params.get("to") } }); return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...result }); } catch (error) { return routeError(error, "Unable to read evidence events."); } }
export async function POST(request: NextRequest) { try { const user = await authenticateRequest(request); ensureConfig(); const result = await createEvidenceEvent({ fetcher: serviceFetch, userId: user.id, input: await request.json() }); return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...result }, { status: 201 }); } catch (error) { return routeError(error, "Unable to record evidence event."); } }
function ensureConfig() { if (!hasServiceRoleConfig()) throw new EvidenceError("service_unavailable", "Cloud data service is not configured."); }
function routeError(error: unknown, fallback: string) { if (error instanceof Error && (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 }); return evidenceErrorResponse(error, fallback); }
