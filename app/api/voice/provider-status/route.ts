/**
 * GET /api/voice/provider-status — 只暴露 Provider 可用性与名称（不含密钥）。
 * Phase 5 Task 5.4
 */
import { NextResponse } from "next/server";
import { getCurrentTTSProviderName, isTTSProviderAvailable } from "@/lib/voice/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const name = getCurrentTTSProviderName();
  return NextResponse.json({
    success: true,
    contractVersion: "2.2.0-alpha.1",
    available: isTTSProviderAvailable(),
    name,
  });
}
