import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 用户名校验与可用性检测（社区系统阶段 A）。
 *
 * 规则（设计文档 §3.4 / §5.2）：
 * - 3-20 字符
 * - 仅 [a-z0-9_-]
 * - 不能以 `-` 开头/结尾
 * - 不能命中保留字
 * - 30 天冷静期（username_changed_at 距今 < 30 天则拒绝）
 */

export const USERNAME_COOLDOWN_DAYS = 30;

export const RESERVED_USERNAMES: string[] = [
  "admin",
  "api",
  "settings",
  "u",
  "login",
  "dashboard",
  "universes",
  "actors",
  "subscription",
  "production",
  "novel-workbench",
  "song-workbench",
  "viral-workbench",
  "video-workbench",
  "storyboard-workbench",
  "art-workbench",
  "production-workbench",
  "kk",
  "companions",
  "business",
  "reset-password",
  "archive",
  "job-center",
  "casting",
  "card-draw",
  "model-registration",
  "assembly",
  "story-stages",
  "templates",
];

const USERNAME_REGEX = /^[a-z0-9_-]+$/;

export type UsernameValidation = { valid: boolean; error?: string };

/**
 * 纯格式校验：长度、字符集、首尾连字符、保留字。
 * 不查数据库。
 */
export function validateUsername(username: string): UsernameValidation {
  if (!username || typeof username !== "string") {
    return { valid: false, error: "用户名不能为空。" };
  }
  if (username.length < 3 || username.length > 20) {
    return { valid: false, error: "用户名长度需为 3-20 字符。" };
  }
  if (!USERNAME_REGEX.test(username)) {
    return { valid: false, error: "用户名只能包含小写字母、数字、下划线和连字符。" };
  }
  if (username.startsWith("-") || username.endsWith("-")) {
    return { valid: false, error: "用户名不能以连字符开头或结尾。" };
  }
  if (RESERVED_USERNAMES.includes(username.toLowerCase())) {
    return { valid: false, error: "该用户名为系统保留字，请更换。" };
  }
  return { valid: true };
}

export type UsernameAvailability = {
  available: boolean;
  reason?: string;
  /** 距离下次可修改还有多少天（不足 1 天按 1 天算），仅冷静期命中时返回 */
  cooldownRemainingDays?: number;
};

/**
 * 综合可用性检测：格式 + 重复 + 冷静期。
 * `serverClient` 应为 service-role SupabaseClient（绕过 RLS 以查所有用户）。
 * `currentUserId` 用于排除本人（避免“已被自己占用”误判）。
 */
export async function isUsernameAvailable(
  serverClient: SupabaseClient,
  username: string,
  currentUserId: string,
): Promise<UsernameAvailability> {
  const formatCheck = validateUsername(username);
  if (!formatCheck.valid) {
    return { available: false, reason: formatCheck.error };
  }

  // 1. 重复检测：是否已被他人占用
  const { data: existing, error: lookupErr } = await serverClient
    .from("storyflow_profiles")
    .select("user_id, username_changed_at")
    .eq("username", username)
    .limit(1)
    .maybeSingle();

  if (lookupErr) {
    return { available: false, reason: "用户名查询失败，请稍后重试。" };
  }
  if (existing && existing.user_id !== currentUserId) {
    return { available: false, reason: "该用户名已被占用。" };
  }

  // 2. 冷静期检测：本人最后一次修改时间距今是否满 30 天
  //    - 首次设置 username（username_changed_at IS NULL）允许直接设置
  //    - 已有 username 且未变更过（username_changed_at IS NULL 但 username 已存在）允许变更
  //    - username_changed_at 存在且 < 30 天 → 拒绝
  const changedAtRaw =
    existing?.username_changed_at ?? null;
  if (changedAtRaw) {
    const changedAt = new Date(changedAtRaw).getTime();
    const elapsedDays = (Date.now() - changedAt) / (24 * 60 * 60 * 1000);
    if (elapsedDays < USERNAME_COOLDOWN_DAYS) {
      const remaining = Math.max(
        1,
        Math.ceil(USERNAME_COOLDOWN_DAYS - elapsedDays),
      );
      return {
        available: false,
        reason: `用户名修改后 ${USERNAME_COOLDOWN_DAYS} 天内不可再次修改。`,
        cooldownRemainingDays: remaining,
      };
    }
  }

  return { available: true };
}
