import { NextResponse } from "next/server";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import { isUsernameAvailable } from "@/lib/profile/username-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/profile/check-username?username=xxx
 * 返回 { available: boolean; reason?: string; cooldownRemainingDays?: number }
 *
 * 综合检测：格式 + 保留字 + 重复 + 30 天冷静期。
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

    const url = new URL(request.url);
    const username = (url.searchParams.get("username") || "").trim();
    if (!username) {
      return NextResponse.json(
        { success: false, error: "缺少 username 参数。" },
        { status: 400 },
      );
    }

    const result = await isUsernameAvailable(client, username, user.id);

    return NextResponse.json({
      success: true,
      available: result.available,
      reason: result.reason,
      cooldownRemainingDays: result.cooldownRemainingDays,
    });
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
