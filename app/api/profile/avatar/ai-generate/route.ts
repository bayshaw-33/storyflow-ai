import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
  serviceFetch,
} from "@/lib/supabase/server";
import { getAvatarUrl } from "@/lib/profile/avatar-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AVATARS_BUCKET = "avatars";
const DAILY_LIMIT = 3;
const FLUX_TIMEOUT_MS = 60_000;

/**
 * POST /api/profile/avatar/ai-generate
 * Body: { prompt: string }
 *
 * 鉴权：必须登录 + 管理员或白名单
 * 限额：3 次/天（UTC 日，服务端查 storyflow_ai_avatar_generations）
 * 不消耗 KK 币
 * 返回 { avatar_url, asset_id, remaining_today }
 */
export async function POST(request: Request) {
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

    // 1. 权限校验：白名单 或 管理员
    const isAllowed = await checkWhitelistOrAdmin(client, user.id);
    if (!isAllowed) {
      return NextResponse.json(
        {
          success: false,
          error: "AI 头像生成仅对白名单用户或管理员开放。",
        },
        { status: 403 },
      );
    }

    // 2. 解析 prompt
    const body = await request.json().catch(() => ({}));
    const prompt = String(body.prompt || "").trim();
    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "缺少 prompt 参数。" },
        { status: 400 },
      );
    }
    if (prompt.length > 1000) {
      return NextResponse.json(
        { success: false, error: "prompt 长度不能超过 1000 字符。" },
        { status: 400 },
      );
    }

    // 3. 每日限额校验（UTC 日）
    const { count: todayCount, error: countErr } = await countTodayGenerations(client, user.id);
    if (countErr) {
      return NextResponse.json(
        { success: false, error: `限额查询失败：${countErr.message}` },
        { status: 500 },
      );
    }
    if (todayCount >= DAILY_LIMIT) {
      return NextResponse.json(
        {
          success: false,
          error: `今日生成次数已达上限（${DAILY_LIMIT} 次/天），请 UTC 零点后再试。`,
          remaining_today: 0,
        },
        { status: 429 },
      );
    }

    // 4. 检查 Flux API 配置
    const fluxUrl = (process.env.FLUX_API_URL || "").trim();
    const fluxKey = (process.env.FLUX_API_KEY || "").trim();
    if (!fluxUrl || !fluxKey) {
      return NextResponse.json(
        {
          success: false,
          error: "AI 头像生成服务未配置（FLUX_API_URL / FLUX_API_KEY）。",
        },
        { status: 501 },
      );
    }

    // 5. 调用 Flux API 生成图片
    const generated = await callFluxApi(fluxUrl, fluxKey, prompt);

    // 6. 下载图片字节
    const imageResp = await fetch(generated.imageUrl, { signal: AbortSignal.timeout(FLUX_TIMEOUT_MS) });
    if (!imageResp.ok) {
      return NextResponse.json(
        { success: false, error: `下载生成图片失败：${imageResp.status}` },
        { status: 502 },
      );
    }
    const imageBuf = await imageResp.arrayBuffer();
    const contentType = imageResp.headers.get("content-type") || "image/png";
    const extension = contentType.includes("jpeg")
      ? "jpg"
      : contentType.includes("webp")
        ? "webp"
        : "png";

    // 7. 上传到 avatars bucket
    const timestamp = Date.now();
    const storagePath = `${user.id}/${timestamp}-ai.${extension}`;
    const { error: uploadErr } = await client
      .storage
      .from(AVATARS_BUCKET)
      .upload(storagePath, imageBuf, {
        contentType,
        upsert: false,
      });
    if (uploadErr) {
      return NextResponse.json(
        { success: false, error: `头像上传失败：${uploadErr.message}` },
        { status: 500 },
      );
    }

    // 8. 创建 asset 记录
    const assetId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error: assetErr } = await client.from("storyflow_assets").insert({
      id: assetId,
      user_id: user.id,
      team_id: null,
      project_id: null,
      asset_type: "user_avatar_ai",
      public_url: null,
      storage_path: storagePath,
      metadata: {
        source: "ai_generate",
        provider: generated.provider,
        model: generated.model,
        prompt,
        content_type: contentType,
        size: imageBuf.byteLength,
        generated_at: now,
        bucket: AVATARS_BUCKET,
      },
      created_at: now,
    });
    if (assetErr) {
      return NextResponse.json(
        { success: false, error: `asset 记录创建失败：${assetErr.message}` },
        { status: 500 },
      );
    }

    // 9. 更新 profiles.avatar_asset_id
    const { error: profileErr } = await client
      .from("storyflow_profiles")
      .update({
        avatar_asset_id: assetId,
        updated_at: now,
      })
      .eq("user_id", user.id);
    if (profileErr) {
      return NextResponse.json(
        { success: false, error: `profile 更新失败：${profileErr.message}` },
        { status: 500 },
      );
    }

    // 10. 记录生成日志（用于限额统计）
    const { error: logErr } = await client.from("storyflow_ai_avatar_generations").insert({
      user_id: user.id,
      prompt,
      asset_id: assetId,
      provider: generated.provider,
      model: generated.model,
      created_at: now,
    });
    if (logErr) {
      // 限额日志写入失败不阻塞返回，但记录错误
      console.warn("[ai-avatar-generate] log insert failed:", logErr.message);
    }

    return NextResponse.json({
      success: true,
      asset_id: assetId,
      storage_path: storagePath,
      avatar_url: getAvatarUrl({ avatar_storage_path: storagePath }),
      remaining_today: Math.max(0, DAILY_LIMIT - (todayCount + 1)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const authError = message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN";
    return NextResponse.json(
      {
        success: false,
        error: authError ? "请先登录。" : `AI 头像生成失败：${message || "未知错误"}`,
      },
      { status: authError ? 401 : 500 },
    );
  }
}

// ============================================================
// Helpers
// ============================================================

async function checkWhitelistOrAdmin(client: SupabaseClient, userId: string): Promise<boolean> {
  if (!client) return false;
  // 1. 白名单
  const { data: wRow } = await client
    .from("storyflow_ai_avatar_whitelist")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (wRow) return true;

  // 2. 管理员
  const adminRows = await serviceFetch<Array<{ role: string }>>(
    `/rest/v1/storyflow_admin_roles?user_id=eq.${encodeURIComponent(userId)}&select=role&limit=1`,
  ).catch(() => [] as Array<{ role: string }>);
  return adminRows.length > 0;
}

async function countTodayGenerations(
  client: SupabaseClient,
  userId: string,
): Promise<{ count: number; error: null | { message: string } }> {
  // UTC 日 0 点
  const now = new Date();
  const utcStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const { count, error } = await client
    .from("storyflow_ai_avatar_generations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", utcStart.toISOString());
  if (error) return { count: 0, error: { message: error.message } };
  return { count: count ?? 0, error: null };
}

type FluxResult = { imageUrl: string; provider: string; model: string };

/**
 * 调用 Flux 文生图 API。
 * 兼容两种常见响应：{ image_url } 或 { data: { url } } 或 { images: [url] }
 */
async function callFluxApi(fluxUrl: string, fluxKey: string, prompt: string): Promise<FluxResult> {
  const resp = await fetch(fluxUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${fluxKey}`,
      "x-api-key": fluxKey,
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: "1:1",
      num_images: 1,
      output_format: "png",
    }),
    signal: AbortSignal.timeout(FLUX_TIMEOUT_MS),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`FLUX_API_ERROR:${resp.status}:${text.slice(0, 200)}`);
  }

  const payload = (await resp.json()) as Record<string, unknown>;

  // 兼容多种响应结构
  const imageUrl =
    (payload.image_url as string) ||
    (payload.url as string) ||
    (payload.output as string) ||
    (payload.output_url as string) ||
    (Array.isArray(payload.images) ? (payload.images[0] as string) : undefined) ||
    (Array.isArray(payload.data) ? ((payload.data[0] as { url?: string })?.url) : undefined) ||
    ((payload.data as { url?: string })?.url);

  if (!imageUrl || typeof imageUrl !== "string") {
    throw new Error("FLUX_API_INVALID_RESPONSE: 无法从响应中解析图片 URL");
  }

  return {
    imageUrl,
    provider: "flux",
    model: (payload.model as string) || "flux",
  };
}
