import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  ensureStageWork,
  UnifiedWorkbenchServiceError,
} from "@/lib/server/v2/unified-workbench";
import type { UnifiedProductionStage } from "@/lib/contracts/v2/unified-workbench";
import { unifiedWorkbenchErrorResponse } from "@/lib/server/v2/unified-workbench/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; stage: string }> },
) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      throw new UnifiedWorkbenchServiceError("service_unavailable", "Unified workbench service is not configured.");
    }
    const { projectId, stage } = await params;
    const result = await ensureStageWork({
      projectId,
      ownerId: user.id,
      stage: stage as UnifiedProductionStage,
      idempotencyKey: request.headers.get("idempotency-key") || crypto.randomUUID(),
      fetcher: serviceFetch,
    });
    return NextResponse.json({ success: true, ...result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return unifiedWorkbenchErrorResponse(error, "Unable to ensure unified workbench stage.");
  }
}
