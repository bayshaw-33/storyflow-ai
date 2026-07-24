import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import {
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import {
  getSharedUniverseSections,
  getUniverseForShare,
} from "@/lib/supabase/universe-share-queries";
import { verifyShareToken } from "@/lib/universe-share/share-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ universeId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { universeId } = await context.params;
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const serverClient = getSupabaseServerClient();
    if (!serverClient) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    // 提取 share token：Authorization: Bearer <token> 或 ?token=<token>
    const token = extractShareToken(request);
    if (!token) {
      return NextResponse.json(
        { success: false, error: "缺少分享访问令牌。", requestId },
        { status: 401 },
      );
    }

    const { valid, payload } = await verifyShareToken(token);
    if (!valid || !payload || payload.universe_id !== universeId) {
      return NextResponse.json(
        { success: false, error: "分享访问令牌无效或已过期。", requestId },
        { status: 401 },
      );
    }

    // 拉取宇宙基本信息（仅 share_status='shared'，自动过滤 share_password）
    const universe = await getUniverseForShare(serverClient, universeId);
    if (!universe) {
      return NextResponse.json(
        { success: false, error: "宇宙未公开或不存在。", requestId },
        { status: 404 },
      );
    }

    // 校验 token 中的 share_updated_at 与当前一致：
    // 修改密码或分享配置后 share_updated_at 变化，旧 token 自动失效。
    // 仅在数据库已有 share_updated_at 时校验（旧数据可能为 NULL，跳过）。
    if (universe.share_updated_at && payload.share_updated_at !== universe.share_updated_at) {
      return NextResponse.json(
        { success: false, error: "分享配置已更新，请重新输入密码。", requestId },
        { status: 401 },
      );
    }

    // 根据权限获取各 section 内容（permissions.sections[key]=false 时返回 null）
    const sections = await getSharedUniverseSections(
      serverClient,
      universeId,
      universe.share_permissions,
    );

    return ok({
      universe: {
        id: universe.id,
        name: universe.name,
        cover_url: universe.cover_url,
        tagline: universe.tagline,
        description: universe.description,
      },
      permissions: universe.share_permissions,
      sections,
      owner: universe.owner,
      requestId,
    });
  } catch (error) {
    return await errorWithRequestId(error, "读取分享内容失败。", requestId);
  }
}

function extractShareToken(request: NextRequest): string | null {
  // 1. Authorization: Bearer <token>
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) return match[1].trim();
  // 2. ?token=<token>（便于 <img src> 等无法设置 header 的场景）
  const fromQuery = request.nextUrl.searchParams.get("token");
  if (fromQuery) return fromQuery;
  return null;
}

async function errorWithRequestId(error: unknown, fallback: string, requestId: string) {
  const errRes = apiError(error, fallback);
  const body = await errRes.json().catch(() => ({ success: false, error: fallback }));
  return NextResponse.json({ ...body, requestId }, { status: errRes.status });
}
