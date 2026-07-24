import { NextResponse } from "next/server";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
  serviceFetch,
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/profile/avatar/whitelist-status
 * 返回 { allowed: boolean } —— 当前用户是否在 AI 头像白名单 或 是管理员。
 */
export async function GET(request: Request) {
  try {
    const user = await authenticateRequest(request);
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

    // 1. 白名单查询
    const { data: whitelistRow, error: wErr } = await client
      .from("storyflow_ai_avatar_whitelist")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (wErr) {
      return NextResponse.json(
        { success: false, error: `白名单查询失败：${wErr.message}` },
        { status: 500 },
      );
    }
    if (whitelistRow) {
      return NextResponse.json({ success: true, allowed: true, reason: "whitelist" });
    }

    // 2. 管理员查询（任意 admin 角色均视为允许）
    const adminRows = await serviceFetch<Array<{ role: string }>>(
      `/rest/v1/storyflow_admin_roles?user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,
    ).catch(() => [] as Array<{ role: string }>);

    if (adminRows.length > 0) {
      return NextResponse.json({ success: true, allowed: true, reason: "admin" });
    }

    return NextResponse.json({ success: true, allowed: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const authError = message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN";
    return NextResponse.json(
      {
        success: false,
        error: authError ? "请先登录。" : "请求失败，请稍后重试。",
      },
      { status: authError ? 401 : 500 },
    );
  }
}
