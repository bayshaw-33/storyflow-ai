/**
 * KIIKIS 2.1 Phase 3 — KK 账号事实与权益账本契约 (K21-KK-020..024)
 *
 * 纯函数契约层，被服务层、API、消费者和测试使用。
 * 不依赖数据库或运行时，只定义类型 + 校验。
 *
 * 设计原则：
 *   1. K21-KK-020: kk_profile 是账号级真相，非 localStorage
 *   2. K21-KK-021: entitlement ledger append-only，幂等 (idempotency_key)
 *   3. K21-KK-022: 装备前必须通过 ledger 净持有校验
 *   4. K21-KK-023: 成长由 milestone 幂等授予，防止刷量
 *   5. K21-KK-024: 2.1 禁止 paid_draw / trade source_type
 */

/** 权益账本条目 (K21-KK-021)。append-only，不可修改。 */
export type KkEntitlementDirection = "grant" | "revoke";

/** K21-KK-024: 2.1 允许的来源类型。禁止 paid_draw / trade。 */
export const KK_ENTITLEMENT_SOURCE_TYPES = [
  "system_migration",
  "creative_milestone",
  "subscription",
  "admin_grant",
] as const;
export type KkEntitlementSourceType =
  (typeof KK_ENTITLEMENT_SOURCE_TYPES)[number];

export interface KkEntitlementEntry {
  readonly id: string;
  readonly ownerId: string;
  readonly itemId: string;
  readonly itemVersion: string;
  readonly direction: KkEntitlementDirection;
  readonly sourceType: KkEntitlementSourceType;
  readonly sourceId: string;
  readonly idempotencyKey: string;
  readonly createdAt: string;
}

