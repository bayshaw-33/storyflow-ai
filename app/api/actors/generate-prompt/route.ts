import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { mergeActorPromptInput, type ActorProfileInput } from "@/lib/actors";
import { getActorForUser, saveActorPrompt } from "@/lib/supabase/actors";
import { authenticateRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const actorId = typeof body.actorId === "string" ? body.actorId.trim() : null;
    let input = (body.actor || body) as ActorProfileInput;
    if (actorId) {
      // 只传 actorId 时，空输入字段不得覆盖已有演员数据（先合并判空再生成 prompt）。
      const existing = await getActorForUser(user.id, actorId);
      input = mergeActorPromptInput(existing, input);
    }
    const result = await saveActorPrompt(user.id, actorId || null, input);
    return ok(result);
  } catch (error) {
    return apiError(error, "生成演员提示词失败。");
  }
}
