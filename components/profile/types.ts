// 用户资料与公开主页 · 共享类型
// 字段对齐 supabase/migrations/20260728000000_community_profile.sql

export type ProfileVisibility = "public" | "private";

export type SocialRegion = "overseas" | "china";

export type SocialLinks = {
  overseas?: {
    twitter?: string;
    facebook?: string;
    instagram?: string;
  };
  china?: {
    douyin?: string;
    xiaohongshu?: string;
    douban?: string;
  };
  display_region?: SocialRegion;
};

export type Profile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  /** 已签名的头像公开 URL（由 avatar_asset_id 解析得到）；无则为字母头像。 */
  avatar_url?: string | null;
  avatar_asset_id?: string | null;
  creative_tags: string[];
  social_links: SocialLinks;
  location: string | null;
  language_preference: string;
  pronouns: string | null;
  profile_visibility: ProfileVisibility;
  plan: string | null;
  username_changed_at: string | null;
  username_set_at: string | null;
};

export type ProfileStats = {
  works_count: number;
  universes_count: number;
  actors_count: number;
  used_count: number;
  adapted_count: number;
};

export type Badge = {
  id: string;
  badge_key: string;
  name_zh: string;
  name_en: string;
  description_zh: string | null;
  description_en: string | null;
  category: string | null;
  sort_order: number;
  /** 已授予徽章的时间；未授予（locked）时为 undefined。 */
  awarded_at?: string;
  /** 是否为未获得态（灰色锁定）。 */
  locked?: boolean;
};

export type Work = {
  id: string;
  title: string;
  cover_url?: string | null;
  status: string;
  updated_at?: string | null;
};

export type Universe = {
  id: string;
  name: string;
  card_summary?: string | null;
  cover_url?: string | null;
  status: string;
  tags: string[];
  updated_at?: string | null;
};

export type Actor = {
  id: string;
  name: string;
  avatar_url?: string | null;
  subtitle?: string | null;
  status: string;
  visibility: string;
  tags: string[];
  portrayal_count: number;
};

export type TabKey = "works" | "universes" | "actors" | "badges";

export type TabDef = {
  key: TabKey;
  label: string;
  count?: number;
};
