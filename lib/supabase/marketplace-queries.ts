/**
 * 演员市场查询（阶段 D）。
 *
 * 所有函数接收 service-role SupabaseClient（绕过 RLS）。
 * 设计文档 §3 / §5。
 *
 * 分页约定：cursor 为 offset 的字符串形式（"0" 起始），与现有 profile-queries
 * 的 Paginated<T> 类型兼容。nextCursor 为 null 表示无更多数据。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFreeActor } from "@/lib/marketplace/pricing";

// ============================================================
// 通用类型
// ============================================================

export type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type MarketplaceFilter = "free" | "paid" | "latest" | "popular";
export type ListingStatus = "unlisted" | "listed" | "delisted" | "removed";
export type GrantType = "free" | "project" | "global";

// ============================================================
// 演员市场详情
// ============================================================

export type ActorMarketDetail = {
  actor: {
    id: string;
    name: string;
    bio: string | null;
    age_range: string | null;
    gender_expression: string | null;
    ethnicity_style: string | null;
    face_description: string | null;
    hair_description: string | null;
    body_description: string | null;
    temperament: string | null;
    playable_roles: string | null;
    avatar_asset_id: string | null;
    avatar_storage_path: string | null;
    reference_sheet_asset_id: string | null;
    owner_id: string;
    listing_status: ListingStatus;
    listing_price_kk: number | null;
    listing_published_at: string | null;
    listing_delisted_at: string | null;
    listing_removed_reason: string | null;
    created_at: string;
    updated_at: string;
  };
  price_kk: number;
  is_free: boolean;
  sales_count: number;
  usage_count: number;
  creator: {
    user_id: string;
    username: string | null;
    display_name: string | null;
    avatar_asset_id: string | null;
    avatar_storage_path: string | null;
  } | null;
  viewer_purchase: {
    purchased: boolean;
    grant_type: GrantType | null;
    project_id: string | null;
    order_id: string | null;
  } | null;
};

const ACTOR_MARKET_SELECT =
  "id, name, bio, age_range, gender_expression, ethnicity_style, face_description, hair_description, body_description, temperament, playable_roles, avatar_asset_id, reference_sheet_asset_id, owner_id, status, listing_status, listing_price_kk, listing_published_at, listing_delisted_at, listing_removed_reason, created_at, updated_at";

const ASSET_JOIN_SELECT = "avatar_asset:avatar_asset_id(storage_path)";

/**
 * 获取演员市场详情（公开）。
 * viewerId 为 null 时 viewer_purchase 返回 null。
 */
export async function getActorMarketDetail(
  serverClient: SupabaseClient,
  actorId: string,
  viewerId?: string | null,
): Promise<ActorMarketDetail | null> {
  // 查演员
  const { data: actor, error } = await serverClient
    .from("storyflow_actor_profiles")
    .select(`${ACTOR_MARKET_SELECT}, ${ASSET_JOIN_SELECT}`)
    .eq("id", actorId)
    .maybeSingle();

  if (error) throw error;
  if (!actor) return null;

  // 并发查：销售统计、使用次数、创作者信息、买家购买状态
  const [salesCount, usageCount, creator, viewerPurchase] = await Promise.all([
    countSalesForActor(serverClient, actorId),
    countUsagesForActor(serverClient, actorId),
    getCreatorProfile(serverClient, (actor as { owner_id: string }).owner_id),
    viewerId ? getViewerPurchase(serverClient, actorId, viewerId) : Promise.resolve(null),
  ]);

  const rawPrice = (actor as { listing_price_kk: number | null }).listing_price_kk ?? 0;
  const priceKk = isFreeActor(rawPrice) ? 0 : Math.max(0, Number(rawPrice) || 0);

  return {
    actor: { ...(actor as Record<string, unknown>), avatar_storage_path: ((actor as { avatar_asset?: { storage_path?: string } | null }).avatar_asset?.storage_path as string | null) ?? null } as ActorMarketDetail["actor"],
    price_kk: priceKk,
    is_free: priceKk === 0,
    sales_count: salesCount,
    usage_count: usageCount,
    creator,
    viewer_purchase: viewerPurchase,
  };
}

// ============================================================
// 市场浏览列表
// ============================================================

export type MarketplaceActorListItem = {
  id: string;
  name: string;
  bio: string | null;
  age_range: string | null;
  gender_expression: string | null;
  ethnicity_style: string | null;
  temperament: string | null;
  avatar_asset_id: string | null;
  avatar_storage_path: string | null;
  listing_price_kk: number | null;
  listing_published_at: string | null;
  owner_id: string;
  owner_username: string | null;
  owner_display_name: string | null;
  sales_count: number;
  created_at: string;
  updated_at: string;
};

