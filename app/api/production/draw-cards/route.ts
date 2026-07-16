import { NextResponse } from "next/server";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DrawnCard = {
  assetId: string;
  kind: string;
  name: string;
  description: string;
  narrativeRole: string;
  status: string;
  rarity: string;
  imageUrl: string | null;
  drawnAt: string;
};

type DrawRequest = {
  action: "draw" | "history" | "clear";
  drawType?: "character" | "scene" | "prop" | "mixed";
  count?: number;
  projectId?: string;
  label?: string;
  limit?: number;
};

type ArtAsset = {
  id: string;
  kind: string;
  name: string;
  description: string;
  narrative_role: string;
  status: string;
};

type ArtVariant = {
  id: string;
  approved_version_id: string | null;
};

type ArtVersion = {
  id: string;
  storage_path: string;
  created_at?: string;
};

function statusToRarity(status: string): string {
  switch (status) {
    case "published":
      return "legendary";
    case "approved":
      return "epic";
    case "candidate":
      return "rare";
    default:
      return "common";
  }
}

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function POST(request: Request) {
  let body: DrawRequest;
  try {
    body = (await request.json()) as DrawRequest;
  } catch {
    return NextResponse.json({ success: false, error: "请求格式不正确。" }, { status: 400 });
  }

  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return NextResponse.json({ success: false, error: "请先登录后再操作。" }, { status: 401 });
  }

  const action = body.action;
  try {
    if (action === "draw") {
      return await handleDraw(userId, body);
    }
    if (action === "history") {
      return await handleHistory(userId, body);
    }
    if (action === "clear") {
      return await handleClear(userId);
    }
    return NextResponse.json({ success: false, error: "未知的 action 类型。" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CARD_DRAW_ERROR";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

async function handleDraw(userId: string, body: DrawRequest) {
  const drawType = body.drawType || "mixed";
  const count = Math.min(Math.max(body.count || 3, 1), 10);
  const projectId = body.projectId?.trim() || null;

  // Build query for art assets
  const kindFilter = drawType !== "mixed" ? `&kind=eq.${encodeURIComponent(drawType)}` : "";
  const assetsPath = `/rest/v1/storyflow_art_assets?created_by=eq.${encodeURIComponent(userId)}&status=in.(approved,published,candidate,draft)${kindFilter}&select=id,kind,name,description,narrative_role,status`;

  const assets = await serviceFetch<ArtAsset[]>(assetsPath);
  const pool = Array.isArray(assets) ? assets : [];

  const shuffled = shuffle(pool);
  const selected = shuffled.slice(0, count);

  const drawnAt = new Date().toISOString();
  const cards: DrawnCard[] = [];
  for (const asset of selected) {
    const imageUrl = await resolveImageUrl(asset.id);
    cards.push({
      assetId: asset.id,
      kind: asset.kind,
      name: asset.name,
      description: asset.description || "",
      narrativeRole: asset.narrative_role || "",
      status: asset.status,
      rarity: statusToRarity(asset.status),
      imageUrl,
      drawnAt,
    });
  }

  // Insert draw record
  const insertBody = {
    owner_id: userId,
    project_id: projectId,
    draw_type: drawType,
    pool_count: pool.length,
    drawn_count: cards.length,
    drawn_cards: cards,
    label: body.label || "",
  };

  const inserted = await serviceFetch<{ id: string }[]>(
    "/rest/v1/storyflow_card_draws?select=id",
    { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(insertBody) },
  );
  const drawId = Array.isArray(inserted) ? inserted[0]?.id : undefined;

  return NextResponse.json({
    success: true,
    drawId,
    cards,
    poolCount: pool.length,
  });
}

async function resolveImageUrl(assetId: string): Promise<string | null> {
  // Get variants for the asset
  const variants = await serviceFetch<ArtVariant[]>(
    `/rest/v1/storyflow_art_asset_variants?asset_id=eq.${encodeURIComponent(assetId)}&select=id,approved_version_id`,
  );
  const variantList = Array.isArray(variants) ? variants : [];
  if (variantList.length === 0) return null;

  // Try approved version first
  const approvedVersionIds = variantList
    .map((v) => v.approved_version_id)
    .filter((id): id is string => Boolean(id));

  if (approvedVersionIds.length > 0) {
    const versions = await serviceFetch<ArtVersion[]>(
      `/rest/v1/storyflow_art_asset_versions?id=in.(${approvedVersionIds.map(encodeURIComponent).join(",")})&select=storage_path&limit=1`,
    );
    const versionList = Array.isArray(versions) ? versions : [];
    if (versionList.length > 0 && versionList[0].storage_path) {
      return versionList[0].storage_path;
    }
  }

  // Fallback: latest version across all variants
  const variantIds = variantList.map((v) => v.id);
  const latestVersions = await serviceFetch<ArtVersion[]>(
    `/rest/v1/storyflow_art_asset_versions?variant_id=in.(${variantIds.map(encodeURIComponent).join(",")})&select=storage_path&order=created_at.desc&limit=1`,
  );
  const latestList = Array.isArray(latestVersions) ? latestVersions : [];
  return latestList.length > 0 ? latestList[0].storage_path : null;
}

async function handleHistory(userId: string, body: DrawRequest) {
  const limit = Math.min(Math.max(body.limit || 20, 1), 100);
  const draws = await serviceFetch<unknown[]>(
    `/rest/v1/storyflow_card_draws?owner_id=eq.${encodeURIComponent(userId)}&select=id,draw_type,pool_count,drawn_count,drawn_cards,label,project_id,created_at&order=created_at.desc&limit=${limit}`,
  );
  return NextResponse.json({
    success: true,
    draws: Array.isArray(draws) ? draws : [],
  });
}

async function handleClear(userId: string) {
  const deleted = await serviceFetch<unknown[]>(
    `/rest/v1/storyflow_card_draws?owner_id=eq.${encodeURIComponent(userId)}`,
    { method: "DELETE", headers: { Prefer: "return=representation" } },
  );
  const deletedCount = Array.isArray(deleted) ? deleted.length : 0;
  return NextResponse.json({
    success: true,
    deletedCount,
  });
}