/** 账号级 KK 档案 (K21-KK-020)。 */
export interface KkProfile {
  readonly ownerId: string;
  readonly displayName: string;
  readonly equippedItemId: string | null;
  readonly equippedItemVersion: string | null;
  /** K21-KK-022: 社区展示隐私默认关闭 */
  readonly profileDisplay: boolean;
  readonly communityDisplay: boolean;
  /** K21-KK-023: 成长等级与 XP，由 RPC 维护 */
  readonly growthLevel: number;
  readonly growthXp: number;
  /** K21-KK-010: 最近上下文 */
  readonly recentProjectId: string | null;
  readonly recentUniverseId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 装备历史记录 (K21-KK-022)。 */
export type KkEquipmentAction = "equip" | "unequip";

export interface KkEquipmentHistoryEntry {
  readonly id: string;
  readonly ownerId: string;
  readonly itemId: string;
  readonly itemVersion: string;
  readonly action: KkEquipmentAction;
  readonly verifiedLedger: boolean;
  readonly sourceType: "user" | "system_migration";
  readonly createdAt: string;
}

/** 陪伴上下文记忆事实 (K21-KK-010, K21-KK-014)。 */
export const KK_MEMORY_FACT_TYPES = [
  "user_choice",
  "recent_project",
  "recent_universe",
  "authorized_context",
  "milestone_grant",
  "manual_note",
] as const;
export type KkMemoryFactType = (typeof KK_MEMORY_FACT_TYPES)[number];

export interface KkMemoryFact {
  readonly id: string;
  readonly ownerId: string;
  readonly factType: KkMemoryFactType;
  readonly factKey: string;
  readonly factValue: Readonly<Record<string, unknown>>;
  readonly source: "user" | "system";
  /** K21-KK-011: 敏感事实读取需服务端权限校验 */
  readonly isSensitive: boolean;
  readonly createdAt: string;
  /** K21-KK-014: 软删除 */
  readonly deletedAt: string | null;
}

/** 净持有结果 (K21-KK-022)。 */
export interface KkNetEntitlement {
  readonly itemId: string;
  readonly itemVersion: string;
  readonly netCount: number;
}

// ============================================================
// 输入类型 (RPC 入参)
// ============================================================

export interface AppendEntitlementInput {
  readonly ownerId: string;
  readonly itemId: string;
  readonly itemVersion: string;
  readonly direction: KkEntitlementDirection;
  readonly sourceType: KkEntitlementSourceType;
  readonly sourceId: string;
  readonly idempotencyKey: string;
}

export interface GrantMilestoneInput {
  readonly ownerId: string;
  readonly milestoneId: string;
  readonly xp: number;
  readonly levelDelta: number;
  readonly idempotencyKey: string;
}

// ============================================================
// 校验函数 (纯函数)
// ============================================================

export class KkProfileValidationError extends Error {
  readonly code: string;
  readonly field?: string;
  constructor(code: string, message: string, field?: string) {
    super(`${code}: ${message}`);
    this.name = "KkProfileValidationError";
    this.code = code;
    this.field = field;
  }
}

/** K21-KK-024: 校验 source_type 是否允许。 */
export function isAllowedSourceType(sourceType: string): sourceType is KkEntitlementSourceType {
  return KK_ENTITLEMENT_SOURCE_TYPES.includes(sourceType as KkEntitlementSourceType);
}

/** 校验权益账本写入输入。 */
export function validateAppendEntitlement(input: AppendEntitlementInput): AppendEntitlementInput {
  if (!input.ownerId) {
    throw new KkProfileValidationError("missing_owner", "ownerId is required", "ownerId");
  }
  if (!input.itemId?.trim()) {
    throw new KkProfileValidationError("missing_item", "itemId is required", "itemId");
  }
  if (!input.itemVersion?.trim()) {
    throw new KkProfileValidationError("missing_version", "itemVersion is required", "itemVersion");
  }
  if (input.direction !== "grant" && input.direction !== "revoke") {
    throw new KkProfileValidationError("invalid_direction", `direction must be grant|revoke, got ${input.direction}`, "direction");
  }
  if (!isAllowedSourceType(input.sourceType)) {
    throw new KkProfileValidationError(
      "forbidden_source_type",
      `K21-KK-024: source_type ${input.sourceType} not allowed in 2.1 (forbidden: paid_draw, trade)`,
      "sourceType",
    );
  }
  if (!input.sourceId?.trim()) {
    throw new KkProfileValidationError("missing_source_id", "sourceId is required", "sourceId");
  }
  if (!input.idempotencyKey?.trim()) {
    throw new KkProfileValidationError("missing_idempotency_key", "idempotencyKey is required", "idempotencyKey");
  }
  return Object.freeze({ ...input });
}

/** 校验成长里程碑授予输入。 */
export function validateGrantMilestone(input: GrantMilestoneInput): GrantMilestoneInput {
  if (!input.ownerId) {
    throw new KkProfileValidationError("missing_owner", "ownerId is required", "ownerId");
  }
  if (!input.milestoneId?.trim()) {
    throw new KkProfileValidationError("missing_milestone", "milestoneId is required", "milestoneId");
  }
  if (input.xp < 0) {
    throw new KkProfileValidationError("invalid_xp", `xp must be >= 0, got ${input.xp}`, "xp");
  }
  if (input.levelDelta < 0) {
    throw new KkProfileValidationError("invalid_level_delta", `levelDelta must be >= 0, got ${input.levelDelta}`, "levelDelta");
  }
  if (!input.idempotencyKey?.trim()) {
    throw new KkProfileValidationError("missing_idempotency_key", "idempotencyKey is required", "idempotencyKey");
  }
  return Object.freeze({ ...input });
}

/**
 * 校验装备请求是否合法 (K21-KK-022)。
 * 不校验 ledger 净持有 (由 RPC 在事务内完成)，只校验输入形状。
 */
export function validateEquipRequest(input: {
  ownerId: string;
  itemId: string;
  itemVersion: string;
}): void {
  if (!input.ownerId) {
    throw new KkProfileValidationError("missing_owner", "ownerId is required", "ownerId");
  }
  if (!input.itemId?.trim()) {
    throw new KkProfileValidationError("missing_item", "itemId is required", "itemId");
  }
  if (!input.itemVersion?.trim()) {
    throw new KkProfileValidationError("missing_version", "itemVersion is required", "itemVersion");
  }
}

/**
 * 计算净持有列表 (纯函数版本，用于测试和缓存)。
 * 输入：append-only ledger 条目列表
 * 输出：当前净持有的 item/version 列表
 *
 * K21-KK-022: 装备前必须在此列表中。
 */
export function computeNetEntitlements(entries: ReadonlyArray<KkEntitlementEntry>): ReadonlyArray<KkNetEntitlement> {
  const map = new Map<string, { itemId: string; itemVersion: string; net: number }>();
  for (const e of entries) {
    const key = `${e.itemId}::${e.itemVersion}`;
    const cur = map.get(key) ?? { itemId: e.itemId, itemVersion: e.itemVersion, net: 0 };
    cur.net += e.direction === "grant" ? 1 : -1;
    map.set(key, cur);
  }
  const result: KkNetEntitlement[] = [];
  for (const v of map.values()) {
    if (v.net > 0) {
      result.push({ itemId: v.itemId, itemVersion: v.itemVersion, netCount: v.net });
    }
  }
  return Object.freeze(result);
}

/**
 * K21-KK-022: 校验装备请求是否满足净持有。
 */
export function isEquippable(
  itemId: string,
  itemVersion: string,
  netEntitlements: ReadonlyArray<KkNetEntitlement>,
): boolean {
  return netEntitlements.some(
    (n) => n.itemId === itemId && n.itemVersion === itemVersion && n.netCount > 0,
  );
}

/**
 * 解析 profile row (snake_case → camelCase)。
 */
export function parseKkProfile(row: {
  owner_id: string;
  display_name: string | null;
  equipped_item_id: string | null;
  equipped_item_version: string | null;
  profile_display: boolean | null;
  community_display: boolean | null;
  growth_level: number | null;
  growth_xp: number | null;
  recent_project_id: string | null;
  recent_universe_id: string | null;
  created_at: string;
  updated_at: string;
}): KkProfile {
  return Object.freeze({
    ownerId: row.owner_id,
    displayName: row.display_name ?? "",
    equippedItemId: row.equipped_item_id,
    equippedItemVersion: row.equipped_item_version,
    profileDisplay: row.profile_display ?? false,
    communityDisplay: row.community_display ?? false,
    growthLevel: row.growth_level ?? 0,
    growthXp: row.growth_xp ?? 0,
    recentProjectId: row.recent_project_id,
    recentUniverseId: row.recent_universe_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/**
 * 解析 entitlement ledger row (snake_case → camelCase)。
 */
export function parseEntitlementEntry(row: {
  id: string;
  owner_id: string;
  item_id: string;
  item_version: string;
  direction: "grant" | "revoke";
  source_type: string;
  source_id: string;
  idempotency_key: string;
  created_at: string;
}): KkEntitlementEntry {
  if (!isAllowedSourceType(row.source_type)) {
    throw new KkProfileValidationError(
      "forbidden_source_type",
      `K21-KK-024: source_type ${row.source_type} not allowed`,
    );
  }
  return Object.freeze({
    id: row.id,
    ownerId: row.owner_id,
    itemId: row.item_id,
    itemVersion: row.item_version,
    direction: row.direction,
    sourceType: row.source_type,
    sourceId: row.source_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  });
}

/**
 * 解析 equipment history row (snake_case → camelCase)。
 */
export function parseEquipmentHistoryEntry(row: {
  id: string;
  owner_id: string;
  item_id: string;
  item_version: string;
  action: "equip" | "unequip";
  verified_ledger: boolean | null;
  source_type: "user" | "system_migration";
  created_at: string;
}): KkEquipmentHistoryEntry {
  return Object.freeze({
    id: row.id,
    ownerId: row.owner_id,
    itemId: row.item_id,
    itemVersion: row.item_version,
    action: row.action,
    verifiedLedger: row.verified_ledger ?? true,
    sourceType: row.source_type,
    createdAt: row.created_at,
  });
}
