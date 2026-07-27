import { NextResponse } from "next/server";
import {
  authenticateRequest,
  getSupabaseServerClient,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import { getProfileByUserId } from "@/lib/supabase/profile-queries";
import { isUsernameAvailable, validateUsername } from "@/lib/profile/username-validation";
import { getAvatarUrl } from "@/lib/profile/avatar-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 允许更新的字段及其校验规则（设计文档 §5.2）
const ALLOWED_LANGUAGES = ["en-US", "zh-CN"];
const ALLOWED_VISIBILITY = ["public", "private"];
const SOCIAL_REGIONS = ["overseas", "china"];
const SOCIAL_PLATFORMS: Record<string, string[]> = {
  overseas: ["twitter", "facebook", "instagram"],
  china: ["douyin", "xiaohongshu", "douban"],
};

type PatchBody = {
  display_name?: unknown;
  username?: unknown;
  bio?: unknown;
  creative_tags?: unknown;
  social_links?: unknown;
  location?: unknown;
  language_preference?: unknown;
  pronouns?: unknown;
  profile_visibility?: unknown;
};

/**
 * GET /api/profile/me
 * 返回本人完整 profile（含所有新字段）。
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

    const profile = await getProfileByUserId(client, user.id);
    if (!profile) {
      return NextResponse.json(
        { success: false, error: "未找到当前用户的资料记录。" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      profile: {
        ...profile,
        avatar_url: getAvatarUrl(profile),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PATCH /api/profile/me
 * 更新本人 profile；username 变更需通过格式/保留字/可用性/冷静期校验。
 */
export async function PATCH(request: Request) {
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

    const body = (await request.json().catch(() => ({}))) as PatchBody;
    const updates: Record<string, unknown> = {};

    // ----- 字段逐项校验 -----
    if (body.display_name !== undefined) {
      const v = String(body.display_name).trim();
      if (v.length < 1 || v.length > 32) {
        return NextResponse.json(
          { success: false, error: "显示名长度需为 1-32 字符。" },
          { status: 400 },
        );
      }
      updates.display_name = v;
    }

    if (body.bio !== undefined) {
      const v = String(body.bio ?? "");
      if (v.length > 500) {
        return NextResponse.json(
          { success: false, error: "个人简介不能超过 500 字符。" },
          { status: 400 },
        );
      }
      updates.bio = v;
    }

    if (body.location !== undefined) {
      const v = String(body.location ?? "");
      if (v.length > 64) {
        return NextResponse.json(
          { success: false, error: "所在地不能超过 64 字符。" },
          { status: 400 },
        );
      }
      updates.location = v;
    }

    if (body.pronouns !== undefined) {
      const v = String(body.pronouns ?? "");
      if (v.length > 32) {
        return NextResponse.json(
          { success: false, error: "代词不能超过 32 字符。" },
          { status: 400 },
        );
      }
      updates.pronouns = v;
    }

    if (body.language_preference !== undefined) {
      const v = String(body.language_preference);
      if (!ALLOWED_LANGUAGES.includes(v)) {
        return NextResponse.json(
          { success: false, error: "语言偏好仅支持 en-US 或 zh-CN。" },
          { status: 400 },
        );
      }
      updates.language_preference = v;
    }

    if (body.profile_visibility !== undefined) {
      const v = String(body.profile_visibility);
      if (!ALLOWED_VISIBILITY.includes(v)) {
        return NextResponse.json(
          { success: false, error: "可见性仅支持 public 或 private。" },
          { status: 400 },
        );
      }
      updates.profile_visibility = v;
    }

    if (body.creative_tags !== undefined) {
      const tags = body.creative_tags;
      if (!Array.isArray(tags)) {
        return NextResponse.json(
          { success: false, error: "创作标签必须是数组。" },
          { status: 400 },
        );
      }
      if (tags.length > 5) {
        return NextResponse.json(
          { success: false, error: "最多 5 个创作标签。" },
          { status: 400 },
        );
      }
      const cleanTags: string[] = [];
      for (const t of tags) {
        const s = String(t ?? "").trim();
        if (s.length < 2 || s.length > 8) {
          return NextResponse.json(
            { success: false, error: "每个标签长度需为 2-8 字符。" },
            { status: 400 },
          );
        }
        cleanTags.push(s);
      }
      updates.creative_tags = cleanTags;
    }

    if (body.social_links !== undefined) {
      const err = validateSocialLinks(body.social_links);
      if (err) {
        return NextResponse.json({ success: false, error: err }, { status: 400 });
      }
      updates.social_links = body.social_links;
    }

    // ----- username 单独处理（涉及冷静期 + 可用性） -----
    let usernameChanged = false;
    if (body.username !== undefined) {
      const newUsername = String(body.username).trim();

      // 先读当前 profile，判断是否真的变更
      const current = await getProfileByUserId(client, user.id);
      const currentUsername = current?.username ?? null;
      if (newUsername !== currentUsername) {
        const formatCheck = validateUsername(newUsername);
        if (!formatCheck.valid) {
          return NextResponse.json(
            { success: false, error: formatCheck.error },
            { status: 400 },
          );
        }
        const availability = await isUsernameAvailable(client, newUsername, user.id);
        if (!availability.available) {
          const status = availability.cooldownRemainingDays ? 409 : 409;
          return NextResponse.json(
            {
              success: false,
              error: availability.reason ?? "用户名不可用。",
              cooldownRemainingDays: availability.cooldownRemainingDays,
            },
            { status },
          );
        }
        updates.username = newUsername;
        updates.username_changed_at = new Date().toISOString();
        // 首次设置 username_set_at
        if (!current?.username_set_at) {
          updates.username_set_at = new Date().toISOString();
        }
        usernameChanged = true;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: "没有需要更新的字段。" },
        { status: 400 },
      );
    }

    updates.updated_at = new Date().toISOString();

    const { data: updated, error: updateErr } = await client
      .from("storyflow_profiles")
      .update(updates)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: `更新失败：${updateErr.message}` },
        { status: 500 },
      );
    }
    if (!updated) {
      return NextResponse.json(
        { success: false, error: "未找到当前用户的资料记录。" },
        { status: 404 },
      );
    }

    // 拍平 avatar_asset join（update select 没有 join，单独查 storage_path）
    const { data: assetRow } = await client
      .from("storyflow_assets")
      .select("storage_path")
      .eq("id", updated.avatar_asset_id)
      .maybeSingle();

    const profile = {
      ...updated,
      avatar_storage_path: assetRow?.storage_path ?? null,
    };

    return NextResponse.json({
      success: true,
      profile: {
        ...profile,
        avatar_url: getAvatarUrl(profile),
      },
      usernameChanged,
    });
  } catch (error) {
    return handleError(error);
  }
}

