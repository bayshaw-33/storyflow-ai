import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import {
  getShareConfig,
  updateShareConfig,
  type ShareStatus,
} from "@/lib/supabase/universe-share-queries";
import { validateSharePermissions } from "@/lib/universe-share/permissions";
import { validatePasswordInput } from "@/lib/universe-share/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set<ShareStatus>(["private", "shared"]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ universeId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { universeId } = await context.params;
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const serverClient = getSupabaseServerClient();
    if (!serverClient) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const config = await getShareConfig(serverClient, universeId, user.id);
    if (!config) throw new Error("UNIVERSE_NOT_FOUND");

    return ok({
      config: {
        share_status: config.share_status,
        permissions: config.share_permissions,
        has_password: config.has_password,
        share_updated_at: config.share_updated_at,
      },
      requestId,
    });
  } catch (error) {
    return await errorWithRequestId(error, "读取分享配置失败。", requestId);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ universeId: string }> },
) {
  const requestId = crypto.randomUUID();
  try {
    const { universeId } = await context.params;
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const serverClient = getSupabaseServerClient();
    if (!serverClient) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const body = (await request.json().catch(() => null)) as {
      share_status?: string;
      password?: string | null;
      permissions?: unknown;
    } | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "请求体格式错误。", requestId },
        { status: 400 },
      );
    }

    // 校验 share_status（'removed' 不允许通过 API 设置，仅供平台下架使用）
    const share_status = body.share_status;
    if (!share_status || !VALID_STATUSES.has(share_status as ShareStatus)) {
      return NextResponse.json(
        { success: false, error: "share_status 必须为 'private' 或 'shared'。", requestId },
        { status: 400 },
      );
    }

    // 校验 password：
    // - undefined：不修改
    // - null / ""：清除密码
    // - 字符串：校验长度后哈希
    let password: string | null | undefined = undefined;
    if (body.password !== undefined) {
      if (body.password === null || body.password === "") {
        password = null;
      } else if (typeof body.password === "string") {
        const check = validatePasswordInput(body.password);
        if (!check.valid) {
          return NextResponse.json(
            { success: false, error: check.error || "密码格式错误。", requestId },
            { status: 400 },
          );
        }
        password = body.password;
      } else {
        return NextResponse.json(
          { success: false, error: "password 必须为字符串或 null。", requestId },
          { status: 400 },
        );
      }
    }

    // permissions 整体覆盖；缺失字段使用默认值（false / 空对象）
    const permissions = validateSharePermissions(body.permissions);

    const updated = await updateShareConfig(serverClient, universeId, user.id, {
      share_status: share_status as ShareStatus,
      password,
      permissions,
    });

    if (!updated) throw new Error("UNIVERSE_NOT_FOUND");

    return ok({
      config: {
        share_status: updated.share_status,
        permissions: updated.share_permissions,
        has_password: updated.has_password,
        share_updated_at: updated.share_updated_at,
      },
      requestId,
    });
  } catch (error) {
    return await errorWithRequestId(error, "更新分享配置失败。", requestId);
  }
}

async function errorWithRequestId(error: unknown, fallback: string, requestId: string) {
  const errRes = apiError(error, fallback);
  const body = await errRes.json().catch(() => ({ success: false, error: fallback }));
  return NextResponse.json({ ...body, requestId }, { status: errRes.status });
}
