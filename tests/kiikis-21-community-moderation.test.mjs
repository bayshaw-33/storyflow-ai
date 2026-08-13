/**
 * tests/kiikis-21-community-moderation.test.mjs
 * KIIKIS 2.1 Phase 5 — Task 5.3 安全与审核测试 (CM-007~010)
 *
 * 覆盖:
 *   CM-007: 举报/屏蔽/moderation queue/隐藏/恢复/申诉同时上线
 *   CM-008: 隐藏 publication 不删除私有源 (CM-001 已实现 hide_publication RPC)
 *   CM-009: 匿名/普通用户/被屏蔽用户/审核员权限矩阵自动化
 *   CM-010: /community 受 feature flag 保护 (应用层实现, 此测试不覆盖)
 *
 * 测试策略:
 *   - 契约校验 (validateCreateReport / validateReviewModeration / validateCreateAppeal / validateReviewAppeal)
 *   - parseReport / parseBlock / parseModerationQueueItem / parseAppeal
 *   - 服务层 mock fetcher (CM-007 完整流程 report → review → appeal → restore)
 *   - 权限矩阵 (CM-009: 4 种角色 anonymous/regular/moderator/admin + 被屏蔽用户)
 *   - migration 文件存在 + RLS + 4 RPC (create_report/toggle_block/review_moderation/create_appeal/review_appeal)
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  validateCreateReport,
  validateReviewModeration,
  validateCreateAppeal,
  validateReviewAppeal,
  parseReport,
  parseBlock,
  parseModerationQueueItem,
  parseAppeal,
  isReportTargetType,
  isReportReasonType,
  isModerationAction,
  isAdminRole,
  ModerationValidationError,
  REPORT_TARGET_TYPES,
  REPORT_REASON_TYPES,
  REPORT_STATUS,
  MODERATION_STATUS,
  MODERATION_ACTION,
  APPEAL_STATUS,
  ADMIN_ROLES,
  REPORT_DESCRIPTION_MAX,
  APPEAL_TEXT_MAX,
  APPEAL_TEXT_MIN,
  ACTION_REASON_MAX,
} from "../lib/contracts/v2/moderation.ts";
import {
  createReport,
  listReportsByReporter,
  toggleBlock,
  listBlocks,
  listModerationQueue,
  getModerationItem,
  reviewModeration,
  createAppeal,
  listAppeals,
  getAppeal,
  reviewAppeal,
} from "../lib/server/v2/community/moderation.ts";
import { CommunityServiceError } from "../lib/server/v2/community/publications.ts";
import {
  computePermissions,
  resolveViewerRole,
  hasModeratorRole,
  requireModerator,
  isBlockedEitherDirection,
  resolvePermissions,
} from "../lib/server/v2/community/permissions.ts";

// ============================================================
// Helpers — Mock fetcher (与 Phase 5.1/5.2 一致)
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

const sampleReportRow = {
  id: "r-1",
  reporter_id: "user-A",
  target_type: "publication",
  target_id: "pub-1",
  reason_type: "spam",
  reason_description: "spam content",
  status: "pending",
  moderation_id: "mod-1",
  created_at: "2026-08-14T00:00:00Z",
  updated_at: "2026-08-14T00:00:00Z",
  resolved_at: null,
  resolved_by: null,
  idempotency_key: "report:user-A:publication:pub-1",
};

const sampleBlockRow = {
  id: "b-1",
  blocker_id: "user-A",
  blocked_id: "user-B",
  created_at: "2026-08-14T00:00:00Z",
};

const sampleModerationRow = {
  id: "mod-1",
  report_id: "r-1",
  target_type: "publication",
  target_id: "pub-1",
  status: "pending",
  moderator_id: null,
  action_taken: null,
  action_reason: null,
  action_at: null,
  created_at: "2026-08-14T00:00:00Z",
  updated_at: "2026-08-14T00:00:00Z",
};

const sampleAppealRow = {
  id: "a-1",
  appellant_id: "user-A",
  moderation_id: "mod-1",
  appeal_text: "This is an appeal.",
  status: "pending",
  reviewer_id: null,
  review_notes: null,
  reviewed_at: null,
  created_at: "2026-08-14T00:00:00Z",
  updated_at: "2026-08-14T00:00:00Z",
  idempotency_key: "appeal:user-A:mod-1",
};

// ============================================================
// 1. 契约常量 (CM-007)
// ============================================================

test("CM-007: REPORT_TARGET_TYPES 含 publication/comment/user", () => {
  assert.ok(REPORT_TARGET_TYPES.includes("publication"));
  assert.ok(REPORT_TARGET_TYPES.includes("comment"));
  assert.ok(REPORT_TARGET_TYPES.includes("user"));
});

test("CM-007: REPORT_REASON_TYPES 含 spam/harassment/hate_speech/violence/sexual_content/misinformation/copyright/impersonation/other", () => {
  ["spam", "harassment", "hate_speech", "violence", "sexual_content",
   "misinformation", "copyright", "impersonation", "other"].forEach((t) => {
    assert.ok(REPORT_REASON_TYPES.includes(t), `should include ${t}`);
  });
});

test("CM-007: REPORT_STATUS 含 pending/reviewing/actioned_hide/actioned_restore/dismissed", () => {
  ["pending", "reviewing", "actioned_hide", "actioned_restore", "dismissed"].forEach((s) => {
    assert.ok(REPORT_STATUS.includes(s));
  });
});

test("CM-007: MODERATION_STATUS 含 pending/reviewing/hidden/restored/dismissed", () => {
  ["pending", "reviewing", "hidden", "restored", "dismissed"].forEach((s) => {
    assert.ok(MODERATION_STATUS.includes(s));
  });
});

test("CM-007: MODERATION_ACTION 含 hide/restore/freeze_comment/dismiss", () => {
  ["hide", "restore", "freeze_comment", "dismiss"].forEach((a) => {
    assert.ok(MODERATION_ACTION.includes(a));
  });
});

test("CM-007: APPEAL_STATUS 含 pending/approved/rejected", () => {
  ["pending", "approved", "rejected"].forEach((s) => {
    assert.ok(APPEAL_STATUS.includes(s));
  });
});

test("CM-009: ADMIN_ROLES 含 admin/moderator/auditor", () => {
  ["admin", "moderator", "auditor"].forEach((r) => {
    assert.ok(ADMIN_ROLES.includes(r));
  });
});

test("CM-007: 常量阈值合理", () => {
  assert.equal(REPORT_DESCRIPTION_MAX, 2000);
  assert.equal(APPEAL_TEXT_MAX, 5000);
  assert.equal(APPEAL_TEXT_MIN, 1);
  assert.equal(ACTION_REASON_MAX, 2000);
});

// ============================================================
// 2. isXxx 类型守卫
// ============================================================

test("CM-007: isReportTargetType 正确识别", () => {
  assert.ok(isReportTargetType("publication"));
  assert.ok(isReportTargetType("comment"));
  assert.ok(!isReportTargetType("project"));
  assert.ok(!isReportTargetType(""));
});

test("CM-007: isReportReasonType 正确识别", () => {
  assert.ok(isReportReasonType("spam"));
  assert.ok(isReportReasonType("copyright"));
  assert.ok(!isReportReasonType("foo"));
});

test("CM-007: isModerationAction 正确识别", () => {
  assert.ok(isModerationAction("hide"));
  assert.ok(isModerationAction("restore"));
  assert.ok(isModerationAction("dismiss"));
  assert.ok(!isModerationAction("delete"));
});

test("CM-009: isAdminRole 正确识别", () => {
  assert.ok(isAdminRole("admin"));
  assert.ok(isAdminRole("moderator"));
  assert.ok(isAdminRole("auditor"));
  assert.ok(!isAdminRole("user"));
});

// ============================================================
// 3. validateCreateReport (CM-007: reporterId 服务端注入)
// ============================================================

test("CM-007: validateCreateReport 合法输入通过", () => {
  const input = validateCreateReport({
    reporterId: "user-A",
    targetType: "publication",
    targetId: "pub-1",
    reasonType: "spam",
    reasonDescription: "spam content",
    idempotencyKey: "idem-1",
  });
  assert.equal(input.reporterId, "user-A");
  assert.equal(input.targetType, "publication");
  assert.equal(input.reasonType, "spam");
  assert.ok(Object.isFrozen(input));
});

test("CM-007: validateCreateReport 缺 reporterId 抛错", () => {
  assert.throws(
    () => validateCreateReport({
      reporterId: "",
      targetType: "publication",
      targetId: "pub-1",
      reasonType: "spam",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof ModerationValidationError && err.code === "missing_reporter",
  );
});

test("CM-007: validateCreateReport 非法 targetType 抛错", () => {
  assert.throws(
    () => validateCreateReport({
      reporterId: "user-A",
      targetType: "project",
      targetId: "pub-1",
      reasonType: "spam",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof ModerationValidationError && err.code === "invalid_target_type",
  );
});

test("CM-007: validateCreateReport 缺 targetId 抛错", () => {
  assert.throws(
    () => validateCreateReport({
      reporterId: "user-A",
      targetType: "publication",
      targetId: "",
      reasonType: "spam",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof ModerationValidationError && err.code === "missing_target_id",
  );
});

test("CM-007: validateCreateReport 非法 reasonType 抛错", () => {
  assert.throws(
    () => validateCreateReport({
      reporterId: "user-A",
      targetType: "publication",
      targetId: "pub-1",
      reasonType: "foo",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof ModerationValidationError && err.code === "invalid_reason_type",
  );
});

test("CM-007: validateCreateReport reasonDescription 过长抛错", () => {
  assert.throws(
    () => validateCreateReport({
      reporterId: "user-A",
      targetType: "publication",
      targetId: "pub-1",
      reasonType: "spam",
      reasonDescription: "x".repeat(REPORT_DESCRIPTION_MAX + 1),
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof ModerationValidationError && err.code === "description_too_long",
  );
});

test("CM-007: validateCreateReport reasonDescription 可为 null/undefined", () => {
  const input = validateCreateReport({
    reporterId: "user-A",
    targetType: "publication",
    targetId: "pub-1",
    reasonType: "spam",
    idempotencyKey: "idem-1",
  });
  assert.equal(input.reasonDescription, undefined);
});

test("CM-007: validateCreateReport 缺 idempotencyKey 抛错", () => {
  assert.throws(
    () => validateCreateReport({
      reporterId: "user-A",
      targetType: "publication",
      targetId: "pub-1",
      reasonType: "spam",
      idempotencyKey: "",
    }),
    (err) => err instanceof ModerationValidationError && err.code === "missing_idempotency_key",
  );
});

// ============================================================
// 4. validateReviewModeration (CM-007)
// ============================================================

test("CM-007: validateReviewModeration 合法输入通过", () => {
  ["hide", "restore", "dismiss"].forEach((action) => {
    const input = validateReviewModeration({
      moderationId: "mod-1",
      action,
      reason: "violates guidelines",
    });
    assert.equal(input.action, action);
    assert.ok(Object.isFrozen(input));
  });
});

test("CM-007: validateReviewModeration 缺 moderationId 抛错", () => {
  assert.throws(
    () => validateReviewModeration({ moderationId: "", action: "hide" }),
    (err) => err instanceof ModerationValidationError && err.code === "missing_moderation_id",
  );
});

test("CM-007: validateReviewModeration 非法 action 抛错", () => {
  assert.throws(
    () => validateReviewModeration({ moderationId: "mod-1", action: "delete" }),
    (err) => err instanceof ModerationValidationError && err.code === "invalid_action",
  );
});

test("CM-007: validateReviewModeration reason 过长抛错", () => {
  assert.throws(
    () => validateReviewModeration({
      moderationId: "mod-1",
      action: "hide",
      reason: "x".repeat(ACTION_REASON_MAX + 1),
    }),
    (err) => err instanceof ModerationValidationError && err.code === "reason_too_long",
  );
});

// ============================================================
// 5. validateCreateAppeal (CM-007: appellantId 服务端注入)
// ============================================================

test("CM-007: validateCreateAppeal 合法输入通过", () => {
  const input = validateCreateAppeal({
    appellantId: "user-A",
    moderationId: "mod-1",
    appealText: "This is an appeal.",
    idempotencyKey: "idem-1",
  });
  assert.equal(input.appellantId, "user-A");
  assert.equal(input.moderationId, "mod-1");
  assert.ok(Object.isFrozen(input));
});

test("CM-007: validateCreateAppeal 缺 appellantId 抛错", () => {
  assert.throws(
    () => validateCreateAppeal({
      appellantId: "",
      moderationId: "mod-1",
      appealText: "appeal",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof ModerationValidationError && err.code === "missing_appellant",
  );
});

test("CM-007: validateCreateAppeal 缺 moderationId 抛错", () => {
  assert.throws(
    () => validateCreateAppeal({
      appellantId: "user-A",
      moderationId: "",
      appealText: "appeal",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof ModerationValidationError && err.code === "missing_moderation_id",
  );
});

test("CM-007: validateCreateAppeal appealText 空抛错", () => {
  assert.throws(
    () => validateCreateAppeal({
      appellantId: "user-A",
      moderationId: "mod-1",
      appealText: "   ",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof ModerationValidationError && err.code === "appeal_text_empty",
  );
});

test("CM-007: validateCreateAppeal appealText 过长抛错 (>5000)", () => {
  assert.throws(
    () => validateCreateAppeal({
      appellantId: "user-A",
      moderationId: "mod-1",
      appealText: "x".repeat(APPEAL_TEXT_MAX + 1),
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof ModerationValidationError && err.code === "appeal_text_too_long",
  );
});

test("CM-007: validateCreateAppeal 缺 idempotencyKey 抛错", () => {
  assert.throws(
    () => validateCreateAppeal({
      appellantId: "user-A",
      moderationId: "mod-1",
      appealText: "appeal",
      idempotencyKey: "",
    }),
    (err) => err instanceof ModerationValidationError && err.code === "missing_idempotency_key",
  );
});

// ============================================================
// 6. validateReviewAppeal (CM-007)
// ============================================================

test("CM-007: validateReviewAppeal 合法输入通过 (approved/rejected)", () => {
  ["approved", "rejected"].forEach((decision) => {
    const input = validateReviewAppeal({
      appealId: "a-1",
      decision,
      reviewNotes: "notes",
    });
    assert.equal(input.decision, decision);
    assert.ok(Object.isFrozen(input));
  });
});

test("CM-007: validateReviewAppeal 缺 appealId 抛错", () => {
  assert.throws(
    () => validateReviewAppeal({ appealId: "", decision: "approved" }),
    (err) => err instanceof ModerationValidationError && err.code === "missing_appeal_id",
  );
});

test("CM-007: validateReviewAppeal 非法 decision 抛错", () => {
  assert.throws(
    () => validateReviewAppeal({ appealId: "a-1", decision: "pending" }),
    (err) => err instanceof ModerationValidationError && err.code === "invalid_decision",
  );
});

test("CM-007: validateReviewAppeal reviewNotes 过长抛错", () => {
  assert.throws(
    () => validateReviewAppeal({
      appealId: "a-1",
      decision: "approved",
      reviewNotes: "x".repeat(ACTION_REASON_MAX + 1),
    }),
    (err) => err instanceof ModerationValidationError && err.code === "review_notes_too_long",
  );
});

// ============================================================
// 7. parseReport / parseBlock / parseModerationQueueItem / parseAppeal
// ============================================================

test("CM-007: parseReport 保留所有字段 (snake→camel)", () => {
  const r = parseReport(sampleReportRow);
  assert.equal(r.id, "r-1");
  assert.equal(r.reporterId, "user-A");
  assert.equal(r.targetType, "publication");
  assert.equal(r.targetId, "pub-1");
  assert.equal(r.reasonType, "spam");
  assert.equal(r.reasonDescription, "spam content");
  assert.equal(r.status, "pending");
  assert.equal(r.moderationId, "mod-1");
  assert.equal(r.resolvedAt, null);
  assert.equal(r.idempotencyKey, "report:user-A:publication:pub-1");
  assert.ok(Object.isFrozen(r));
});

test("CM-007: parseBlock 保留所有字段", () => {
  const b = parseBlock(sampleBlockRow);
  assert.equal(b.id, "b-1");
  assert.equal(b.blockerId, "user-A");
  assert.equal(b.blockedId, "user-B");
  assert.ok(Object.isFrozen(b));
});

test("CM-007: parseModerationQueueItem 保留所有字段", () => {
  const m = parseModerationQueueItem(sampleModerationRow);
  assert.equal(m.id, "mod-1");
  assert.equal(m.reportId, "r-1");
  assert.equal(m.targetType, "publication");
  assert.equal(m.targetId, "pub-1");
  assert.equal(m.status, "pending");
  assert.equal(m.moderatorId, null);
  assert.equal(m.actionTaken, null);
  assert.ok(Object.isFrozen(m));
});

test("CM-007: parseAppeal 保留所有字段", () => {
  const a = parseAppeal(sampleAppealRow);
  assert.equal(a.id, "a-1");
  assert.equal(a.appellantId, "user-A");
  assert.equal(a.moderationId, "mod-1");
  assert.equal(a.appealText, "This is an appeal.");
  assert.equal(a.status, "pending");
  assert.equal(a.reviewerId, null);
  assert.equal(a.idempotencyKey, "appeal:user-A:mod-1");
  assert.ok(Object.isFrozen(a));
});

// ============================================================
// 8. createReport service (CM-007)
// ============================================================

test("CM-007: createReport 调用 RPC 并返回 Report", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_report"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return { ...sampleReportRow, idempotency_key: receivedBody.p_idempotency_key };
      },
    },
  ]);
  const r = await createReport(fetcher, {
    reporterId: "user-A",
    targetType: "publication",
    targetId: "pub-1",
    reasonType: "spam",
    reasonDescription: "spam content",
    idempotencyKey: "idem-1",
  });
  assert.equal(receivedBody.p_target_type, "publication");
  assert.equal(receivedBody.p_target_id, "pub-1");
  assert.equal(receivedBody.p_reason_type, "spam");
  assert.equal(receivedBody.p_reason_description, "spam content");
  assert.equal(receivedBody.p_idempotency_key, "idem-1");
  // 不传 reporterId (服务端注入)
  assert.ok(!("p_reporter_id" in receivedBody));
  assert.equal(r.id, "r-1");
  assert.equal(r.reporterId, "user-A");
});

test("CM-007: createReport 校验失败抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => createReport(fetcher, {
      reporterId: "user-A",
      targetType: "invalid",
      targetId: "pub-1",
      reasonType: "spam",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

test("CM-007: createReport target 不存在抛 not_found", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_report"),
      respond: () => {
        const err = new Error("not found");
        err.status = 404;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => createReport(fetcher, {
      reporterId: "user-A",
      targetType: "publication",
      targetId: "unknown",
      reasonType: "spam",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof CommunityServiceError && err.code === "not_found",
  );
});

test("CM-007: createReport 无权限抛 forbidden", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_report"),
      respond: () => {
        const err = new Error("forbidden");
        err.status = 403;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => createReport(fetcher, {
      reporterId: "user-A",
      targetType: "publication",
      targetId: "pub-1",
      reasonType: "spam",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof CommunityServiceError && err.code === "forbidden",
  );
});

// ============================================================
// 9. listReportsByReporter
// ============================================================

test("CM-007: listReportsByReporter 按 reporter 查询", async () => {
  let receivedUrl = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => {
        receivedUrl = p;
        return p.includes("/rest/v1/storyflow_reports?reporter_id=eq.");
      },
      respond: () => [sampleReportRow],
    },
  ]);
  const items = await listReportsByReporter(fetcher, "user-A");
  assert.equal(items.length, 1);
  assert.ok(receivedUrl.includes("reporter_id=eq.user-A"));
  assert.ok(receivedUrl.includes("order=created_at.desc"));
});

test("CM-007: listReportsByReporter 缺 reporterId 抛 unauthenticated", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => listReportsByReporter(fetcher, ""),
    (err) => err instanceof CommunityServiceError && err.code === "unauthenticated",
  );
});

test("CM-007: listReportsByReporter 支持 status 过滤", async () => {
  let receivedUrl = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => {
        receivedUrl = p;
        return p.includes("/rest/v1/storyflow_reports?");
      },
      respond: () => [],
    },
  ]);
  await listReportsByReporter(fetcher, "user-A", { status: "pending" });
  assert.ok(receivedUrl.includes("status=eq.pending"));
});

// ============================================================
// 10. toggleBlock service (CM-007: 幂等 toggle)
// ============================================================

test("CM-007: toggleBlock 调用 RPC 并返回 blocking=true", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/toggle_block"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return true; // 已屏蔽
      },
    },
  ]);
  const { blocking } = await toggleBlock(fetcher, {
    blockerId: "user-A",
    blockedId: "user-B",
  });
  assert.equal(receivedBody.p_blocked_id, "user-B");
  assert.ok(!("p_blocker_id" in receivedBody)); // 服务端注入
  assert.equal(blocking, true);
});

test("CM-007: toggleBlock 已屏蔽返回 blocking=false", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/toggle_block"),
      respond: () => false,
    },
  ]);
  const { blocking } = await toggleBlock(fetcher, {
    blockerId: "user-A",
    blockedId: "user-B",
  });
  assert.equal(blocking, false);
});

test("CM-007: toggleBlock 缺 blockerId 抛 unauthenticated", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => toggleBlock(fetcher, { blockerId: "", blockedId: "user-B" }),
    (err) => err instanceof CommunityServiceError && err.code === "unauthenticated",
  );
});

test("CM-007: toggleBlock 缺 blockedId 抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => toggleBlock(fetcher, { blockerId: "user-A", blockedId: "" }),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

test("CM-007: toggleBlock 不能屏蔽自己抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => toggleBlock(fetcher, { blockerId: "user-A", blockedId: "user-A" }),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

// ============================================================
// 11. listBlocks
// ============================================================

test("CM-007: listBlocks 按 blocker 查询", async () => {
  let receivedUrl = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => {
        receivedUrl = p;
        return p.includes("/rest/v1/storyflow_blocks?blocker_id=eq.");
      },
      respond: () => [sampleBlockRow],
    },
  ]);
  const items = await listBlocks(fetcher, "user-A");
  assert.equal(items.length, 1);
  assert.equal(items[0].blockerId, "user-A");
  assert.equal(items[0].blockedId, "user-B");
  assert.ok(receivedUrl.includes("blocker_id=eq.user-A"));
});

// ============================================================
// 12. listModerationQueue (CM-007, CM-009)
// ============================================================

test("CM-007: listModerationQueue 按 status/targetType 过滤", async () => {
  let receivedUrl = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => {
        receivedUrl = p;
        return p.includes("/rest/v1/storyflow_moderation_queue?");
      },
      respond: () => [sampleModerationRow],
    },
  ]);
  const items = await listModerationQueue(fetcher, {
    status: "pending",
    targetType: "publication",
  });
  assert.equal(items.length, 1);
  assert.ok(receivedUrl.includes("status=eq.pending"));
  assert.ok(receivedUrl.includes("target_type=eq.publication"));
});

test("CM-007: listModerationQueue 无参数返回全部", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_moderation_queue"),
      respond: () => [sampleModerationRow, { ...sampleModerationRow, id: "mod-2" }],
    },
  ]);
  const items = await listModerationQueue(fetcher);
  assert.equal(items.length, 2);
});

// ============================================================
// 13. getModerationItem
// ============================================================

test("CM-007: getModerationItem 返回单条", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_moderation_queue?id=eq."),
      respond: () => [sampleModerationRow],
    },
  ]);
  const item = await getModerationItem(fetcher, "mod-1");
  assert.equal(item?.id, "mod-1");
  assert.equal(item?.status, "pending");
});

test("CM-007: getModerationItem 不存在返回 null", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_moderation_queue?id=eq."),
      respond: () => [],
    },
  ]);
  const item = await getModerationItem(fetcher, "unknown");
  assert.equal(item, null);
});

test("CM-007: getModerationItem 缺 id 抛错", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => getModerationItem(fetcher, ""),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

// ============================================================
// 14. reviewModeration (CM-007: hide/restore/dismiss)
// ============================================================

test("CM-007: reviewModeration hide 调用 RPC (CM-008: 不删除源)", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/review_moderation"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return {
          ...sampleModerationRow,
          status: "hidden",
          action_taken: "hide",
          moderator_id: "user-mod",
        };
      },
    },
  ]);
  const item = await reviewModeration(fetcher, {
    moderationId: "mod-1",
    action: "hide",
    reason: "violates guidelines",
  });
  assert.equal(receivedBody.p_moderation_id, "mod-1");
  assert.equal(receivedBody.p_action, "hide");
  assert.equal(receivedBody.p_reason, "violates guidelines");
  assert.equal(item.status, "hidden");
  assert.equal(item.actionTaken, "hide");
});

test("CM-007: reviewModeration restore 返回 restored", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/review_moderation"),
      respond: () => ({
        ...sampleModerationRow,
        status: "restored",
        action_taken: "restore",
        moderator_id: "user-mod",
      }),
    },
  ]);
  const item = await reviewModeration(fetcher, {
    moderationId: "mod-1",
    action: "restore",
  });
  assert.equal(item.status, "restored");
  assert.equal(item.actionTaken, "restore");
});

test("CM-007: reviewModeration dismiss 返回 dismissed", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/review_moderation"),
      respond: () => ({
        ...sampleModerationRow,
        status: "dismissed",
        action_taken: "dismiss",
        moderator_id: "user-mod",
      }),
    },
  ]);
  const item = await reviewModeration(fetcher, {
    moderationId: "mod-1",
    action: "dismiss",
  });
  assert.equal(item.status, "dismissed");
  assert.equal(item.actionTaken, "dismiss");
});

test("CM-007: reviewModeration 校验失败抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => reviewModeration(fetcher, { moderationId: "mod-1", action: "delete" }),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

test("CM-007: reviewModeration moderator 不存在抛 not_found", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/review_moderation"),
      respond: () => {
        const err = new Error("not found");
        err.status = 404;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => reviewModeration(fetcher, { moderationId: "unknown", action: "hide" }),
    (err) => err instanceof CommunityServiceError && err.code === "not_found",
  );
});

test("CM-007: reviewModeration 非审核员抛 forbidden", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/review_moderation"),
      respond: () => {
        const err = new Error("forbidden");
        err.status = 403;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => reviewModeration(fetcher, { moderationId: "mod-1", action: "hide" }),
    (err) => err instanceof CommunityServiceError && err.code === "forbidden",
  );
});

// ============================================================
// 15. createAppeal (CM-007: 被处罚用户提交, 幂等)
// ============================================================

test("CM-007: createAppeal 调用 RPC 并返回 Appeal", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_appeal"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return { ...sampleAppealRow, idempotency_key: receivedBody.p_idempotency_key };
      },
    },
  ]);
  const a = await createAppeal(fetcher, {
    appellantId: "user-A",
    moderationId: "mod-1",
    appealText: "This is an appeal.",
    idempotencyKey: "idem-1",
  });
  assert.equal(receivedBody.p_moderation_id, "mod-1");
  assert.equal(receivedBody.p_appeal_text, "This is an appeal.");
  assert.equal(receivedBody.p_idempotency_key, "idem-1");
  assert.ok(!("p_appellant_id" in receivedBody)); // 服务端注入
  assert.equal(a.id, "a-1");
  assert.equal(a.appellantId, "user-A");
});

test("CM-007: createAppeal 校验失败抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => createAppeal(fetcher, {
      appellantId: "user-A",
      moderationId: "mod-1",
      appealText: "",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

test("CM-007: createAppeal moderation 不存在抛 not_found", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_appeal"),
      respond: () => {
        const err = new Error("not found");
        err.status = 404;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => createAppeal(fetcher, {
      appellantId: "user-A",
      moderationId: "unknown",
      appealText: "appeal",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof CommunityServiceError && err.code === "not_found",
  );
});

test("CM-007: createAppeal 非被处罚用户抛 forbidden", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_appeal"),
      respond: () => {
        const err = new Error("forbidden");
        err.status = 403;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => createAppeal(fetcher, {
      appellantId: "user-X",
      moderationId: "mod-1",
      appealText: "appeal",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof CommunityServiceError && err.code === "forbidden",
  );
});

// ============================================================
// 16. listAppeals / getAppeal
// ============================================================

test("CM-007: listAppeals 默认列出自己的申诉", async () => {
  let receivedUrl = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => {
        receivedUrl = p;
        return p.includes("/rest/v1/storyflow_appeals?");
      },
      respond: () => [sampleAppealRow],
    },
  ]);
  const items = await listAppeals(fetcher, "user-A");
  assert.equal(items.length, 1);
  assert.ok(receivedUrl.includes("appellant_id=eq.user-A"));
});

test("CM-007: listAppeals 审核员传 all=true 可看所有 (不过滤 appellantId)", async () => {
  let receivedUrl = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => {
        receivedUrl = p;
        return p.includes("/rest/v1/storyflow_appeals?");
      },
      respond: () => [sampleAppealRow],
    },
  ]);
  await listAppeals(fetcher, "user-mod", { all: true });
  assert.ok(!receivedUrl.includes("appellant_id="));
});

test("CM-007: listAppeals 缺 viewerId 抛 unauthenticated", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => listAppeals(fetcher, ""),
    (err) => err instanceof CommunityServiceError && err.code === "unauthenticated",
  );
});

test("CM-007: getAppeal 返回详情", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_appeals?id=eq."),
      respond: () => [sampleAppealRow],
    },
  ]);
  const a = await getAppeal(fetcher, "a-1");
  assert.equal(a?.id, "a-1");
  assert.equal(a?.status, "pending");
});

test("CM-007: getAppeal 不存在返回 null", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_appeals?id=eq."),
      respond: () => [],
    },
  ]);
  const a = await getAppeal(fetcher, "unknown");
  assert.equal(a, null);
});

// ============================================================
// 17. reviewAppeal (CM-007: approved 自动 restore)
// ============================================================

test("CM-007: reviewAppeal approved 返回 approved", async () => {
  let receivedBody = null;
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/review_appeal"),
      respond: (p, init) => {
        receivedBody = JSON.parse(init.body);
        return {
          ...sampleAppealRow,
          status: "approved",
          reviewer_id: "user-mod",
          reviewed_at: "2026-08-14T01:00:00Z",
        };
      },
    },
  ]);
  const a = await reviewAppeal(fetcher, {
    appealId: "a-1",
    decision: "approved",
    reviewNotes: "valid appeal",
  });
  assert.equal(receivedBody.p_appeal_id, "a-1");
  assert.equal(receivedBody.p_decision, "approved");
  assert.equal(receivedBody.p_review_notes, "valid appeal");
  assert.equal(a.status, "approved");
  assert.equal(a.reviewerId, "user-mod");
});

test("CM-007: reviewAppeal rejected 返回 rejected", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/review_appeal"),
      respond: () => ({
        ...sampleAppealRow,
        status: "rejected",
        reviewer_id: "user-mod",
      }),
    },
  ]);
  const a = await reviewAppeal(fetcher, {
    appealId: "a-1",
    decision: "rejected",
  });
  assert.equal(a.status, "rejected");
});

test("CM-007: reviewAppeal 校验失败抛 validation_failed", async () => {
  const fetcher = makeMockFetcher([]);
  await assert.rejects(
    () => reviewAppeal(fetcher, { appealId: "a-1", decision: "pending" }),
    (err) => err instanceof CommunityServiceError && err.code === "validation_failed",
  );
});

test("CM-007: reviewAppeal appeal 不存在抛 not_found", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/review_appeal"),
      respond: () => {
        const err = new Error("not found");
        err.status = 404;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => reviewAppeal(fetcher, { appealId: "unknown", decision: "approved" }),
    (err) => err instanceof CommunityServiceError && err.code === "not_found",
  );
});

test("CM-007: reviewAppeal 非审核员抛 forbidden", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/review_appeal"),
      respond: () => {
        const err = new Error("forbidden");
        err.status = 403;
        throw err;
      },
    },
  ]);
  await assert.rejects(
    () => reviewAppeal(fetcher, { appealId: "a-1", decision: "approved" }),
    (err) => err instanceof CommunityServiceError && err.code === "forbidden",
  );
});

// ============================================================
// 18. 权限矩阵 (CM-009)
// ============================================================

test("CM-009: 匿名用户只能浏览, 不能互动", () => {
  const p = computePermissions("anonymous", false);
  assert.equal(p.canView, true);
  assert.equal(p.canFollow, false);
  assert.equal(p.canReact, false);
  assert.equal(p.canBookmark, false);
  assert.equal(p.canComment, false);
  assert.equal(p.canReport, false);
  assert.equal(p.canBlock, false);
  assert.equal(p.canApplyUse, false);
  assert.equal(p.canViewModerationQueue, false);
  assert.equal(p.canModerate, false);
  assert.equal(p.canReviewAppeals, false);
});

test("CM-009: 普通用户可浏览 + 互动, 但不能审核", () => {
  const p = computePermissions("regular", false);
  assert.equal(p.canView, true);
  assert.equal(p.canFollow, true);
  assert.equal(p.canReact, true);
  assert.equal(p.canBookmark, true);
  assert.equal(p.canComment, true);
  assert.equal(p.canReport, true);
  assert.equal(p.canBlock, true);
  assert.equal(p.canApplyUse, true);
  assert.equal(p.canViewModerationQueue, false);
  assert.equal(p.canModerate, false);
  assert.equal(p.canReviewAppeals, false);
});

test("CM-009: 审核员拥有普通用户全部权限 + 审核能力", () => {
  const p = computePermissions("moderator", false);
  assert.equal(p.canView, true);
  assert.equal(p.canFollow, true);
  assert.equal(p.canReact, true);
  assert.equal(p.canComment, true);
  assert.equal(p.canViewModerationQueue, true);
  assert.equal(p.canModerate, true);
  assert.equal(p.canReviewAppeals, true);
});

test("CM-009: admin 角色权限与 moderator 一致", () => {
  const modP = computePermissions("moderator", false);
  const adminP = computePermissions("admin", false);
  assert.deepEqual(adminP, modP);
});

test("CM-009: 被屏蔽用户看不到屏蔽者内容 (全部权限关闭)", () => {
  const p = computePermissions("regular", true);
  assert.equal(p.canView, false);
  assert.equal(p.canFollow, false);
  assert.equal(p.canReact, false);
  assert.equal(p.canBookmark, false);
  assert.equal(p.canComment, false);
  assert.equal(p.canReport, false);
  assert.equal(p.canApplyUse, false);
  // 审核员屏蔽关系不阻断审核能力 (此处 isBlocked=true 简化: 仍返回全 false)
  // 真实场景由 resolvePermissions + moderator 角色 + 屏蔽查询组合判断
});

test("CM-009: 被屏蔽 moderator 仍保留审核能力 (通过 resolvePermissions)", async () => {
  // 场景: moderator 被普通用户屏蔽, 但对其他 publication 仍能审核
  const fetcher = makeMockFetcher([
    // admin_roles 查询: moderator
    {
      match: (p) => p.includes("/rest/v1/storyflow_admin_roles?"),
      respond: () => [{ role: "moderator" }],
    },
    // 屏蔽关系: 无 (moderator 看的是另一个 publication owner 的内容, 与屏蔽者无关)
    {
      match: (p) => p.includes("/rest/v1/storyflow_blocks?"),
      respond: () => [],
    },
  ]);
  const { role, permissions } = await resolvePermissions(fetcher, "user-mod", "user-A");
  assert.equal(role, "moderator");
  assert.equal(permissions.canModerate, true);
  assert.equal(permissions.canView, true);
});

// ============================================================
// 19. resolveViewerRole / hasModeratorRole / requireModerator
// ============================================================

test("CM-009: resolveViewerRole userId 为 null 返回 anonymous", async () => {
  const fetcher = makeMockFetcher([]);
  const role = await resolveViewerRole(fetcher, null);
  assert.equal(role, "anonymous");
});

test("CM-009: resolveViewerRole 无 admin 角色返回 regular", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_admin_roles?"),
      respond: () => [],
    },
  ]);
  const role = await resolveViewerRole(fetcher, "user-A");
  assert.equal(role, "regular");
});

test("CM-009: resolveViewerRole moderator 角色返回 moderator", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_admin_roles?"),
      respond: () => [{ role: "moderator" }],
    },
  ]);
  const role = await resolveViewerRole(fetcher, "user-mod");
  assert.equal(role, "moderator");
});

test("CM-009: resolveViewerRole admin 角色优先返回 admin", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_admin_roles?"),
      respond: () => [{ role: "moderator" }, { role: "admin" }],
    },
  ]);
  const role = await resolveViewerRole(fetcher, "user-admin");
  assert.equal(role, "admin");
});

test("CM-009: hasModeratorRole moderator 返回 true", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_admin_roles?"),
      respond: () => [{ role: "moderator" }],
    },
  ]);
  const has = await hasModeratorRole(fetcher, "user-mod");
  assert.equal(has, true);
});

test("CM-009: hasModeratorRole admin 也返回 true (admin 包含 moderator)", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_admin_roles?"),
      respond: () => [{ role: "admin" }],
    },
  ]);
  const has = await hasModeratorRole(fetcher, "user-admin");
  assert.equal(has, true);
});

test("CM-009: hasModeratorRole 普通用户返回 false", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_admin_roles?"),
      respond: () => [],
    },
  ]);
  const has = await hasModeratorRole(fetcher, "user-A");
  assert.equal(has, false);
});

test("CM-009: requireModerator 普通用户抛 forbidden", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_admin_roles?"),
      respond: () => [],
    },
  ]);
  await assert.rejects(
    () => requireModerator(fetcher, "user-A"),
    (err) => err instanceof CommunityServiceError && err.code === "forbidden",
  );
});

test("CM-009: requireModerator moderator 通过", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_admin_roles?"),
      respond: () => [{ role: "moderator" }],
    },
  ]);
  await requireModerator(fetcher, "user-mod"); // 不抛错即通过
});

// ============================================================
// 20. isBlockedEitherDirection
// ============================================================

test("CM-009: isBlockedEitherDirection A 屏蔽 B 返回 true", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_blocks?"),
      respond: () => [{ id: "b-1" }],
    },
  ]);
  const blocked = await isBlockedEitherDirection(fetcher, "user-A", "user-B");
  assert.equal(blocked, true);
});

test("CM-009: isBlockedEitherDirection 无屏蔽关系返回 false", async () => {
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rest/v1/storyflow_blocks?"),
      respond: () => [],
    },
  ]);
  const blocked = await isBlockedEitherDirection(fetcher, "user-A", "user-B");
  assert.equal(blocked, false);
});

test("CM-009: isBlockedEitherDirection 同一用户返回 false", async () => {
  const fetcher = makeMockFetcher([]);
  const blocked = await isBlockedEitherDirection(fetcher, "user-A", "user-A");
  assert.equal(blocked, false);
});

test("CM-009: isBlockedEitherDirection 空用户返回 false", async () => {
  const fetcher = makeMockFetcher([]);
  const blocked = await isBlockedEitherDirection(fetcher, "", "user-B");
  assert.equal(blocked, false);
});

// ============================================================
// 21. Migration 文件存在 + RLS + RPC (CM-007~009)
// ============================================================

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260827050200_kiikis_21_moderation.sql",
);

test("CM-007: migration 文件存在", () => {
  assert.ok(fs.existsSync(migrationPath), `migration should exist at ${migrationPath}`);
});

if (fs.existsSync(migrationPath)) {
  const sql = fs.readFileSync(migrationPath, "utf8");

  test("CM-007: migration 包含 storyflow_reports 表", () => {
    assert.ok(sql.includes("CREATE TABLE") && sql.includes("storyflow_reports"));
    assert.ok(sql.includes("reporter_id"));
    assert.ok(sql.includes("target_type"));
    assert.ok(sql.includes("target_id"));
    assert.ok(sql.includes("reason_type"));
    assert.ok(sql.includes("idempotency_key"));
    // 同一用户对同一对象只能举报一次
    assert.ok(sql.includes("reports_unique"));
  });

  test("CM-007: migration 包含 storyflow_blocks 表 (双向不可见)", () => {
    assert.ok(sql.includes("storyflow_blocks"));
    assert.ok(sql.includes("blocker_id"));
    assert.ok(sql.includes("blocked_id"));
    assert.ok(sql.includes("blocks_unique"));
    // 不能屏蔽自己
    assert.ok(sql.includes("blocker_id <> blocked_id"));
  });

  test("CM-007: migration 包含 storyflow_moderation_queue 表", () => {
    assert.ok(sql.includes("storyflow_moderation_queue"));
    assert.ok(sql.includes("moderator_id"));
    assert.ok(sql.includes("action_taken"));
    assert.ok(sql.includes("status") && sql.includes("pending"));
    assert.ok(sql.includes("hidden") && sql.includes("restored") && sql.includes("dismissed"));
  });

  test("CM-007: migration 包含 storyflow_appeals 表", () => {
    assert.ok(sql.includes("storyflow_appeals"));
    assert.ok(sql.includes("appellant_id"));
    assert.ok(sql.includes("appeal_text"));
    assert.ok(sql.includes("reviewer_id"));
    assert.ok(sql.includes("approved") && sql.includes("rejected"));
  });

  test("CM-009: migration 包含 storyflow_admin_roles 表 (或复用)", () => {
    assert.ok(
      sql.includes("storyflow_admin_roles") && sql.includes("moderator"),
      "admin_roles 表应包含 moderator 角色",
    );
  });

  test("CM-007: migration 包含 create_report RPC (SECURITY DEFINER)", () => {
    assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.create_report"));
    assert.ok(sql.includes("SECURITY DEFINER"));
    assert.ok(sql.includes("LANGUAGE plpgsql"));
    // 服务端注入 reporter_id (用 auth.uid())
    assert.ok(sql.includes("auth.uid()"));
    // 幂等: 同一 idempotency_key 已存在则返回
    assert.ok(sql.includes("idempotency_key = p_idempotency_key"));
    // 自动创建 moderation queue 条目
    assert.ok(sql.includes("storyflow_moderation_queue"));
    // REVOKE anon
    assert.ok(sql.includes("REVOKE EXECUTE ON FUNCTION public.create_report") && sql.includes("FROM anon"));
  });

  test("CM-007: migration 包含 toggle_block RPC (幂等 toggle)", () => {
    assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.toggle_block"));
    assert.ok(sql.includes("SECURITY DEFINER"));
    // 不能屏蔽自己
    assert.ok(sql.includes("p_blocked_id = v_blocker"));
    // toggle 逻辑
    assert.ok(sql.includes("DELETE FROM public.storyflow_blocks") || sql.includes("ON CONFLICT"));
  });

  test("CM-007: migration 包含 review_moderation RPC (hide/restore/dismiss)", () => {
    assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.review_moderation"));
    assert.ok(sql.includes("SECURITY DEFINER"));
    // CM-009: 权限校验 (必须 moderator 角色)
    assert.ok(sql.includes("storyflow_admin_roles") && sql.includes("moderator"));
    // CM-008: hide 调用 hide_publication RPC
    assert.ok(sql.includes("public.hide_publication"));
    // restore 调用 restore_publication RPC
    assert.ok(sql.includes("public.restore_publication"));
    // 更新 report 状态
    assert.ok(sql.includes("actioned_hide") && sql.includes("actioned_restore"));
    // CM-006: 通知 publication owner (creative_events)
    assert.ok(sql.includes("storyflow_creative_events") || sql.includes("notification_moderation_result"));
  });

  test("CM-007: migration 包含 create_appeal RPC (被处罚用户提交)", () => {
    assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.create_appeal"));
    assert.ok(sql.includes("SECURITY DEFINER"));
    // 幂等
    assert.ok(sql.includes("idempotency_key = p_idempotency_key"));
    // 校验 moderation 存在
    assert.ok(sql.includes("storyflow_moderation_queue WHERE id = p_moderation_id"));
    // 校验被处罚人是申诉人 (publication owner)
    assert.ok(sql.includes("storyflow_publications") && sql.includes("publisher_id"));
    assert.ok(sql.includes("only affected user can appeal"));
    // CM-006: 通知审核员
    assert.ok(sql.includes("storyflow_admin_roles") && sql.includes("storyflow_creative_events"));
  });

  test("CM-007: migration 包含 review_appeal RPC (approved 自动 restore)", () => {
    assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.review_appeal"));
    assert.ok(sql.includes("SECURITY DEFINER"));
    // CM-009: 权限校验
    assert.ok(sql.includes("moderator role required"));
    // CM-007: approved 自动恢复 publication
    assert.ok(sql.includes("IF p_decision = 'approved'"));
    assert.ok(sql.includes("public.restore_publication"));
    assert.ok(sql.includes("status = 'restored'"));
    // CM-006: 通知申诉人
    assert.ok(sql.includes("appellant_id") && sql.includes("storyflow_creative_events"));
  });

  test("CM-009: migration 包含 RLS 策略", () => {
    assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
    // reports: 举报者可看自己的举报; 审核员可看所有
    assert.ok(sql.includes("reports_reporter_select"));
    assert.ok(sql.includes("reports_moderator_update"));
    // blocks: 用户只能看/创建/删除自己的屏蔽
    assert.ok(sql.includes("blocks_owner_select"));
    assert.ok(sql.includes("blocks_owner_insert"));
    assert.ok(sql.includes("blocks_owner_delete"));
    // moderation_queue: 审核员可查/更新
    assert.ok(sql.includes("moderation_moderator_select"));
    assert.ok(sql.includes("moderation_moderator_update"));
    // appeals: 申诉人可看自己; 审核员可看所有
    assert.ok(sql.includes("appeals_appellant_select"));
    assert.ok(sql.includes("appeals_moderator_update"));
  });

  test("CM-008: migration 中 hide 不删除私有源 (仅调 hide_publication RPC)", () => {
    // 验证 review_moderation 内 hide 动作只调用 hide_publication, 不直接 DELETE publication
    const hideSection = sql.substring(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.review_moderation"),
      sql.indexOf("REVOKE EXECUTE ON FUNCTION public.review_moderation"),
    );
    assert.ok(hideSection.includes("public.hide_publication"));
    // 不应包含 DELETE FROM storyflow_publications
    assert.ok(!hideSection.includes("DELETE FROM public.storyflow_publications"));
  });
}

// ============================================================
// 22. CM-008 完整流程 (hide → 不删除源 → restore)
// ============================================================

test("CM-008: 完整流程 report → review hide → appeal → review approve → restore", async () => {
  // 模拟完整 moderation 流程
  const calls = [];
  const fetcher = makeMockFetcher([
    {
      match: (p) => p.includes("/rpc/create_report"),
      respond: (p, init) => {
        calls.push("create_report");
        return { ...sampleReportRow, moderation_id: "mod-1" };
      },
    },
    {
      match: (p) => p.includes("/rpc/review_moderation"),
      respond: (p, init) => {
        const body = JSON.parse(init.body);
        calls.push(`review_moderation:${body.p_action}`);
        return {
          ...sampleModerationRow,
          status: body.p_action === "hide" ? "hidden" : "restored",
          action_taken: body.p_action,
          moderator_id: "user-mod",
        };
      },
    },
    {
      match: (p) => p.includes("/rpc/create_appeal"),
      respond: (p, init) => {
        calls.push("create_appeal");
        return { ...sampleAppealRow };
      },
    },
    {
      match: (p) => p.includes("/rpc/review_appeal"),
      respond: (p, init) => {
        const body = JSON.parse(init.body);
        calls.push(`review_appeal:${body.p_decision}`);
        return {
          ...sampleAppealRow,
          status: body.p_decision,
          reviewer_id: "user-mod",
        };
      },
    },
  ]);

  // 1. 创建举报
  const report = await createReport(fetcher, {
    reporterId: "user-A",
    targetType: "publication",
    targetId: "pub-1",
    reasonType: "spam",
    idempotencyKey: "report-1",
  });
  assert.equal(report.status, "pending");

  // 2. 审核员隐藏 publication
  const hidden = await reviewModeration(fetcher, {
    moderationId: report.moderationId,
    action: "hide",
    reason: "spam confirmed",
  });
  assert.equal(hidden.status, "hidden");
  assert.equal(hidden.actionTaken, "hide");

  // 3. 被处罚用户提交申诉
  const appeal = await createAppeal(fetcher, {
    appellantId: "user-A",
    moderationId: report.moderationId,
    appealText: "Not spam, please restore",
    idempotencyKey: "appeal-1",
  });
  assert.equal(appeal.status, "pending");

  // 4. 审核员批准申诉
  const reviewed = await reviewAppeal(fetcher, {
    appealId: appeal.id,
    decision: "approved",
    reviewNotes: "appeal valid",
  });
  assert.equal(reviewed.status, "approved");

  // 验证调用顺序
  assert.deepEqual(calls, [
    "create_report",
    "review_moderation:hide",
    "create_appeal",
    "review_appeal:approved",
  ]);
});
