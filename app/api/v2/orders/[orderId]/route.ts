import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { readOrder, OrdersError } from "@/lib/server/v2/orders";
import { ordersErrorResponse } from "@/lib/server/v2/orders/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, context: { params: Promise<{ orderId: string }> }) { try { const user = await authenticateRequest(request); if (!hasServiceRoleConfig()) throw new OrdersError("service_unavailable", "Cloud data service is not configured."); const { orderId } = await context.params; const result = await readOrder({ fetcher: serviceFetch, userId: user.id, orderId }); return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...result }); } catch (error) { if (error instanceof Error && (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 }); return ordersErrorResponse(error, "Unable to read order."); } }
