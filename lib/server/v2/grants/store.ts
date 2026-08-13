/**
 * KIIKIS 2.1 Phase 4 — 资源权利服务层 (Task 4.1, RG-001~006)
 *
 * 服务层职责:
 *   1. 调用 PostgREST/RPC 完成 grant CRUD
 *   2. RG-001: owner_id 由服务端认证填入，客户端不可指定
 *   3. RG-003: checkGrant 双重校验 (RLS 自动 + 应用层)
 *   4. RG-004: revoke 只改 status，不删除历史
 *   5. RG-006: 所有权转移双方确认
 */

import {
  parseResourceGrant,
  parseOwnershipTransfer,
  validateCreateGrant,
  validateCreateTransfer,
  GrantValidationError,
  type CreateGrantInput,
  type CreateTransferInput,
  type ResourceGrant,
  type ResourceGrantRow,
  type OwnershipTransfer,
  type OwnershipTransferRow,
  type ResourceType,
  type GrantScope,
} from "../../../contracts/v2/grants.ts";

/** PostgREST 风格 fetcher。 */
export type GrantFetcher = <T = unknown>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

// ============================================================
// 错误类型
// ============================================================

export class GrantServiceError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "validation_failed"
    | "idempotent_skip"
    | "service_unavailable";
  readonly status: number;
  readonly cause?: unknown;

  constructor(
    code: GrantServiceError["code"],
    message: string,
    status: number,
    cause?: unknown,
  ) {
    super(`${code}: ${message}`);
    this.name = "GrantServiceError";
    this.code = code;
    this.status = status;
    if (cause !== undefined) this.cause = cause;
  }
}

// ============================================================
// Grant 创建 (RG-001: owner 服务端决定)
// ============================================================

/**
 * 创建 grant (RG-001/003)。
 * grantorId 必须由调用方从认证用户注入，不接受客户端传入。
 */
export async function createGrant(
  fetcher: GrantFetcher,
  input: CreateGrantInput,
): Promise<ResourceGrant> {
  let validated: CreateGrantInput;
  try {
    validated = validateCreateGrant(input);
  } catch (err) {
    if (err instanceof GrantValidationError) {
      throw new GrantServiceError("validation_failed", err.message, 400);
    }
    throw err;
  }

  // 调用 RPC (SECURITY DEFINER, owner_id 来自 auth.uid())
  const row = await fetcher<ResourceGrantRow>(
    `/rest/v1/rpc/create_resource_grant`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_resource_type: validated.resourceType,
        p_resource_id: validated.resourceId,
        p_grantee_id: validated.granteeId,
        p_scope: validated.scope,
        p_role: validated.role ?? null,
        p_terms: validated.terms ?? {},
        p_expires_at: validated.expiresAt ?? null,
        p_idempotency_key: validated.idempotencyKey,
        p_source_grant_id: validated.sourceGrantId ?? null,
      }),
    },
  ).catch((err: unknown) => {
    throw new GrantServiceError("service_unavailable", "failed to create grant", 503, err);
  });

  return parseResourceGrant(row);
}

// ============================================================
// Grant 查询 (RG-003: RLS 自动过滤)
// ============================================================

/**
 * 列出用户相关的 grant (作为 grantor 或 grantee)。
 * RLS 自动过滤：用户只能看到自己相关的 grant。
 */
