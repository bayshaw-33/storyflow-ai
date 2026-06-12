import { NextRequest } from "next/server";
import type { TaskType } from "@/lib/ai/prompts";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest } from "@/lib/supabase/server";
import { listProjectSteps, readProjectStep, saveProjectStep } from "@/lib/supabase/phase2";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const projectId = request.nextUrl.searchParams.get("projectId") || "";
    const stepKey = request.nextUrl.searchParams.get("stepKey") as TaskType | null;
    const result = stepKey ? await readProjectStep(user.id, projectId, stepKey) : await listProjectSteps(user.id, projectId);
    return ok({ steps: result });
  } catch (error) {
    return apiError(error, "读取步骤失败。");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const step = await saveProjectStep(user.id, body);
    return ok({ step });
  } catch (error) {
    return apiError(error, "保存步骤失败。");
  }
}

export async function PATCH(request: NextRequest) {
  return POST(request);
}
