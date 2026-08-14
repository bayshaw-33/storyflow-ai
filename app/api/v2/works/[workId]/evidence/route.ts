/**
 * GET  /api/v2/works/[workId]/evidence — return EvidenceManifestV2
 * POST /api/v2/works/[workId]/evidence — materialize a V2.2 evidence package
 *
 * Phase 1 Task 1.4
 *
 * The manifest is built on-demand from persisted facts (versions, conversations,
 * generations). The package is materialized synchronously for small works;
 * large packages will return 202 + jobId in a future iteration.
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { buildEvidenceManifestV2, ManifestBuilderError } from "@/lib/server/v2/evidence/manifest-v2";
import {
  materializeEvidencePackageV2,
  createServerEvidencePackageV2Store,
  EvidencePackageV2Error,
} from "@/lib/server/v2/evidence/package-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Evidence service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const viewer = await getViewerFromCookies();
    if (!viewer) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
    const { workId } = await params;
    const projectId = await resolveProjectId(workId);
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "Work not found or missing project.", code: "not_found" },
        { status: 404 },
      );
    }
    const manifest = await buildEvidenceManifestV2(
      { ownerId: viewer.id, projectId, workId },
      serviceFetch,
    );
    return NextResponse.json({
      success: true,
      contractVersion: "2.2.0-alpha.1",
      manifest,
    });
  } catch (error) {
    return evidenceErrorResponse(error);
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Evidence service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const viewer = await getViewerFromCookies();
    if (!viewer) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
    const { workId } = await params;
    const projectId = await resolveProjectId(workId);
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "Work not found or missing project.", code: "not_found" },
        { status: 404 },
      );
    }

    const store = createServerEvidencePackageV2Store();
    const { package: pkg, idempotent } = await materializeEvidencePackageV2(
      { ownerId: viewer.id, projectId, workId },
      serviceFetch,
      store,
    );

    return NextResponse.json(
      {
        success: true,
        contractVersion: "2.2.0-alpha.1",
        packageId: pkg.id,
        status: pkg.status,
        manifestHash: pkg.manifest_hash,
        idempotent,
      },
      { status: idempotent ? 200 : 201 },
    );
  } catch (error) {
    return evidenceErrorResponse(error);
  }
}

function evidenceErrorResponse(error: unknown) {
  if (error instanceof ManifestBuilderError) {
    const status = error.code === "validation_failed" ? 422 : 503;
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status },
    );
  }
  if (error instanceof EvidencePackageV2Error) {
    const status =
      error.code === "unauthenticated" ? 401 :
      error.code === "forbidden" ? 403 :
      error.code === "not_found" ? 404 :
      error.code === "validation_failed" ? 422 :
      503;
    return NextResponse.json(
      { success: false, error: error.message.replace(`${error.code}: `, ""), code: error.code },
      { status },
    );
  }
  return NextResponse.json(
    { success: false, error: "Evidence service unavailable.", code: "service_unavailable" },
    { status: 503 },
  );
}

async function resolveProjectId(workId: string): Promise<string | null> {
  try {
    const rows = await serviceFetch<{ project_id?: string }[] | null>(
      `/rest/v1/storyflow_works?id=eq.${encodeURIComponent(workId)}&select=project_id`,
    );
    if (Array.isArray(rows) && rows.length > 0 && rows[0].project_id) {
      return rows[0].project_id;
    }
  } catch {
    // fall through
  }
  return null;
}
