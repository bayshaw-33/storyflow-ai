import { NextRequest, NextResponse } from "next/server";
import { hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { updateSettlement, OrdersError } from "@/lib/server/v2/orders";
import { ordersErrorResponse } from "@/lib/server/v2/orders/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PATCH(request: NextRequest, context: { params: Promise<{ settlementId: string }> }) { try { const admin = await requireAdminRole(request, "operator"); if (!hasServiceRoleConfig()) throw new OrdersError("service_unavailable", "Cloud data service is not configured."); const { settlementId } = await context.params; const result = await updateSettlement({ fetcher: serviceFetch, adminId: admin.id, settlementId, input: await request.json() }); return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...result }); } catch (error) { const adminResponse = adminErrorResponse(error); if (adminResponse.status !== 500 || error instanceof Error && (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))) return adminResponse; return ordersErrorResponse(error, "Unable to update manual settlement."); } }
