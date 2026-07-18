import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { getActorForUser } from "@/lib/supabase/actors";
import type { ActorProfile } from "@/lib/actors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssetRow = {
  id: string;
  user_id: string;
  team_id: string | null;
  asset_type: string;
  metadata: Record<string, unknown> | null;
};

type ImagePackCompleteness = {
  avatar: boolean;
  threeViewCasual: boolean;
  threeViewSwimwear: boolean;
  expressions: boolean;
  bodyDetails: boolean;
};

export type ActorDetail = Omit<ActorProfile, "storage_source"> & {
  imagePackCompleteness: ImagePackCompleteness;
  portrayalCount: number;
};

export async function GET(request: NextRequest, context: { params: Promise<{ actorId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { actorId } = await context.params;
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    // getActorForUser 处理 404 与 403：ACTOR_NOT_FOUND / ACTOR_FORBIDDEN
    const actor = await getActorForUser(user.id, actorId);

    // imagePackCompleteness：查 storyflow_assets 按 asset_type/pack 标签判断
    const imagePackCompleteness = await resolveImagePackCompleteness(actor);

    // portrayalCount：仅统计当前用户可读的 portrayal（owner_id 匹配或 team 共享）
    const portrayalCount = await countPortrayalsForActor(user.id, actor);

    const detail: ActorDetail = {
      ...actor,
      imagePackCompleteness,
      portrayalCount,
    };

    return ok({ actor: detail, requestId });
  } catch (error) {
    return await errorWithRequestId(error, "读取演员详情失败。", requestId);
  }
}

async function resolveImagePackCompleteness(actor: ActorProfile): Promise<ImagePackCompleteness> {
  const assetIds = [actor.avatar_asset_id, actor.reference_sheet_asset_id].filter(Boolean) as string[];
  // 查询该 actor 关联的所有 asset（通过 metadata.actor_id 反查 + 直接 id 查询）
  // KIIKIS-TR-ACTOR-P0-009: 两次独立查询并行化
  const [directAssets, actorAssets] = await Promise.all([
    assetIds.length
      ? serviceFetch<AssetRow[]>(
          `/rest/v1/storyflow_assets?id=in.(${assetIds.map(encodeURIComponent).join(",")})&select=id,user_id,team_id,asset_type,metadata`,
        ).catch(() => [] as AssetRow[])
      : Promise.resolve([] as AssetRow[]),
    serviceFetch<AssetRow[]>(
      `/rest/v1/storyflow_assets?metadata->>actor_id=eq.${encodeURIComponent(actor.id)}&select=id,user_id,team_id,asset_type,metadata`,
    ).catch(() => [] as AssetRow[]),
  ]);

  const all = [...directAssets, ...actorAssets];
  const types = new Set<string>();
  const packs = new Set<string>();
  for (const asset of all) {
    if (asset.asset_type) types.add(asset.asset_type);
    const meta = asset.metadata || {};
    const pack = typeof meta.pack === "string" ? meta.pack : typeof meta.image_pack === "string" ? meta.image_pack : "";
    if (pack) packs.add(pack);
  }

  // canonical pack key：three-view-casual / three-view-swimwear / expressions / body-details
  // 同时兼容旧 underscore key（three_view_casual 等）以防 staging 旧数据
  return {
    avatar: actor.avatar_asset_id != null || types.has("actor_avatar"),
    threeViewCasual: packs.has("three-view-casual") || packs.has("three_view_casual") || types.has("actor_three_view"),
    threeViewSwimwear: packs.has("three-view-swimwear") || packs.has("three_view_swimwear") || types.has("actor_three_view_swimwear"),
    expressions: packs.has("expressions") || types.has("actor_expressions"),
    bodyDetails: packs.has("body-details") || packs.has("body_details") || types.has("actor_body_details"),
  };
}

async function countPortrayalsForActor(userId: string, actor: ActorProfile): Promise<number> {
  // KIIKIS-TR-ACTOR-P0-009: owner 和 team 查询并行 + 改用 select=id&limit=0 拿总数（避免拉 1000 行）
  // PostgREST 在 limit=0 时仍返回 Content-Range header，但 serviceFetch 不解析 header
  // 退而求其次：用 select=id&limit=1000 但只取 length（与原逻辑一致，但并行）
  const ownerFilter = `actor_profile_id=eq.${encodeURIComponent(actor.id)}&owner_id=eq.${encodeURIComponent(userId)}`;
  const ownerPromise = serviceFetch<Array<{ id: string }>>(
    `/rest/v1/storyflow_character_portrayals?${ownerFilter}&select=id&limit=1000`,
  ).catch(() => [] as Array<{ id: string }>);
  const teamPromise = actor.team_id
    ? serviceFetch<Array<{ id: string }>>(
        `/rest/v1/storyflow_character_portrayals?actor_profile_id=eq.${encodeURIComponent(actor.id)}&team_id=eq.${encodeURIComponent(actor.team_id)}&select=id&limit=1000`,
      ).catch(() => [] as Array<{ id: string }>)
    : Promise.resolve([] as Array<{ id: string }>);
  const [ownerRows, teamRows] = await Promise.all([ownerPromise, teamPromise]);
  return Math.max(ownerRows.length, teamRows.length);
}

async function errorWithRequestId(error: unknown, fallback: string, requestId: string) {
  const errRes = apiError(error, fallback);
  const body = await errRes.json().catch(() => ({ success: false, error: fallback }));
  return NextResponse.json({ ...body, requestId }, { status: errRes.status });
}
