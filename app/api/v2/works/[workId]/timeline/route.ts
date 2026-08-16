/**
 * Timeline API — Phase 5 Task 5.5.
 *   GET  /api/v2/works/[workId]/timeline — latest kiikis.timeline/1 version
 *   POST /api/v2/works/[workId]/timeline — save (CAS baseVersionId → 409)
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { TimelineVersioningService, TimelineVersionError } from "@/lib/server/v2/editing";
import { TIMELINE_SCHEMA_VERSION } from "@/lib/editor/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof TimelineVersionError) {
    const status =
      error.code === "conflict" ? 409 :
      error.code === "not_found" ? 404 :
      error.code === "validation_failed" ? 422 : 503;
    return NextResponse.json({ success: false, error: error.message.replace(`${error.code}: `, ""), code: error.code }, { status });
  }
  return NextResponse.json({ success: false, error: "Timeline service unavailable.", code: "service_unavailable" }, { status: 503 });
}

interface VersionRow {
  id: string;
  work_id: string;
  version_no: number;
  content_schema: string;
  content_json: { timeline?: unknown } | null;
  finalized_at: string | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "Timeline service not configured.", code: "service_unavailable" }, { status: 503 });
    }
    const viewer = await getViewerFromRequest(_request);
    if (!viewer) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
    const { workId } = await params;
    const rows = await serviceFetch<VersionRow[]>(
      `/rest/v1/storyflow_work_versions?work_id=eq.${encodeURIComponent(workId)}&select=id,work_id,version_no,content_schema,content_json,finalized_at&order=version_no.desc&limit=1`,
    ).catch(() => [] as VersionRow[]);
    const latest = rows?.[0] ?? null;
    return NextResponse.json({
      success: true,
      contractVersion: "2.2.0-alpha.1",
      timeline: latest?.content_json?.timeline ?? null,
      versionId: latest?.id ?? null,
      versionNo: latest?.version_no ?? null,
      finalized: Boolean(latest?.finalized_at),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "Timeline service not configured.", code: "service_unavailable" }, { status: 503 });
    }
    const viewer = await getViewerFromRequest(request);
    if (!viewer) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
    const { workId } = await params;
    const body = await request.json().catch(() => ({}));
    if (body.timeline?.schemaVersion !== TIMELINE_SCHEMA_VERSION) {
      return NextResponse.json({ success: false, error: `unsupported_schema_version:${String(body.timeline?.schemaVersion)}`, code: "validation_failed" }, { status: 422 });
    }
    const service = new TimelineVersioningService(serviceFetch);
    const result = await service.save({
      ownerId: viewer.id,
      workId,
      timeline: body.timeline,
      baseVersionId: body.baseVersionId ? String(body.baseVersionId) : null,
    });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", version: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