const MARKET_LIST_SELECT =
  "id, name, bio, age_range, gender_expression, ethnicity_style, temperament, avatar_asset_id, listing_price_kk, listing_published_at, owner_id, created_at, updated_at";

/**
 * 市场浏览列表（listing_status='listed'）。
 * filter: free（免费）/ paid（付费）/ latest（最新，默认）/ popular（热门，按销量）
 */
export async function getMarketplaceActors(
  serverClient: SupabaseClient,
  cursor?: string | null,
  limit = 12,
  filter: MarketplaceFilter = "latest",
): Promise<Paginated<MarketplaceActorListItem>> {
  const offset = Math.max(0, Number(cursor) || 0);
  const safeLimit = Math.min(Math.max(1, limit), 50);

  // popular：先取近 200 个 listed 演员，按销量排序后分页
  if (filter === "popular") {
    return listPopularActors(serverClient, offset, safeLimit);
  }

  let q = serverClient
    .from("storyflow_actor_profiles")
    .select(`${MARKET_LIST_SELECT}, ${ASSET_JOIN_SELECT}`)
    .eq("listing_status", "listed")
    .neq("status", "archived")
    .order("listing_published_at", { ascending: false })
    .range(offset, offset + safeLimit);

  if (filter === "free") {
    q = q.or("listing_price_kk.is.null,listing_price_kk.eq.0");
  } else if (filter === "paid") {
    q = q.gt("listing_price_kk", 0);
  }

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data || []) as Array<Record<string, unknown>>;
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id as string)));
  const ownerMap = await fetchOwnerProfiles(serverClient, ownerIds);
  const salesMap = await fetchSalesCounts(serverClient, rows.map((r) => r.id as string));

  const items = rows.map((row) => normalizeListItem(row, ownerMap, salesMap));
  return paginate(items, offset, safeLimit);
}

async function listPopularActors(
  serverClient: SupabaseClient,
  offset: number,
  limit: number,
): Promise<Paginated<MarketplaceActorListItem>> {
  // 取较多候选按销量排序，再分页
  const fetchLimit = Math.max(200, offset + limit);
  const { data, error } = await serverClient
    .from("storyflow_actor_profiles")
    .select(`${MARKET_LIST_SELECT}, ${ASSET_JOIN_SELECT}`)
    .eq("listing_status", "listed")
    .neq("status", "archived")
    .order("listing_published_at", { ascending: false })
    .limit(fetchLimit);
  if (error) throw error;

  const rows = (data || []) as Array<Record<string, unknown>>;
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id as string)));
  const ownerMap = await fetchOwnerProfiles(serverClient, ownerIds);
  const salesMap = await fetchSalesCounts(serverClient, rows.map((r) => r.id as string));

  const items = rows
    .map((row) => normalizeListItem(row, ownerMap, salesMap))
    .sort((a, b) => b.sales_count - a.sales_count || (b.listing_published_at || "").localeCompare(a.listing_published_at || ""));

  const page = items.slice(offset, offset + limit);
  return paginateFromItems(page, offset, limit, items.length);
}

// ============================================================
// 买家已购列表
// ============================================================

export type PurchasedActorItem = {
  order_id: string;
  actor_id: string;
  actor_name: string;
  actor_avatar_asset_id: string | null;
  price_kk: number;
  grant_type: GrantType;
  project_id: string | null;
  paid_at: string;
  seller_id: string;
  seller_username: string | null;
  seller_display_name: string | null;
};

const PURCHASED_SELECT =
  "id, actor_id, project_id, price_kk, paid_at, seller_id, actor:actor_id(name, avatar_asset_id, status)";

/**
 * 买家已购演员列表。
 * scope: 'global'（通用授权）/ 'project'（项目专属）/ 不传=全部
 * projectId: 当 scope='project' 时进一步按项目过滤
 */
