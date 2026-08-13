import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { createAssetVersion, AssetError } from "@/lib/server/v2/assets";
import { assetErrorResponse } from "@/lib/server/v2/assets/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ assetId: string }> }) { try { const user = await authenticateRequest(request); if (!hasServiceRoleConfig()) throw new AssetError("service_unavailable", "Cloud data service is not configured."); const { assetId } = await context.params; const result = await createAssetVersion({ fetcher: serviceFetch, userId: user.id, assetId, input: await request.json() }); return NextResponse.json({ success: true, contractVersion: "2.0.0-alpha.1", ...result }, { status: 201 }); } catch (error) { if (error instanceof Error && (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))) return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 }); return assetErrorResponse(error, "Unable to create asset version."); } }
