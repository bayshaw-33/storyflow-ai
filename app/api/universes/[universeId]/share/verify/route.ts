import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import {
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import { getUniverseById } from "@/lib/supabase/universe-share-queries";
import { verifyPassword } from "@/lib/universe-share/password";
import { signShareToken } from "@/lib/universe-share/share-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_TTL_SECONDS = 24 * 60 * 60;

// 用于防枚举：当宇宙不存在或未分享时仍执行一次密码比对，避免时序差异泄露宇宙存在性。
// 格式与真实哈希一致（scrypt$<saltHex>$<hashHex>），但 salt / hash 全为 0。
const DUMMY_HASH =
  "scrypt$00000000000000000000000000000000$00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ universeId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { universeId } = await context.params;
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const serverClient = getSupabaseServerClient();
    if (!serverClient) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const body = (await request.json().catch(() => null)) as {
      password?: string;
    } | null;

    if (!body || typeof body.password !== "string") {
      return NextResponse.json(
        { success: false, error: "请输入访问密码。", requestId },
        { status: 400 },
      );
    }

    // 拉取宇宙（含 share_password / share_updated_at），用于密码比对与 JWT 签发。
    const universe = await getUniverseById(serverClient, universeId);

    // 安全策略（设计文档 §3.2）：不区分"宇宙不存在"和"密码错误"，防枚举。
    // 即使宇宙不存在或未分享，也执行一次密码比对（用 DUMMY_HASH），使响应时间接近真实场景。
    const isShared = Boolean(universe && universe.share_status === "shared");
    const storedHash = universe?.share_password || DUMMY_HASH;

    const passwordOk = await verifyPassword(body.password, storedHash);

    if (!universe || !isShared || !passwordOk) {
      return NextResponse.json(
        { success: false, error: "密码错误或宇宙未公开。", requestId },
        { status: 403 },
      );
    }

    // 校验通过，签发分享访问 JWT（payload 含 share_updated_at，密码修改后旧 token 自动失效）
    const share_updated_at =
      universe.share_updated_at ?? new Date(0).toISOString();
    const token = await signShareToken({
      universe_id: universe.id,
      share_updated_at,
      viewer_session: true,
    });

    return ok({
      token,
      expires_in: TOKEN_TTL_SECONDS,
      requestId,
    });
  } catch (error) {
    return await errorWithRequestId(error, "密码验证失败。", requestId);
  }
}

async function errorWithRequestId(error: unknown, fallback: string, requestId: string) {
  const errRes = apiError(error, fallback);
  const body = await errRes.json().catch(() => ({ success: false, error: fallback }));
  return NextResponse.json({ ...body, requestId }, { status: errRes.status });
}