export async function getPurchasedActors(
  serverClient: SupabaseClient,
  buyerId: string,
  cursor?: string | null,
  limit = 12,
  scope?: "global" | "project",
  projectId?: string | null,
): Promise<Paginated<PurchasedActorItem>> {
  const offset = Math.max(0, Number(cursor) || 0);
  const safeLimit = Math.min(Math.max(1, limit), 50);

  let q = serverClient
    .from("storyflow_actor_orders")
    .select(PURCHASED_SELECT)
    .eq("buyer_id", buyerId)
    .eq("status", "paid")
    .order("paid_at", { ascending: false })
    .range(offset, offset + safeLimit);

  if (scope === "global") {
    q = q.is("project_id", null);
  } else if (scope === "project") {
    q = q.not("project_id", "is", null);
    if (projectId) q = q.eq("project_id", projectId);
  }

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data || []) as Array<Record<string, unknown>>;
  const sellerIds = Array.from(new Set(rows.map((r) => r.seller_id as string)));
  const sellerMap = await fetchOwnerProfiles(serverClient, sellerIds);

  const items = rows.map((row) => normalizePurchasedItem(row, sellerMap));
  return paginate(items, offset, safeLimit);
}

// ============================================================
// 卖家订单列表
// ============================================================

export type SellerOrderItem = {
  id: string;
  actor_id: string;
  actor_name: string;
  buyer_id: string;
  buyer_username: string | null;
  buyer_display_name: string | null;
  project_id: string | null;
  price_kk: number;
  platform_fee_kk: number;
  seller_revenue_kk: number;
  grant_type: GrantType;
  status: string;
  paid_at: string;
  created_at: string;
};

const SELLER_ORDER_SELECT =
  "id, actor_id, buyer_id, project_id, price_kk, platform_fee_kk, seller_revenue_kk, status, paid_at, created_at, actor:actor_id(name)";

export async function getSellerOrders(
  serverClient: SupabaseClient,
  sellerId: string,
  cursor?: string | null,
  limit = 12,
): Promise<Paginated<SellerOrderItem>> {
  const offset = Math.max(0, Number(cursor) || 0);
  const safeLimit = Math.min(Math.max(1, limit), 50);

  const { data, error } = await serverClient
    .from("storyflow_actor_orders")
    .select(SELLER_ORDER_SELECT)
    .eq("seller_id", sellerId)
    .order("paid_at", { ascending: false })
    .range(offset, offset + safeLimit);

  if (error) throw error;

  const rows = (data || []) as Array<Record<string, unknown>>;
  const buyerIds = Array.from(new Set(rows.map((r) => r.buyer_id as string)));
  const buyerMap = await fetchOwnerProfiles(serverClient, buyerIds);

  const items = rows.map((row) => normalizeSellerOrder(row, buyerMap));
  return paginate(items, offset, safeLimit);
}

// ============================================================
// 收益明细
// ============================================================

export type RevenueLedgerItem = {
  id: string;
  order_id: string;
  actor_id: string;
  actor_name: string;
  amount_kk: number;
  fee_kk: number;
  gross_kk: number;
  type: string;
  status: string;
  settlement_period: string | null;
  settled_at: string | null;
  created_at: string;
};

const REVENUE_LEDGER_SELECT =
  "id, order_id, actor_id, amount_kk, fee_kk, gross_kk, type, status, settlement_period, settled_at, created_at, actor:actor_id(name)";

export async function getRevenueLedger(
  serverClient: SupabaseClient,
  userId: string,
  cursor?: string | null,
  limit = 12,
): Promise<Paginated<RevenueLedgerItem>> {
  const offset = Math.max(0, Number(cursor) || 0);
  const safeLimit = Math.min(Math.max(1, limit), 50);

  const { data, error } = await serverClient
    .from("storyflow_creator_revenue_ledger")
    .select(REVENUE_LEDGER_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + safeLimit);

  if (error) throw error;

  const rows = (data || []) as Array<Record<string, unknown>>;
  const items = rows.map((row) => normalizeRevenueLedger(row));
  return paginate(items, offset, safeLimit);
}

// ============================================================
// 卖家上架列表（含销量统计）
// ============================================================

export type SellerListingItem = {
  id: string;
  name: string;
  bio: string | null;
  avatar_asset_id: string | null;
  avatar_storage_path: string | null;
  listing_status: ListingStatus;
  listing_price_kk: number | null;
  is_free: boolean;
  listing_published_at: string | null;
  listing_delisted_at: string | null;
  listing_removed_reason: string | null;
  sales_count: number;
  revenue_kk: number;
  created_at: string;
  updated_at: string;
};

const SELLER_LISTING_SELECT =
  "id, name, bio, avatar_asset_id, listing_status, listing_price_kk, listing_published_at, listing_delisted_at, listing_removed_reason, created_at, updated_at";

