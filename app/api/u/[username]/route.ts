import { NextResponse } from "next/server";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import {
  getProfileStats,
  getUserBadges,
  getUserWorks,
  type PublicProfile,
} from "@/lib/supabase/profile-queries";
import { getAvatarUrl } from "@/lib/profile/avatar-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/u/[username]
 * 一次性返回主页所有数据：profile + stats + badges + 默认 Tab（works）首屏 12 条。
 *
 * 可见性：
 * - public 用户：任何人可访问
 * - private 用户：仅本人可访问（其他访客 404）
 * - 不存在的 username：404
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ username: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "服务端缺少 SUPABASE_SERVICE_ROLE_KEY 配置。" },
        { status: 503 },
      );
    }
    const client = getSupabaseServerClient();
    if (!client) {
      return NextResponse.json(
        { success: false, error: "服务端 Supabase client 不可用。" },
        { status: 503 },
      );
    }

    const { username } = await context.params;
    const normalizedUsername = decodeURIComponent(username).trim();
    if (!normalizedUsername) {
      return NextResponse.json(
        { success: false, error: "用户名不能为空。" },
        { status: 400 },
      );
    }

    // 可选鉴权：失败按 anon 处理
    let currentUserId: string | null = null;
    try {
      const user = await authenticateRequest(request);
      currentUserId = user.id;
    } catch {
      currentUserId = null;
    }

    // 查 profile（service role 绕过 RLS，因此需手动应用可见性规则）
    const { data: rawProfile, error: pErr } = await client
      .from("storyflow_profiles")
      .select(
        "user_id, username, display_name, bio, avatar_asset_id, location, pronouns, creative_tags, social_links, profile_visibility, language_preference, created_at, avatar_asset:avatar_asset_id(storage_path)",
      )
      .eq("username", normalizedUsername)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json(
        { success: false, error: `查询失败：${pErr.message}` },
        { status: 500 },
      );
    }
    if (!rawProfile) {
      return NextResponse.json(
        { success: false, error: "用户不存在。" },
        { status: 404 },
      );
    }

    // 可见性规则：private 用户仅本人可见
    const visibility = rawProfile.profile_visibility as string;
    const isOwner = currentUserId && currentUserId === rawProfile.user_id;
    if (visibility === "private" && !isOwner) {
      return NextResponse.json(
        { success: false, error: "用户不存在。" },
        { status: 404 },
      );
    }

    const profile = normalizeProfile(rawProfile);
    const targetUserId = profile.user_id;

    // 并发拉取 stats + badges + works 首屏
    const [stats, badges, works] = await Promise.all([
      getProfileStats(client, targetUserId).catch((e) => {
        throw new Error(`stats 查询失败：${e?.message || e}`);
      }),
      getUserBadges(client, targetUserId).catch(() => []),
      getUserWorks(client, targetUserId, null, 12),
    ]);

    return NextResponse.json({
      success: true,
      profile: {
        ...profile,
        avatar_url: getAvatarUrl(profile),
        is_owner: Boolean(isOwner),
      },
      stats,
      badges,
      tabs: {
        works,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      { success: false, error: `请求失败：${message || "未知错误"}` },
      { status: 500 },
    );
  }
}

function normalizeProfile(row: Record<string, unknown>): PublicProfile {
  const avatar = row.avatar_asset as { storage_path?: string } | null;
  return {
    user_id: row.user_id as string,
    username: (row.username as string) ?? null,
    display_name: (row.display_name as string) ?? null,
    bio: (row.bio as string) ?? null,
    avatar_asset_id: (row.avatar_asset_id as string) ?? null,
    avatar_storage_path: avatar?.storage_path ?? null,
    location: (row.location as string) ?? null,
    pronouns: (row.pronouns as string) ?? null,
    creative_tags: (row.creative_tags as string[]) ?? [],
    social_links: (row.social_links as Record<string, unknown>) ?? {},
    profile_visibility: (row.profile_visibility as "public" | "private") ?? "public",
    language_preference: (row.language_preference as string) ?? null,
    created_at: row.created_at as string,
  };
}
