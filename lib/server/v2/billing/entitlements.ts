/**
 * KIIKIS 2.1 Phase 6 — 权益服务 (Task 6.1, BI-008)
 *
 * BI-008: plan entitlement 只由服务器读取 webhook 同步状态
 *
 * 服务层职责:
 *   1. syncEntitlement: 由 webhook 处理器调用, 将订阅状态映射为权益 (SECURITY DEFINER RPC)
 *   2. getEntitlements: 查询用户当前有效权益 (服务器读取, 不信任客户端)
 *   3. hasFeature: 判断用户是否拥有某权益
 *
 * 设计原则:
 *   - 客户端无法直接 INSERT/UPDATE/DELETE 权益表 (RLS 限制)
 *   - 权益更新只通过 sync_entitlement RPC (服务器调用)
 *   - 权益查询通过 get_user_entitlements RPC (服务器读取订阅状态)
 */
import {
  parseEntitlement,
  type Entitlement,
  type EntitlementRow,
  type PlanTier,
  type EntitlementSource,
  hasFeature as hasFeatureContract,
  getPlanFeatures,
  derivePlanTierFromStatus,
  type Subscription,
} from "../../../contracts/v2/billing.ts";
import { BillingServiceError, type BillingFetcher } from "./stripe.ts";

// ============================================================
// 输入类型
// ============================================================

export interface SyncEntitlementInput {
  readonly userId: string;
  readonly planTier: PlanTier;
  readonly features: ReadonlyArray<string>;
  readonly source: EntitlementSource;
  readonly sourceId: string | null;
  readonly active: boolean;
}

export interface ListEntitlementsFilter {
  readonly activeOnly?: boolean;
  readonly planTier?: PlanTier;
}

// ============================================================
// BI-008: syncEntitlement — 从订阅状态同步权益
// ============================================================

/**
 * BI-008: 从订阅状态同步权益 (webhook 处理器调用)
 *
 * 通过 SECURITY DEFINER RPC `sync_entitlement` 写入权益表:
 *   - upsert (user_id, plan_tier) 唯一约束
 *   - features / source / source_id / active 随订阅状态变化
 *
 * 客户端无法直接调用此函数 (RLS 阻止 INSERT/UPDATE/DELETE)。
 */
