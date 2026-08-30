import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/supabase/server";
import {
  readLatestPrevisVersion,
  readPrevisVersion,
  savePrevisVersion,
  type SavePrevisVersionInput,
} from "@/lib/server/previs-versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ shotId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await authenticateRequest(request);
    const { shotId } = await context.params;
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim();
    const sourceUnitId = request.nextUrl.searchParams.get("sourceUnitId")?.trim();
    const versionId = request.nextUrl.searchParams.get("versionId")?.trim();
    if (!shotId || !projectId || !sourceUnitId) return badRequest("缺少 shotId、projectId 或 sourceUnitId。");
    const scope = { userId: user.id, projectId, sourceUnitId, shotId };
    const version = versionId
      ? await readPrevisVersion({ ...scope, versionId })
      : await readLatestPrevisVersion(scope);
    return NextResponse.json({ success: true, version });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await authenticateRequest(request);
    const { shotId } = await context.params;
    const body = await request.json() as Omit<SavePrevisVersionInput, "shotId">;
    if (!shotId || !isSaveBody(body)) return badRequest("白模版本请求缺少项目、工作单元、revision 或场景数据。");
    const version = await savePrevisVersion({ userId: user.id, input: { ...body, shotId } });
    return NextResponse.json({ success: true, version });
  } catch (error) {
    return routeError(error);
  }
}

function isSaveBody(value: Omit<SavePrevisVersionInput, "shotId">): value is Omit<SavePrevisVersionInput, "shotId"> {
  return Boolean(
    value
    && typeof value.projectId === "string" && value.projectId.trim()
    && typeof value.workId === "string" && value.workId.trim()
    && typeof value.sourceUnitId === "string" && value.sourceUnitId.trim()
    && Number.isInteger(value.storyboardRevision) && value.storyboardRevision >= 0
    && value.scene && typeof value.scene === "object",
  );
}

function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "PREVIS_VERSION_ERROR";
  if (message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN") {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }
  const status = message.includes("NOT_FOUND") ? 404
    : message.includes("STALE") || message.includes("NOT_CONFIRMED") ? 409
      : message.includes("REQUIRED") || message.includes("INVALID") ? 422
        : 500;
  return NextResponse.json({ success: false, error: message }, { status });
}