export async function getSellerListings(
  serverClient: SupabaseClient,
  sellerId: string,
  cursor?: string | null,
  limit = 12,
): Promise<Paginated<SellerListingItem>> {
  const offset = Math.max(0, Number(cursor) || 0);
  const safeLimit = Math.min(Math.max(1, limit), 50);

  const { data, error } = await serverClient
    .from("storyflow_actor_profiles")
    .select(`${SELLER_LISTING_SELECT}, ${ASSET_JOIN_SELECT}`)
    .eq("owner_id", sellerId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .range(offset, offset + safeLimit);

  if (error) throw error;

  const rows = (data || []) as Array<Record<string, unknown>>;
  const actorIds = rows.map((r) => r.id as string);
  const [salesMap, revenueMap] = await Promise.all([
    fetchSalesCounts(serverClient, actorIds),
    fetchRevenueSums(serverClient, actorIds, sellerId),
  ]);

  const items = rows.map((row) => normalizeSellerListing(row, salesMap, revenueMap));
  return paginate(items, offset, safeLimit);
}

// ============================================================
// 买家演员库（本人创建 UNION 已购买）
// ============================================================

export type BuyerLibraryItem = {
  id: string;
  name: string;
  bio: string | null;
  avatar_asset_id: string | null;
  avatar_storage_path: string | null;
  age_range: string | null;
  gender_expression: string | null;
  source: "owned" | "purchased";
  grant_type: GrantType | null;
  order_id: string | null;
  project_id: string | null;
  paid_at: string | null;
  owner_id: string;
  owner_username: string | null;
  owner_display_name: string | null;
};

const BUYER_LIBRARY_OWNED_SELECT =
  "id, name, bio, avatar_asset_id, age_range, gender_expression, owner_id, created_at, updated_at";

export async function getBuyerActorLibrary(
  serverClient: SupabaseClient,
  buyerId: string,
  cursor?: string | null,
  limit = 12,
): Promise<Paginated<BuyerLibraryItem>> {
  const offset = Math.max(0, Number(cursor) || 0);
  const safeLimit = Math.min(Math.max(1, limit), 50);

  // 并发查：本人创建 + 已购买
  const [owned, purchased] = await Promise.all([
    serverClient
      .from("storyflow_actor_profiles")
      .select(`${BUYER_LIBRARY_OWNED_SELECT}, ${ASSET_JOIN_SELECT}`)
      .eq("owner_id", buyerId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(100),
    serverClient
      .from("storyflow_actor_orders")
      .select("id, actor_id, project_id, price_kk, paid_at, actor:actor_id(name, bio, avatar_asset_id, age_range, gender_expression, owner_id, status)")
      .eq("buyer_id", buyerId)
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(100),
  ]);

  if (owned.error) throw owned.error;
  if (purchased.error) throw purchased.error;

  const sellerIds = Array.from(new Set(
    (purchased.data || []).map((r) => (r as { actor?: { owner_id?: string } }).actor?.owner_id).filter(Boolean) as string[],
  ));
  const sellerMap = await fetchOwnerProfiles(serverClient, sellerIds);

  const ownedItems: BuyerLibraryItem[] = ((owned.data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    bio: (row.bio as string | null) ?? null,
    avatar_asset_id: (row.avatar_asset_id as string | null) ?? null,
    avatar_storage_path: ((row.avatar_asset as { storage_path?: string } | null)?.storage_path as string | null) ?? null,
    age_range: (row.age_range as string | null) ?? null,
    gender_expression: (row.gender_expression as string | null) ?? null,
    source: "owned" as const,
    grant_type: null,
    order_id: null,
    project_id: null,
    paid_at: null,
    owner_id: row.owner_id as string,
    owner_username: null,
    owner_display_name: null,
  }));

  const purchasedItems: BuyerLibraryItem[] = ((purchased.data || []) as Array<Record<string, unknown>>).map((row) => {
    const actor = (row.actor as Record<string, unknown> | null) || {};
    const sellerId = (actor.owner_id as string) || "";
    const seller = sellerMap.get(sellerId);
    const priceKk = Number(row.price_kk ?? 0);
    const grantType: GrantType = priceKk === 0 ? "free" : row.project_id ? "project" : "global";
    return {
      id: actor.id as string,
      name: (actor.name as string) || "",
      bio: (actor.bio as string | null) ?? null,
      avatar_asset_id: (actor.avatar_asset_id as string | null) ?? null,
      avatar_storage_path: null,
      age_range: (actor.age_range as string | null) ?? null,
      gender_expression: (actor.gender_expression as string | null) ?? null,
      source: "purchased" as const,
      grant_type: grantType,
      order_id: row.id as string,
      project_id: (row.project_id as string | null) ?? null,
      paid_at: (row.paid_at as string | null) ?? null,
      owner_id: sellerId,
      owner_username: seller?.username ?? null,
      owner_display_name: seller?.display_name ?? null,
    };
  }).filter((item) => Boolean(item.id));

  // 合并去重（本人创建 + 已购买可能重复，已购买的优先展示）
  const seen = new Set<string>();
  const merged: BuyerLibraryItem[] = [];
  for (const item of purchasedItems) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  for (const item of ownedItems) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }

  const page = merged.slice(offset, offset + safeLimit);
  return paginateFromItems(page, offset, safeLimit, merged.length);
}

