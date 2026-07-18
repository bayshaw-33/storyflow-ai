/**
 * POST /api/actors/generate-views — 演员图组生成（参考图驱动 · 合成图模式）。
 *
 * KIIKIS-TR-ACTOR-P0-006 修复：
 *   - 每个 pack 只生成 1 张合成图（character sheet 风格）
 *   - 三视图横排3格(3:1) / 表情组2x2(1:1) / 身体细节2x2(1:1)
 *   - 失败时按 SHEET_RETRY_PLAN 自动重试 5 次：
 *       attempt 1-2: 同 prompt 换 seed
 *       attempt 3-5: 切换更保守的 promptVariants + 换 seed
 *   - 全部失败才返回 502
 *   - 单张合成图成功后转存 Storage + 写 version
 *
 * 输入 actorId + pack（canonical 或旧 underscore key）：
 *   - three-view-casual    白T牛仔三视图（3 格横排）
 *   - three-view-swimwear  泳装三视图（3 格横排）
 *   - expressions          表情组（2x2 共 4 格）
 *   - body-details         身体细节（2x2 共 4 格）
 *
 * 错误可观测性：requestId + stage + errorCode，不记密钥/URL/响应/Prompt。
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { generateArtImages } from "@/lib/art/providers";
import {
  buildActorReferenceImageRequest,
  buildActorSheetPrompt,
  firstArtImageResult,
  getActorViewPack,
  randomSheetSeed,
  sanitizeReferenceUrls,
  SHEET_RETRY_PLAN,
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
  attempt?: number;
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

class StageHandledError extends Error {
  errorCode: string;
  stage: StageError["stage"];
  attempt?: number;
  constructor(errorCode: string, stage: StageError["stage"], cause: unknown, attempt?: number) {
    super(errorCode);
    this.name = "StageHandledError";
    this.errorCode = errorCode;
    this.stage = stage;
    this.attempt = attempt;
    if (cause instanceof Error) {
      this.message = `${errorCode}: ${cause.message}`;
    }
  }
}

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
      // 合成图模式下 shotKey 固定为 "sheet"；旧版本若有多 shotKey 也兼容
      const shotKey = typeof meta.shot_key === "string" ? meta.shot_key : "sheet";
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
 *
 * 合成图模式：每个 pack 生成 1 张图，失败时按 SHEET_RETRY_PLAN 重试 5 次。
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

    // 3. 合成图生成 + 5 次重试
    type SheetResult = {
      storagePath: string;
      previewUrl: string;
      provider: string;
      model: string;
      providerTaskId: string;
      prompt: string;
      attempt: number;
    };
    let success: SheetResult | null = null;
    const failures: StageError[] = [];

    for (let i = 0; i < SHEET_RETRY_PLAN.length; i++) {
      const attempt = i + 1;
      const plan = SHEET_RETRY_PLAN[i];
      // -1 表示最后一个 variant
      const variantIdx = plan.promptVariantIndex === -1
        ? pack.promptVariants.length - 1
        : Math.min(plan.promptVariantIndex, pack.promptVariants.length - 1);
      const seed = randomSheetSeed();
      const prompt = buildActorSheetPrompt(pack, variantIdx, basePrompt);

      try {
        stage = "atlas-generation";
        const generated = await generateArtImages(
          buildActorReferenceImageRequest({
            prompt,
            negativePrompt: actor.negative_prompt || "",
            referenceUrls,
            aspectRatio: pack.aspectRatio,
            seed,
          }),
          { atlasAuthorized: true },
        );
        const image = firstArtImageResult(generated);

        // 转存到 Storage
        let stored;
        try {
          stage = "art-image-transfer";
          stored = await persistRemoteArtImage({
            userId: user.id,
            projectId: artProjectId,
            assetId,
            remoteUrl: image.imageUrl,
            providerTaskId: image.providerTaskId,
            index: 0,
          });
        } catch (error) {
          throw new StageHandledError("ART_IMAGE_TRANSFER_FAILED", "art-image-transfer", error, attempt);
        }

        success = {
          storagePath: stored.storagePath,
          previewUrl: stored.previewUrl,
          provider: image.provider,
          model: image.model,
          providerTaskId: image.providerTaskId,
          prompt,
          attempt,
        };
        break; // 成功，退出重试循环
      } catch (error) {
        const handled = error instanceof StageHandledError
          ? { stage: error.stage, errorCode: error.errorCode, attempt, message: error.message }
          : { stage: "atlas-generation" as const, errorCode: "ATLAS_GENERATION_FAILED", attempt, message: String(error) };
        failures.push(handled);
        console.warn(JSON.stringify({
          requestId,
          stage: handled.stage,
          errorCode: handled.errorCode,
          attempt,
        }));
        // 继续下一次重试
      }
    }

    if (!success) {
      // 5 次全部失败 — 返回 502 + 失败明细
      return NextResponse.json({
        success: false,
        error: "ACTOR_VIEW_SHEET_ALL_RETRIES_FAILED",
        requestId,
        failures,
      }, { status: 502 });
    }

    // 4. 写入成功版本
    let inserted: Array<{ versionId: string; storagePath: string }> = [];
    try {
      stage = "art-version-insert";
      inserted = await insertAssetVersions(serviceFetch, {
        variantId,
        createdBy: user.id,
        versions: [{
          storagePath: success.storagePath,
          previewUrl: success.previewUrl,
          provider: success.provider,
          model: success.model,
          providerTaskId: success.providerTaskId,
          prompt: success.prompt,
          appearanceSummary: `${pack.label} · sheet`,
          shotKey: "sheet",
        }],
      });
    } catch (error) {
      throw new StageHandledError("ART_VERSION_INSERT_FAILED", "art-version-insert", error);
    }

    // 5. 组装契约响应
    const versions = [{
      versionId: inserted[0]?.versionId || "",
      previewUrl: success.previewUrl,
      provider: success.provider,
      model: success.model,
      pack: pack.key,
      shotKey: "sheet",
      prompt: success.prompt,
      isPrimary: true,
      attempt: success.attempt,
    }];

    return ok({
      pack: pack.key,
      packLabel: pack.label,
      actorId: actor.id,
      assetId,
      variantId,
      versions,
      attempts: success.attempt,
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