// ============================================================
// Helpers
// ============================================================

function validateSocialLinks(input: unknown): string | null {
  if (typeof input !== "object" || input === null) {
    return "社交链接格式不正确。";
  }
  const obj = input as Record<string, unknown>;

  // display_region 可选
  if (obj.display_region !== undefined && obj.display_region !== null) {
    const r = String(obj.display_region);
    if (!SOCIAL_REGIONS.includes(r)) {
      return "display_region 仅支持 overseas 或 china。";
    }
  }

  for (const region of SOCIAL_REGIONS) {
    const regionData = obj[region];
    if (regionData === undefined || regionData === null) continue;
    if (typeof regionData !== "object") {
      return `social_links.${region} 必须是对象。`;
    }
    const r = regionData as Record<string, unknown>;
    for (const platform of SOCIAL_PLATFORMS[region]) {
      const url = r[platform];
      if (url === undefined || url === null || url === "") continue;
      const s = String(url);
      if (!s.startsWith("https://")) {
        return `social_links.${region}.${platform} 必须以 https:// 开头。`;
      }
    }
  }
  return null;
}

function handleError(error: unknown) {
  const message = flattenError(error);
  const authError = message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN";
  // 开发期：把数据库 / Supabase 返回的具体错误消息带出来，便于前端定位
  // （认证错误仍然走标准的"请先登录"提示）
  if (authError) {
    return NextResponse.json(
      { success: false, error: "请先登录。" },
      { status: 401 },
    );
  }
  return NextResponse.json(
    { success: false, error: message, detail: JSON.stringify(error) },
    { status: 500 },
  );
}

/**
 * 把任意 error（Error / string / Supabase PostgrestError / 其他对象）拍平成可读字符串。
 * PostgrestError 的 message 字段才是真正的错误描述，直接 String() 会得到 "[object Object]"。
 */
function flattenError(error: unknown): string {
  if (error instanceof Error) return error.message || error.toString();
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    if (typeof e.message === "string" && e.message.trim()) return e.message;
    if (typeof e.error === "string" && e.error.trim()) return e.error;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error ?? "");
}