// ============================================================
// 上架状态 / 上架管理
// ============================================================

export type ActorListingStatus = {
  actor_id: string;
  owner_id: string;
  listing_status: ListingStatus;
  listing_price_kk: number | null;
  listing_published_at: string | null;
  listing_delisted_at: string | null;
  listing_removed_reason: string | null;
};

export async function getActorListingStatus(
  serverClient: SupabaseClient,
  actorId: string,
  ownerId: string,
): Promise<ActorListingStatus> {
  const { data, error } = await serverClient
    .from("storyflow_actor_profiles")
    .select("id, owner_id, listing_status, listing_price_kk, listing_published_at, listing_delisted_at, listing_removed_reason")
    .eq("id", actorId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("ACTOR_NOT_FOUND");
  if (data.owner_id !== ownerId) throw new Error("ACTOR_FORBIDDEN");

  return {
    actor_id: data.id as string,
    owner_id: data.owner_id as string,
    listing_status: data.listing_status as ListingStatus,
    listing_price_kk: (data.listing_price_kk as number | null) ?? null,
    listing_published_at: (data.listing_published_at as string | null) ?? null,
    listing_delisted_at: (data.listing_delisted_at as string | null) ?? null,
    listing_removed_reason: (data.listing_removed_reason as string | null) ?? null,
  };
}

export type ListingAction = "publish" | "delist" | "update_price";

export type UpdateListingResult = {
  actor_id: string;
  listing_status: ListingStatus;
  listing_price_kk: number | null;
  listing_published_at: string | null;
  listing_delisted_at: string | null;
};

/**
 * 上架/下架/改价。
 * - publish: unlisted/delisted → listed，设 price + published_at
 * - delist: listed → delisted，设 delisted_at
 * - update_price: 仅 listed 可改价
 * - removed 状态只有管理员能改（本函数拒绝）
 */
export async function updateActorListing(
  serverClient: SupabaseClient,
  actorId: string,
  ownerId: string,
  action: ListingAction,
  priceKk?: number | null,
): Promise<UpdateListingResult> {
  const status = await getActorListingStatus(serverClient, actorId, ownerId);

  if (status.listing_status === "removed") {
    throw new Error("LISTING_REMOVED_REQUIRES_ADMIN");
  }

  const now = new Date().toISOString();
  let patch: Record<string, unknown> = {};

  if (action === "publish") {
    // 价格校验：null/0=免费，正整数=付费
    let nextPrice: number | null = null;
    if (priceKk != null) {
      const n = Math.floor(Number(priceKk) || 0);
      if (n < 0) throw new Error("INVALID_PRICE");
      nextPrice = n;
    }
    patch = {
      listing_status: "listed",
      listing_price_kk: nextPrice,
      listing_published_at: status.listing_published_at || now,
      listing_delisted_at: null,
      listing_removed_reason: null,
    };
  } else if (action === "delist") {
    if (status.listing_status !== "listed") {
      throw new Error("NOT_CURRENTLY_LISTED");
    }
    patch = {
      listing_status: "delisted",
      listing_delisted_at: now,
    };
  } else if (action === "update_price") {
    if (status.listing_status !== "listed") {
      throw new Error("NOT_CURRENTLY_LISTED");
    }
    let nextPrice: number | null = null;
    if (priceKk != null) {
      const n = Math.floor(Number(priceKk) || 0);
      if (n < 0) throw new Error("INVALID_PRICE");
      nextPrice = n;
    }
    patch = { listing_price_kk: nextPrice };
  } else {
    throw new Error("INVALID_LISTING_ACTION");
  }

  const { data, error } = await serverClient
    .from("storyflow_actor_profiles")
    .update(patch)
    .eq("id", actorId)
    .eq("owner_id", ownerId)
    .select("id, listing_status, listing_price_kk, listing_published_at, listing_delisted_at")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("ACTOR_NOT_FOUND");

  return {
    actor_id: data.id as string,
    listing_status: data.listing_status as ListingStatus,
    listing_price_kk: (data.listing_price_kk as number | null) ?? null,
    listing_published_at: (data.listing_published_at as string | null) ?? null,
    listing_delisted_at: (data.listing_delisted_at as string | null) ?? null,
  };
}

// ============================================================
// 管理员：所有上架
// ============================================================

export type AdminListingItem = {
  id: string;
  name: string;
  owner_id: string;
  owner_username: string | null;
  owner_display_name: string | null;
  listing_status: ListingStatus;
  listing_price_kk: number | null;
  listing_published_at: string | null;
  listing_delisted_at: string | null;
  listing_removed_reason: string | null;
  sales_count: number;
  created_at: string;
  updated_at: string;
};

const ADMIN_LISTING_SELECT =
  "id, name, owner_id, listing_status, listing_price_kk, listing_published_at, listing_delisted_at, listing_removed_reason, created_at, updated_at";

export async function getAdminListings(
  serverClient: SupabaseClient,
  cursor?: string | null,
  limit = 12,
  status?: ListingStatus,
): Promise<Paginated<AdminListingItem>> {
  const offset = Math.max(0, Number(cursor) || 0);
  const safeLimit = Math.min(Math.max(1, limit), 50);

  let q = serverClient
    .from("storyflow_actor_profiles")
    .select(ADMIN_LISTING_SELECT)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .range(offset, offset + safeLimit);

  if (status) {
    q = q.eq("listing_status", status);
  }

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data || []) as Array<Record<string, unknown>>;
  const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id as string)));
  const ownerMap = await fetchOwnerProfiles(serverClient, ownerIds);
  const salesMap = await fetchSalesCounts(serverClient, rows.map((r) => r.id as string));

  const items = rows.map((row) => normalizeAdminListing(row, ownerMap, salesMap));
  return paginate(items, offset, safeLimit);
}

