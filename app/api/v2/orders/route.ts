import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { createOrder, listOrders, OrdersError } from "@/lib/server/v2/orders";
import { ordersErrorResponse } from "@/lib/server/v2/orders/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try { const user = await authenticateRequest(request); ensureConfig(); const params = request.nextUrl.searchParams; const result = await listOrders({ fetcher: serviceFetch, userId: user.id, paymentStatus: params.get("paymentStatus"), orderStatus: params.get("orderStatus") }); return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...result }); } catch (error) { return routeError(error, "Unable to read orders."); }
}

export async function POST(request: NextRequest) {
  try { const user = await authenticateRequest(request); ensureConfig(); const result = await createOrder({ fetcher: serviceFetch, userId: user.id, input: await request.json() }); return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...result }, { status: 201 }); } catch (error) { return routeError(error, "Unable to create order."); }
}

function ensureConfig() { if (!hasServiceRoleConfig()) throw new OrdersError("service_unavailable", "Cloud data service is not configured."); }
function routeError(error: unknown, fallback: string) { if (error instanceof Error && (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 }); return ordersErrorResponse(error, fallback); }
