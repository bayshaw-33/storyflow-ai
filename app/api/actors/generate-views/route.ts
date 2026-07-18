/**
 * POST /api/actors/generate-views — 演员图组生成（参考图驱动）。
 *
 * 输入 actorId + pack：
 *   - three-view-casual    白T牛仔裤三视图（正面 / 侧面 / 背面）
 *   - three-view-swimwear  泳装三视图（正面 / 侧面 / 背面）
 *   - expressions          表情组（微笑 / 愤怒 / 悲伤 / 惊讶）
 *   - body-details         身体细节（面部 / 手部 / 背面发型 / 全身比例）
 *
 * 以演员头像 + 基础描述作为参考图逐张生成（Atlas 图生图模型），逐张持久化
 * 到 storyflow_art_asset_versions（persistRemoteArtImage + insertAssetVersions
 * 模式，与 storyboard 资产共用现有 art 表），返回 versions 列表。
 *
 * 演员没有可远程抓取的头像时显式报错（ACTOR_AVATAR_REQUIRED），任何一张
 * 生成或持久化失败都会以错误响应结束，不静默降级。
 */

import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { generateArtImages } from "@/lib/art/providers";
import {
  buildActorReferenceImageRequest,
  buildActorViewShotPrompt,
  ACTOR_VIEW_PACKS,
  firstArtImageResult,
  getActorViewPack,
  sanitizeReferenceUrls,
} from "@/lib/art/providers/actor-image";
import { persistRemoteArtImage, signStoredArtImage } from "@/lib/supabase/art-storage";
import { getActorForUser } from "@/lib/supabase/actors";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import { ensureStoryboardArtProject, insertAssetVersions, upsertStoryboardAsset } from "@/lib/storyboard/assets/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const actorId = request.nextUrl.searchParams.get("actorId")?.trim() || "";
    if (!actorId) throw new Error("ACTOR_NOT_FOUND");
    await getActorForUser(user.id, actorId);

    const projects = await serviceFetch<Array<{ id: string }>>(
      `/rest/v1/storyflow_art_projects?owner_id=eq.${encodeURIComponent(user.id)}&source_project_id=eq.${encodeURIComponent(`actor:${actorId}`)}&name=eq.${encodeURIComponent("Storyboard Assets")}&select=id&limit=1`,
    );
    const projectId = projects[0]?.id;
    if (!projectId) return ok({ actorId, versions: [] });

    const assets = await serviceFetch<Array<{ id: string; name: string }>>(
      `/rest/v1/storyflow_art_assets?project_id=eq.${encodeURIComponent(projectId)}&kind=eq.character&select=id,name`,
    );
    if (!assets.length) return ok({ actorId, versions: [] });
    const packByAsset = new Map<string, string>();
    for (const asset of assets) {
      const pack = ACTOR_VIEW_PACKS.find((candidate) => asset.name.endsWith(candidate.label));
      if (pack) packByAsset.set(asset.id, pack.key);
    }

    const variants = await serviceFetch<Array<{ id: string; asset_id: string }>>(
      `/rest/v1/storyflow_art_asset_variants?asset_id=in.(${assets.map((asset) => asset.id).join(",")})&select=id,asset_id`,
    );
    if (!variants.length) return ok({ actorId, versions: [] });
    const assetByVariant = new Map(variants.map((variant) => [variant.id, variant.asset_id]));
    const rows = await serviceFetch<Array<{
      id: string;
      variant_id: string;
      storage_path: string;
      provider: string | null;
      model: string | null;
      prompt: string;
      metadata: Record<string, unknown> | null;
      created_at: string;
    }>>(
      `/rest/v1/storyflow_art_asset_versions?variant_id=in.(${variants.map((variant) => variant.id).join(",")})&select=id,variant_id,storage_path,provider,model,prompt,metadata,created_at&order=created_at.desc`,
    );

    const versions = await Promise.all(rows.map(async (row) => {
      const assetId = assetByVariant.get(row.variant_id) || "";
      const pack = packByAsset.get(assetId) || "";
      return {
        versionId: row.id,
        previewUrl: await signStoredArtImage(row.storage_path),
        storagePath: row.storage_path,
        provider: row.provider || "atlas",
        model: row.model || "",
        prompt: row.prompt || "",
        pack,
        createdAt: row.created_at,
      };
    }));

    return ok({ actorId, versions: versions.filter((version) => version.pack) });
  } catch (error) {
    return apiError(error, "读取演员图组失败。", 502);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const actorId = String(body.actorId || "").trim();
    if (!actorId) throw new Error("ACTOR_NOT_FOUND");

    const pack = getActorViewPack(String(body.pack || "").trim());
    if (!pack) throw new Error("ACTOR_VIEW_PACK_UNKNOWN");

    const actor = await getActorForUser(user.id, actorId);
    const referenceUrls = sanitizeReferenceUrls([actor.avatar_url]);
    if (!referenceUrls.length) throw new Error("ACTOR_AVATAR_REQUIRED");
    const basePrompt = String(actor.base_prompt || "").trim();

    // 每个演员一个 art project；每个 (演员 × 图组包) 一个 character 资产，
    // 版本挂在该资产的 master variant 下。
    const artProjectId = await ensureStoryboardArtProject(serviceFetch, {
      ownerId: user.id,
      sourceProjectId: `actor:${actor.id}`,
    });
    const { assetId, variantId } = await upsertStoryboardAsset(serviceFetch, {
      ownerId: user.id,
      artProjectId,
      kind: "character",
      name: `${actor.name} · ${pack.label}`,
      description: basePrompt || `${actor.name} 的${pack.label}图组`,
      prompt: `${pack.label}：${pack.description}`,
    });

    const generatedVersions = await Promise.all(
      pack.shots.map(async (shot, index) => {
        const prompt = buildActorViewShotPrompt(pack, shot, basePrompt);
        const generated = await generateArtImages(
          buildActorReferenceImageRequest({
            prompt,
            negativePrompt: actor.negative_prompt || "",
            referenceUrls,
            aspectRatio: pack.aspectRatio,
          }),
          { atlasAuthorized: true },
        );
        const image = firstArtImageResult(generated);
        const stored = await persistRemoteArtImage({
          userId: user.id,
          projectId: artProjectId,
          assetId,
          remoteUrl: image.imageUrl,
          providerTaskId: image.providerTaskId,
          index,
        });
        return {
          shotKey: shot.key,
          shotLabel: shot.label,
          prompt,
          storagePath: stored.storagePath,
          previewUrl: stored.previewUrl,
          provider: image.provider,
          model: image.model,
          providerTaskId: image.providerTaskId,
        };
      }),
    );

    const inserted = await insertAssetVersions(serviceFetch, {
      variantId,
      createdBy: user.id,
      versions: generatedVersions.map((version) => ({
        storagePath: version.storagePath,
        previewUrl: version.previewUrl,
        provider: version.provider,
        model: version.model,
        providerTaskId: version.providerTaskId,
        prompt: version.prompt,
        appearanceSummary: `${pack.label} · ${version.shotLabel}`,
      })),
    });

    const versions = generatedVersions.map((version, index) => ({
      versionId: inserted[index]?.versionId || "",
      storagePath: version.storagePath,
      previewUrl: version.previewUrl,
      provider: version.provider,
      model: version.model,
      shotKey: version.shotKey,
      shotLabel: version.shotLabel,
      prompt: version.prompt,
    }));

    return ok({
      pack: pack.key,
      packLabel: pack.label,
      actorId: actor.id,
      assetId,
      variantId,
      versions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ACTOR_VIEW_PACK_UNKNOWN") {
      return apiError(error, "未知的图组包，支持：three-view-casual / three-view-swimwear / expressions / body-details。", 400);
    }
    if (message === "ACTOR_AVATAR_REQUIRED") {
      return apiError(error, "请先生成演员头像：图组生成需要可访问的头像 URL 作为参考图。", 400);
    }
    return apiError(error, "生成演员图组失败。", 502);
  }
}