// ============================================================
// 内部辅助
// ============================================================

type OwnerProfile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_asset_id: string | null;
  avatar_storage_path: string | null;
};

async function fetchOwnerProfiles(
  c: SupabaseClient,
  userIds: string[],
): Promise<Map<string, OwnerProfile>> {
  const map = new Map<string, OwnerProfile>();
  if (!userIds.length) return map;
  const { data, error } = await c
    .from("storyflow_profiles")
    .select("user_id, username, display_name, avatar_asset_id, avatar_storage_path")
    .in("user_id", userIds);
  if (error) throw error;
  for (const row of data || []) {
    map.set(row.user_id as string, {
      user_id: row.user_id as string,
      username: (row.username as string | null) ?? null,
      display_name: (row.display_name as string | null) ?? null,
      avatar_asset_id: (row.avatar_asset_id as string | null) ?? null,
      avatar_storage_path: (row.avatar_storage_path as string | null) ?? null,
    });
  }
  return map;
}

async function fetchSalesCounts(
  c: SupabaseClient,
  actorIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!actorIds.length) return map;
  const { data, error } = await c
    .from("storyflow_actor_orders")
    .select("actor_id")
    .eq("status", "paid")
    .in("actor_id", actorIds);
  if (error) throw error;
  for (const row of data || []) {
    const id = row.actor_id as string;
    map.set(id, (map.get(id) || 0) + 1);
  }
  return map;
}

async function fetchRevenueSums(
  c: SupabaseClient,
  actorIds: string[],
  sellerId: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!actorIds.length) return map;
  const { data, error } = await c
    .from("storyflow_creator_revenue_ledger")
    .select("actor_id, amount_kk")
    .eq("user_id", sellerId)
    .eq("type", "sale")
    .in("actor_id", actorIds);
  if (error) throw error;
  for (const row of data || []) {
    const id = row.actor_id as string;
    map.set(id, (map.get(id) || 0) + (Number(row.amount_kk) || 0));
  }
  return map;
}

async function countSalesForActor(c: SupabaseClient, actorId: string): Promise<number> {
  const { count, error } = await c
    .from("storyflow_actor_orders")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", actorId)
    .eq("status", "paid");
  if (error) throw error;
  return count ?? 0;
}

async function countUsagesForActor(c: SupabaseClient, actorId: string): Promise<number> {
  // storyflow_actor_usages.actor_id 为 FK -> storyflow_actor_profiles.id
  const { count, error } = await c
    .from("storyflow_actor_usages")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", actorId)
    .is("revoked_at", null);
  if (error) throw error;
  return count ?? 0;
}

