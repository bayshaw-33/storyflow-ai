import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest } from "@/lib/supabase/server";
import { listAppearanceVariantsForProject, upsertAppearanceVariant } from "@/lib/supabase/actors";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await authenticateRequest(_request);
    const { projectId } = await context.params;
    const variants = await listAppearanceVariantsForProject(user.id, projectId);
    return ok({ variants });
  } catch (error) {
    return apiError(error, "读取项目形象版本失败。");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await authenticateRequest(request);
    const { projectId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const variant = await upsertAppearanceVariant(user.id, { ...body, project_id: projectId });
    return ok({ variant });
  } catch (error) {
    return apiError(error, "保存项目形象版本失败。");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return POST(request, context);
}
