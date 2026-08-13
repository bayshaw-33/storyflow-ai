import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { readCreatorLedger, OrdersError } from "@/lib/server/v2/orders";
import { ordersErrorResponse } from "@/lib/server/v2/orders/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { try { const user = await authenticateRequest(request); if (!hasServiceRoleConfig()) throw new OrdersError("service_unavailable", "Cloud data service is not configured."); const params = request.nextUrl.searchParams; const result = await readCreatorLedger({ fetcher: serviceFetch, userId: user.id, from: params.get("from"), to: params.get("to") }); return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...result }); } catch (error) { if (error instanceof Error && (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 }); return ordersErrorResponse(error, "Unable to read creator ledger."); } }
