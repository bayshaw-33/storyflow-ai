/**
 * tests/kiikis-21-community-publications.test.mjs
 * KIIKIS 2.1 Phase 5 — Task 5.1 IP 资产社区测试 (CM-001~003, CM-005)
 *
 * 覆盖:
 *   CM-001: publication 与源资源分离 (保存快照, 隐藏不删除源)
 *   CM-002: 发现页只读取允许公开/邀请访问的投影
 *   CM-003: 关注/反应/收藏唯一且幂等
 *   CM-005: 对象页明确来源/owner/许可状态/允许动作
 *
 * 测试策略:
 *   - 契约校验 (validateCreatePublication / parsePublication / toProjection / computeAllowedActions)
 *   - 服务层 mock fetcher (CM-001 publisherId 服务端注入 + CM-003 幂等 toggle + CM-008 隐藏)
 *   - 发现页投影只读公开字段 (CM-002)
 *   - migration 文件存在 + RLS + RPC
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  validateCreatePublication,
  parsePublication,
  parseFollow,
  parseReaction,
  parseBookmark,
  toProjection,
  computeAllowedActions,
  isPublicationSourceType,
  isVisibility,
  isFollowTargetType,
  isReactionType,
  CommunityValidationError,
  PUBLICATION_SOURCE_TYPES,
  VISIBILITY,
  PUBLICATION_STATUS,
  FOLLOW_TARGET_TYPES,
  REACTION_TYPES,
} from "../lib/contracts/v2/community.ts";
import {
  createPublication,
  getPublication,
  listPublicationsByPublisher,
  hidePublication,
  restorePublication,
  CommunityServiceError,
} from "../lib/server/v2/community/publications.ts";
import {
  toggleFollow,
  toggleReaction,
  toggleBookmark,
  listFollows,
  listReactions,
  listBookmarks,
  isFollowing,
} from "../lib/server/v2/community/interactions.ts";
import {
  listDiscoveryFeed,
  listByPublisher,
  getPublicationDetail,
} from "../lib/server/v2/community/discovery.ts";

// ============================================================
// Helpers — Mock fetcher
// ============================================================

function makeMockFetcher(handlers) {
  return async (url, init) => {
    for (const h of handlers) {
      if (h.match(url, init)) {
        return h.respond(url, init);
      }
    }
    throw Object.assign(new Error(`no handler for ${url}`), { status: 503 });
  };
}

const samplePublicationRow = {
  id: "pub-1",
  source_type: "universe",
  source_id: "u-1",
  source_version: "v1.0",
  publisher_id: "user-A",
  title: "Sample Universe",
  summary: "A sample publication",
  cover_url: "https://example.com/cover.png",
  visibility: "public",
  status: "active",
  invite_token_hash: null,
  created_at: "2026-08-14T00:00:00Z",
  updated_at: "2026-08-14T00:00:00Z",
  idempotency_key: "pub:user-A:universe:u-1:v1.0",
  follow_count: 3,
  reaction_count: 5,
  bookmark_count: 2,
  comment_count: 1,
};

const sampleFollowRow = {
  id: "f-1",
  follower_id: "user-A",
  target_type: "universe",
  target_id: "u-1",
  created_at: "2026-08-14T00:00:00Z",
};

const sampleReactionRow = {
  id: "r-1",
  user_id: "user-A",
  publication_id: "pub-1",
  reaction_type: "like",
  created_at: "2026-08-14T00:00:00Z",
};

const sampleBookmarkRow = {
  id: "b-1",
  user_id: "user-A",
  publication_id: "pub-1",
  created_at: "2026-08-14T00:00:00Z",
};

// ============================================================
// 1. 契约常量 (CM-001~003, CM-005)
// ============================================================

test("CM-001: PUBLICATION_SOURCE_TYPES 含 universe/project/actor/asset/episode/scene", () => {
  assert.ok(PUBLICATION_SOURCE_TYPES.includes("universe"));
  assert.ok(PUBLICATION_SOURCE_TYPES.includes("project"));
  assert.ok(PUBLICATION_SOURCE_TYPES.includes("actor"));
  assert.ok(PUBLICATION_SOURCE_TYPES.includes("asset"));
  assert.ok(PUBLICATION_SOURCE_TYPES.includes("episode"));
  assert.ok(PUBLICATION_SOURCE_TYPES.includes("scene"));
});

test("CM-008: VISIBILITY 含 public/invite_only/hidden (隐藏不删除源)", () => {
  assert.deepEqual([...VISIBILITY], ["public", "invite_only", "hidden"]);
});

test("CM-005: PUBLICATION_STATUS 含 active/hidden_by_moderator/removed", () => {
  assert.ok(PUBLICATION_STATUS.includes("active"));
  assert.ok(PUBLICATION_STATUS.includes("hidden_by_moderator"));
  assert.ok(PUBLICATION_STATUS.includes("removed"));
});

test("CM-003: FOLLOW_TARGET_TYPES 含 user/universe/publication", () => {
  assert.deepEqual([...FOLLOW_TARGET_TYPES], ["user", "universe", "publication"]);
});

test("CM-003: REACTION_TYPES 含 like/love/wow/haha/sad/angry", () => {
  assert.ok(REACTION_TYPES.includes("like"));
  assert.ok(REACTION_TYPES.includes("love"));
  assert.ok(REACTION_TYPES.includes("wow"));
  assert.ok(REACTION_TYPES.includes("haha"));
  assert.ok(REACTION_TYPES.includes("sad"));
  assert.ok(REACTION_TYPES.includes("angry"));
});

// ============================================================
// 2. validateCreatePublication (CM-001: publisherId 必填)
// ============================================================

test("CM-001: validateCreatePublication 合法输入通过", () => {
  const input = validateCreatePublication({
    sourceType: "universe",
    sourceId: "u-1",
    sourceVersion: "v1.0",
    publisherId: "user-A",
    title: "Test Publication",
    summary: "test summary",
    visibility: "public",
    idempotencyKey: "idem-1",
  });
  assert.equal(input.sourceType, "universe");
  assert.equal(input.publisherId, "user-A");
  assert.equal(input.title, "Test Publication");
  assert.equal(input.visibility, "public");
  // 返回被冻结
  assert.ok(Object.isFrozen(input));
});

test("CM-001: validateCreatePublication 缺 publisherId 抛错 (服务端注入)", () => {
  assert.throws(
    () =>
      validateCreatePublication({
        sourceType: "universe",
        sourceId: "u-1",
        publisherId: "",
        title: "Test",
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommunityValidationError && err.code === "missing_publisher",
  );
});

test("CM-001: validateCreatePublication 非法 sourceType 抛错", () => {
  assert.throws(
    () =>
      validateCreatePublication({
        sourceType: "invalid",
        sourceId: "u-1",
        publisherId: "user-A",
        title: "Test",
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommunityValidationError && err.code === "invalid_source_type",
  );
});

test("CM-001: validateCreatePublication 缺 title 抛错", () => {
  assert.throws(
    () =>
      validateCreatePublication({
        sourceType: "universe",
        sourceId: "u-1",
        publisherId: "user-A",
        title: "",
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommunityValidationError && err.code === "missing_title",
  );
});

test("CM-001: validateCreatePublication title 过长抛错 (>200)", () => {
  assert.throws(
    () =>
      validateCreatePublication({
        sourceType: "universe",
        sourceId: "u-1",
        publisherId: "user-A",
        title: "x".repeat(201),
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommunityValidationError && err.code === "title_too_long",
  );
});

test("CM-001: validateCreatePublication summary 过长抛错 (>2000)", () => {
  assert.throws(
    () =>
      validateCreatePublication({
        sourceType: "universe",
        sourceId: "u-1",
        publisherId: "user-A",
        title: "Test",
        summary: "x".repeat(2001),
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommunityValidationError && err.code === "summary_too_long",
  );
});

test("CM-002: validateCreatePublication invite_only 必须有 inviteTokenHash", () => {
  assert.throws(
    () =>
      validateCreatePublication({
        sourceType: "universe",
        sourceId: "u-1",
        publisherId: "user-A",
        title: "Test",
        visibility: "invite_only",
        inviteTokenHash: null,
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommunityValidationError && err.code === "missing_invite_token",
  );
});

test("CM-002: validateCreatePublication invite_only 有 token 通过", () => {
  const input = validateCreatePublication({
    sourceType: "universe",
    sourceId: "u-1",
    publisherId: "user-A",
    title: "Test",
    visibility: "invite_only",
    inviteTokenHash: "hashed_token_xyz",
    idempotencyKey: "idem-1",
  });
  assert.equal(input.visibility, "invite_only");
  assert.equal(input.inviteTokenHash, "hashed_token_xyz");
});

test("CM-001: validateCreatePublication 非法 visibility 抛错", () => {
  assert.throws(
    () =>
      validateCreatePublication({
        sourceType: "universe",
        sourceId: "u-1",
        publisherId: "user-A",
        title: "Test",
        visibility: "secret",
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommunityValidationError && err.code === "invalid_visibility",
  );
});

test("CM-001: validateCreatePublication 缺 idempotencyKey 抛错", () => {
  assert.throws(
    () =>
      validateCreatePublication({
        sourceType: "universe",
        sourceId: "u-1",
        publisherId: "user-A",
        title: "Test",
        idempotencyKey: "",
      }),
    (err) => err instanceof CommunityValidationError && err.code === "missing_idempotency_key",
  );
});

// ============================================================
// 3. parsePublication — CM-001 保存源资源快照
// ============================================================

test("CM-001: parsePublication 保存源资源快照 (sourceType/sourceId/sourceVersion)", () => {
  const pub = parsePublication(samplePublicationRow);
  assert.equal(pub.sourceType, "universe");
  assert.equal(pub.sourceId, "u-1");
  assert.equal(pub.sourceVersion, "v1.0");
  assert.equal(pub.publisherId, "user-A");
  assert.equal(pub.title, "Sample Universe");
});

test("CM-001: parsePublication summary null → 空字符串", () => {
  const pub = parsePublication({ ...samplePublicationRow, summary: null });
  assert.equal(pub.summary, "");
});

test("CM-001: parsePublication 返回冻结对象", () => {
  const pub = parsePublication(samplePublicationRow);
  assert.ok(Object.isFrozen(pub));
});

test("CM-001: parsePublication 计数字段保留", () => {
  const pub = parsePublication(samplePublicationRow);
  assert.equal(pub.followCount, 3);
  assert.equal(pub.reactionCount, 5);
  assert.equal(pub.bookmarkCount, 2);
  assert.equal(pub.commentCount, 1);
});

// ============================================================
// 4. toProjection — CM-002 发现页投影
// ============================================================

test("CM-002: toProjection 不暴露 source_*/invite_token_hash 等私有字段", () => {
  const pub = parsePublication(samplePublicationRow);
  const proj = toProjection(pub);
  assert.equal(proj.id, "pub-1");
  assert.equal(proj.title, "Sample Universe");
  assert.equal(proj.publisherId, "user-A");
  // 不应包含 source_*
  assert.ok(!("sourceType" in proj));
  assert.ok(!("sourceId" in proj));
  assert.ok(!("sourceVersion" in proj));
  // 不应包含 invite_token_hash
  assert.ok(!("inviteTokenHash" in proj));
  // 不应包含 status
  assert.ok(!("status" in proj));
});

