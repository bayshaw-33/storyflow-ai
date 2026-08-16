/**
 * GET /api/v2/evidence/packages/[packageId]/download — signed download URL
 *
 * Phase 1 Task 1.4
 *
 * Returns a short-lived (≤ 300 s) signed URL for the V2.2 evidence package.
 * The URL is owner-scoped: only the package owner can request it.
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig } from "@/lib/supabase/server";
import {
  signEvidencePackageV2,
  createServerEvidencePackageV2Store,
  EvidencePackageV2Error,
} from "@/lib/server/v2/evidence/package-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Evidence service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const viewer = await getViewerFromRequest(_request);
    if (!viewer) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
    const { packageId } = await params;
    if (!packageId) {
      return NextResponse.json(
        { success: false, error: "Package ID is required.", code: "validation_failed" },
        { status: 422 },
      );
    }

    const store = createServerEvidencePackageV2Store();
    const signed = await signEvidencePackageV2({
      packageId,
      requesterId: viewer.id,
      store,
    });

    return NextResponse.json({
      success: true,
      downloadUrl: signed.url,
      expiresIn: signed.expiresIn,
      packageId: signed.package.id,
    });
  } catch (error) {
    if (error instanceof EvidencePackageV2Error) {
      const status =
        error.code === "unauthenticated" ? 401 :
        error.code === "not_found" ? 404 :
        error.code === "validation_failed" ? 422 :
        503;
      return NextResponse.json(
        { success: false, error: error.message.replace(`${error.code}: `, ""), code: error.code },
        { status },
      );
    }
    return NextResponse.json(
      { success: false, error: "Evidence package not found.", code: "not_found" },
      { status: 404 },
    );
  }
}
