import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { generateArtImages } from "@/lib/art/providers";
import { buildActorReferenceImageRequest, firstArtImageResult, sanitizeReferenceUrls } from "@/lib/art/providers/actor-image";
import { authenticateRequest } from "@/lib/supabase/server";
import { buildActorReferencePrompt, getActorForUser, saveGeneratedActorImage } from "@/lib/supabase/actors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    // 参考图驱动：演员头像作为 images 参考输入（Atlas 图生图模型）；
    // 无可用 http 头像时退化为文生图，并通过 referenceUsed 显式告知前端。
    const referenceUrls = sanitizeReferenceUrls([actor.avatar_url]);
    const generated = await generateArtImages(
      buildActorReferenceImageRequest({
        prompt,
        negativePrompt: actor.negative_prompt || "",
        referenceUrls,
        aspectRatio: "4:3",
      }),
      { atlasAuthorized: true },
    );
    const result = firstArtImageResult(generated);
    const saved = await saveGeneratedActorImage({
      userId: user.id,
      actorId,
      imageUrl: result.imageUrl,
      assetType: "actor_reference_sheet",
      prompt,
      provider: result.provider,
      model: result.model,
    });
    return ok({
      imageUrl: result.imageUrl,
      actor: saved.actor,
      asset: saved.asset,
      prompt,
      referenceUsed: referenceUrls.length > 0,
      references: referenceUrls,
    });
  } catch (error) {
    return apiError(error, "生成角色参考表失败。", 502);
  }
}
