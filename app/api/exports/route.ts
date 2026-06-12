import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest } from "@/lib/supabase/server";
import { exportProjectAsJson, exportProjectAsMarkdown } from "@/lib/supabase/phase2";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const exportType = body.exportType === "markdown" ? "markdown" : "json";
    const payload = exportType === "markdown"
      ? await exportProjectAsMarkdown(user.id, projectId)
      : await exportProjectAsJson(user.id, projectId);
    return ok({ exportType, payload });
  } catch (error) {
    return apiError(error, "导出项目失败。");
  }
}
