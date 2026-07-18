import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { generateArtImages } from "@/lib/art/providers";
import { buildActorAvatarPrompt, buildActorTextToImageRequest, firstArtImageResult } from "@/lib/art/providers/actor-image";
import { authenticateRequest } from "@/lib/supabase/server";
import { getActorForUser, saveGeneratedActorImage } from "@/lib/supabase/actors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const actorId = String(body.actorId || "").trim();
    if (!actorId) throw new Error("ACTOR_NOT_FOUND");
    const actor = await getActorForUser(user.id, actorId);
    const basePrompt = String(body.prompt || actor.base_prompt || "").trim();
    if (!basePrompt) throw new Error("ACTOR_PROMPT_REQUIRED");
    // 白底正面特写肖像：作为后续参考表 / 图组的身份锚点
    const prompt = buildActorAvatarPrompt(basePrompt);
    const generated = await generateArtImages(
      buildActorTextToImageRequest({
        prompt,
        negativePrompt: actor.negative_prompt || "",
        aspectRatio: "1:1",
      }),
      { atlasAuthorized: true },
    );
    const result = firstArtImageResult(generated);
    const saved = await saveGeneratedActorImage({
      userId: user.id,
      actorId,
      imageUrl: result.imageUrl,
      assetType: "actor_avatar",
      prompt,
      provider: result.provider,
      model: result.model,
    });
    return ok({ imageUrl: result.imageUrl, actor: saved.actor, asset: saved.asset, prompt });
  } catch (error) {
    return apiError(error, "生成演员头像失败。", 502);
  }
}
