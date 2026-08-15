import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { listProjectLibrary, projectLibrarySource } from "@/lib/server/v2/project-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    ensureServiceConfig();
    const projects = await listProjectLibrary(serviceFetch, user.id);
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

    const table = source === "project"
      ? "storyflow_projects"
      : source === "production"
        ? "storyflow_production_projects"
        : source === "art"
          ? "storyflow_art_projects"
          : "storyflow_viral_projects";
    const userId = encodeURIComponent(user.id);
    const ownerFilter = source === "project"
      ? `or=(owner_id.eq.${userId},user_id.eq.${userId})`
      : `${source === "viral" ? "user_id" : "owner_id"}=eq.${userId}`;
    await serviceFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(sourceId)}&${ownerFilter}`, { method: "DELETE" });
    return NextResponse.json({ success: true, source, sourceId });
  } catch (error) {
    return errorResponse(error, "项目删除失败。");
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
