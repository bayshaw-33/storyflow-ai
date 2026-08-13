/**
 * KIIKIS 2.1 Phase 3 — KK 账号事实与权益账本服务层 (Task 3.1)
 *
 * 服务层职责：
 *   1. 通过 PostgREST fetcher 调用数据库 RPC，封装错误处理
 *   2. 校验输入 (调用契约层 validateAppendEntitlement 等)
 *   3. 处理幂等冲突 (K21-KK-021)
 *   4. 处理装备校验 (K21-KK-022)
 *   5. 处理成长里程碑幂等授予 (K21-KK-023)
 *
 * 与 creative-events.ts 服务保持一致的 fetcher 模式。
 */

import {
  parseCreativeEvent,
  type CreativeEventInput,
  type CreativeEventV1,
} from "../../../contracts/v2/creative-events.ts";
import {
  computeNetEntitlements,
  isAllowedSourceType,
  isEquippable,
  parseEntitlementEntry,
  parseEquipmentHistoryEntry,
  parseKkProfile,
  validateAppendEntitlement,
  validateEquipRequest,
  validateGrantMilestone,
  KkProfileValidationError,
  type AppendEntitlementInput,
  type GrantMilestoneInput,
  type KkEntitlementEntry,
  type KkEquipmentHistoryEntry,
  type KkMemoryFact,
  type KkNetEntitlement,
  type KkProfile,
} from "../../../contracts/v2/kk-profile.ts";

/** PostgREST 风格 fetcher。 */
export type KkProfileFetcher = <T = unknown>(
  path: string,
  init?: RequestInit
) => Promise<T>;

export class KkProfileServiceError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "validation_failed"
    | "idempotent_skip"
    | "equip_denied"
    | "service_unavailable";
  readonly status: number;
  readonly cause?: unknown;

  constructor(
    code: KkProfileServiceError["code"],
    message: string,
    status: number,
    cause?: unknown,
  ) {
    super(`${code}: ${message}`);
    this.name = "KkProfileServiceError";
    this.code = code;
    this.status = status;
    if (cause !== undefined) this.cause = cause;
  }
}

// ============================================================
// 获取账号 profile
// ============================================================

export async function getProfile(
  fetcher: KkProfileFetcher,
  ownerId: string,
): Promise<KkProfile | null> {
  if (!ownerId) {
    throw new KkProfileServiceError("unauthenticated", "ownerId is required", 401);
  }
  const row = await fetcher<{ owner_id: string; display_name: string | null; equipped_item_id: string | null; equipped_item_version: string | null; profile_display: boolean | null; community_display: boolean | null; growth_level: number | null; growth_xp: number | null; recent_project_id: string | null; recent_universe_id: string | null; created_at: string; updated_at: string } | null>(
    `/rest/v1/storyflow_kk_profiles?owner_id=eq.${encodeURIComponent(ownerId)}&limit=1`,
    { headers: { Accept: "application/vnd.pgrst.object+json" } },
  ).catch((err: unknown) => {
    // 406 表示无匹配行 (pgrst.object 返回单行，无匹配返回 406)
    if (err && typeof err === "object" && "status" in err && err.status === 406) {
      return null;
    }
    throw new KkProfileServiceError("service_unavailable", "failed to fetch kk profile", 503, err);
  });
  if (!row) return null;
  return parseKkProfile(row);
}

/**
 * 确保 profile 存在 (首次访问自动创建)。
 * K21-KK-020: 账号级真相，不能依赖 localStorage。
 */
export async function ensureProfile(
  fetcher: KkProfileFetcher,
  ownerId: string,
  displayName: string = "",
): Promise<KkProfile> {
  const existing = await getProfile(fetcher, ownerId);
  if (existing) return existing;

  // UPSERT — 若并发已创建则返回现有
  const row = await fetcher<{ owner_id: string; display_name: string | null; equipped_item_id: string | null; equipped_item_version: string | null; profile_display: boolean | null; community_display: boolean | null; growth_level: number | null; growth_xp: number | null; recent_project_id: string | null; recent_universe_id: string | null; created_at: string; updated_at: string }>(
    `/rest/v1/storyflow_kk_profiles`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({ owner_id: ownerId, display_name: displayName }),
    },
  ).catch((err: unknown) => {
    throw new KkProfileServiceError("service_unavailable", "failed to ensure kk profile", 503, err);
  });
  return parseKkProfile(Array.isArray(row) ? row[0] : row);
}

// ============================================================
// 权益账本 (K21-KK-021)
// ============================================================

export interface AppendEntitlementResult {
  inserted: boolean;
  entryId: string | null;
}

/**
 * 追加权益账本条目 (K21-KK-021)。
 * 幂等：同一 idempotency_key 已存在则跳过。
 */
export async function appendEntitlement(
  fetcher: KkProfileFetcher,
  input: AppendEntitlementInput,
): Promise<AppendEntitlementResult> {
  const validated = validateAppendEntitlement(input);

  // 调用 RPC append_entitlement_entry
  const rpcResp = await fetcher<{ p_inserted: boolean; p_entry_id: string | null }>(
    `/rest/v1/rpc/append_entitlement_entry`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_owner_id: validated.ownerId,
        p_item_id: validated.itemId,
        p_item_version: validated.itemVersion,
        p_direction: validated.direction,
        p_source_type: validated.sourceType,
        p_source_id: validated.sourceId,
        p_idempotency_key: validated.idempotencyKey,
      }),
    },
  ).catch((err: unknown) => {
    throw new KkProfileServiceError("service_unavailable", "failed to append entitlement", 503, err);
  });

  return {
    inserted: rpcResp.p_inserted === true,
    entryId: rpcResp.p_entry_id ?? null,
  };
}

