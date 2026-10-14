import { NextRequest, NextResponse } from "next/server";
import {
  deleteTestAccountProjects,
  isTestCleanupEmail,
  normalizeTestCleanupSelections,
  type TestCleanupStorageObject,
} from "@/lib/server/v2/project-library/test-cleanup";
import { authenticateRequest, getSupabaseServerClient, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!isTestCleanupEmail(user.email)) {
      return NextResponse.json({ success: false }, { status: 404 });
    }
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const body = await request.json().catch(() => ({})) as { projects?: unknown };
    const projects = normalizeTestCleanupSelections(body.projects);
    const result = await deleteTestAccountProjects(serviceFetch, user.id, projects, deleteStorageObjects);
    return NextResponse.json({ success: result.deleted.length > 0, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "INVALID_TEST_CLEANUP_SELECTIONS") {
      return NextResponse.json(
        { success: false, error: "请选择有效的测试项目。", code: "invalid_selection" },
        { status: 422 },
      );
    }
    if (message.includes("MISSING_AUTH_TOKEN") || message.includes("INVALID_AUTH_TOKEN")) {
      return NextResponse.json(
        { success: false, error: "Authentication is required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { success: false, error: "测试项目清理失败。", code: "cleanup_failed" },
      { status: 503 },
    );
  }
}

async function deleteStorageObjects(objects: TestCleanupStorageObject[]) {
  const client = getSupabaseServerClient();
  if (!client) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

  const grouped = new Map<string, string[]>();
  for (const object of objects) {
    const paths = grouped.get(object.bucket) || [];
    paths.push(object.path);
    grouped.set(object.bucket, paths);
  }

  for (const [bucket, paths] of grouped) {
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await client.storage.from(bucket).remove(paths.slice(index, index + 100));
      if (error) throw new Error(`STORAGE_DELETE_FAILED:${bucket}`);
    }
  }
}
