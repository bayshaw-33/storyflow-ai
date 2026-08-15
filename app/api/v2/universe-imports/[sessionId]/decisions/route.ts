/**
 * GET  /api/v2/universe-imports/[sessionId]/decisions — decision trail (restore)
 * POST /api/v2/universe-imports/[sessionId]/decisions — append a decision
 *       body: { candidateId, action: accept|reject|merge|edit|bulk_accept,
 *               editedPayload? }
 * Phase 4 Task 4.4
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { UniverseImportSessionsService, UniverseImportError } from "@/lib/server/v2/universe-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set(["accept", "reject", "merge", "edit", "bulk_accept"]);

interface DecisionRow {
  id: string;
  session_id: string;
  candidate_id: string | null;
  action: string;
  snapshot_json: Record<string, unknown>;
  decided_by: string;
  decided_at: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromCookies();
    if (!viewer) return unauthorized();
    const { sessionId } = await params;
    const sessions = new UniverseImportSessionsService(serviceFetch);
    await sessions.getSession({ ownerId: viewer.id, sessionId });
    const rows = await serviceFetch<DecisionRow[]>(
      `/rest/v1/storyflow_universe_import_decisions?session_id=eq.${encodeURIComponent(sessionId)}&select=id,session_id,candidate_id,action,snapshot_json,decided_by,decided_at&order=decided_at.asc&limit=500`,
    ).catch(() => [] as DecisionRow[]);
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", decisions: rows ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) return unavailable();
    const viewer = await getViewerFromCookies();
    if (!viewer) return unauthorized();
    const { sessionId } = await params;
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");
    if (!ACTIONS.has(action)) {
      return NextResponse.json(
        { success: false, error: `Unknown decision action: ${action}.`, code: "validation_failed" },
        { status: 422 },
      );
    }
    const sessions = new UniverseImportSessionsService(serviceFetch);
    const session = await sessions.getSession({ ownerId: viewer.id, sessionId });
    if (session.state !== "review_required" && session.state !== "degraded" && session.state !== "ready_for_u1") {
      return NextResponse.json(
        { success: false, error: `Session state ${session.state} does not accept decisions.`, code: "conflict" },
        { status: 409 },
      );
    }

    // Append-only decision row + candidate status transition (same semantics
    // as the review state machine).
    const inserted = await serviceFetch<DecisionRow[]>(
      "/rest/v1/storyflow_universe_import_decisions",
      {
        method: "POST",
        headers: { Prefer: "return=representation", "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          candidate_id: body.candidateId ?? null,
          action,
          snapshot_json: { editedPayload: body.editedPayload ?? null },
          decided_by: viewer.id,
        }),
      },
    ).catch(() => [] as DecisionRow[]);

    if (body.candidateId && inserted.length >= 0) {
      const status = action === "accept" || action === "bulk_accept" ? "accepted" : action === "reject" ? "rejected" : action === "merge" ? "merged" : undefined;
      if (status) {
        await serviceFetch(
          `/rest/v1/storyflow_universe_import_candidates?id=eq.${encodeURIComponent(String(body.candidateId))}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal", "Content-Type": "application/json" },
            body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
          },
        ).catch(() => undefined);
      }
    }
    return NextResponse.json(
      { success: true, contractVersion: "2.2.0-alpha.1", decision: inserted?.[0] ?? null },
      { status: 201 },
    );
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
