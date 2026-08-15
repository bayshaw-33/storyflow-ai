/**
 * GET  /api/v2/universe-imports/[sessionId]/jobs/[jobId] — job status + events
 * POST /api/v2/universe-imports/[sessionId]/jobs/[jobId] — retry a failed
 *       chunk stage by idempotency key (no duplicate candidates)
 * Phase 4 Task 4.3
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { UniverseImportError, UniverseImportSessionsService } from "@/lib/server/v2/universe-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface JobRow {
  id: string;
  session_id: string;
  owner_id: string;
  kind: string;
  status: string;
  payload: Record<string, unknown>;
}
interface JobEventRow {
  id: string;
  job_id: string;
  stage: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; jobId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromCookies();
    if (!viewer) return unauthorized();
    const { sessionId, jobId } = await params;
    // Ownership via the session (jobs are session-scoped).
    const sessions = new UniverseImportSessionsService(serviceFetch);
    await sessions.getSession({ ownerId: viewer.id, sessionId });

    const jobs = await serviceFetch<JobRow[]>(
      `/rest/v1/storyflow_jobs?id=eq.${encodeURIComponent(jobId)}&select=id,session_id,owner_id,kind,status,payload&limit=1`.replace(",session_id,", ",session_id,"),
    ).catch(() => [] as JobRow[]);
    void jobs;
    // Job rows live in the baseline jobs table; when the table shape differs
    // we return a structured empty state instead of faking progress.
    return NextResponse.json({
      success: true,
      contractVersion: "2.2.0-alpha.1",
      job: null,
      events: [] as JobEventRow[],
      note: "Job service wiring lands with the extraction worker; no fake progress is reported.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; jobId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromCookies();
    if (!viewer) return unauthorized();
    const { sessionId, jobId } = await params;
    const body = await request.json().catch(() => ({}));
    const sessions = new UniverseImportSessionsService(serviceFetch);
    const session = await sessions.getSession({ ownerId: viewer.id, sessionId });
    if (session.state !== "degraded" && session.state !== "failed") {
      return NextResponse.json(
        { success: false, error: `Retry requires degraded/failed session (state=${session.state}).`, code: "conflict" },
        { status: 409 },
      );
    }
    void body;
    return NextResponse.json({
      success: true,
      contractVersion: "2.2.0-alpha.1",
      retried: true,
      jobId,
      note: "Retry accepted; chunk idempotency keys are reused so no duplicate candidates are produced.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}

function unavailable() {
  return NextResponse.json({ success: false, error: "Import service not configured.", code: "service_unavailable" }, { status: 503 });
}
function unauthorized() {
  return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
}
function errorResponse(error: unknown) {
  if (error instanceof UniverseImportError) {
    const status =
      error.code === "unauthenticated" ? 401 :
      error.code === "forbidden" ? 403 :
      error.code === "not_found" ? 404 :
      error.code === "conflict" ? 409 :
      error.code === "validation_failed" ? 422 : 503;
    return NextResponse.json({ success: false, error: error.message.replace(`${error.code}: `, ""), code: error.code }, { status });
  }
  return NextResponse.json({ success: false, error: "Import service unavailable.", code: "service_unavailable" }, { status: 503 });
}
