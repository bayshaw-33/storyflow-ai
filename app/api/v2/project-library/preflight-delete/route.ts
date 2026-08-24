import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { projectLibrarySource } from "@/lib/server/v2/project-library";
import { getProjectDeletePreflight } from "@/lib/server/v2/project-library/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
    const body = await request.json().catch(() => ({})) as { source?: unknown; sourceId?: unknown };
    const source = projectLibrarySource(body.source);
    const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
    if (!sourceId) return NextResponse.json({ success: false, error: "缺少项目标识。" }, { status: 422 });
    const preflight = await getProjectDeletePreflight(serviceFetch, user.id, { source, sourceId });
    if (preflight.decision === "not_found") {
      return NextResponse.json({ success: false, error: "项目不存在或你无权管理。", code: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, preflight });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const unavailable = message.includes("MISSING_AUTH_TOKEN") || message.includes("INVALID_AUTH_TOKEN")
      ? { error: "Authentication is required.", code: "unauthenticated", status: 401 }
      : { error: "项目清理服务暂时不可用。", code: "service_unavailable", status: 503 };
    return NextResponse.json({ success: false, error: unavailable.error, code: unavailable.code }, { status: unavailable.status });
  }
}