async function getCreatorProfile(
  c: SupabaseClient,
  userId: string,
): Promise<ActorMarketDetail["creator"]> {
  const { data, error } = await c
    .from("storyflow_profiles")
    .select("user_id, username, display_name, avatar_asset_id, avatar_storage_path")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    user_id: data.user_id as string,
    username: (data.username as string | null) ?? null,
    display_name: (data.display_name as string | null) ?? null,
    avatar_asset_id: (data.avatar_asset_id as string | null) ?? null,
    avatar_storage_path: (data.avatar_storage_path as string | null) ?? null,
  };
}

async function getViewerPurchase(
  c: SupabaseClient,
  actorId: string,
  viewerId: string,
): Promise<ActorMarketDetail["viewer_purchase"]> {
  // 优先查通用授权（project_id IS NULL），没有则查任意项目专属
  const { data, error } = await c
    .from("storyflow_actor_orders")
    .select("id, project_id, price_kk")
    .eq("actor_id", actorId)
    .eq("buyer_id", viewerId)
    .eq("status", "paid")
    .order("project_id", { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw error;
  const row = (data || [])[0];
  if (!row) return { purchased: false, grant_type: null, project_id: null, order_id: null };

  const priceKk = Number(row.price_kk ?? 0);
  const grantType: GrantType = priceKk === 0 ? "free" : row.project_id ? "project" : "global";
  return {
    purchased: true,
    grant_type: grantType,
    project_id: (row.project_id as string | null) ?? null,
    order_id: row.id as string,
  };
}

function normalizeListItem(
  row: Record<string, unknown>,
  ownerMap: Map<string, OwnerProfile>,
  salesMap: Map<string, number>,
): MarketplaceActorListItem {
  const ownerId = row.owner_id as string;
  const owner = ownerMap.get(ownerId);
  const id = row.id as string;
  return {
    id,
    name: row.name as string,
    bio: (row.bio as string | null) ?? null,
    age_range: (row.age_range as string | null) ?? null,
    gender_expression: (row.gender_expression as string | null) ?? null,
    ethnicity_style: (row.ethnicity_style as string | null) ?? null,
    temperament: (row.temperament as string | null) ?? null,
    avatar_asset_id: (row.avatar_asset_id as string | null) ?? null,
    avatar_storage_path: ((row.avatar_asset as { storage_path?: string } | null)?.storage_path as string | null) ?? null,
    listing_price_kk: (row.listing_price_kk as number | null) ?? null,
    listing_published_at: (row.listing_published_at as string | null) ?? null,
    owner_id: ownerId,
    owner_username: owner?.username ?? null,
    owner_display_name: owner?.display_name ?? null,
    sales_count: salesMap.get(id) || 0,
    created_at: (row.created_at as string) || "",
    updated_at: (row.updated_at as string) || "",
  };
}

function normalizePurchasedItem(
  row: Record<string, unknown>,
  sellerMap: Map<string, OwnerProfile>,
): PurchasedActorItem {
  const actor = (row.actor as Record<string, unknown> | null) || {};
  const sellerId = row.seller_id as string;
  const seller = sellerMap.get(sellerId);
  const priceKk = Number(row.price_kk ?? 0);
  const grantType: GrantType = priceKk === 0 ? "free" : row.project_id ? "project" : "global";
  return {
    order_id: row.id as string,
    actor_id: (actor.id as string) || row.actor_id as string,
    actor_name: (actor.name as string) || "",
    actor_avatar_asset_id: (actor.avatar_asset_id as string | null) ?? null,
    price_kk: priceKk,
    grant_type: grantType,
    project_id: (row.project_id as string | null) ?? null,
    paid_at: (row.paid_at as string) || "",
    seller_id: sellerId,
    seller_username: seller?.username ?? null,
    seller_display_name: seller?.display_name ?? null,
  };
}

function normalizeSellerOrder(
  row: Record<string, unknown>,
  buyerMap: Map<string, OwnerProfile>,
): SellerOrderItem {
  const actor = (row.actor as Record<string, unknown> | null) || {};
  const buyerId = row.buyer_id as string;
  const buyer = buyerMap.get(buyerId);
  const priceKk = Number(row.price_kk ?? 0);
  const grantType: GrantType = priceKk === 0 ? "free" : row.project_id ? "project" : "global";
  return {
    id: row.id as string,
    actor_id: row.actor_id as string,
    actor_name: (actor.name as string) || "",
    buyer_id: buyerId,
    buyer_username: buyer?.username ?? null,
    buyer_display_name: buyer?.display_name ?? null,
    project_id: (row.project_id as string | null) ?? null,
    price_kk: priceKk,
    platform_fee_kk: Number(row.platform_fee_kk ?? 0),
    seller_revenue_kk: Number(row.seller_revenue_kk ?? 0),
    grant_type: grantType,
    status: (row.status as string) || "paid",
    paid_at: (row.paid_at as string) || "",
    created_at: (row.created_at as string) || "",
  };
}

function normalizeRevenueLedger(row: Record<string, unknown>): RevenueLedgerItem {
  const actor = (row.actor as Record<string, unknown> | null) || {};
  return {
    id: row.id as string,
    order_id: row.order_id as string,
    actor_id: row.actor_id as string,
    actor_name: (actor.name as string) || "",
    amount_kk: Number(row.amount_kk ?? 0),
    fee_kk: Number(row.fee_kk ?? 0),
    gross_kk: Number(row.gross_kk ?? 0),
    type: (row.type as string) || "sale",
    status: (row.status as string) || "pending",
    settlement_period: (row.settlement_period as string | null) ?? null,
    settled_at: (row.settled_at as string | null) ?? null,
    created_at: (row.created_at as string) || "",
  };
}

function normalizeSellerListing(
  row: Record<string, unknown>,
  salesMap: Map<string, number>,
  revenueMap: Map<string, number>,
): SellerListingItem {
  const id = row.id as string;
  const rawPrice = (row.listing_price_kk as number | null) ?? null;
  return {
    id,
    name: row.name as string,
    bio: (row.bio as string | null) ?? null,
    avatar_asset_id: (row.avatar_asset_id as string | null) ?? null,
    avatar_storage_path: ((row.avatar_asset as { storage_path?: string } | null)?.storage_path as string | null) ?? null,
    listing_status: (row.listing_status as ListingStatus) || "unlisted",
    listing_price_kk: rawPrice,
    is_free: isFreeActor(rawPrice),
    listing_published_at: (row.listing_published_at as string | null) ?? null,
    listing_delisted_at: (row.listing_delisted_at as string | null) ?? null,
    listing_removed_reason: (row.listing_removed_reason as string | null) ?? null,
    sales_count: salesMap.get(id) || 0,
    revenue_kk: revenueMap.get(id) || 0,
    created_at: (row.created_at as string) || "",
    updated_at: (row.updated_at as string) || "",
  };
}

function normalizeAdminListing(
  row: Record<string, unknown>,
  ownerMap: Map<string, OwnerProfile>,
  salesMap: Map<string, number>,
): AdminListingItem {
  const ownerId = row.owner_id as string;
  const owner = ownerMap.get(ownerId);
  const id = row.id as string;
  return {
    id,
    name: row.name as string,
    owner_id: ownerId,
    owner_username: owner?.username ?? null,
    owner_display_name: owner?.display_name ?? null,
    listing_status: (row.listing_status as ListingStatus) || "unlisted",
    listing_price_kk: (row.listing_price_kk as number | null) ?? null,
    listing_published_at: (row.listing_published_at as string | null) ?? null,
    listing_delisted_at: (row.listing_delisted_at as string | null) ?? null,
    listing_removed_reason: (row.listing_removed_reason as string | null) ?? null,
    sales_count: salesMap.get(id) || 0,
    created_at: (row.created_at as string) || "",
    updated_at: (row.updated_at as string) || "",
  };
}

// ============================================================
// 分页辅助
// ============================================================

/**
 * 基于 offset 分页：多取 1 条判断 hasMore。
 * 调用方 range(offset, offset+limit) 实际取 limit+1 条。
 */
function paginate<T>(items: T[], offset: number, limit: number): Paginated<T> {
  return paginateFromItems(items, offset, limit, items.length);
}

function paginateFromItems<T>(
  page: T[],
  offset: number,
  limit: number,
  totalKnown: number,
): Paginated<T> {
  // 当传入的 page 包含 limit+1 条时，最后一条用于判断 hasMore
  const hasMorePage = page.length > limit;
  const items = hasMorePage ? page.slice(0, limit) : page;
  const hasMore = hasMorePage || totalKnown > offset + limit;
  const nextCursor = hasMore ? String(offset + limit) : null;
  return { items, nextCursor, hasMore };
}