export async function listGrants(
  fetcher: GrantFetcher,
  userId: string,
  filter?: {
    resourceType?: ResourceType;
    resourceId?: string;
    scope?: GrantScope;
    status?: string;
  },
): Promise<ResourceGrant[]> {
  if (!userId) {
    throw new GrantServiceError("unauthenticated", "userId is required", 401);
  }

  const params = new URLSearchParams();
  params.set("or", `(grantor_id.eq.${encodeURIComponent(userId)},grantee_id.eq.${encodeURIComponent(userId)})`);
  params.set("order", "created_at.desc");
  if (filter?.resourceType) params.set("resource_type", `eq.${filter.resourceType}`);
  if (filter?.resourceId) params.set("resource_id", `eq.${encodeURIComponent(filter.resourceId)}`);
  if (filter?.scope) params.set("scope", `eq.${filter.scope}`);
  if (filter?.status) params.set("status", `eq.${filter.status}`);

  const rows = await fetcher<ResourceGrantRow[]>(
    `/rest/v1/storyflow_resource_grants?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new GrantServiceError("service_unavailable", "failed to list grants", 503, err);
  });

  return (rows ?? []).map(parseResourceGrant);
}

/**
 * 获取单个 grant 详情。
 */
export async function getGrant(
  fetcher: GrantFetcher,
  grantId: string,
): Promise<ResourceGrant | null> {
  if (!grantId) {
    throw new GrantServiceError("validation_failed", "grantId is required", 400);
  }

  const row = await fetcher<ResourceGrantRow | null>(
    `/rest/v1/storyflow_resource_grants?id=eq.${encodeURIComponent(grantId)}&limit=1`,
    { headers: { Accept: "application/vnd.pgrst.object+json" } },
  ).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err && err.status === 406) {
      return null;
    }
    throw new GrantServiceError("service_unavailable", "failed to fetch grant", 503, err);
  });

  return row ? parseResourceGrant(row) : null;
}

// ============================================================
// checkGrant (RG-003: 应用层双重校验)
// ============================================================

/**
 * 检查用户对资源是否有指定 scope 的 active grant (RG-003)。
 * RLS 已自动过滤无权访问的行；此函数做应用层二次校验。
 */
export async function checkGrant(
  fetcher: GrantFetcher,
  params: {
    resourceType: ResourceType;
    resourceId: string;
    userId: string;
    requiredScope?: GrantScope;
  },
): Promise<boolean> {
  const { resourceType, resourceId, userId, requiredScope } = params;
  if (!userId) return false;

  const result = await fetcher<boolean>(
    `/rest/v1/rpc/check_resource_grant`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_resource_type: resourceType,
        p_resource_id: resourceId,
        p_user_id: userId,
        p_required_scope: requiredScope ?? null,
      }),
    },
  ).catch((err: unknown) => {
    throw new GrantServiceError("service_unavailable", "failed to check grant", 503, err);
  });

  return result === true;
}

// ============================================================
// Grant 撤销 (RG-004: 撤销不删除历史)
// ============================================================

/**
 * 撤销 grant (RG-004)。
 * 只改 status=revoked，不删除记录。已生成衍生物的来源、版本、审计事实保留。
 */
export async function revokeGrant(
  fetcher: GrantFetcher,
  params: {
    grantId: string;
    revokeReason?: string;
  },
): Promise<ResourceGrant> {
  const { grantId, revokeReason } = params;
  if (!grantId) {
    throw new GrantServiceError("validation_failed", "grantId is required", 400);
  }

  const row = await fetcher<ResourceGrantRow>(
    `/rest/v1/rpc/revoke_resource_grant`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_grant_id: grantId,
        p_revoke_reason: revokeReason ?? null,
      }),
    },
  ).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err && err.status === 403) {
      throw new GrantServiceError("forbidden", "only grantor can revoke", 403, err);
    }
    if (err && typeof err === "object" && "status" in err && err.status === 404) {
      throw new GrantServiceError("not_found", `grant ${grantId} not found`, 404, err);
    }
    throw new GrantServiceError("service_unavailable", "failed to revoke grant", 503, err);
  });

  return parseResourceGrant(row);
}

// ============================================================
// 所有权转移 (RG-006: 双方确认)
// ============================================================

/**
 * 发起所有权转移 (RG-006)。
 * from_owner 发起，to_owner 确认。单方发起不生效。
 */
export async function createOwnershipTransfer(
  fetcher: GrantFetcher,
  input: CreateTransferInput,
): Promise<OwnershipTransfer> {
  let validated: CreateTransferInput;
  try {
    validated = validateCreateTransfer(input);
  } catch (err) {
    if (err instanceof GrantValidationError) {
      throw new GrantServiceError("validation_failed", err.message, 400);
    }
    throw err;
  }

  // 直接 INSERT (RLS 限制 from_owner_id = auth.uid())
  const rows = await fetcher<OwnershipTransferRow[]>(
    `/rest/v1/storyflow_ownership_transfers`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        resource_type: validated.resourceType,
        resource_id: validated.resourceId,
        from_owner_id: validated.fromOwnerId,
        to_owner_id: validated.toOwnerId,
        status: "pending",
        idempotency_key: validated.idempotencyKey,
      }),
    },
  ).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err && err.status === 409) {
      throw new GrantServiceError("idempotent_skip", "transfer already exists", 409, err);
    }
    throw new GrantServiceError("service_unavailable", "failed to create transfer", 503, err);
  });

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) {
    throw new GrantServiceError("service_unavailable", "transfer creation returned no row", 503);
  }
  return parseOwnershipTransfer(row);
}

/**
 * 确认所有权转移 (RG-006: to_owner 确认)。
 * 单方发起不生效 — 必须由 to_owner_id 确认。
 */
export async function confirmOwnershipTransfer(
  fetcher: GrantFetcher,
  transferId: string,
): Promise<OwnershipTransfer> {
  if (!transferId) {
    throw new GrantServiceError("validation_failed", "transferId is required", 400);
  }

  const row = await fetcher<OwnershipTransferRow>(
    `/rest/v1/rpc/confirm_ownership_transfer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_transfer_id: transferId }),
    },
  ).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err && err.status === 403) {
      throw new GrantServiceError(
        "forbidden",
        "RG-006: only to_owner can confirm transfer",
        403,
        err,
      );
    }
    if (err && typeof err === "object" && "status" in err && err.status === 404) {
      throw new GrantServiceError("not_found", `transfer ${transferId} not found`, 404, err);
    }
    throw new GrantServiceError("service_unavailable", "failed to confirm transfer", 503, err);
  });

  return parseOwnershipTransfer(row);
}

/**
 * 取消所有权转移。
 */
export async function cancelOwnershipTransfer(
  fetcher: GrantFetcher,
  transferId: string,
): Promise<OwnershipTransfer> {
  if (!transferId) {
    throw new GrantServiceError("validation_failed", "transferId is required", 400);
  }

  const rows = await fetcher<OwnershipTransferRow[]>(
    `/rest/v1/storyflow_ownership_transfers?id=eq.${encodeURIComponent(transferId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      }),
    },
  ).catch((err: unknown) => {
    throw new GrantServiceError("service_unavailable", "failed to cancel transfer", 503, err);
  });

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) {
    throw new GrantServiceError("not_found", `transfer ${transferId} not found`, 404);
  }
  return parseOwnershipTransfer(row);
}

/**
 * 查询资源的所有权转移历史 (RG-006: 记录前后 owner)。
 */
export async function listOwnershipTransfers(
  fetcher: GrantFetcher,
  params: {
    resourceType: ResourceType;
    resourceId: string;
  },
): Promise<OwnershipTransfer[]> {
  const rows = await fetcher<OwnershipTransferRow[]>(
    `/rest/v1/storyflow_ownership_transfers?resource_type=eq.${params.resourceType}&resource_id=eq.${encodeURIComponent(params.resourceId)}&order=created_at.desc`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new GrantServiceError("service_unavailable", "failed to list transfers", 503, err);
  });

  return (rows ?? []).map(parseOwnershipTransfer);
}
