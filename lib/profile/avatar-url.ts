/**
 * 头像 URL 拼接（社区系统阶段 A）。
 *
 * 设计文档 §5.1 / 任务说明：本期简化，假设 `avatars` bucket 是公开的，
 * 直接拼 public URL；无 storage_path 时返回 null，由前端 fallback 到字母头像。
 */

const AVATARS_BUCKET = "avatars";

export type AvatarableProfile = {
  avatar_asset_id?: string | null;
  /** 由 storyflow_assets JOIN 得到的 storage_path；缺失则回退字母头像 */
  avatar_storage_path?: string | null;
};

/**
 * 根据 profile 上的 avatar_storage_path 返回公开 URL。
 * 服务端 / 浏览器均可调用（仅做字符串拼接，不发网络请求）。
 */
export function getAvatarUrl(profile: AvatarableProfile | null | undefined): string | null {
  const path = profile?.avatar_storage_path;
  if (!path) return null;
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/${AVATARS_BUCKET}/${path}`;
}
