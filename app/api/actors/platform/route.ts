import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig } from "@/lib/supabase/server";
import { listPlatformActors } from "@/lib/supabase/actor-usages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/actors/platform
 * 列出平台共享演员（visibility=platform, status!=archived）。
 *
 * Query: page?, pageSize?, search?
 * 返回: { actors: PlatformActorCard[], total }
 *
 * PlatformActorCard 含：actor, creator_display_name, usage_count
 * 不暴露：创建者邮箱、用户 UUID、供应商 URL、内部存储路径。
 *
 * PRD §平台共享演员卡展示：白底头像、演员名称、年龄感/气质/可出演类型、
 * 创建者昵称和头像、"平台共享"标记、被使用次数、"使用此演员"按钮。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const url = request.nextUrl;
    const page = Number(url.searchParams.get("page") || "1");
    const pageSize = Number(url.searchParams.get("pageSize") || "20");
    const search = url.searchParams.get("search") || undefined;

    const result = await listPlatformActors({ page, pageSize, search });
    return ok(result);
  } catch (error) {
    return apiError(error, "读取平台演员失败。");
  }
}