export async function syncEntitlement(
  fetcher: BillingFetcher,
  input: SyncEntitlementInput,
): Promise<Entitlement> {
  if (!input.userId?.trim()) {
    throw new BillingServiceError("unauthenticated", "userId is required (server-injected)", 401);
  }
  if (!input.planTier) {
    throw new BillingServiceError("validation_failed", "planTier is required", 400);
  }

  const row = await fetcher<EntitlementRow>(`/rest/v1/rpc/sync_entitlement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_user_id: input.userId,
      p_plan_tier: input.planTier,
      p_features: JSON.stringify([...input.features]),
      p_source: input.source,
      p_source_id: input.sourceId ?? null,
      p_active: input.active,
    }),
  }).catch((err: unknown) => {
    throw new BillingServiceError("service_unavailable", "failed to sync entitlement", 503, err);
  });

  return parseEntitlement(row);
}

// ============================================================
// BI-008: getEntitlements — 服务器读取用户权益
// ============================================================

/**
 * BI-008: 查询用户当前权益 (服务器读取 webhook 同步状态)
 *
 * 通过 SECURITY DEFINER RPC `get_user_entitlements` 读取:
 *   - 返回 active=true 的权益
 *   - 客户端通过 API 调用, 不可直接伪造
 *
 * 返回的 Entitlement[] 不可变 (Object.freeze)。
 */
export async function getEntitlements(
  fetcher: BillingFetcher,
  userId: string,
): Promise<Entitlement[]> {
  if (!userId?.trim()) {
    throw new BillingServiceError("unauthenticated", "userId is required", 401);
  }

  // 通过 RPC 读取 (SECURITY DEFINER, 返回 jsonb)
  // RPC 返回 [{ planTier, features, source, active }, ...] 但缺少完整字段
  // 用 PostgREST 直接 SELECT 用户的权益行 (RLS 限制: user_id = auth.uid())
  const rows = await fetcher<EntitlementRow[]>(
    `/rest/v1/storyflow_entitlements?user_id=eq.${encodeURIComponent(userId)}&active=eq.true&order=updated_at.desc`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new BillingServiceError("service_unavailable", "failed to read entitlements", 503, err);
  });

  if (!rows || rows.length === 0) {
    // 未有权益记录, 返回 free tier 默认权益 (BI-008: 默认 free)
    return [
      {
        id: `default-free-${userId}`,
        userId,
        planTier: "free",
        features: [...getPlanFeatures("free")],
        source: "manual",
        sourceId: null,
        active: true,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
    ].map((e) => Object.freeze(e) as Entitlement);
  }

  return rows.map((row) => parseEntitlement(row));
}

// ============================================================
// BI-008: getActivePlanTier — 读取用户当前计划层级
// ============================================================

/**
 * BI-008: 获取用户当前最高 plan_tier (服务器读取)
 *
 * 规则: 多个权益时取最高层级 (enterprise > pro > creator > free)
 */
export async function getActivePlanTier(
  fetcher: BillingFetcher,
  userId: string,
): Promise<PlanTier> {
  const entitlements = await getEntitlements(fetcher, userId);
  if (entitlements.length === 0) return "free";

  const tierOrder: Record<PlanTier, number> = {
    free: 0,
    creator: 1,
    pro: 2,
    enterprise: 3,
  };

  let highest: PlanTier = "free";
  for (const e of entitlements) {
    if (e.active && tierOrder[e.planTier] > tierOrder[highest]) {
      highest = e.planTier;
    }
  }
  return highest;
}

// ============================================================
// BI-008: hasFeature — 服务器判定用户是否拥有某权益
// ============================================================

/**
 * BI-008: 判断用户是否拥有某权益 (服务器读取, 不信任客户端)
 */
export async function hasFeature(
  fetcher: BillingFetcher,
  userId: string,
  feature: string,
): Promise<boolean> {
  const entitlements = await getEntitlements(fetcher, userId);
  return hasFeatureContract(entitlements, feature);
}

// ============================================================
// BI-008: syncFromSubscription — 从 Subscription 推导并同步权益
// ============================================================

/**
 * BI-008: 从 Subscription 推导权益并同步 (供 webhook 之外的恢复场景调用)
 *
 * - 仅当 subscription.status === "active" 时写入对应 tier
 * - 其他状态降级为 free
 */
export async function syncFromSubscription(
  fetcher: BillingFetcher,
  subscription: Subscription,
): Promise<Entitlement> {
  const tier = derivePlanTierFromStatus(subscription);
  const features = getPlanFeatures(tier);
  const active = subscription.status === "active";

  return syncEntitlement(fetcher, {
    userId: subscription.userId,
    planTier: tier,
    features,
    source: "subscription",
    sourceId: subscription.stripeSubscriptionId,
    active,
  });
}

// ============================================================
// BI-008: listEntitlements (admin 视图)
// ============================================================

/**
 * BI-008: 列出用户所有权益记录 (admin/审计用, 包含非 active)
 *
 * 注意: 此函数应仅在 admin/服务端上下文调用, 普通用户应使用 getEntitlements。
 */
export async function listEntitlements(
  fetcher: BillingFetcher,
  userId: string,
  filter?: ListEntitlementsFilter,
): Promise<Entitlement[]> {
  if (!userId?.trim()) {
    throw new BillingServiceError("unauthenticated", "userId is required", 401);
  }

  let path = `/rest/v1/storyflow_entitlements?user_id=eq.${encodeURIComponent(userId)}`;
  if (filter?.activeOnly) path += `&active=eq.true`;
  if (filter?.planTier) path += `&plan_tier=eq.${filter.planTier}`;
  path += `&order=updated_at.desc`;

  const rows = await fetcher<EntitlementRow[]>(path, {
    headers: { Accept: "application/json" },
  }).catch((err: unknown) => {
    throw new BillingServiceError("service_unavailable", "failed to list entitlements", 503, err);
  });

  return (rows ?? []).map((row) => parseEntitlement(row));
}
