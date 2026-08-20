import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { getUnifiedWorkbenchContext, UnifiedWorkbenchServiceError } from "@/lib/server/v2/unified-workbench";
import { unifiedWorkbenchErrorResponse } from "@/lib/server/v2/unified-workbench/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      throw new UnifiedWorkbenchServiceError("service_unavailable", "Unified workbench service is not configured.");
    }
    const { projectId } = await params;
    const context = await getUnifiedWorkbenchContext({
      projectId,
      ownerId: user.id,
      fetcher: serviceFetch,
    });
    return NextResponse.json({ success: true, ...context });
  } catch (error) {
    return unifiedWorkbenchErrorResponse(error, "Unable to load unified workbench context.");
  }
}
