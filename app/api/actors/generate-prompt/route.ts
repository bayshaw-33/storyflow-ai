import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest } from "@/lib/supabase/server";
import { saveActorPrompt } from "@/lib/supabase/actors";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const actorId = typeof body.actorId === "string" ? body.actorId.trim() : null;
    const result = await saveActorPrompt(user.id, actorId || null, body.actor || body);
    return ok(result);
  } catch (error) {
    return apiError(error, "生成演员提示词失败。");
  }
}
