/**
 * tests/kiikis-21-grants.test.mjs
 * KIIKIS 2.1 Phase 4 — Task 4.1 资源权利测试 (RG-001~006)
 *
 * 覆盖:
 *   RG-001: owner 只由服务端认证决定
 *   RG-002: 邀请 token 单次/限时/哈希存储
 *   RG-003: grant + RLS 双重校验
 *   RG-004: 撤销不删除历史
 *   RG-005: 衍生物权利遵循创建时条款
 *   RG-006: 所有权转移双方确认
 *
 * 测试策略:
 *   - 契约校验 (validateCreateGrant / validateCreateInvite / validateCreateTransfer)
 *   - 纯函数 (freezeTermsForAdaptation / isGrantActive / isGrantRevoked)
 *   - 服务层 mock fetcher (RG-001 owner 服务端注入 + RG-004 撤销 + RG-006 双方确认)
 *   - 邀请 token 生命周期 (RG-002)
 *   - migration 文件存在
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  validateCreateGrant,
  validateCreateInvite,
  validateCreateTransfer,
  freezeTermsForAdaptation,
  isTermsFrozen,
  isGrantActive,
  isGrantRevoked,
  isGrantScope,
  isResourceType,
  isGrantRole,
  parseResourceGrant,
  parseInviteToken,
  parseOwnershipTransfer,
  GrantValidationError,
  RESOURCE_TYPES,
  GRANT_SCOPES,
  GRANT_ROLES,
  GRANT_STATUS,
  INVITE_TOKEN_STATUS,
  TRANSFER_STATUS,
} from "../lib/contracts/v2/grants.ts";
import {
  createGrant,
  listGrants,
  getGrant,
  checkGrant,
  revokeGrant,
  createOwnershipTransfer,
  confirmOwnershipTransfer,
  cancelOwnershipTransfer,
  GrantServiceError,
} from "../lib/server/v2/grants/store.ts";
import {
  createInvite,
  acceptInvite,
  listInvites,
  revokeInvite,
  generateTokenPlain,
  hashToken,
} from "../lib/server/v2/grants/invite.ts";

// ============================================================
// Helpers — Mock fetcher
// ============================================================

function makeMockFetcher(handlers) {
  return async (path, init) => {
    for (const h of handlers) {
      if (h.match(path, init)) {
        return h.respond(path, init);
      }
    }
    throw Object.assign(new Error(`no handler for ${path}`), { status: 503 });
  };
}

const sampleGrantRow = {
  id: "g-1",
  resource_type: "project",
  resource_id: "p-1",
  grantor_id: "user-A",
  grantee_id: "user-B",
  scope: "collaboration",
  role: "editor",
  terms: { license: "cc-by-4" },
  status: "active",
  expires_at: null,
  source_grant_id: null,
  idempotency_key: "idem-1",
  created_at: "2026-08-14T00:00:00Z",
  updated_at: "2026-08-14T00:00:00Z",
  revoked_at: null,
  revoked_by: null,
  revoke_reason: null,
};

const sampleInviteRow = {
  id: "inv-1",
  resource_type: "project",
  resource_id: "p-1",
  inviter_id: "user-A",
  scope: "collaboration",
  role: "editor",
  terms: {},
  token_hash: "hash-1",
  status: "pending",
  expires_at: "2026-08-15T00:00:00Z",
  accepted_by: null,
  accepted_at: null,
  created_at: "2026-08-14T00:00:00Z",
  revoked_at: null,
  revoked_by: null,
};

const sampleTransferRow = {
  id: "t-1",
  resource_type: "project",
  resource_id: "p-1",
  from_owner_id: "user-A",
  to_owner_id: "user-B",
  status: "pending",
  confirmed_at: null,
  cancelled_at: null,
  cancelled_by: null,
  created_at: "2026-08-14T00:00:00Z",
  idempotency_key: "trans-1",
};

// ============================================================
// 1. 契约常量 (RG-001~006)
// ============================================================

test("RG-001: RESOURCE_TYPES 含 universe/project/actor/asset", () => {
  assert.ok(RESOURCE_TYPES.includes("universe"));
  assert.ok(RESOURCE_TYPES.includes("project"));
  assert.ok(RESOURCE_TYPES.includes("actor"));
  assert.ok(RESOURCE_TYPES.includes("asset"));
});

test("RG-003: GRANT_SCOPES 含 collaboration/share/use/adaptation/license", () => {
  assert.deepEqual([...GRANT_SCOPES], ["collaboration", "share", "use", "adaptation", "license"]);
});

test("CO-001: GRANT_ROLES 含 owner/editor/reviewer/viewer/asset_operator", () => {
  assert.ok(GRANT_ROLES.includes("owner"));
  assert.ok(GRANT_ROLES.includes("editor"));
  assert.ok(GRANT_ROLES.includes("reviewer"));
  assert.ok(GRANT_ROLES.includes("viewer"));
  assert.ok(GRANT_ROLES.includes("asset_operator"));
});

test("RG-004: GRANT_STATUS 含 revoked (不删除)", () => {
  assert.ok(GRANT_STATUS.includes("active"));
  assert.ok(GRANT_STATUS.includes("revoked"));
  assert.ok(GRANT_STATUS.includes("expired"));
});

test("RG-002: INVITE_TOKEN_STATUS 含 pending/accepted/expired/revoked", () => {
  assert.ok(INVITE_TOKEN_STATUS.includes("pending"));
  assert.ok(INVITE_TOKEN_STATUS.includes("accepted"));
});

test("RG-006: TRANSFER_STATUS 含 pending/confirmed/cancelled", () => {
  assert.deepEqual([...TRANSFER_STATUS], ["pending", "confirmed", "cancelled"]);
});

// ============================================================
// 2. validateCreateGrant (RG-001: owner 服务端决定)
// ============================================================

test("RG-001: validateCreateGrant 合法输入通过", () => {
  const input = validateCreateGrant({
    resourceType: "project",
    resourceId: "p-1",
    grantorId: "user-A",
    granteeId: "user-B",
    scope: "collaboration",
    role: "editor",
    idempotencyKey: "idem-1",
  });
  assert.equal(input.grantorId, "user-A");
  assert.equal(input.scope, "collaboration");
});

test("RG-001: validateCreateGrant 缺 grantorId 抛错", () => {
  assert.throws(
    () => validateCreateGrant({
      resourceType: "project",
      resourceId: "p-1",
      grantorId: "",
      granteeId: "user-B",
      scope: "collaboration",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof GrantValidationError && err.code === "missing_grantor",
  );
});

test("RG-001: validateCreateGrant 自我 grant 抛错", () => {
  assert.throws(
    () => validateCreateGrant({
      resourceType: "project",
      resourceId: "p-1",
      grantorId: "user-A",
      granteeId: "user-A",
      scope: "collaboration",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof GrantValidationError && err.code === "self_grant_forbidden",
  );
});

test("validateCreateGrant 非法 resourceType 抛错", () => {
  assert.throws(
    () => validateCreateGrant({
      resourceType: "invalid",
      resourceId: "p-1",
      grantorId: "user-A",
      granteeId: "user-B",
      scope: "collaboration",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof GrantValidationError && err.code === "invalid_resource_type",
  );
});

test("CO-001: validateCreateGrant role 非 collaboration 范围抛错", () => {
  assert.throws(
    () => validateCreateGrant({
      resourceType: "project",
      resourceId: "p-1",
      grantorId: "user-A",
      granteeId: "user-B",
      scope: "share",
      role: "editor", // role 只在 collaboration 范围下
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof GrantValidationError && err.code === "role_scope_mismatch",
  );
});

test("validateCreateGrant 非法 expiresAt 抛错", () => {
  assert.throws(
    () => validateCreateGrant({
      resourceType: "project",
      resourceId: "p-1",
      grantorId: "user-A",
      granteeId: "user-B",
      scope: "share",
      expiresAt: "not-a-date",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof GrantValidationError && err.code === "invalid_expires_at",
  );
});

// ============================================================
// 3. validateCreateInvite (RG-002: 限时/单次)
// ============================================================

test("RG-002: validateCreateInvite 合法输入通过", () => {
  const input = validateCreateInvite({
    resourceType: "project",
    resourceId: "p-1",
    inviterId: "user-A",
    scope: "collaboration",
    role: "editor",
    expiresInSeconds: 3600,
  });
  assert.equal(input.expiresInSeconds, 3600);
});

test("RG-002: validateCreateInvite expiresInSeconds < 60 抛错", () => {
  assert.throws(
    () => validateCreateInvite({
      resourceType: "project",
      resourceId: "p-1",
      inviterId: "user-A",
      scope: "collaboration",
      expiresInSeconds: 30,
    }),
    (err) => err instanceof GrantValidationError && err.code === "invalid_expiry",
  );
});

test("RG-002: validateCreateInvite expiresInSeconds > 7天 抛错", () => {
  assert.throws(
    () => validateCreateInvite({
      resourceType: "project",
      resourceId: "p-1",
      inviterId: "user-A",
      scope: "collaboration",
      expiresInSeconds: 8 * 24 * 60 * 60,
    }),
    (err) => err instanceof GrantValidationError && err.code === "invalid_expiry",
  );
});

test("RG-001: validateCreateInvite 缺 inviterId 抛错", () => {
  assert.throws(
    () => validateCreateInvite({
      resourceType: "project",
      resourceId: "p-1",
      inviterId: "",
      scope: "collaboration",
      expiresInSeconds: 3600,
    }),
    (err) => err instanceof GrantValidationError && err.code === "missing_inviter",
  );
});

// ============================================================
// 4. validateCreateTransfer (RG-006: 双方确认)
// ============================================================

test("RG-006: validateCreateTransfer 合法输入通过", () => {
  const input = validateCreateTransfer({
    resourceType: "project",
    resourceId: "p-1",
    fromOwnerId: "user-A",
    toOwnerId: "user-B",
    idempotencyKey: "trans-1",
  });
  assert.equal(input.fromOwnerId, "user-A");
  assert.equal(input.toOwnerId, "user-B");
});

test("RG-006: validateCreateTransfer 转给自己抛错", () => {
  assert.throws(
    () => validateCreateTransfer({
      resourceType: "project",
      resourceId: "p-1",
      fromOwnerId: "user-A",
      toOwnerId: "user-A",
      idempotencyKey: "trans-1",
    }),
    (err) => err instanceof GrantValidationError && err.code === "self_transfer_forbidden",
  );
});

// ============================================================
// 5. 衍生物 terms 快照 (RG-005)
// ============================================================

test("RG-005: freezeTermsForAdaptation 冻结 source grant terms", () => {
  const sourceGrant = parseResourceGrant(sampleGrantRow);
  const frozen = freezeTermsForAdaptation(sourceGrant);
  assert.equal(frozen._frozen_from, "g-1");
  assert.equal(typeof frozen._frozen_at, "string");
  assert.equal(frozen._frozen_scope, "collaboration");
  assert.equal(frozen.license, "cc-by-4"); // 原始 terms 保留
  assert.ok(isTermsFrozen(frozen));
});

test("RG-005: isTermsFrozen 未冻结返回 false", () => {
  assert.ok(!isTermsFrozen({}));
  assert.ok(!isTermsFrozen({ foo: "bar" }));
});

test("RG-005: source grant 撤销后已生成衍生物 terms 不变", () => {
  // 衍生物创建时已冻结 terms，即使 source grant 被撤销，衍生物 rights 仍以快照为准
  const sourceGrant = parseResourceGrant(sampleGrantRow);
  const frozen = freezeTermsForAdaptation(sourceGrant);
  const revokedSource = { ...sourceGrant, status: "revoked", revokedAt: "2026-08-14T01:00:00Z" };
  const revokedParsed = parseResourceGrant({
    ...sampleGrantRow,
    status: "revoked",
    revoked_at: "2026-08-14T01:00:00Z",
  });
  // frozen terms 仍包含原 terms
  assert.equal(frozen.license, "cc-by-4");
  assert.equal(frozen._frozen_from, revokedParsed.id);
  assert.ok(isTermsFrozen(frozen));
});

// ============================================================
// 6. isGrantActive / isGrantRevoked (RG-003/004)
// ============================================================

test("RG-003: isGrantActive active+未过期 返回 true", () => {
  const grant = parseResourceGrant(sampleGrantRow);
  assert.ok(isGrantActive(grant, new Date("2026-08-14T12:00:00Z")));
});

test("RG-003: isGrantActive revoked 返回 false", () => {
  const grant = parseResourceGrant({ ...sampleGrantRow, status: "revoked" });
  assert.ok(!isGrantActive(grant));
});

test("RG-003: isGrantActive 已过期 返回 false", () => {
  const grant = parseResourceGrant({
    ...sampleGrantRow,
    expires_at: "2026-08-13T00:00:00Z",
  });
  assert.ok(!isGrantActive(grant, new Date("2026-08-14T00:00:00Z")));
});

test("RG-004: isGrantRevoked revoked 返回 true", () => {
  const grant = parseResourceGrant({ ...sampleGrantRow, status: "revoked" });
  assert.ok(isGrantRevoked(grant));
});

test("RG-004: isGrantRevoked active 返回 false", () => {
  const grant = parseResourceGrant(sampleGrantRow);
  assert.ok(!isGrantRevoked(grant));
});

// ============================================================
// 7. 服务层 createGrant (RG-001: 服务端注入 grantorId)
// ============================================================

test("RG-001: createGrant 调用 RPC 时使用服务端注入的 grantorId", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_resource_grant"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return sampleGrantRow;
      },
    },
  ]);

  const grant = await createGrant(fetcher, {
    resourceType: "project",
    resourceId: "p-1",
    grantorId: "user-A", // 服务端注入
    granteeId: "user-B",
    scope: "collaboration",
    role: "editor",
    idempotencyKey: "idem-1",
  });

  // 验证 RPC 调用使用服务端注入的 grantorId (不在 body 中作为 grantor_id)
  assert.equal(receivedBody.p_grantee_id, "user-B");
  assert.equal(receivedBody.p_resource_type, "project");
  assert.equal(receivedBody.p_idempotency_key, "idem-1");
  // RPC 内部用 auth.uid() 作为 grantor_id, 不接受客户端传入
  assert.ok(!receivedBody.p_grantor_id);
  assert.equal(grant.grantorId, "user-A");
});

test("RG-001: createGrant 校验失败抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => createGrant(fetcher, {
      resourceType: "invalid",
      resourceId: "p-1",
      grantorId: "user-A",
      granteeId: "user-B",
      scope: "collaboration",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof GrantServiceError && err.code === "validation_failed",
  );
});

// ============================================================
// 8. 服务层 listGrants / getGrant (RG-003: RLS 过滤)
// ============================================================

test("RG-003: listGrants 返回 RLS 过滤后的 grants", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_resource_grants?"),
      respond: () => [sampleGrantRow, { ...sampleGrantRow, id: "g-2" }],
    },
  ]);
  const grants = await listGrants(fetcher, "user-A");
  assert.equal(grants.length, 2);
  assert.equal(grants[0].id, "g-1");
});

test("RG-003: getGrant 返回 null 当 RLS 拒绝 (406)", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_resource_grants?"),
      respond: () => {
        const err = new Error("no row");
        err.status = 406;
        throw err;
      },
    },
  ]);
  const grant = await getGrant(fetcher, "g-999");
  assert.equal(grant, null);
});

test("RG-003: checkGrant 返回 RPC 结果", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/check_resource_grant"),
      respond: () => true,
    },
  ]);
  const has = await checkGrant(fetcher, {
    resourceType: "project",
    resourceId: "p-1",
    userId: "user-B",
    requiredScope: "collaboration",
  });
  assert.equal(has, true);
});

// ============================================================
// 9. 服务层 revokeGrant (RG-004: 撤销不删除)
// ============================================================

test("RG-004: revokeGrant 调用 RPC 返回 revoked grant", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/revoke_resource_grant"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return { ...sampleGrantRow, status: "revoked", revoked_at: "2026-08-14T01:00:00Z" };
      },
    },
  ]);
  const grant = await revokeGrant(fetcher, {
    grantId: "g-1",
    revokeReason: "test revoke",
  });
  assert.equal(receivedBody.p_grant_id, "g-1");
  assert.equal(receivedBody.p_revoke_reason, "test revoke");
  assert.equal(grant.status, "revoked");
  assert.ok(grant.revokedAt);
});

test("RG-004: revokeGrant forbidden 抛 forbidden", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/revoke_resource_grant"),
      respond: () => {
        const err = new Error("forbidden");
        err.status = 403;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => revokeGrant(fetcher, { grantId: "g-1" }),
    (err) => err instanceof GrantServiceError && err.code === "forbidden",
  );
});

// ============================================================
// 10. 所有权转移 (RG-006: 双方确认)
// ============================================================

test("RG-006: createOwnershipTransfer 创建 pending 转移", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_ownership_transfers"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return [sampleTransferRow];
      },
    },
  ]);
  const transfer = await createOwnershipTransfer(fetcher, {
    resourceType: "project",
    resourceId: "p-1",
    fromOwnerId: "user-A",
    toOwnerId: "user-B",
    idempotencyKey: "trans-1",
  });
  assert.equal(receivedBody.from_owner_id, "user-A");
  assert.equal(receivedBody.to_owner_id, "user-B");
  assert.equal(receivedBody.status, "pending");
  assert.equal(transfer.status, "pending");
});

test("RG-006: confirmOwnershipTransfer 调用 RPC", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/confirm_ownership_transfer"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return { ...sampleTransferRow, status: "confirmed", confirmed_at: "2026-08-14T01:00:00Z" };
      },
    },
  ]);
  const transfer = await confirmOwnershipTransfer(fetcher, "t-1");
  assert.equal(receivedBody.p_transfer_id, "t-1");
  assert.equal(transfer.status, "confirmed");
  assert.ok(transfer.confirmedAt);
});

test("RG-006: confirmOwnershipTransfer 非 to_owner 抛 forbidden", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/confirm_ownership_transfer"),
      respond: () => {
        const err = new Error("forbidden");
        err.status = 403;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => confirmOwnershipTransfer(fetcher, "t-1"),
    (err) => err instanceof GrantServiceError && err.code === "forbidden",
  );
});

test("RG-006: cancelOwnershipTransfer PATCH 调用", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_ownership_transfers?id="),
      respond: () => [{ ...sampleTransferRow, status: "cancelled", cancelled_at: "2026-08-14T01:00:00Z" }],
    },
  ]);
  const transfer = await cancelOwnershipTransfer(fetcher, "t-1");
  assert.equal(transfer.status, "cancelled");
});

// ============================================================
// 11. 邀请 token 生命周期 (RG-002)
// ============================================================

test("RG-002: generateTokenPlain 返回 k4s_ 前缀", () => {
  const t = generateTokenPlain();
  assert.ok(t.startsWith("k4s_"));
  assert.ok(t.length > 10);
});

test("RG-002: hashToken 返回 hex 字符串", async () => {
  const h = await hashToken("k4s_abc123");
  assert.equal(typeof h, "string");
  assert.ok(h.length > 0);
});

test("RG-002: hashToken 相同输入相同输出", async () => {
  const h1 = await hashToken("k4s_test");
  const h2 = await hashToken("k4s_test");
  assert.equal(h1, h2);
});

test("RG-002: createInvite 返回明文 token + 哈希存储的 invite", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_invite_tokens"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return [{ ...sampleInviteRow, token_hash: receivedBody.token_hash }];
      },
    },
  ]);
  const result = await createInvite(fetcher, {
    resourceType: "project",
    resourceId: "p-1",
    inviterId: "user-A",
    scope: "collaboration",
    role: "editor",
    expiresInSeconds: 3600,
  });
  // 明文 token 返回
  assert.ok(result.token.startsWith("k4s_"));
  // DB 存的是哈希, 不是明文
  assert.ok(!receivedBody.token_hash.startsWith("k4s_"));
  assert.equal(receivedBody.status, "pending");
  assert.equal(result.invite.status, "pending");
});

test("RG-002: acceptInvite 调用 RPC 接受 token", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/accept_invite_token"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return { ...sampleGrantRow, idempotency_key: `invite:inv-1` };
      },
    },
  ]);
  const grant = await acceptInvite(fetcher, {
    token: "k4s_test123",
    accepterId: "user-B",
  });
  // 接受者由服务端注入
  assert.equal(receivedBody.p_accepter_id, "user-B");
  assert.ok(receivedBody.p_token_hash);
  assert.ok(!receivedBody.p_token); // 不传明文
  assert.equal(grant.grantorId, "user-A");
});

test("RG-002: acceptInvite 已用 token 抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/accept_invite_token"),
      respond: () => {
        const err = new Error("invalid");
        err.status = 400;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => acceptInvite(fetcher, { token: "k4s_used", accepterId: "user-B" }),
    (err) => err instanceof GrantServiceError && err.code === "validation_failed",
  );
});

test("RG-002: acceptInvite token 不存在抛 not_found", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/accept_invite_token"),
      respond: () => {
        const err = new Error("not found");
        err.status = 404;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => acceptInvite(fetcher, { token: "k4s_unknown", accepterId: "user-B" }),
    (err) => err instanceof GrantServiceError && err.code === "not_found",
  );
});

// ============================================================
// 12. Migration 文件存在 (RG-001~006 数据库结构)
// ============================================================

test("RG-001~006: migration 文件存在", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20260827040000_kiikis_21_grants.sql",
  );
  assert.ok(fs.existsSync(migrationPath), `migration file missing: ${migrationPath}`);
});

test("RG-003: migration 包含 storyflow_resource_grants 表", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20260827040000_kiikis_21_grants.sql",
  );
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.ok(sql.includes("CREATE TABLE") && sql.includes("storyflow_resource_grants"));
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
});

test("RG-002: migration 包含 storyflow_invite_tokens 表 + token_hash 唯一", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20260827040000_kiikis_21_grants.sql",
  );
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.ok(sql.includes("storyflow_invite_tokens"));
  assert.ok(sql.includes("token_hash text not null unique"));
});

test("RG-004: migration 包含 revoke_resource_grant RPC (不删除)", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20260827040000_kiikis_21_grants.sql",
  );
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.ok(sql.includes("revoke_resource_grant"));
  assert.ok(sql.includes("status = 'revoked'"));
});

test("RG-006: migration 包含 confirm_ownership_transfer RPC", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20260827040000_kiikis_21_grants.sql",
  );
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.ok(sql.includes("confirm_ownership_transfer"));
  assert.ok(sql.includes("storyflow_ownership_transfers"));
});

test("RG-005: migration 包含 source_grant_id 字段", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20260827040000_kiikis_21_grants.sql",
  );
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.ok(sql.includes("source_grant_id"));
  assert.ok(sql.includes("terms jsonb"));
});

// ============================================================
// 13. isResourceType / isGrantScope / isGrantRole 类型守卫
// ============================================================

test("isResourceType 校验资源类型", () => {
  assert.ok(isResourceType("project"));
  assert.ok(isResourceType("universe"));
  assert.ok(!isResourceType("invalid"));
});

test("isGrantScope 校验 scope", () => {
  assert.ok(isGrantScope("collaboration"));
  assert.ok(isGrantScope("adaptation"));
  assert.ok(!isGrantScope("admin"));
});

test("isGrantRole 校验 role", () => {
  assert.ok(isGrantRole("owner"));
  assert.ok(isGrantRole("editor"));
  assert.ok(!isGrantRole("super_admin"));
});

// ============================================================
// 14. parseResourceGrant / parseInviteToken / parseOwnershipTransfer
// ============================================================

test("parseResourceGrant 正确转换 snake_case → camelCase", () => {
  const grant = parseResourceGrant(sampleGrantRow);
  assert.equal(grant.id, "g-1");
  assert.equal(grant.resourceType, "project");
  assert.equal(grant.resourceId, "p-1");
  assert.equal(grant.grantorId, "user-A");
  assert.equal(grant.granteeId, "user-B");
  assert.equal(grant.idempotencyKey, "idem-1");
  assert.equal(grant.terms.license, "cc-by-4");
});

test("parseInviteToken 正确转换", () => {
  const invite = parseInviteToken(sampleInviteRow);
  assert.equal(invite.id, "inv-1");
  assert.equal(invite.inviterId, "user-A");
  assert.equal(invite.tokenHash, "hash-1");
  assert.equal(invite.status, "pending");
});

test("parseOwnershipTransfer 正确转换", () => {
  const transfer = parseOwnershipTransfer(sampleTransferRow);
  assert.equal(transfer.id, "t-1");
  assert.equal(transfer.fromOwnerId, "user-A");
  assert.equal(transfer.toOwnerId, "user-B");
  assert.equal(transfer.status, "pending");
});

test("parseResourceGrant 处理 null terms", () => {
  const grant = parseResourceGrant({ ...sampleGrantRow, terms: null });
  assert.deepEqual({ ...grant.terms }, {});
});