test("CM-002: toProjection 计数字段保留", () => {
  const pub = parsePublication(samplePublicationRow);
  const proj = toProjection(pub);
  assert.equal(proj.followCount, 3);
  assert.equal(proj.reactionCount, 5);
});

test("CM-002: toProjection 返回冻结对象", () => {
  const pub = parsePublication(samplePublicationRow);
  const proj = toProjection(pub);
  assert.ok(Object.isFrozen(proj));
});

// ============================================================
// 5. computeAllowedActions — CM-005 权限矩阵
// ============================================================

test("CM-005: 匿名浏览 public active 可 view 但不可互动", () => {
  const pub = parsePublication(samplePublicationRow);
  const actions = computeAllowedActions(pub, null);
  assert.ok(actions.includes("view"));
  // 匿名不可 follow/react/bookmark/comment
  assert.ok(!actions.includes("follow"));
  assert.ok(!actions.includes("react"));
  assert.ok(!actions.includes("bookmark"));
  assert.ok(!actions.includes("comment"));
});

test("CM-005: 认证用户浏览 public 可互动", () => {
  const pub = parsePublication(samplePublicationRow);
  const actions = computeAllowedActions(pub, "user-B");
  assert.ok(actions.includes("view"));
  assert.ok(actions.includes("follow"));
  assert.ok(actions.includes("react"));
  assert.ok(actions.includes("bookmark"));
  assert.ok(actions.includes("comment"));
  assert.ok(actions.includes("apply_use"));
});

