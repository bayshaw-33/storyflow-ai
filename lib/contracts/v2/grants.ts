/**
 * KIIKIS 2.1 Phase 4 — 资源权利契约 (Task 4.1, RG-001~006)
 *
 * 纯函数契约层，被服务层、API、消费者和测试使用。
 *
 * 设计原则:
 *   RG-001: owner 只由服务端认证决定，客户端不可指定
 *   RG-002: 邀请 token 单次/限时/哈希存储
 *   RG-003: grant + RLS 双重校验
 *   RG-004: 撤销不删除历史 (status=revoked)
 *   RG-005: 衍生物权利遵循创建时条款 (terms 快照冻结)
 *   RG-006: 所有权转移双方确认
 */

// ============================================================
// 常量
// ============================================================

export const RESOURCE_TYPES = [
  "universe",
  "project",
  "actor",
  "asset",
  "episode",
  "scene",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const GRANT_SCOPES = [
  "collaboration",
  "share",
  "use",
  "adaptation",
  "license",
] as const;
export type GrantScope = (typeof GRANT_SCOPES)[number];

/** CO-001: 协作角色 (仅 scope=collaboration 时生效) */
export const GRANT_ROLES = [
  "owner",
  "editor",
  "reviewer",
  "viewer",
  "asset_operator",
] as const;
export type GrantRole = (typeof GRANT_ROLES)[number];

export const GRANT_STATUS = ["active", "revoked", "expired"] as const;
export type GrantStatus = (typeof GRANT_STATUS)[number];

export const INVITE_TOKEN_STATUS = ["pending", "accepted", "expired", "revoked"] as const;
export type InviteTokenStatus = (typeof INVITE_TOKEN_STATUS)[number];

export const TRANSFER_STATUS = ["pending", "confirmed", "cancelled"] as const;
export type TransferStatus = (typeof TRANSFER_STATUS)[number];

// ============================================================
// ResourceGrant (RG-003/004/005)
// ============================================================

/**
 * 资源授权关系。
 * RG-004: status=revoked 不删除，历史保留。
 * RG-005: terms 为创建时快照，衍生物冻结后不变。
 */
export interface ResourceGrant {
  readonly id: string;
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  readonly grantorId: string;
  readonly granteeId: string;
  readonly scope: GrantScope;
  readonly role: GrantRole | null;
  readonly terms: Readonly<Record<string, unknown>>;
  readonly status: GrantStatus;
  readonly expiresAt: string | null;
  readonly sourceGrantId: string | null;
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revokedAt: string | null;
  readonly revokedBy: string | null;
  readonly revokeReason: string | null;
}

/** DB row 原始结构（snake_case） */
export interface ResourceGrantRow {
  readonly id: string;
  readonly resource_type: ResourceType;
  readonly resource_id: string;
  readonly grantor_id: string;
  readonly grantee_id: string;
  readonly scope: GrantScope;
  readonly role: GrantRole | null;
  readonly terms: Record<string, unknown> | null;
  readonly status: GrantStatus;
  readonly expires_at: string | null;
  readonly source_grant_id: string | null;
  readonly idempotency_key: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly revoked_at: string | null;
  readonly revoked_by: string | null;
  readonly revoke_reason: string | null;
}

// ============================================================
// InviteToken (RG-002)
// ============================================================

/**
 * 邀请 token。
 * RG-002: 哈希存储（不存明文），单次使用，限时过期。
 */
export interface InviteToken {
  readonly id: string;
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  readonly inviterId: string;
  readonly scope: GrantScope;
  readonly role: GrantRole | null;
  readonly terms: Readonly<Record<string, unknown>>;
  /** token 哈希（不存明文，RG-002） */
  readonly tokenHash: string;
  readonly status: InviteTokenStatus;
  readonly expiresAt: string;
  readonly acceptedBy: string | null;
  readonly acceptedAt: string | null;
  readonly createdAt: string;
  readonly revokedAt: string | null;
  readonly revokedBy: string | null;
}

export interface InviteTokenRow {
  readonly id: string;
  readonly resource_type: ResourceType;
  readonly resource_id: string;
  readonly inviter_id: string;
  readonly scope: GrantScope;
  readonly role: GrantRole | null;
  readonly terms: Record<string, unknown> | null;
  readonly token_hash: string;
  readonly status: InviteTokenStatus;
  readonly expires_at: string;
  readonly accepted_by: string | null;
  readonly accepted_at: string | null;
  readonly created_at: string;
  readonly revoked_at: string | null;
  readonly revoked_by: string | null;
}

// ============================================================
// OwnershipTransfer (RG-006)
// ============================================================

/**
 * 所有权转移审计记录。
 * RG-006: 双方确认 — from_owner 发起，to_owner 确认。
 */
export interface OwnershipTransfer {
  readonly id: string;
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  readonly fromOwnerId: string;
  readonly toOwnerId: string;
  readonly status: TransferStatus;
  readonly confirmedAt: string | null;
  readonly cancelledAt: string | null;
  readonly cancelledBy: string | null;
  readonly createdAt: string;
  readonly idempotencyKey: string;
}

export interface OwnershipTransferRow {
  readonly id: string;
  readonly resource_type: ResourceType;
  readonly resource_id: string;
  readonly from_owner_id: string;
  readonly to_owner_id: string;
  readonly status: TransferStatus;
  readonly confirmed_at: string | null;
  readonly cancelled_at: string | null;
  readonly cancelled_by: string | null;
  readonly created_at: string;
  readonly idempotency_key: string;
}

// ============================================================
// 输入类型
// ============================================================

export interface CreateGrantInput {
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  /** RG-001: grantorId 由服务端认证决定，不接受客户端传入 */
  readonly grantorId: string;
  readonly granteeId: string;
  readonly scope: GrantScope;
  readonly role?: GrantRole | null;
  readonly terms?: Readonly<Record<string, unknown>>;
  readonly expiresAt?: string | null;
  readonly sourceGrantId?: string | null;
  readonly idempotencyKey: string;
}

export interface CreateInviteInput {
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  readonly inviterId: string;
  readonly scope: GrantScope;
  readonly role?: GrantRole | null;
  readonly terms?: Readonly<Record<string, unknown>>;
  readonly expiresInSeconds: number;
}

export interface AcceptInviteInput {
  readonly tokenHash: string;
  readonly accepterId: string;
}

export interface CreateTransferInput {
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  readonly fromOwnerId: string;
  readonly toOwnerId: string;
  readonly idempotencyKey: string;
}

// ============================================================
// 校验 (纯函数)
// ============================================================

export class GrantValidationError extends Error {
  readonly code: string;
  readonly field?: string;
  constructor(code: string, message: string, field?: string) {
    super(`${code}: ${message}`);
    this.name = "GrantValidationError";
    this.code = code;
    if (field) this.field = field;
  }
}

export function isResourceType(v: string): v is ResourceType {
  return RESOURCE_TYPES.includes(v as ResourceType);
}

export function isGrantScope(v: string): v is GrantScope {
  return GRANT_SCOPES.includes(v as GrantScope);
}

export function isGrantRole(v: string): v is GrantRole {
  return GRANT_ROLES.includes(v as GrantRole);
}

/** RG-001: 校验 grant 创建输入。grantorId 必须由服务端填入。 */
export function validateCreateGrant(input: CreateGrantInput): CreateGrantInput {
  if (!isResourceType(input.resourceType)) {
    throw new GrantValidationError(
      "invalid_resource_type",
      `resourceType must be one of ${RESOURCE_TYPES.join(", ")}, got ${input.resourceType}`,
      "resourceType",
    );
  }
  if (!input.resourceId?.trim()) {
    throw new GrantValidationError("missing_resource_id", "resourceId is required", "resourceId");
  }
  // RG-001: grantorId 必须存在（由服务端填入）
  if (!input.grantorId?.trim()) {
    throw new GrantValidationError(
      "missing_grantor",
      "RG-001: grantorId is required (server-injected from auth)",
      "grantorId",
    );
  }
  if (!input.granteeId?.trim()) {
    throw new GrantValidationError("missing_grantee", "granteeId is required", "granteeId");
  }
  if (input.grantorId === input.granteeId) {
    throw new GrantValidationError(
      "self_grant_forbidden",
      "grantor and grantee cannot be the same user",
      "granteeId",
    );
  }
  if (!isGrantScope(input.scope)) {
    throw new GrantValidationError(
      "invalid_scope",
      `scope must be one of ${GRANT_SCOPES.join(", ")}, got ${input.scope}`,
      "scope",
    );
  }
  if (input.role != null && !isGrantRole(input.role)) {
    throw new GrantValidationError(
      "invalid_role",
      `role must be one of ${GRANT_ROLES.join(", ")}, got ${input.role}`,
      "role",
    );
  }
  // CO-001: role 只在 collaboration 范围下有意义
  if (input.role != null && input.scope !== "collaboration") {
    throw new GrantValidationError(
      "role_scope_mismatch",
      `role can only be set when scope=collaboration, got scope=${input.scope}`,
      "role",
    );
  }
  if (!input.idempotencyKey?.trim()) {
    throw new GrantValidationError(
      "missing_idempotency_key",
      "idempotencyKey is required",
      "idempotencyKey",
    );
  }
  if (input.expiresAt != null) {
    const ts = Date.parse(input.expiresAt);
    if (!Number.isFinite(ts)) {
      throw new GrantValidationError(
        "invalid_expires_at",
        `expiresAt is not valid ISO: ${input.expiresAt}`,
        "expiresAt",
      );
    }
  }
  return Object.freeze({ ...input });
}

/** RG-002: 校验邀请 token 创建输入。 */
export function validateCreateInvite(input: CreateInviteInput): CreateInviteInput {
  if (!isResourceType(input.resourceType)) {
    throw new GrantValidationError("invalid_resource_type", `invalid resourceType: ${input.resourceType}`, "resourceType");
  }
  if (!input.resourceId?.trim()) {
    throw new GrantValidationError("missing_resource_id", "resourceId is required", "resourceId");
  }
  // RG-001: inviterId 必须由服务端填入
  if (!input.inviterId?.trim()) {
    throw new GrantValidationError(
      "missing_inviter",
      "RG-001: inviterId is required (server-injected)",
      "inviterId",
    );
  }
  if (!isGrantScope(input.scope)) {
    throw new GrantValidationError("invalid_scope", `invalid scope: ${input.scope}`, "scope");
  }
  if (input.role != null && !isGrantRole(input.role)) {
    throw new GrantValidationError("invalid_role", `invalid role: ${input.role}`, "role");
  }
  if (input.role != null && input.scope !== "collaboration") {
    throw new GrantValidationError(
      "role_scope_mismatch",
      `role can only be set when scope=collaboration`,
      "role",
    );
  }
  // RG-002: 限时过期 — 1 分钟到 7 天
  if (!Number.isFinite(input.expiresInSeconds) || input.expiresInSeconds < 60) {
    throw new GrantValidationError(
      "invalid_expiry",
      "RG-002: expiresInSeconds must be >= 60",
      "expiresInSeconds",
    );
  }
  if (input.expiresInSeconds > 7 * 24 * 60 * 60) {
    throw new GrantValidationError(
      "invalid_expiry",
      "RG-002: expiresInSeconds must be <= 7 days",
      "expiresInSeconds",
    );
  }
  return Object.freeze({ ...input });
}

/** RG-006: 校验转移输入。 */
export function validateCreateTransfer(input: CreateTransferInput): CreateTransferInput {
  if (!isResourceType(input.resourceType)) {
    throw new GrantValidationError("invalid_resource_type", `invalid resourceType`, "resourceType");
  }
  if (!input.resourceId?.trim()) {
    throw new GrantValidationError("missing_resource_id", "resourceId is required", "resourceId");
  }
  if (!input.fromOwnerId?.trim()) {
    throw new GrantValidationError("missing_from_owner", "fromOwnerId is required", "fromOwnerId");
  }
  if (!input.toOwnerId?.trim()) {
    throw new GrantValidationError("missing_to_owner", "toOwnerId is required", "toOwnerId");
  }
  // RG-006: 不能转给自己
  if (input.fromOwnerId === input.toOwnerId) {
    throw new GrantValidationError(
      "self_transfer_forbidden",
      "RG-006: from_owner and to_owner cannot be the same",
      "toOwnerId",
    );
  }
  if (!input.idempotencyKey?.trim()) {
    throw new GrantValidationError("missing_idempotency_key", "idempotencyKey is required", "idempotencyKey");
  }
  return Object.freeze({ ...input });
}

// ============================================================
// DB row → 实体 (纯函数)
// ============================================================

export function parseResourceGrant(row: ResourceGrantRow): ResourceGrant {
  return Object.freeze({
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    grantorId: row.grantor_id,
    granteeId: row.grantee_id,
    scope: row.scope,
    role: row.role,
    terms: Object.freeze(row.terms ?? {}),
    status: row.status,
    expiresAt: row.expires_at,
    sourceGrantId: row.source_grant_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    revokeReason: row.revoke_reason,
  });
}

export function parseInviteToken(row: InviteTokenRow): InviteToken {
  return Object.freeze({
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    inviterId: row.inviter_id,
    scope: row.scope,
    role: row.role,
    terms: Object.freeze(row.terms ?? {}),
    tokenHash: row.token_hash,
    status: row.status,
    expiresAt: row.expires_at,
    acceptedBy: row.accepted_by,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
  });
}

export function parseOwnershipTransfer(row: OwnershipTransferRow): OwnershipTransfer {
  return Object.freeze({
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    fromOwnerId: row.from_owner_id,
    toOwnerId: row.to_owner_id,
    status: row.status,
    confirmedAt: row.confirmed_at,
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    createdAt: row.created_at,
    idempotencyKey: row.idempotency_key,
  });
}

// ============================================================
// 衍生物 terms 快照 (RG-005)
// ============================================================

/**
 * RG-005: 衍生物创建时冻结 source grant 的 terms 快照。
 * 后续权利不由前端猜测，以创建时条款为准。
 */
export function freezeTermsForAdaptation(
  sourceGrant: ResourceGrant,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    ...sourceGrant.terms,
    _frozen_from: sourceGrant.id,
    _frozen_at: new Date().toISOString(),
    _frozen_scope: sourceGrant.scope,
  });
}

/**
 * RG-005: 判断 terms 是否已被冻结（衍生物快照）。
 */
export function isTermsFrozen(
  terms: Readonly<Record<string, unknown>>,
): boolean {
  return (
    typeof terms._frozen_from === "string" &&
    typeof terms._frozen_at === "string"
  );
}

/**
 * RG-004: 判断 grant 是否已撤销（不删除历史）。
 */
export function isGrantRevoked(grant: ResourceGrant): boolean {
  return grant.status === "revoked";
}

/**
 * RG-003: 判断 grant 是否有效（active + 未过期）。
 */
export function isGrantActive(grant: ResourceGrant, now: Date = new Date()): boolean {
  if (grant.status !== "active") return false;
  if (grant.expiresAt == null) return true;
  return Date.parse(grant.expiresAt) > now.getTime();
}
