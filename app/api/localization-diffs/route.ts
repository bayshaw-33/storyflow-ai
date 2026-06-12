import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest } from "@/lib/supabase/server";
import { listLocalizationDiffs, saveLocalizationDiff } from "@/lib/supabase/phase2";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const projectId = request.nextUrl.searchParams.get("projectId") || "";
    const diffs = await listLocalizationDiffs(user.id, projectId);
    return ok({ diffs });
  } catch (error) {
    return apiError(error, "读取本土化 Diff 失败。");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const diff = await saveLocalizationDiff(user.id, body);
    return ok({ diff });
  } catch (error) {
    return apiError(error, "保存本土化 Diff 失败。");
  }
}
