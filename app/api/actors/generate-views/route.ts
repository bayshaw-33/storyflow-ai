/**
 * POST /api/actors/generate-views — 演员图组生成（参考图驱动）。
 *
 * 输入 actorId + pack（canonical key 或兼容旧 underscore key）：
 *   - three-view-casual    白T牛仔裤三视图（正面 / 侧面 / 背面）
 *   - three-view-swimwear  泳装三视图（正面 / 侧面 / 背面）
 *   - expressions          表情组（微笑 / 愤怒 / 悲伤 / 惊讶）
 *   - body-details         身体细节（面部 / 手部 / 背面发型 / 全身比例）
 *
 * KIIKIS-TR-ACTOR-P0-005 修复（替代旧实现）：
 *   - 不再写 source_project_id = "actor:<actorId>"（违反 FK）
 *   - 改用 ensureActorArtProject + actor_id 作用域 + identity_anchor
 *   - 每张图独立 try/catch，单张失败不清空已成功图片
 *   - 至少一张成功时返回成功版本 + 失败明细，全部失败才 502
 *   - 每条版本明确返回 versionId/previewUrl/pack/shotKey/isPrimary
 *   - Provider 图片先转存 Supabase Storage 再写 version（persistRemoteArtImage）
 *   - GET 重新签名并恢复图片
 *
 * 错误可观测性：requestId + stage + errorCode，不记密钥/URL/响应/Prompt。
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { generateArtImages } from "@/lib/art/providers";
import {
  buildActorReferenceImageRequest,
  buildActorViewShotPrompt,
  firstArtImageResult,
  getActorViewPack,
  sanitizeReferenceUrls,
} from "@/lib/art/providers/actor-image";
import { persistRemoteArtImage, signStoredArtImage } from "@/lib/supabase/art-storage";
import { getActorForUser } from "@/lib/supabase/actors";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import {
  ensureActorArtProject,
  upsertActorViewAsset,
  insertAssetVersions,
} from "@/lib/storyboard/assets/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StageError = {
  stage: "art-project" | "art-asset" | "atlas-generation" | "art-image-transfer" | "art-version-insert";
  errorCode: string;
  shotKey?: string;
  message: string;
};

type HistoryAssetRow = {
  id: string;
  identity_anchor: string;
};

type HistoryVariantRow = {
  id: string;
  asset_id: string;
  approved_version_id: string | null;
};

type HistoryVersionRow = {
  id: string;
  variant_id: string;
  storage_path: string;
  provider: string | null;
  model: string | null;
  prompt: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/**
 * GET /api/actors/generate-views?actorId=X
 *
 * 读取该演员所有图组的历史版本。按 actor_id + identity_anchor 前缀查询。
 * 重新签名 storage_path 返回 previewUrl。
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const stage = "history-load";
  try {
    const user = await authenticateRequest(request);
    const actorId = request.nextUrl.searchParams.get("actorId")?.trim() || "";
    if (!actorId) throw new Error("ACTOR_NOT_FOUND");
    await getActorForUser(user.id, actorId);

    // 按 actor_id 查询所有 view 资产（identity_anchor 形如 actor-view:<actorId>:<pack>）
    const assets = await serviceFetch<HistoryAssetRow[]>(
      `/rest/v1/storyflow_art_assets?actor_id=eq.${encodeURIComponent(actorId)}&select=id,identity_anchor`,
    ).catch(() => [] as HistoryAssetRow[]);

    if (!assets.length) return ok({ actorId, versions: [], requestId });

    // 反解 identity_anchor 拿到 pack（不再从中文名后缀推断）
    const packByAsset = new Map<string, string>();
    for (const asset of assets) {
      const match = asset.identity_anchor.match(/^actor-view:[^:]+:(.+)$/);
      if (match) packByAsset.set(asset.id, match[1]);
    }

    const variants = await serviceFetch<HistoryVariantRow[]>(
      `/rest/v1/storyflow_art_asset_variants?asset_id=in.(${assets.map((a) => a.id).join(",")})&select=id,asset_id,approved_version_id`,
    ).catch(() => [] as HistoryVariantRow[]);

    if (!variants.length) return ok({ actorId, versions: [], requestId });

    const assetByVariant = new Map(variants.map((v) => [v.id, v.asset_id]));
    const primaryByVariant = new Map(variants.map((v) => [v.id, v.approved_version_id]));

    const rows = await serviceFetch<HistoryVersionRow[]>(
      `/rest/v1/storyflow_art_asset_versions?variant_id=in.(${variants.map((v) => v.id).join(",")})&select=id,variant_id,storage_path,provider,model,prompt,metadata,created_at&order=created_at.desc`,
    ).catch(() => [] as HistoryVersionRow[]);

    const versions = await Promise.all(rows.map(async (row) => {
      const assetId = assetByVariant.get(row.variant_id) || "";
      const pack = packByAsset.get(assetId) || "";
      const meta = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
      const isPrimary = primaryByVariant.get(row.variant_id) === row.id || meta.is_primary === true;
      const shotKey = typeof meta.shot_key === "string" ? meta.shot_key : "";
      let previewUrl = "";
      try {
        previewUrl = await signStoredArtImage(row.storage_path);
      } catch {
        previewUrl = "";
      }
      return {
        versionId: row.id,
        previewUrl,
        provider: row.provider || "atlas",
        model: row.model || "",
        pack,
        shotKey,
        createdAt: row.created_at,
        isPrimary,
      };
    }));

    return ok({
      actorId,
      versions: versions.filter((v) => v.pack && v.previewUrl),
      requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.warn(JSON.stringify({ requestId, stage, errorCode: "HISTORY_LOAD_FAILED", message: message.slice(0, 100) }));
    return apiError(error, "读取演员图组失败。", 502);
  }
}

/**
 * POST /api/actors/generate-views
 * Body: { actorId: string, pack: string }
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let stage: StageError["stage"] = "art-project";
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

    // 1. 创建/复用 actor-scoped art project（DB UNIQUE 保证幂等）
    let artProjectId: string;
    try {
      stage = "art-project";
      artProjectId = await ensureActorArtProject(serviceFetch, {
        ownerId: user.id,
        actorId: actor.id,
      });
    } catch (error) {
      throw new StageHandledError("ACTOR_ART_PROJECT_FAILED", "art-project", error);
    }

    // 2. 创建/复用 (actor × pack) 资产 + master variant
    let assetId: string;
    let variantId: string;
    try {
      stage = "art-asset";
      const upserted = await upsertActorViewAsset(serviceFetch, {
        ownerId: user.id,
        artProjectId,
        actorId: actor.id,
        canonicalPackKey: pack.key,
        name: `${actor.name} · ${pack.label}`,
        description: basePrompt || `${actor.name} 的${pack.label}图组`,
        prompt: `${pack.label}：${pack.description}`,
      });
      assetId = upserted.assetId;
      variantId = upserted.variantId;
    } catch (error) {
      throw new StageHandledError("ACTOR_ART_ASSET_FAILED", "art-asset", error);
    }

    // 3. 逐张生成 + 转存到 Storage（单张失败不影响其他）
    type GeneratedShot = {
      shotKey: string;
      shotLabel: string;
      prompt: string;
      storagePath: string;
      previewUrl: string;
      provider: string;
      model: string;
      providerTaskId: string;
    };
    const successes: GeneratedShot[] = [];
    const failures: StageError[] = [];

    await Promise.all(
      pack.shots.map(async (shot) => {
        const shotStage: StageError["stage"] = "atlas-generation";
        try {
          const prompt = buildActorViewShotPrompt(pack, shot, basePrompt);
          let image;
          try {
            const generated = await generateArtImages(
              buildActorReferenceImageRequest({
                prompt,
                negativePrompt: actor.negative_prompt || "",
                referenceUrls,
                aspectRatio: pack.aspectRatio,
              }),
              { atlasAuthorized: true },
            );
            image = firstArtImageResult(generated);
          } catch (error) {
            throw new StageHandledError("ATLAS_GENERATION_FAILED", shotStage, error, shot.key);
          }

          let stored;
          try {
            stored = await persistRemoteArtImage({
              userId: user.id,
              projectId: artProjectId,
              assetId,
              remoteUrl: image.imageUrl,
              providerTaskId: image.providerTaskId,
              index: pack.shots.indexOf(shot),
            });
          } catch (error) {
            throw new StageHandledError("ART_IMAGE_TRANSFER_FAILED", "art-image-transfer", error, shot.key);
          }

          successes.push({
            shotKey: shot.key,
            shotLabel: shot.label,
            prompt,
            storagePath: stored.storagePath,
            previewUrl: stored.previewUrl,
            provider: image.provider,
            model: image.model,
            providerTaskId: image.providerTaskId,
          });
        } catch (error) {
          const handled = error instanceof StageHandledError
            ? { stage: error.stage, errorCode: error.errorCode, shotKey: error.shotKey, message: error.message }
            : { stage: shotStage, errorCode: "ATLAS_GENERATION_FAILED", shotKey: shot.key, message: String(error) };
          failures.push(handled);
          console.warn(JSON.stringify({
            requestId,
            stage: handled.stage,
            errorCode: handled.errorCode,
            shotKey: handled.shotKey,
          }));
        }
      }),
    );

    if (!successes.length) {
      // 全部失败 — 返回 502 + 失败明细
      return NextResponse.json({
        success: false,
        error: "ACTOR_VIEW_ALL_SHOTS_FAILED",
        requestId,
        failures,
      }, { status: 502 });
    }

    // 4. 批量插入成功版本
    let inserted: Array<{ versionId: string; storagePath: string }> = [];
    try {
      stage = "art-version-insert";
      inserted = await insertAssetVersions(serviceFetch, {
        variantId,
        createdBy: user.id,
        versions: successes.map((version) => ({
          storagePath: version.storagePath,
          previewUrl: version.previewUrl,
          provider: version.provider,
          model: version.model,
          providerTaskId: version.providerTaskId,
          prompt: version.prompt,
          appearanceSummary: `${pack.label} · ${version.shotLabel}`,
          shotKey: version.shotKey,
        })),
      });
    } catch (error) {
      throw new StageHandledError("ART_VERSION_INSERT_FAILED", "art-version-insert", error);
    }

    // 5. 组装契约响应：每条版本明确返回 versionId/previewUrl/pack/shotKey/isPrimary
    const versions = successes.map((version, index) => ({
      versionId: inserted[index]?.versionId || "",
      previewUrl: version.previewUrl,
      provider: version.provider,
      model: version.model,
      pack: pack.key,
      shotKey: version.shotKey,
      shotLabel: version.shotLabel,
      prompt: version.prompt,
      isPrimary: index === 0,
    }));

    return ok({
      pack: pack.key,
      packLabel: pack.label,
      actorId: actor.id,
      assetId,
      variantId,
      versions,
      failures,
      requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ACTOR_VIEW_PACK_UNKNOWN") {
      return apiError(error, "未知的图组包，支持：three-view-casual / three-view-swimwear / expressions / body-details。", 400);
    }
    if (message === "ACTOR_AVATAR_REQUIRED") {
      return apiError(error, "请先生成演员头像：图组生成需要可访问的头像 URL 作为参考图。", 400);
    }
    let errorCode = "ACTOR_VIEW_GENERATION_FAILED";
    if (error instanceof StageHandledError) {
      errorCode = error.errorCode;
      stage = error.stage;
    }
    console.warn(JSON.stringify({ requestId, stage, errorCode, message: message.slice(0, 100) }));
    return apiError(error, "生成演员图组失败。", 502);
  }
}

class StageHandledError extends Error {
  errorCode: string;
  stage: StageError["stage"];
  shotKey?: string;
  constructor(errorCode: string, stage: StageError["stage"], cause: unknown, shotKey?: string) {
    super(errorCode);
    this.name = "StageHandledError";
    this.errorCode = errorCode;
    this.stage = stage;
    this.shotKey = shotKey;
    if (cause instanceof Error) {
      // 保留原始 message 供日志，但不暴露给客户端
      this.message = `${errorCode}: ${cause.message}`;
    }
  }
}