test("CM-005: owner 有 edit/hide/delete 权限", () => {
  const pub = parsePublication(samplePublicationRow);
  const actions = computeAllowedActions(pub, "user-A"); // publisherId
  assert.ok(actions.includes("edit"));
  assert.ok(actions.includes("hide"));
  assert.ok(actions.includes("delete"));
});

test("CM-005: 已关注 → unfollow 动作", () => {
  const pub = parsePublication(samplePublicationRow);
  const actions = computeAllowedActions(pub, "user-B", { hasFollow: true });
  assert.ok(actions.includes("unfollow"));
  assert.ok(!actions.includes("follow"));
});

test("CM-005: 已收藏 → remove_bookmark 动作", () => {
  const pub = parsePublication(samplePublicationRow);
  const actions = computeAllowedActions(pub, "user-B", { hasBookmarked: true });
  assert.ok(actions.includes("remove_bookmark"));
  assert.ok(!actions.includes("bookmark"));
});

test("CM-005: hidden publication 匿名不可 view", () => {
  const hiddenPub = parsePublication({
    ...samplePublicationRow,
    visibility: "hidden",
    status: "hidden_by_moderator",
  });
  const actions = computeAllowedActions(hiddenPub, null);
  assert.ok(!actions.includes("view"));
});

test("CM-005: invite_only active 认证用户可 request_invite", () => {
  const invitePub = parsePublication({
    ...samplePublicationRow,
    visibility: "invite_only",
    invite_token_hash: "hash-x",
  });
  const actions = computeAllowedActions(invitePub, "user-B");
  assert.ok(actions.includes("request_invite"));
});

