/**
 * KIIKIS 2.1 Phase 4 — 邀请 token 服务 (Task 4.1, RG-002)
 *
 * RG-002 核心规则:
 *   1. token 哈希存储（不存明文）
 *   2. 单次使用（accepted 后 status=used）
 *   3. 限时过期（expires_at）
 *   4. 接受后绑定到接受者账号
 */

import {
  parseInviteToken,
  parseResourceGrant,
  validateCreateInvite,
  GrantValidationError,
  type CreateInviteInput,
  type InviteToken,
  type InviteTokenRow,
  type ResourceGrant,
  type ResourceGrantRow,
} from "../../../contracts/v2/grants.ts";
import type { GrantFetcher, GrantServiceError } from "./store.ts";

// 错误类型别名（与 store.ts 共享）
type InviteServiceError = InstanceType<typeof GrantServiceErrorClass>;

// 避免 import cycle: 用 local alias
import { GrantServiceError as GrantServiceErrorClass } from "./store.ts";

// ============================================================
// token 哈希 (RG-002: 不存明文)
// ============================================================

/**
 * 生成随机 token 明文 (返回给调用方一次，不存储)。
 * 格式: k4s_<32 hex chars>
 */
export function generateTokenPlain(): string {
  const bytes = new Uint8Array(16);
  // 注意: 浏览器环境用 crypto.getRandomValues; Node 用 crypto.randomBytes
  // 这里用兼容写法
  const g = globalThis as unknown as {
    crypto?: { getRandomValues?: (arr: Uint8Array) => Uint8Array };
  };
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
  } else {
    // fallback — 测试环境用 Math.random (不安全但测试足够)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `k4s_${hex}`;
}

/**
 * 计算 token 哈希 (RG-002: 存哈希不存明文)。
 * 使用 SHA-256。
 */
export async function hashToken(token: string): Promise<string> {
  const g = globalThis as unknown as {
    crypto?: {
      subtle?: {
        digest?: (alg: string, data: Uint8Array) => Promise<ArrayBuffer>;
      };
    };
  };
  if (g.crypto?.subtle?.digest) {
    const data = new TextEncoder().encode(token);
    const buf = await g.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // fallback — 简单 hash (测试环境)
  let h = 0;
  for (let i = 0; i < token.length; i++) {
    h = ((h << 5) - h + token.charCodeAt(i)) | 0;
  }
  return `fallback_${(h >>> 0).toString(16)}`;
}

// ============================================================
// 创建邀请 token
// ============================================================

export interface CreateInviteResult {
  /** token 明文 (只返回一次，不存储) */
  readonly token: string;
  /** 邀请记录 */
  readonly invite: InviteToken;
}

/**
 * 创建邀请 token (RG-002)。
 * 返回 token 明文一次，DB 只存哈希。
 */
export async function createInvite(
  fetcher: GrantFetcher,
  input: CreateInviteInput,
): Promise<CreateInviteResult> {
  let validated: CreateInviteInput;
  try {
    validated = validateCreateInvite(input);
  } catch (err) {
    if (err instanceof GrantValidationError) {
      throw new GrantServiceErrorClass("validation_failed", err.message, 400);
    }
    throw err;
  }

  // 生成 token 明文 + 哈希
  const tokenPlain = generateTokenPlain();
  const tokenHash = await hashToken(tokenPlain);

  const expiresAt = new Date(Date.now() + validated.expiresInSeconds * 1000).toISOString();

  const rows = await fetcher<InviteTokenRow[]>(
    `/rest/v1/storyflow_invite_tokens`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        resource_type: validated.resourceType,
        resource_id: validated.resourceId,
        inviter_id: validated.inviterId,
        scope: validated.scope,
        role: validated.role ?? null,
        terms: validated.terms ?? {},
        token_hash: tokenHash,
        status: "pending",
        expires_at: expiresAt,
      }),
    },
  ).catch((err: unknown) => {
    throw new GrantServiceErrorClass("service_unavailable", "failed to create invite", 503, err);
  });

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) {
    throw new GrantServiceErrorClass("service_unavailable", "invite creation returned no row", 503);
  }

  return {
    token: tokenPlain,
    invite: parseInviteToken(row),
  };
}

// ============================================================
// 接受邀请 token (RG-002: 单次使用 + 绑定)
// ============================================================

/**
 * 接受邀请 token (RG-002)。
 * - 单次使用：accepted 后不可再用
 * - 限时过期：过期后拒绝
 * - 接受后绑定到接受者账号
 */
export async function acceptInvite(
  fetcher: GrantFetcher,
  params: { token: string; accepterId: string },
): Promise<ResourceGrant> {
  const { token, accepterId } = params;
  if (!token?.trim()) {
    throw new GrantServiceErrorClass("validation_failed", "token is required", 400);
  }
  if (!accepterId?.trim()) {
    throw new GrantServiceErrorClass("unauthenticated", "accepterId is required", 401);
  }

  const tokenHash = await hashToken(token);

  // 调用 RPC accept_invite_token (SECURITY DEFINER)
  const row = await fetcher<ResourceGrantRow>(
    `/rest/v1/rpc/accept_invite_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_token_hash: tokenHash,
        p_accepter_id: accepterId,
      }),
    },
  ).catch((err: unknown) => {
    if (err && typeof err === "object" && "status" in err && err.status === 404) {
      throw new GrantServiceErrorClass("not_found", "invite token not found", 404, err);
    }
    if (err && typeof err === "object" && "status" in err && err.status === 400) {
      // token 已用/已过期
      throw new GrantServiceErrorClass(
        "validation_failed",
        "RG-002: token already used or expired",
        400,
        err,
      );
    }
    throw new GrantServiceErrorClass("service_unavailable", "failed to accept invite", 503, err);
  });

  return parseResourceGrant(row);
}

// ============================================================
// 查询邀请列表
// ============================================================

/**
 * 列出 inviter 创建的邀请。
 */
export async function listInvites(
  fetcher: GrantFetcher,
  inviterId: string,
  filter?: { status?: string },
): Promise<InviteToken[]> {
  if (!inviterId) {
    throw new GrantServiceErrorClass("unauthenticated", "inviterId is required", 401);
  }

  const params = new URLSearchParams();
  params.set("inviter_id", `eq.${encodeURIComponent(inviterId)}`);
  params.set("order", "created_at.desc");
  if (filter?.status) params.set("status", `eq.${filter.status}`);

  const rows = await fetcher<InviteTokenRow[]>(
    `/rest/v1/storyflow_invite_tokens?${params.toString()}`,
    { headers: { Accept: "application/json" } },
  ).catch((err: unknown) => {
    throw new GrantServiceErrorClass("service_unavailable", "failed to list invites", 503, err);
  });

  return (rows ?? []).map(parseInviteToken);
}

/**
 * 撤销邀请 token (RG-002: 改 status, 不删除)。
 */
export async function revokeInvite(
  fetcher: GrantFetcher,
  inviteId: string,
): Promise<InviteToken> {
  if (!inviteId) {
    throw new GrantServiceErrorClass("validation_failed", "inviteId is required", 400);
  }

  const rows = await fetcher<InviteTokenRow[]>(
    `/rest/v1/storyflow_invite_tokens?id=eq.${encodeURIComponent(inviteId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        status: "revoked",
        revoked_at: new Date().toISOString(),
      }),
    },
  ).catch((err: unknown) => {
    throw new GrantServiceErrorClass("service_unavailable", "failed to revoke invite", 503, err);
  });

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) {
    throw new GrantServiceErrorClass("not_found", `invite ${inviteId} not found`, 404);
  }
  return parseInviteToken(row);
}
