import { NextResponse } from "next/server";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import { getUserUniverses } from "@/lib/supabase/profile-queries";
import { resolveVisibleProfile } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/u/[username]/universes?cursor=xxx&limit=12
 * 宇宙分页。
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
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const limitRaw = Number(url.searchParams.get("limit") || "12");
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 50 ? limitRaw : 12;

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

    const result = await getUserUniverses(client, profile.user_id, cursor, limit);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      { success: false, error: `请求失败：${message || "未知错误"}` },
      { status: 500 },
    );
  }
}
