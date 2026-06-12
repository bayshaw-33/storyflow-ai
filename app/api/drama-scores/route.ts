import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest } from "@/lib/supabase/server";
import { listDramaScores, saveDramaScore } from "@/lib/supabase/phase2";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const projectId = request.nextUrl.searchParams.get("projectId") || "";
    const scores = await listDramaScores(user.id, projectId);
    return ok({ scores });
  } catch (error) {
    return apiError(error, "读取 DramaScore 失败。");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const score = await saveDramaScore(user.id, body);
    return ok({ score });
  } catch (error) {
    return apiError(error, "保存 DramaScore 失败。");
  }
}
