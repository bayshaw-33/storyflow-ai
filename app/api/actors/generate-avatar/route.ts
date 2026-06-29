import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { generateMiniMaxImage } from "@/lib/ai/providers/minimax";
import { authenticateRequest } from "@/lib/supabase/server";
import { getActorForUser, saveGeneratedActorImage } from "@/lib/supabase/actors";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const actorId = String(body.actorId || "").trim();
    if (!actorId) throw new Error("ACTOR_NOT_FOUND");
    const actor = await getActorForUser(user.id, actorId);
    const prompt = String(body.prompt || actor.base_prompt || "").trim();
    if (!prompt) throw new Error("ACTOR_PROMPT_REQUIRED");
    const result = await generateMiniMaxImage(`${prompt}\n\nPortrait avatar, clean studio lighting, single fictional virtual actor.`);
    const saved = await saveGeneratedActorImage({
      userId: user.id,
      actorId,
      imageUrl: result.imageUrl,
      assetType: "actor_avatar",
      prompt,
      provider: result.provider,
      model: result.model,
    });
    return ok({ imageUrl: result.imageUrl, actor: saved.actor, asset: saved.asset });
  } catch (error) {
    return apiError(error, "生成演员头像失败。", 502);
  }
}
