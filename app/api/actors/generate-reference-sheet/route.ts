import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { generateMiniMaxImage } from "@/lib/ai/providers/minimax";
import { authenticateRequest } from "@/lib/supabase/server";
import { buildActorReferencePrompt, getActorForUser, saveGeneratedActorImage } from "@/lib/supabase/actors";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const actorId = String(body.actorId || "").trim();
    if (!actorId) throw new Error("ACTOR_NOT_FOUND");
    const actor = await getActorForUser(user.id, actorId);
    const prompt = buildActorReferencePrompt(actor, {
      projectStyle: String(body.projectStyle || "").trim(),
      characterRole: String(body.characterRole || "").trim(),
      costumeDirection: String(body.costumeDirection || "").trim(),
    });
    const result = await generateMiniMaxImage(prompt);
    const saved = await saveGeneratedActorImage({
      userId: user.id,
      actorId,
      imageUrl: result.imageUrl,
      assetType: "actor_reference_sheet",
      prompt,
      provider: result.provider,
      model: result.model,
    });
    return ok({ imageUrl: result.imageUrl, actor: saved.actor, asset: saved.asset, prompt });
  } catch (error) {
    return apiError(error, "生成角色参考表失败。", 502);
  }
}
