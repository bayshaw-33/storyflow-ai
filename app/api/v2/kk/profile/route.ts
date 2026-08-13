import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { ensureProfile, kkProfileErrorResponse } from "@/lib/server/v2/kk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/kk/profile — 获取当前用户的 KK profile (K21-KK-020)
 * PATCH /api/v2/kk/profile — 更新 profile (display_name / profile_display / community_display)
 *                            (growth_* 不可直接更新，由 RPC 维护 K21-KK-023)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "KK service not configured (K21-KK-002).", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const profile = await ensureProfile(serviceFetch, user.id);
    return NextResponse.json({ success: true, contractVersion: "kiikis.kk-runtime/1", profile });
  } catch (error) {
    return kkProfileErrorResponse(error, "Unable to fetch KK profile.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "KK service not configured (K21-KK-002).", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const body = await request.json().catch(() => ({}));
    const allowed: Record<string, unknown> = {};
    if (typeof body.displayName === "string") {
      allowed.display_name = body.displayName.slice(0, 100);
    }
    if (typeof body.profileDisplay === "boolean") {
      allowed.profile_display = body.profileDisplay;
    }
    if (typeof body.communityDisplay === "boolean") {
      allowed.community_display = body.communityDisplay;
    }
    if (typeof body.recentProjectId === "string") {
      allowed.recent_project_id = body.recentProjectId || null;
    }
    if (typeof body.recentUniverseId === "string") {
      allowed.recent_universe_id = body.recentUniverseId || null;
    }
    // growth_* 字段不允许直接更新 (K21-KK-023)
    if (Object.keys(allowed).length === 0) {
      return NextResponse.json(
        { success: false, error: "No updatable fields provided.", code: "validation_failed" },
        { status: 422 },
      );
    }

    const row = await serviceFetch<{ owner_id: string; display_name: string | null; equipped_item_id: string | null; equipped_item_version: string | null; profile_display: boolean | null; community_display: boolean | null; growth_level: number | null; growth_xp: number | null; recent_project_id: string | null; recent_universe_id: string | null; created_at: string; updated_at: string }>(
      `/rest/v1/storyflow_kk_profiles?owner_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
          Accept: "application/vnd.pgrst.object+json",
        },
        body: JSON.stringify({ ...allowed, updated_at: new Date().toISOString() }),
      },
    );

    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.kk-runtime/1",
      profile: {
        ownerId: row.owner_id,
        displayName: row.display_name ?? "",
        equippedItemId: row.equipped_item_id,
        equippedItemVersion: row.equipped_item_version,
        profileDisplay: row.profile_display ?? false,
        communityDisplay: row.community_display ?? false,
        growthLevel: row.growth_level ?? 0,
        growthXp: row.growth_xp ?? 0,
        recentProjectId: row.recent_project_id,
        recentUniverseId: row.recent_universe_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    return kkProfileErrorResponse(error, "Unable to update KK profile.");
  }
}