// ============================================================
// 6. 服务层 — createPublication (CM-001: publisherId 服务端注入)
// ============================================================

test("CM-001: createPublication 调用 RPC 并返回 Publication", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_publication"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return { ...samplePublicationRow, idempotency_key: receivedBody.p_idempotency_key };
      },
    },
  ]);
  const pub = await createPublication(fetcher, {
    sourceType: "universe",
    sourceId: "u-1",
    sourceVersion: "v1.0",
    publisherId: "user-A",
    title: "Test",
    summary: "desc",
    visibility: "public",
    idempotencyKey: "idem-1",
  });
  // CM-001: RPC 参数正确传给后端 (p_publisher_id 由 RPC 内 auth.uid() 决定)
  assert.equal(receivedBody.p_source_type, "universe");
  assert.equal(receivedBody.p_title, "Test");
  assert.equal(receivedBody.p_idempotency_key, "idem-1");
  // 返回解析后的 Publication
  assert.equal(pub.sourceType, "universe");
  assert.equal(pub.title, "Sample Universe");
});

test("CM-001: createPublication 校验失败抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      createPublication(fetcher, {
        sourceType: "invalid",
        sourceId: "u-1",
        publisherId: "user-A",
        title: "Test",
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

test("CM-001: createPublication 服务不可用抛 service_unavailable", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_publication"),
      respond: () => {
        throw Object.assign(new Error("network"), { status: 503 });
      },
    },
  ]);
  await assert.rejects(
    () =>
      createPublication(fetcher, {
        sourceType: "universe",
        sourceId: "u-1",
        publisherId: "user-A",
        title: "Test",
        idempotencyKey: "idem-1",
      }),
    (err) => err instanceof CommunityServiceError && err.code === "service_unavailable",
  );
});

