/**
 * POST /api/storyboard/assets/generate — reference-image generation for one
 * storyboard asset (character / location / prop).
 *
 * Task card: KIIKIS-P1-KIMI-002 §4
 *
 * Flow: auth → validate → upsert asset (existing art tables) → idempotency
 * on storyflow_generation_jobs (target_type "storyboard_asset") →
 * generateArtImages → persist → insert versions → result.
 * Credits are intentionally NOT touched (internal Alpha).
 */

import { NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { ok } from "@/lib/api/responses";
import { generateArtImages } from "@/lib/art/providers";
import { isAtlasAuthorizedUser } from "@/lib/art/providers/router";
import { persistRemoteArtImage } from "@/lib/supabase/art-storage";
import type { StoryboardAssetKind } from "@/lib/storyboard/contracts";
import {
  ensureStoryboardArtProject,
  insertAssetVersions,
  upsertStoryboardAsset,
} from "@/lib/storyboard/assets/store";
import {
  buildCharacterArtPrompt,
  buildLocationArtPrompt,
  buildPropArtPrompt,
} from "@/lib/storyboard/prompts/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssetInput = {
  kind: StoryboardAssetKind;
  name: string;
  description: string;
  prompt: string;
  aliases?: string[];
};

type GenerateAssetBody = {
  projectId: string;
  sourceUnitId: string;
  asset: AssetInput;
  idempotencyKey: string;
  count: 1 | 2 | 4;
  aspectRatio: "9:16" | "16:9" | "1:1";
};

function errorResponse(status: number, code: string, error: string, details?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, code, ...(details ? { details } : {}) }, { status });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateBody(body: unknown): { ok: true; value: GenerateAssetBody } | { ok: false; response: NextResponse } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, response: errorResponse(422, "MISSING_FIELD", "请求缺少或包含非法字段: body", { fields: ["body"] }) };
  }
  const input = body as Record<string, unknown>;
  const fields: string[] = [];
  if (!isNonEmptyString(input.projectId)) fields.push("projectId");
  if (!isNonEmptyString(input.sourceUnitId)) fields.push("sourceUnitId");
  if (!isNonEmptyString(input.idempotencyKey)) fields.push("idempotencyKey");

  const asset = input.asset as Record<string, unknown> | undefined;
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
    fields.push("asset");
  } else {
    if (asset.kind !== "character" && asset.kind !== "location" && asset.kind !== "prop") fields.push("asset.kind");
    if (!isNonEmptyString(asset.name)) fields.push("asset.name");
    if (asset.description !== undefined && typeof asset.description !== "string") fields.push("asset.description");
    if (asset.prompt !== undefined && typeof asset.prompt !== "string") fields.push("asset.prompt");
    if (asset.aliases !== undefined && (!Array.isArray(asset.aliases) || asset.aliases.some((a) => typeof a !== "string"))) {
      fields.push("asset.aliases");
    }
  }

  const count = input.count === undefined ? 4 : input.count;
  if (count !== 1 && count !== 2 && count !== 4) fields.push("count");
  const aspectRatio = input.aspectRatio === undefined ? "9:16" : input.aspectRatio;
  if (aspectRatio !== "9:16" && aspectRatio !== "16:9" && aspectRatio !== "1:1") fields.push("aspectRatio");

  if (fields.length > 0) {
    return {
      ok: false,
      response: errorResponse(422, "MISSING_FIELD", `请求缺少或包含非法字段: ${fields.join(", ")}`, { fields }),
    };
  }

  return {
    ok: true,
    value: {
      projectId: (input.projectId as string).trim(),
      sourceUnitId: (input.sourceUnitId as string).trim(),
      idempotencyKey: (input.idempotencyKey as string).trim(),
      count: count as 1 | 2 | 4,
      aspectRatio: aspectRatio as "9:16" | "16:9" | "1:1",
      asset: {
        kind: asset!.kind as StoryboardAssetKind,
        name: (asset!.name as string).trim(),
        description: typeof asset!.description === "string" ? asset!.description : "",
        prompt: typeof asset!.prompt === "string" ? asset!.prompt : "",
        aliases: Array.isArray(asset!.aliases) ? (asset!.aliases as string[]) : undefined,
      },
    },
  };
}

function defaultArtPrompt(asset: AssetInput): string {
  const input = {
    name: asset.name,
    description: asset.description,
    visualKeywords: [] as string[],
    scriptBasis: "",
  };
  if (asset.kind === "character") return buildCharacterArtPrompt(input);
  if (asset.kind === "location") return buildLocationArtPrompt(input);
  return buildPropArtPrompt(input);
}

type GenerationJobRow = {
  id: string;
  status: string;
  result_metadata: Record<string, unknown>;
};

