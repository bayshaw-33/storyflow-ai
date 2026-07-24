// 演员市场（阶段 D） · 共享类型
// 字段对齐 supabase/migrations/20260731000000_actor_marketplace.sql

/** 上架状态：unlisted 未上架 / listed 已上架 / delisted 主动下架 / removed 平台下架 */
export type ListingStatus = "unlisted" | "listed" | "delisted" | "removed";

/** 授权范围：free 免费 / project 项目专属 / global 通用授权 */
export type GrantType = "free" | "project" | "global";

/** 创作者信息（用于市场卡片与详情页） */
export type OwnerInfo = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
};

/** 多视图资产（正/侧/背/全身等预览缩略图） */
export type ViewAsset = {
  id: string;
  url: string;
  label_zh: string;
  label_en: string;
};

/** 市场卡片（列表视图） */
export type MarketActorCard = {
  id: string;
  name: string;
  tagline?: string | null;
  primary_asset_url?: string | null;
  listing_price_kk: number | null;
  owner: OwnerInfo;
};

/** 市场详情页用的演员完整数据 */
export type MarketActorDetail = MarketActorCard & {
  bio?: string | null;
  tags: string[];
  listing_status: ListingStatus;
  listing_published_at?: string | null;
  listing_delisted_at?: string | null;
  view_assets?: ViewAsset[];
};

/** 上架信息（详情页购买卡用，价格/状态的视图切片） */
export type Listing = {
  status: ListingStatus;
  price_kk: number | null;
  published_at?: string | null;
  delisted_at?: string | null;
};

/** 演员市场统计 */
export type ActorStats = {
  sales_count: number;
  usage_count: number;
};

/** 买家对当前演员的购买状态 */
export type BuyerStatus = {
  hasPurchased: boolean;
  grantType?: GrantType;
  projectTitle?: string | null;
  paidAt?: string | null;
};

/** 购买预览（费用摘要，由 preview_only=true 接口返回） */
export type PurchasePreview = {
  price_kk: number;
  platform_fee_kk: number;
  seller_revenue_kk: number;
  balance_kk: number;
  balance_after_kk: number;
  grant_type: GrantType;
  project_id: string | null;
  project_title?: string | null;
};

/** 可选项目（用于购买卡的下拉选择） */
export type ProjectOption = {
  id: string;
  title: string;
};

/** 销售总览 */
export type SalesSummary = {
  total_revenue_kk: number;
  pending_revenue_kk: number;
  settled_revenue_kk: number;
  withdrawn_revenue_kk: number;
  available_for_withdrawal_kk: number;
  this_month_revenue_kk: number;
  total_sales_count: number;
  this_month_sales_count: number;
};

/** 销售订单 */
export type Order = {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_thumbnail?: string | null;
  buyer_name: string;
  price_kk: number;
  seller_revenue_kk: number;
  paid_at: string;
  project_id?: string | null;
  project_title?: string | null;
  grant_type: GrantType;
};

/** 收益明细条目 */
export type RevenueItem = {
  id: string;
  type: "sale" | "refund" | "settlement" | "withdrawal";
  amount_kk: number;
  fee_kk: number;
  gross_kk: number;
  status: "pending" | "settled" | "withdrawn";
  actor_name: string;
  created_at: string;
  settlement_period?: string | null;
};

/** 上架条目（创作者自己的上架列表） */
export type ListingItem = {
  actor_id: string;
  actor_name: string;
  actor_thumbnail?: string | null;
  listing_status: ListingStatus;
  listing_price_kk: number | null;
  sales_count: number;
  total_revenue_kk: number;
};

/** 销售 Tab key */
export type SalesTab = "orders" | "revenue" | "listings";