// ============================================================
// 7. getPublication / listPublicationsByPublisher
// ============================================================

test("CM-005: getPublication 返回 publication 详情", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_publications?id=eq."),
      respond: () => samplePublicationRow,
    },
  ]);
  const pub = await getPublication(fetcher, "pub-1");
  assert.equal(pub?.id, "pub-1");
  assert.equal(pub?.publisherId, "user-A");
});

test("CM-005: getPublication 不存在返回 null", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_publications?id=eq."),
      respond: () => {
        const err = new Error("not found");
        err.status = 406;
        throw err;
      },
    },
  ]);
  const pub = await getPublication(fetcher, "unknown");
  assert.equal(pub, null);
});

test("CM-001: listPublicationsByPublisher 按 publisher 查询", async () => {
  let receivedUrl = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => {
        receivedUrl = p;
        return p.includes("/rest/v1/storyflow_publications?publisher_id=eq.");
      },
      respond: () => [samplePublicationRow, { ...samplePublicationRow, id: "pub-2" }],
    },
  ]);
  const items = await listPublicationsByPublisher(fetcher, "user-A", { limit: 10 });
  assert.equal(items.length, 2);
  assert.ok(receivedUrl.includes("publisher_id=eq.user-A"));
  assert.ok(receivedUrl.includes("limit=10"));
});

test("listPublicationsByPublisher 缺 publisherId 抛 unauthenticated", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => listPublicationsByPublisher(fetcher, ""),
    (err) => err instanceof CommunityServiceError && err.code === "unauthenticated",
  );
});

// ============================================================
// 8. hidePublication / restorePublication — CM-008 隐藏不删除源
// ============================================================

test("CM-008: hidePublication 调用 hide_publication RPC", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/hide_publication"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return {
          ...samplePublicationRow,
          visibility: "hidden",
          status: "hidden_by_moderator",
        };
      },
    },
  ]);
  const pub = await hidePublication(fetcher, "pub-1", "violates rules");
  assert.equal(receivedBody.p_publication_id, "pub-1");
  assert.equal(receivedBody.p_reason, "violates rules");
  // CM-008: 只改 visibility, source_* 保留
  assert.equal(pub.visibility, "hidden");
  assert.equal(pub.status, "hidden_by_moderator");
  assert.equal(pub.sourceType, "universe");
  assert.equal(pub.sourceId, "u-1");
});

test("CM-008: restorePublication 恢复为 public", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/restore_publication"),
      respond: () => ({
        ...samplePublicationRow,
        visibility: "public",
        status: "active",
      }),
    },
  ]);
  const pub = await restorePublication(fetcher, "pub-1", "appeal approved");
  assert.equal(pub.visibility, "public");
  assert.equal(pub.status, "active");
});

test("CM-008: hidePublication 不存在抛 not_found", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/hide_publication"),
      respond: () => {
        const err = new Error("not found");
        err.status = 404;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => hidePublication(fetcher, "unknown"),
    (err) => err instanceof CommunityServiceError && err.code === "not_found",
  );
});

// ============================================================
// 9. 发现页投影 — CM-002
// ============================================================

test("CM-002: listDiscoveryFeed 只查 public+active 投影", async () => {
  let receivedUrl = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => {
        receivedUrl = p;
        return p.includes("/rest/v1/storyflow_publications?");
      },
      respond: () => [samplePublicationRow],
    },
  ]);
  const items = await listDiscoveryFeed(fetcher, { limit: 20 });
  // CM-002: 只查 public
  assert.ok(receivedUrl.includes("visibility=eq.public"));
  assert.ok(receivedUrl.includes("status=eq.active"));
  // CM-002: select 只含投影字段 (不含 source_*, invite_token_hash)
  assert.ok(receivedUrl.includes("select="));
  assert.ok(receivedUrl.includes("title"));
  assert.ok(receivedUrl.includes("follow_count"));
  assert.ok(!receivedUrl.includes("source_type"));
  assert.ok(!receivedUrl.includes("invite_token_hash"));
  // 返回 PublicationProjection
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Sample Universe");
});

