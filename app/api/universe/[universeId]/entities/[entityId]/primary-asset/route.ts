import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { assertUniverseWriteAccess } from "@/lib/supabase/universe-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EntityRow = {
  id: string;
  universe_id: string;
  primary_asset_version_id: string | null;
};

type AssetVersionRow = {
  id: string;
  variant_id: string;
  created_by: string;
};

type AssetVariantRow = {
  id: string;
  asset_id: string;
};

type AssetRow = {
  id: string;
  user_id: string;
  team_id: string | null;
};

export async function PATCH(request: NextRequest, context: { params: Promise<{ universeId: string; entityId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { universeId, entityId } = await context.params;
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    // PRD §9.4 鉴权：assertUniverseWriteAccess（user_id 匹配或 team editor+）
    await assertUniverseWriteAccess(user.id, universeId);

    // 验证 entity 属于该 universe —— 不属于则 404
    const entityRows = await serviceFetch<EntityRow[]>(
      `/rest/v1/storyflow_universe_entities?id=eq.${encodeURIComponent(entityId)}&universe_id=eq.${encodeURIComponent(universeId)}&select=id,universe_id,primary_asset_version_id&limit=1`,
    );
    const entity = entityRows[0];
    if (!entity) throw new Error("UNIVERSE_NOT_FOUND");

    // PRD §9.4 不接受客户端直接提交图片 URL —— 必须传 assetVersionId
    const body = await request.json().catch(() => ({}));
    const assetVersionId = String(body?.assetVersionId || "").trim();
    if (!assetVersionId) throw new Error("ASSET_VERSION_REQUIRED");

    // 验证 assetVersionId 属于同一 owner/team
    // 链路：storyflow_art_asset_versions -> storyflow_art_asset_variants -> storyflow_art_assets
    const versions = await serviceFetch<AssetVersionRow[]>(
      `/rest/v1/storyflow_art_asset_versions?id=eq.${encodeURIComponent(assetVersionId)}&select=id,variant_id,created_by&limit=1`,
    );
    const version = versions[0];
    if (!version) throw new Error("ASSET_VERSION_NOT_FOUND");

    const variants = await serviceFetch<AssetVariantRow[]>(
      `/rest/v1/storyflow_art_asset_variants?id=eq.${encodeURIComponent(version.variant_id)}&select=id,asset_id&limit=1`,
    ).catch(() => [] as AssetVariantRow[]);
    const variant = variants[0];
    if (!variant) throw new Error("ASSET_VERSION_NOT_FOUND");

    const assets = await serviceFetch<AssetRow[]>(
      `/rest/v1/storyflow_art_assets?id=eq.${encodeURIComponent(variant.asset_id)}&select=id,user_id,team_id&limit=1`,
    ).catch(() => [] as AssetRow[]);
    const asset = assets[0];

    const ownerOk = asset && (asset.user_id === user.id || (asset.team_id && await isUserInTeam(user.id, asset.team_id)));
    if (!ownerOk) throw new Error("ASSET_FORBIDDEN");

    // UPDATE entity SET primary_asset_version_id = X
    await serviceFetch(`/rest/v1/storyflow_universe_entities?id=eq.${encodeURIComponent(entityId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        primary_asset_version_id: assetVersionId,
        updated_at: new Date().toISOString(),
      }),
    });

    return ok({
      entity: { id: entityId, primaryAssetVersionId: assetVersionId },
      requestId,
    });
  } catch (error) {
    return await errorWithRequestId(error, "更新实体主图失败。", requestId);
  }
}

async function isUserInTeam(userId: string, teamId: string): Promise<boolean> {
  try {
    const rows = await serviceFetch<Array<{ team_id: string }>>(
      `/rest/v1/storyflow_team_members?team_id=eq.${encodeURIComponent(teamId)}&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=team_id&limit=1`,
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function errorWithRequestId(error: unknown, fallback: string, requestId: string) {
  const errRes = apiError(error, fallback);
  const body = await errRes.json().catch(() => ({ success: false, error: fallback }));
  return NextResponse.json({ ...body, requestId }, { status: errRes.status });
}
