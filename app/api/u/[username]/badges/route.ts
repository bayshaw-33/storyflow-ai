import { NextResponse } from "next/server";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import { getUserBadges } from "@/lib/supabase/profile-queries";
import { resolveVisibleProfile } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/u/[username]/badges
 * 徽章列表（不分页，单用户徽章数量有限）。
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

    let currentUserId: string | null = null;
    try {
      const user = await authenticateRequest(request);
      currentUserId = user.id;
    } catch {
      currentUserId = null;
    }

    const profile = await resolveVisibleProfile(client, username, currentUserId);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: "用户不存在。" },
        { status: 404 },
      );
    }

    const badges = await getUserBadges(client, profile.user_id);
    return NextResponse.json({ success: true, badges });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      { success: false, error: `请求失败：${message || "未知错误"}` },
      { status: 500 },
    );
  }
}