test("CM-002: listDiscoveryFeed 空结果返回空数组", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_publications?"),
      respond: () => [],
    },
  ]);
  const items = await listDiscoveryFeed(fetcher, {});
  assert.deepEqual(items, []);
});

test("CM-002: listByPublisher 查询指定 publisher 投影", async () => {
  let receivedUrl = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => {
        receivedUrl = p;
        return p.includes("/rest/v1/storyflow_publications?publisher_id=eq.");
      },
      respond: () => [samplePublicationRow],
    },
  ]);
  const items = await listByPublisher(fetcher, "user-A");
  assert.ok(receivedUrl.includes("publisher_id=eq.user-A"));
  assert.ok(receivedUrl.includes("status=eq.active"));
  assert.equal(items.length, 1);
});

test("CM-002: listByPublisher 缺 publisherId 抛错", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => listByPublisher(fetcher, ""),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

test("CM-005: getPublicationDetail 返回完整 Publication", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_publications?id=eq."),
      respond: () => samplePublicationRow,
    },
  ]);
  const pub = await getPublicationDetail(fetcher, "pub-1");
  assert.equal(pub?.id, "pub-1");
  // CM-005: 返回完整 Publication (含 source_*, publisherId 等用于对象页)
  assert.equal(pub?.sourceType, "universe");
  assert.equal(pub?.sourceId, "u-1");
  assert.equal(pub?.publisherId, "user-A");
});

// ============================================================
// 10. toggleFollow — CM-003 幂等 toggle
// ============================================================

test("CM-003: toggleFollow 调用 RPC 返回 following 状态", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/toggle_follow"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return true; // 已关注
      },
    },
  ]);
  const { following } = await toggleFollow(fetcher, {
    targetType: "universe",
    targetId: "u-1",
    userId: "user-A",
  });
  assert.equal(following, true);
  assert.equal(receivedBody.p_target_type, "universe");
  assert.equal(receivedBody.p_target_id, "u-1");
});

test("CM-003: toggleFollow 返回 false 表示取消关注", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/toggle_follow"),
      respond: () => false,
    },
  ]);
  const { following } = await toggleFollow(fetcher, {
    targetType: "universe",
    targetId: "u-1",
    userId: "user-A",
  });
  assert.equal(following, false);
});

test("CM-003: toggleFollow 缺 userId 抛 unauthenticated", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      toggleFollow(fetcher, {
        targetType: "universe",
        targetId: "u-1",
        userId: "",
      }),
    (err) => err instanceof CommunityServiceError && err.code === "unauthenticated",
  );
});

test("CM-003: toggleFollow 缺 target 抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      toggleFollow(fetcher, {
        targetType: "universe",
        targetId: "",
        userId: "user-A",
      }),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

test("CM-003: isFollowing 返回 true/false", async () => {
  const fetcherTrue = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_follows?"),
      respond: () => [sampleFollowRow],
    },
  ]);
  const isFollowTrue = await isFollowing(fetcherTrue, {
    followerId: "user-A",
    targetType: "universe",
    targetId: "u-1",
  });
  assert.equal(isFollowTrue, true);

  const fetcherFalse = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_follows?"),
      respond: () => [],
    },
  ]);
  const isFollowFalse = await isFollowing(fetcherFalse, {
    followerId: "user-A",
    targetType: "universe",
    targetId: "other",
  });
  assert.equal(isFollowFalse, false);
});

// ============================================================
// 11. toggleReaction — CM-003 幂等 toggle
// ============================================================

test("CM-003: toggleReaction 调用 RPC 返回 reacted 状态", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/toggle_reaction"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return true;
      },
    },
  ]);
  const { reacted } = await toggleReaction(fetcher, {
    publicationId: "pub-1",
    reactionType: "like",
    userId: "user-A",
  });
  assert.equal(reacted, true);
  assert.equal(receivedBody.p_publication_id, "pub-1");
  assert.equal(receivedBody.p_reaction_type, "like");
});

test("CM-003: toggleReaction 缺 publicationId 抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      toggleReaction(fetcher, {
        publicationId: "",
        reactionType: "like",
        userId: "user-A",
      }),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

