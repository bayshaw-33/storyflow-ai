import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  InheritanceLocalStateError,
  listLocalStates,
  upsertLocalState,
} from "@/lib/server/v2/inheritance/local-states";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ workId: string }> }) {
  try {
    const viewer = await requireViewer(request);
    const { workId } = await context.params;
    const items = await listLocalStates({ fetcher: serviceFetch, ownerId: viewer.id, workId });
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", items });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ workId: string }> }) {
  return save(request, context);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ workId: string }> }) {
  return save(request, context);
}

async function save(request: NextRequest, context: { params: Promise<{ workId: string }> }) {
  try {
    const viewer = await requireViewer(request);
    const { workId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await upsertLocalState({
      fetcher: serviceFetch,
      ownerId: viewer.id,
      workId,
      entityType: String(body.entityType ?? ""),
      entityId: String(body.entityId ?? ""),
      note: String(body.note ?? ""),
      expectedRevision: body.expectedRevision == null ? undefined : Number(body.expectedRevision),
    });
    return NextResponse.json(
      { success: true, contractVersion: "2.2.0-alpha.1", ...result },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

async function requireViewer(request: NextRequest) {
  if (!hasServiceRoleConfig()) throw new InheritanceLocalStateError("service_unavailable", "Local override service is not configured.");
  const viewer = await getViewerFromRequest(request);
  if (!viewer) throw new InheritanceLocalStateError("unauthenticated", "Authentication required.");
  return viewer;
}

function errorResponse(error: unknown) {
  if (error instanceof InheritanceLocalStateError) {
    const status = error.code === "unauthenticated" ? 401 : error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : error.code === "validation_failed" ? 422 : 503;
    return NextResponse.json({ success: false, error: error.message.replace(`${error.code}: `, ""), code: error.code }, { status });
  }
  return NextResponse.json({ success: false, error: "Local override service unavailable.", code: "service_unavailable" }, { status: 503 });
}

