import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { listProjectLibrary, projectLibrarySource } from "@/lib/server/v2/project-library";
import { deletePreflightedProject, setPrimaryProjectArchiveState } from "@/lib/server/v2/project-library/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    ensureServiceConfig();
    const archived = new URL(request.url).searchParams.get("view") === "archived";
    const projects = await listProjectLibrary(serviceFetch, user.id, { archived });
    return NextResponse.json({ success: true, projects, contractVersion: "2.0.0-alpha.1" });
  } catch (error) {
    return errorResponse(error, "项目数据加载失败。");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    ensureServiceConfig();
    const body = await request.json().catch(() => ({})) as { source?: unknown; sourceId?: unknown };
    const source = projectLibrarySource(body.source);
    const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
    if (!sourceId) return NextResponse.json({ success: false, error: "缺少项目标识。" }, { status: 422 });

    await deletePreflightedProject(serviceFetch, user.id, { source, sourceId });
    return NextResponse.json({ success: true, source, sourceId });
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_ARCHIVE_ONLY") {
      return NextResponse.json({ success: false, error: "项目含有创作内容或关联记录，请归档而不是永久删除。", code: "archive_only" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND_OR_FORBIDDEN") {
      return NextResponse.json({ success: false, error: "项目不存在或你无权删除。", code: "not_found" }, { status: 404 });
    }
    return errorResponse(error, "项目删除失败。");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    ensureServiceConfig();
    const body = await request.json().catch(() => ({})) as { source?: unknown; sourceId?: unknown; action?: unknown };
    const source = projectLibrarySource(body.source);
    const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
    const action = body.action === "restore" ? "restore" : body.action === "archive" ? "archive" : null;
    if (!sourceId || !action) return NextResponse.json({ success: false, error: "归档请求无效。" }, { status: 422 });
    if (source !== "project") return NextResponse.json({ success: false, error: "当前仅支持归档主项目。" }, { status: 422 });
    await setPrimaryProjectArchiveState(serviceFetch, user.id, sourceId, action);
    return NextResponse.json({ success: true, source, sourceId, action });
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND_OR_FORBIDDEN") {
      return NextResponse.json({ success: false, error: "项目不存在或你无权管理。", code: "not_found" }, { status: 404 });
    }
    return errorResponse(error, "项目归档失败。");
  }
}

function ensureServiceConfig() {
  if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("MISSING_AUTH_TOKEN") || message.includes("INVALID_AUTH_TOKEN")) {
    return NextResponse.json({ success: false, error: "Authentication is required.", code: "unauthenticated" }, { status: 401 });
  }
  if (message.includes("MISSING_SUPABASE") || message.includes("SERVICE_ROLE")) {
    return NextResponse.json({ success: false, error: "Cloud data service is not configured.", code: "service_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ success: false, error: fallback, code: "service_unavailable" }, { status: 503 });
}