test("CM-003: listReactions 按 publication 查询", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_reactions?publication_id=eq."),
      respond: () => [sampleReactionRow],
    },
  ]);
  const items = await listReactions(fetcher, "pub-1");
  assert.equal(items.length, 1);
  assert.equal(items[0].reactionType, "like");
});

// ============================================================
// 12. toggleBookmark — CM-003 幂等 toggle
// ============================================================

test("CM-003: toggleBookmark 调用 RPC 返回 bookmarked 状态", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/toggle_bookmark"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return true;
      },
    },
  ]);
  const { bookmarked } = await toggleBookmark(fetcher, {
    publicationId: "pub-1",
    userId: "user-A",
  });
  assert.equal(bookmarked, true);
  assert.equal(receivedBody.p_publication_id, "pub-1");
});

test("CM-003: toggleBookmark 缺 publicationId 抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () =>
      toggleBookmark(fetcher, {
        publicationId: "",
        userId: "user-A",
      }),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

test("CM-003: listBookmarks 查询用户收藏", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_bookmarks?user_id=eq."),
      respond: () => [sampleBookmarkRow],
    },
  ]);
  const items = await listBookmarks(fetcher, "user-A");
  assert.equal(items.length, 1);
  assert.equal(items[0].publicationId, "pub-1");
});

test("CM-003: listFollows 查询用户关注", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_follows?follower_id=eq."),
      respond: () => [sampleFollowRow],
    },
  ]);
  const items = await listFollows(fetcher, "user-A");
  assert.equal(items.length, 1);
  assert.equal(items[0].targetType, "universe");
});

// ============================================================
// 13. 类型守卫
// ============================================================

test("isPublicationSourceType 校验", () => {
  assert.ok(isPublicationSourceType("universe"));
  assert.ok(isPublicationSourceType("project"));
  assert.ok(!isPublicationSourceType("invalid"));
});

test("isVisibility 校验", () => {
  assert.ok(isVisibility("public"));
  assert.ok(isVisibility("invite_only"));
  assert.ok(isVisibility("hidden"));
  assert.ok(!isVisibility("secret"));
});

test("isFollowTargetType 校验", () => {
  assert.ok(isFollowTargetType("user"));
  assert.ok(isFollowTargetType("universe"));
  assert.ok(isFollowTargetType("publication"));
  assert.ok(!isFollowTargetType("invalid"));
});

test("isReactionType 校验", () => {
  assert.ok(isReactionType("like"));
  assert.ok(isReactionType("love"));
  assert.ok(!isReactionType("invalid"));
});

// ============================================================
// 14. Migration 文件 (CM-001~003, CM-005)
// ============================================================

test("CM-001~003: migration 文件存在", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20260827050000_kiikis_21_community.sql",
  );
  assert.ok(fs.existsSync(migrationPath), `migration file missing: ${migrationPath}`);
});

test("CM-001: migration 包含 storyflow_publications 表", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827050000_kiikis_21_community.sql"),
    "utf8",
  );
  assert.ok(sql.includes("CREATE TABLE") && sql.includes("storyflow_publications"));
  // CM-001: 源资源快照字段
  assert.ok(sql.includes("source_type"));
  assert.ok(sql.includes("source_id"));
  assert.ok(sql.includes("source_version"));
});

test("CM-002: migration publications 有 visibility/public 索引", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827050000_kiikis_21_community.sql"),
    "utf8",
  );
  assert.ok(sql.includes("idx_publications_visibility"));
  assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
  // CM-009: 匿名可读 public 的 RLS 策略
  assert.ok(sql.includes("publications_select"));
  assert.ok(sql.includes("visibility = 'public'"));
});

test("CM-003: migration 包含 follows/reactions/bookmarks 唯一约束", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827050000_kiikis_21_community.sql"),
    "utf8",
  );
  assert.ok(sql.includes("storyflow_follows"));
  assert.ok(sql.includes("follows_unique"));
  assert.ok(sql.includes("storyflow_reactions"));
  assert.ok(sql.includes("reactions_unique"));
  assert.ok(sql.includes("storyflow_bookmarks"));
  assert.ok(sql.includes("bookmarks_unique"));
});

