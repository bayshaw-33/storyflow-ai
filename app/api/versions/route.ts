import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { compareJsonVersions, compareTextVersions } from "@/lib/diff";
import { authenticateRequest } from "@/lib/supabase/server";
import { createVersion, listVersions, restoreVersion, saveDiffToVersion } from "@/lib/supabase/phase2";

type VersionRow = {
  id: string;
  snapshot_text?: string | null;
  snapshot_json?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const projectId = request.nextUrl.searchParams.get("projectId") || "";
    const versionA = request.nextUrl.searchParams.get("versionA");
    const versionB = request.nextUrl.searchParams.get("versionB");
    const versions = await listVersions(user.id, {
      projectId,
      entityType: request.nextUrl.searchParams.get("entityType") || undefined,
      entityId: request.nextUrl.searchParams.get("entityId") || undefined,
      stepKey: request.nextUrl.searchParams.get("stepKey") || undefined,
    }) as VersionRow[];

    if (versionA && versionB) {
      const a = versions.find((version) => version.id === versionA);
      const b = versions.find((version) => version.id === versionB);
      return ok({
        versions,
        diff: {
          text: compareTextVersions(a?.snapshot_text || "", b?.snapshot_text || ""),
          json: compareJsonVersions(a?.snapshot_json || {}, b?.snapshot_json || {}),
        },
      });
    }

    return ok({ versions });
  } catch (error) {
    return apiError(error, "读取版本失败。");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const version = await createVersion(user.id, body);
    return ok({ version });
  } catch (error) {
    return apiError(error, "保存版本失败。");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    if (body.action === "restore") {
      const version = await restoreVersion(user.id, body.versionId);
      return ok({ version });
    }
    if (body.action === "save_diff") {
      const version = await saveDiffToVersion(user.id, body.versionId, body.diffJson || {});
      return ok({ version });
    }
    return apiError(new Error("UNKNOWN_VERSION_ACTION"), "不支持的版本操作。");
  } catch (error) {
    return apiError(error, "版本操作失败。");
  }
}
