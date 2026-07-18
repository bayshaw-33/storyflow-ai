import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { getActorForUser } from "@/lib/supabase/actors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/actors/:actorId/primary-version
// PRD §7.2 主版本持久化：把指定 versionId 标记为该 variant 内的主版本，
// 同 variant 其他版本的 metadata.is_primary 置 false。
// 主版本信息存储在 storyflow_art_asset_versions.metadata.is_primary (jsonb bool)，
// 不需要新列，刷新后从 GET /api/actors/generate-views 恢复。
//
// 安全：actor 必须属于当前用户；version 必须挂在 actor 的 art_project 下。
type VersionRow = {
  id: string;
  variant_id: string;
  metadata: Record<string, unknown> | null;
};

type VariantRow = {
  id: string;
  asset_id: string;
};

type AssetRow = {
  id: string;
  project_id: string;
};

type ArtProjectRow = {
  id: string;
  owner_id: string;
  source_project_id: string;
};

export async function PATCH(request: NextRequest, context: { params: Promise<{ actorId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { actorId } = await context.params;
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    // 校验 actor 归属
    await getActorForUser(user.id, actorId);

    const body = await request.json().catch(() => ({}));
    const versionId = String(body.versionId || "").trim();
    if (!versionId) throw new Error("VERSION_REQUIRED");

    // 拉取目标 version，校验它挂在当前 actor 的 art_project 下
    const versionRows = await serviceFetch<VersionRow[]>(
      `/rest/v1/storyflow_art_asset_versions?id=eq.${encodeURIComponent(versionId)}&select=id,variant_id,metadata&limit=1`,
    );
    const version = versionRows[0];
    if (!version) throw new Error("VERSION_NOT_FOUND");

    const variantRows = await serviceFetch<VariantRow[]>(
      `/rest/v1/storyflow_art_asset_variants?id=eq.${encodeURIComponent(version.variant_id)}&select=id,asset_id&limit=1`,
    );
    const variant = variantRows[0];
    if (!variant) throw new Error("VERSION_NOT_FOUND");

    const assetRows = await serviceFetch<AssetRow[]>(
      `/rest/v1/storyflow_art_assets?id=eq.${encodeURIComponent(variant.asset_id)}&select=id,project_id&limit=1`,
    );
    const asset = assetRows[0];
    if (!asset) throw new Error("VERSION_NOT_FOUND");

    const artProjectRows = await serviceFetch<ArtProjectRow[]>(
      `/rest/v1/storyflow_art_projects?id=eq.${encodeURIComponent(asset.project_id)}&select=id,owner_id,source_project_id&limit=1`,
    );
    const artProject = artProjectRows[0];
    if (!artProject) throw new Error("VERSION_NOT_FOUND");
    // 严格校验：art_project 必须属于当前用户 且 source_project_id 必须匹配 actor
    if (artProject.owner_id !== user.id) throw new Error("VERSION_FORBIDDEN");
    if (artProject.source_project_id !== `actor:${actorId}`) throw new Error("VERSION_FORBIDDEN");

    // 把同 variant 下其他 version 的 is_primary 置 false
    // PostgREST PATCH 支持 ?variant_id=eq.X 过滤
    await serviceFetch(
      `/rest/v1/storyflow_art_asset_versions?variant_id=eq.${encodeURIComponent(variant.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          metadata: { is_primary: false },
        }),
      },
    );

    // 把目标 version 的 is_primary 置 true（保留原有 metadata 其他字段）
    const existingMeta = version.metadata && typeof version.metadata === "object" ? version.metadata : {};
    await serviceFetch(
      `/rest/v1/storyflow_art_asset_versions?id=eq.${encodeURIComponent(versionId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          metadata: { ...existingMeta, is_primary: true },
        }),
      },
    );

    return ok({ versionId, isPrimary: true, requestId });
  } catch (error) {
    const errRes = apiError(error, "更新主版本失败。");
    const body = await errRes.json().catch(() => ({ success: false, error: "更新主版本失败。" }));
    return NextResponse.json({ ...body, requestId }, { status: errRes.status });
  }
}