test("CM-003: migration 包含 toggle_follow/toggle_reaction/toggle_bookmark RPC", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827050000_kiikis_21_community.sql"),
    "utf8",
  );
  assert.ok(sql.includes("toggle_follow"));
  assert.ok(sql.includes("toggle_reaction"));
  assert.ok(sql.includes("toggle_bookmark"));
  assert.ok(sql.includes("ON CONFLICT") && sql.includes("DO NOTHING"));
});

test("CM-001: migration 包含 create_publication RPC (publisher 由 auth.uid() 注入)", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827050000_kiikis_21_community.sql"),
    "utf8",
  );
  assert.ok(sql.includes("create_publication"));
  assert.ok(sql.includes("auth.uid()"));
  // 幂等: idempotency_key unique
  assert.ok(sql.includes("idempotency_key text not null unique"));
});

test("CM-008: migration 包含 hide_publication/restore_publication RPC", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260827050000_kiikis_21_community.sql"),
    "utf8",
  );
  assert.ok(sql.includes("hide_publication"));
  assert.ok(sql.includes("restore_publication"));
  // CM-008: 隐藏只改 visibility, 不删除源
  assert.ok(sql.includes("visibility = 'hidden'"));
});

// ============================================================
// 15. parseFollow / parseReaction / parseBookmark
// ============================================================

test("CM-003: parseFollow 返回冻结对象", () => {
  const follow = parseFollow(sampleFollowRow);
  assert.equal(follow.followerId, "user-A");
  assert.equal(follow.targetType, "universe");
  assert.equal(follow.targetId, "u-1");
  assert.ok(Object.isFrozen(follow));
});

test("CM-003: parseReaction 返回冻结对象", () => {
  const reaction = parseReaction(sampleReactionRow);
  assert.equal(reaction.userId, "user-A");
  assert.equal(reaction.publicationId, "pub-1");
  assert.equal(reaction.reactionType, "like");
  assert.ok(Object.isFrozen(reaction));
});

test("CM-003: parseBookmark 返回冻结对象", () => {
  const bookmark = parseBookmark(sampleBookmarkRow);
  assert.equal(bookmark.userId, "user-A");
  assert.equal(bookmark.publicationId, "pub-1");
  assert.ok(Object.isFrozen(bookmark));
});

// ============================================================
// 16. CM-001 快照不破坏 — 源资源与 publication 分离
// ============================================================

test("CM-001: publication 与源资源分离 — source_version 是快照", () => {
  // 即使源资源更新版本, publication 保留发布时的 source_version
  const pubV1 = parsePublication({
    ...samplePublicationRow,
    source_version: "v1.0",
  });
  const pubV2 = parsePublication({
    ...samplePublicationRow,
    id: "pub-2",
    source_version: "v2.0",
  });
  assert.equal(pubV1.sourceVersion, "v1.0");
  assert.equal(pubV2.sourceVersion, "v2.0");
  // 同一源资源可有多个 publication (不同版本快照)
  assert.equal(pubV1.sourceId, pubV2.sourceId);
  assert.notEqual(pubV1.id, pubV2.id);
});

test("CM-008: 隐藏 publication 不影响源资源 — 源字段保留", async () => {
  // 模拟 hide_publication RPC — 验证隐藏后 source_* 字段仍在
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/hide_publication"),
      respond: () => ({
        ...samplePublicationRow,
        visibility: "hidden",
        status: "hidden_by_moderator",
        // CM-008: source_* 保留, 不删除
        source_type: "universe",
        source_id: "u-1",
        source_version: "v1.0",
      }),
    },
  ]);
  const hiddenPub = await hidePublication(fetcher, "pub-1", "test");
  assert.equal(hiddenPub.visibility, "hidden");
  // CM-008: 源资源字段仍在
  assert.equal(hiddenPub.sourceType, "universe");
  assert.equal(hiddenPub.sourceId, "u-1");
  assert.equal(hiddenPub.sourceVersion, "v1.0");
});