export async function POST(request: Request) {
  let user: { id: string; email: string; token: string };
  try {
    user = await authenticateRequest(request);
  } catch {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录。");
  }

  if (!hasServiceRoleConfig()) {
    return errorResponse(500, "MISSING_SUPABASE_SERVICE_ROLE_KEY", "服务端缺少 Supabase Service Role 配置。");
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse(422, "INVALID_JSON", "请求体不是合法的 JSON。");
  }
  const validated = validateBody(rawBody);
  if (!validated.ok) return validated.response;
  const body = validated.value;

  try {
    const artProjectId = await ensureStoryboardArtProject(serviceFetch, {
      ownerId: user.id,
      sourceProjectId: body.projectId,
    });
    const { assetId, variantId } = await upsertStoryboardAsset(serviceFetch, {
      ownerId: user.id,
      artProjectId,
      kind: body.asset.kind,
      name: body.asset.name,
      description: body.asset.description,
      prompt: body.asset.prompt || defaultArtPrompt(body.asset),
      aliases: body.asset.aliases,
    });

    const prompt = body.asset.prompt || defaultArtPrompt(body.asset);

    // Idempotency: reuse a non-failed job with the same key.
    const existingJobs = await serviceFetch<GenerationJobRow[]>(
      `/rest/v1/storyflow_generation_jobs?owner_id=eq.${encodeURIComponent(user.id)}&job_type=eq.image&input_params-%3E%3EidempotencyKey=eq.${encodeURIComponent(body.idempotencyKey)}&status=not.eq.failed&limit=1&select=id,status,result_metadata`,
    );
    const existing = existingJobs?.[0];
    if (existing) {
      const metadata = (existing.result_metadata ?? {}) as Record<string, unknown>;
      return ok({
        assetId,
        jobId: existing.id,
        reused: true,
        status: existing.status,
        versions: Array.isArray(metadata.versions) ? metadata.versions : [],
      });
    }

    const jobId = crypto.randomUUID();
    await serviceFetch("/rest/v1/storyflow_generation_jobs", {
      method: "POST",
      body: JSON.stringify({
        id: jobId,
        owner_id: user.id,
        job_type: "image",
        provider: "pending",
        model: null,
        prompt,
        input_params: {
          idempotencyKey: body.idempotencyKey,
          assetId,
          sourceUnitId: body.sourceUnitId,
          count: body.count,
          aspectRatio: body.aspectRatio,
        },
        status: "running",
        target_type: "storyboard_asset",
        target_id: assetId,
        project_id: body.projectId,
      }),
    });

    let generated;
    try {
      generated = await generateArtImages(
        {
          task: "concept",
          prompt,
          referenceUrls: [],
          aspectRatio: body.aspectRatio,
          count: body.count,
          selection: "smart",
        },
        { atlasAuthorized: isAtlasAuthorizedUser(user) },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await serviceFetch(`/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "failed", error: message, completed_at: new Date().toISOString() }),
      });
      return errorResponse(500, "ASSET_GENERATION_FAILED", `资产参考图生成失败: ${message}`);
    }

    const versions: Array<{ versionId: string; previewUrl: string; provider: string; model: string; prompt: string }> = [];
    const newVersions = [];
    for (let index = 0; index < generated.length; index += 1) {
      const image = generated[index];
      const stored = await persistRemoteArtImage({
        userId: user.id,
        projectId: artProjectId,
        assetId,
        remoteUrl: image.imageUrl,
        providerTaskId: image.providerTaskId,
        index,
      });
      newVersions.push({
        storagePath: stored.storagePath,
        previewUrl: stored.previewUrl,
        provider: image.provider,
        model: image.model,
        providerTaskId: image.providerTaskId,
        prompt,
        appearanceSummary: body.asset.description,
      });
    }
    const inserted = await insertAssetVersions(serviceFetch, {
      variantId,
      createdBy: user.id,
      versions: newVersions,
    });
    for (let index = 0; index < inserted.length; index += 1) {
      versions.push({
        versionId: inserted[index].versionId,
        previewUrl: newVersions[index].previewUrl,
        provider: newVersions[index].provider ?? "unknown",
        model: newVersions[index].model ?? "unknown",
        prompt,
      });
    }

    await serviceFetch(`/rest/v1/storyflow_generation_jobs?id=eq.${encodeURIComponent(jobId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "completed",
        provider: generated[0]?.provider ?? "unknown",
        model: generated[0]?.model ?? "unknown",
        result_url: versions[0]?.previewUrl ?? "",
        result_metadata: { versions },
        completed_at: new Date().toISOString(),
      }),
    });

    return ok({ assetId, jobId, reused: false, status: "completed", versions });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(500, "ASSET_GENERATION_FAILED", message);
  }
}