/**
 * 查询 owner 的权益账本历史。
 */
export async function listEntitlements(
  fetcher: KkProfileFetcher,
  ownerId: string,
  options: { limit?: number } = {},
): Promise<ReadonlyArray<KkEntitlementEntry>> {
  if (!ownerId) {
    throw new KkProfileServiceError("unauthenticated", "ownerId is required", 401);
  }
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const rows = await fetcher<Array<{ id: string; owner_id: string; item_id: string; item_version: string; direction: "grant" | "revoke"; source_type: string; source_id: string; idempotency_key: string; created_at: string }>>(
    `/rest/v1/storyflow_entitlement_ledger?owner_id=eq.${encodeURIComponent(ownerId)}&order=created_at.desc&limit=${limit}`,
  ).catch((err: unknown) => {
    throw new KkProfileServiceError("service_unavailable", "failed to list entitlements", 503, err);
  });
  return (rows ?? []).map(parseEntitlementEntry);
}

/**
 * 计算净持有 (客户端版本，用于缓存和测试)。
 * 生产环境应调用 DB RPC compute_net_entitlements。
 */
export async function getNetEntitlements(
  fetcher: KkProfileFetcher,
  ownerId: string,
): Promise<ReadonlyArray<KkNetEntitlement>> {
  if (!ownerId) {
    throw new KkProfileServiceError("unauthenticated", "ownerId is required", 401);
  }
  // 优先调用 DB RPC (高效)
  const rpcRows = await fetcher<Array<{ item_id: string; item_version: string; net_count: number }> | null>(
    `/rest/v1/rpc/compute_net_entitlements`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_owner_id: ownerId }),
    },
  ).catch(() => null);

  if (rpcRows && Array.isArray(rpcRows)) {
    return rpcRows.map((r) => Object.freeze({
      itemId: r.item_id,
      itemVersion: r.item_version,
      netCount: r.net_count,
    }));
  }

  // 退化：客户端计算 (用于 RPC 不可用时)
  const entries = await listEntitlements(fetcher, ownerId, { limit: 500 });
  return computeNetEntitlements(entries);
}

// ============================================================
// 装备 (K21-KK-022)
// ============================================================

export async function equipItem(
  fetcher: KkProfileFetcher,
  ownerId: string,
  itemId: string,
  itemVersion: string,
): Promise<void> {
  validateEquipRequest({ ownerId, itemId, itemVersion });

  // 调用 RPC equip_kk_item (内部校验 ledger 净持有 + 记录历史 + 更新 profile)
  await fetcher(
    `/rest/v1/rpc/equip_kk_item`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_owner_id: ownerId,
        p_item_id: itemId,
        p_item_version: itemVersion,
      }),
    },
  ).catch((err: unknown) => {
    // RPC 失败 → 解析错误消息
    const msg = err instanceof Error ? err.message : String(err);
    if (/not in net entitlements/i.test(msg)) {
      throw new KkProfileServiceError("equip_denied", "item not in net entitlements (K21-KK-022)", 403, err);
    }
    throw new KkProfileServiceError("service_unavailable", "failed to equip item", 503, err);
  });
}

/**
 * 查询装备历史 (K21-KK-022)。
 */
export async function listEquipmentHistory(
  fetcher: KkProfileFetcher,
  ownerId: string,
  options: { limit?: number } = {},
): Promise<ReadonlyArray<KkEquipmentHistoryEntry>> {
  if (!ownerId) {
    throw new KkProfileServiceError("unauthenticated", "ownerId is required", 401);
  }
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const rows = await fetcher<Array<{ id: string; owner_id: string; item_id: string; item_version: string; action: "equip" | "unequip"; verified_ledger: boolean | null; source_type: "user" | "system_migration"; created_at: string }>>(
    `/rest/v1/storyflow_kk_equipment_history?owner_id=eq.${encodeURIComponent(ownerId)}&order=created_at.desc&limit=${limit}`,
  ).catch((err: unknown) => {
    throw new KkProfileServiceError("service_unavailable", "failed to list equipment history", 503, err);
  });
  return (rows ?? []).map(parseEquipmentHistoryEntry);
}

// ============================================================
// 成长里程碑 (K21-KK-023)
// ============================================================

/**
 * 授予成长里程碑 (幂等)。
 * K21-KK-023: 批量垃圾生成不能刷成长。
 */
export async function grantMilestone(
  fetcher: KkProfileFetcher,
  input: GrantMilestoneInput,
): Promise<{ inserted: boolean }> {
  const validated = validateGrantMilestone(input);

  await fetcher(
    `/rest/v1/rpc/grant_milestone`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_owner_id: validated.ownerId,
        p_milestone_id: validated.milestoneId,
        p_xp: validated.xp,
        p_level_delta: validated.levelDelta,
        p_idempotency_key: validated.idempotencyKey,
      }),
    },
  ).catch((err: unknown) => {
    throw new KkProfileServiceError("service_unavailable", "failed to grant milestone", 503, err);
  });

  // RPC 幂等：已存在则跳过，但这里无法区分是否新授予。
  // 返回 inserted=true 表示调用成功；实际是否新授予需查询 memory_facts。
  return { inserted: true };
}
