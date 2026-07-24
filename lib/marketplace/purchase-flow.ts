/**
 * 演员市场购买流程核心逻辑（阶段 D）。
 *
 * 设计文档 §4 购买流程：
 * 1. 校验 listing_status='listed'
 * 2. 校验买家 != 卖家
 * 3. 校验未重复购买（同 actor+buyer+project 且 paid）
 * 4. 校验买家未持有通用授权（若有通用授权，拒绝再购任何授权）
 * 5. 查余额，免费演员跳过扣费
 * 6. 扣 KK 币（复用现有 credits 扣费逻辑）
 * 7. 计算抽成
 * 8. INSERT 订单（trigger 自动写收益账本）
 * 9. 返回订单 + 剩余余额
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateFees, isFreeActor, PLATFORM_FEE_RATE } from "./pricing";
import { getCreditAccount, consumeCredits } from "@/lib/supabase/server";

// ============================================================
// 错误类型
// ============================================================

export type PurchaseErrorCode =
  | "NOT_LISTED"
  | "CANNOT_BUY_OWN"
  | "ALREADY_PURCHASED"
  | "INSUFFICIENT_BALANCE"
  | "ACTOR_NOT_FOUND"
  | "PROJECT_NOT_OWNED";

export class PurchaseError extends Error {
  code: PurchaseErrorCode;
  constructor(code: PurchaseErrorCode, message?: string) {
    super(message || code);
    this.code = code;
    this.name = "PurchaseError";
  }
}

// ============================================================
// 类型
// ============================================================

export type ActorOrderRow = {
  id: string;
  actor_id: string;
  buyer_id: string;
  seller_id: string;
  project_id: string | null;
  price_kk: number;
  platform_fee_kk: number;
  seller_revenue_kk: number;
  platform_fee_rate: number;
  status: string;
  paid_at: string;
  created_at: string;
};

export type GrantType = "free" | "project" | "global";

export type PurchasePreview = {
  preview: true;
  actor_id: string;
  actor_name: string;
  price_kk: number;
  is_free: boolean;
  platform_fee_kk: number;
  seller_revenue_kk: number;
  grant_type: GrantType;
  project_id: string | null;
  buyer_balance_kk: number;
  balance_after_kk: number;
  insufficient_balance: boolean;
};

export type PurchaseSuccess = {
  preview: false;
  order: ActorOrderRow;
  balance_after_kk: number;
};

export type PurchaseResult = PurchasePreview | PurchaseSuccess;

export type ExecutePurchaseParams = {
  serverClient: SupabaseClient;
  buyerId: string;
  actorId: string;
  projectId?: string | null;
  previewOnly?: boolean;
};

// ============================================================
// 核心流程
// ============================================================

export async function executePurchase(
  params: ExecutePurchaseParams,
): Promise<PurchaseResult> {
  const { serverClient, buyerId, actorId } = params;
  const projectId = params.projectId ?? null;
  const previewOnly = params.previewOnly ?? false;

  // 1. 查演员（含 listing_status / listing_price_kk / owner_id）
  const { data: actor, error: actorErr } = await serverClient
    .from("storyflow_actor_profiles")
    .select("id, owner_id, name, status, listing_status, listing_price_kk")
    .eq("id", actorId)
    .maybeSingle();

  if (actorErr) throw actorErr;
  if (!actor || actor.status === "archived") {
    throw new PurchaseError("ACTOR_NOT_FOUND");
  }

  // 2. 校验上架状态
  if (actor.listing_status !== "listed") {
    throw new PurchaseError("NOT_LISTED");
  }

  // 3. 校验买家 != 卖家
  if (actor.owner_id === buyerId) {
    throw new PurchaseError("CANNOT_BUY_OWN");
  }

  // 4. 校验 project_id 属于买家（如非 null）
  if (projectId) {
    await assertProjectOwnedBy(serverClient, projectId, buyerId);
  }

  // 5. 重复购买校验：
  //    a) 买家是否已有通用授权（project_id IS NULL 且 paid）→ 拒绝再购
  //    b) 同 actor+buyer+project 已有 paid 订单 → 拒绝
  const { data: globalGrant } = await serverClient
    .from("storyflow_actor_orders")
    .select("id")
    .eq("actor_id", actorId)
    .eq("buyer_id", buyerId)
    .eq("status", "paid")
    .is("project_id", null)
    .maybeSingle();

  if (globalGrant) {
    throw new PurchaseError("ALREADY_PURCHASED");
  }

  if (projectId) {
    const { data: projectGrant } = await serverClient
      .from("storyflow_actor_orders")
      .select("id")
      .eq("actor_id", actorId)
      .eq("buyer_id", buyerId)
      .eq("status", "paid")
      .eq("project_id", projectId)
      .maybeSingle();

    if (projectGrant) {
      throw new PurchaseError("ALREADY_PURCHASED");
    }
  }

  // 6. 计算价格 / 抽成 / 授权类型
  const rawPrice = actor.listing_price_kk ?? 0;
  const priceKk = isFreeActor(rawPrice) ? 0 : Math.max(0, Number(rawPrice) || 0);
  const isFree = priceKk === 0;
  const { feeKk, revenueKk } = calculateFees(priceKk);
  const grantType: GrantType = isFree ? "free" : projectId ? "project" : "global";

  // 7. 查买家余额（免费演员也需要查，用于返回余额信息）
  const account = await getCreditAccount(buyerId);
  const buyerBalance = account?.balance ?? 0;
  const balanceAfter = Math.max(0, buyerBalance - priceKk);
  const insufficient = !isFree && buyerBalance < priceKk;

  // 8. 预览模式：返回费用摘要，不扣费
  if (previewOnly) {
    return {
      preview: true,
      actor_id: actorId,
      actor_name: actor.name,
      price_kk: priceKk,
      is_free: isFree,
      platform_fee_kk: feeKk,
      seller_revenue_kk: revenueKk,
      grant_type: grantType,
      project_id: projectId,
      buyer_balance_kk: buyerBalance,
      balance_after_kk: balanceAfter,
      insufficient_balance: insufficient,
    };
  }

  // 9. 实际购买
  if (!isFree) {
    if (insufficient) {
      throw new PurchaseError("INSUFFICIENT_BALANCE");
    }
    // 复用现有 credits 扣费逻辑（内部使用 service role PATCH storyflow_credits）
    try {
      await consumeCredits(buyerId, priceKk);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("INSUFFICIENT_CREDITS")) {
        throw new PurchaseError("INSUFFICIENT_BALANCE");
      }
      throw error;
    }
  }

  // 10. INSERT 订单（trigger trg_actor_order_revenue 自动写收益账本）
  const orderRow = {
    id: crypto.randomUUID(),
    actor_id: actorId,
    buyer_id: buyerId,
    seller_id: actor.owner_id,
    project_id: projectId,
    price_kk: priceKk,
    platform_fee_kk: feeKk,
    seller_revenue_kk: revenueKk,
    platform_fee_rate: PLATFORM_FEE_RATE,
    status: "paid",
    paid_at: new Date().toISOString(),
  };

  const { data: inserted, error: insertErr } = await serverClient
    .from("storyflow_actor_orders")
    .insert(orderRow)
    .select()
    .single();

  if (insertErr) {
    // 唯一约束冲突（并发重复购买）
    if (insertErr.code === "23505") {
      throw new PurchaseError("ALREADY_PURCHASED");
    }
    throw insertErr;
  }

  // 11. 返回订单 + 剩余余额
  return {
    preview: false,
    order: inserted as unknown as ActorOrderRow,
    balance_after_kk: balanceAfter,
  };
}

// ============================================================
// 辅助
// ============================================================

async function assertProjectOwnedBy(
  serverClient: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<void> {
  const { data: project, error } = await serverClient
    .from("storyflow_projects")
    .select("id, owner_id, user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (error) throw error;
  if (!project) throw new PurchaseError("PROJECT_NOT_OWNED");
  const ownerId = project.owner_id || project.user_id;
  if (!ownerId || ownerId !== userId) {
    throw new PurchaseError("PROJECT_NOT_OWNED");
  }
}
