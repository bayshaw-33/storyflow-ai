/**
 * POST /api/actors/:actorId/upload-view — 上传演员图组图片（替代生成）。
 *
 * KIIKIS-TR-ACTOR-P0-007: 用户可上传 PNG/JPG/WebP 图片替代 Atlas 生成。
 *
 * Body (multipart/form-data):
 *   - pack: canonical key（reference-sheet / three-view-casual / three-view-swimwear / expressions / body-details）
 *   - file: 图片文件（PNG/JPG/WebP，<= 10MB）
 *
 * 流程：
 *   1. 校验 actor 归属 + pack 合法
 *   2. ensureActorArtProject + upsertActorViewAsset（与生成共用）
 *   3. persistUploadedActorView 转存 Storage
 *   4. insertAssetVersions（source: "uploaded"）
 *   5. 返回 versionId/previewUrl/pack/shotKey/isPrimary
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { getActorViewPack } from "@/lib/art/providers/actor-image";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import { getActorForUser } from "@/lib/supabase/actors";
import { persistUploadedActorView } from "@/lib/supabase/art-storage";
import {
  ensureActorArtProject,
  upsertActorViewAsset,
  insertAssetVersions,
} from "@/lib/storyboard/assets/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ actorId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { actorId } = await context.params;
    const user = await authenticateRequest(request);
    const actor = await getActorForUser(user.id, actorId);

    const formData = await request.formData();
    const packKey = String(formData.get("pack") || "").trim();
    const file = formData.get("file");

    const pack = getActorViewPack(packKey);
    if (!pack) {
      return apiError(new Error("ACTOR_VIEW_PACK_UNKNOWN"), "未知的图组包。", 400);
    }
    if (!(file instanceof File)) {
      return apiError(new Error("FILE_REQUIRED"), "请选择要上传的图片文件。", 400);
    }

    // 1. 创建/复用 actor-scoped art project
    const artProjectId = await ensureActorArtProject(serviceFetch, {
      ownerId: user.id,
      actorId: actor.id,
    });

    // 2. 创建/复用 (actor × pack) 资产 + master variant
    const upserted = await upsertActorViewAsset(serviceFetch, {
      ownerId: user.id,
      artProjectId,
      actorId: actor.id,
      canonicalPackKey: pack.key,
      name: `${actor.name} · ${pack.label}`,
      description: `${actor.name} 的${pack.label}图组（用户上传）`,
      prompt: `uploaded:${pack.label}`,
    });

    // 3. 转存到 Storage
    const stored = await persistUploadedActorView({
      userId: user.id,
      projectId: artProjectId,
      assetId: upserted.assetId,
      file,
    });

    // 4. 写入版本（source: "uploaded"）
    const inserted = await insertAssetVersions(serviceFetch, {
      variantId: upserted.variantId,
      createdBy: user.id,
      versions: [{
        storagePath: stored.storagePath,
        previewUrl: stored.previewUrl,
        provider: "user-upload",
        model: "",
        providerTaskId: "",
        prompt: `uploaded:${pack.label}`,
        appearanceSummary: `${pack.label} · uploaded`,
        shotKey: "sheet",
        source: "uploaded",
      }],
    });

    return ok({
      pack: pack.key,
      packLabel: pack.label,
      actorId: actor.id,
      assetId: upserted.assetId,
      variantId: upserted.variantId,
      versions: [{
        versionId: inserted[0]?.versionId || "",
        previewUrl: stored.previewUrl,
        provider: "user-upload",
        model: "",
        pack: pack.key,
        shotKey: "sheet",
        isPrimary: true,
        source: "uploaded",
      }],
      requestId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ACTOR_VIEW_PACK_UNKNOWN") {
      return apiError(error, "未知的图组包。", 400);
    }
    if (message === "FILE_REQUIRED") {
      return apiError(error, "请选择要上传的图片文件。", 400);
    }
    if (message.startsWith("ACTOR_VIEW_UPLOAD_TYPE_ERROR")) {
      return apiError(error, "仅支持 PNG / JPG / WebP 格式。", 400);
    }
    if (message.startsWith("ACTOR_VIEW_UPLOAD_SIZE_ERROR")) {
      return apiError(error, "图片大小不能超过 10MB。", 400);
    }
    console.warn(JSON.stringify({ requestId, errorCode: "ACTOR_VIEW_UPLOAD_FAILED", message: message.slice(0, 100) }));
    return apiError(error, "上传演员图组失败。", 502);
  }
}
