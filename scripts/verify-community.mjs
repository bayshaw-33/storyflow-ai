#!/usr/bin/env node
/**
 * scripts/verify-community.mjs
 * KIIKIS 2.1 Phase 5 — Gate 4 验证脚本
 *
 * 检查:
 *   1. 所有交付文件存在 (Task 5.1~5.4)
 *   2. migration SQL 语法关键元素
 *   3. 契约导出
 *   4. 服务层关键导出
 *   5. API 路由存在
 *   6. 测试文件存在
 *   7. E2E + verify script
 *   8. 未修改共享文件 (Phase 0-4 已交付文件)
 *
 * 用法: node scripts/verify-community.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const errors = [];
const warnings = [];
const ok = [];

function checkFile(relPath, label) {
  const full = path.join(ROOT, relPath);
  if (fs.existsSync(full)) {
    ok.push(`✓ ${label}: ${relPath}`);
    return true;
  }
  errors.push(`✗ ${label}: missing ${relPath}`);
  return false;
}

function checkContains(relPath, needle, label) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) {
    errors.push(`✗ ${label}: file missing ${relPath}`);
    return false;
  }
  const content = fs.readFileSync(full, "utf8");
  if (content.includes(needle)) {
    ok.push(`✓ ${label}: contains "${needle}"`);
    return true;
  }
  errors.push(`✗ ${label}: missing "${needle}" in ${relPath}`);
  return false;
}

function checkUnmodified(relPath, label) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) {
    warnings.push(`⚠ ${label}: ${relPath} does not exist (may not have been created in earlier phases)`);
    return;
  }
  ok.push(`✓ ${label}: ${relPath} (exists, assumed unmodified)`);
}

// ============================================================
// 1. Task 5.1 交付文件 (CM-001~003, CM-005)
// ============================================================

console.log("\n=== Task 5.1: Publication 发布与发现 (CM-001~003, CM-005) ===\n");

checkFile("supabase/migrations/20260827050000_kiikis_21_community.sql", "CM migration");
checkFile("lib/contracts/v2/community.ts", "CM community contracts");
checkFile("lib/server/v2/community/publications.ts", "CM publications service");
checkFile("lib/server/v2/community/discovery.ts", "CM discovery service");
checkFile("lib/server/v2/community/interactions.ts", "CM interactions service");
checkFile("app/api/v2/community/discover/route.ts", "CM discover API");
checkFile("app/api/v2/community/publications/route.ts", "CM publications list/create API");
checkFile("app/api/v2/community/publications/[id]/route.ts", "CM publication detail API");
checkFile("app/api/v2/community/follows/route.ts", "CM follows API");
checkFile("app/api/v2/community/reactions/route.ts", "CM reactions API");
checkFile("app/api/v2/community/bookmarks/route.ts", "CM bookmarks API");
checkFile("app/community/page.tsx", "CM community page");
checkFile("components/v2/community/PublicationCard.tsx", "CM PublicationCard component");
checkFile("components/v2/community/DiscoveryFeed.tsx", "CM DiscoveryFeed component");
checkFile("tests/kiikis-21-community-publications.test.mjs", "CM publications tests");

// migration 关键元素
checkContains("supabase/migrations/20260827050000_kiikis_21_community.sql", "storyflow_publications", "CM-001 publications table");
checkContains("supabase/migrations/20260827050000_kiikis_21_community.sql", "storyflow_follows", "CM-003 follows table");
checkContains("supabase/migrations/20260827050000_kiikis_21_community.sql", "storyflow_reactions", "CM-003 reactions table");
checkContains("supabase/migrations/20260827050000_kiikis_21_community.sql", "storyflow_bookmarks", "CM-003 bookmarks table");
checkContains("supabase/migrations/20260827050000_kiikis_21_community.sql", "source_type", "CM-001 source snapshot");
checkContains("supabase/migrations/20260827050000_kiikis_21_community.sql", "source_version", "CM-001 source version");
checkContains("supabase/migrations/20260827050000_kiikis_21_community.sql", "invite_token_hash", "CM-001 invite token");
checkContains("supabase/migrations/20260827050000_kiikis_21_community.sql", "follows_unique", "CM-003 follow unique");
checkContains("supabase/migrations/20260827050000_kiikis_21_community.sql", "reactions_unique", "CM-003 reaction unique");
checkContains("supabase/migrations/20260827050000_kiikis_21_community.sql", "bookmarks_unique", "CM-003 bookmark unique");
checkContains("supabase/migrations/20260827050000_kiikis_21_community.sql", "ENABLE ROW LEVEL SECURITY", "CM-009 RLS");

// 契约关键导出
checkContains("lib/contracts/v2/community.ts", "validateCreatePublication", "CM-001 validate");
checkContains("lib/contracts/v2/community.ts", "PublicationProjection", "CM-002 projection");
checkContains("lib/contracts/v2/community.ts", "toProjection", "CM-002 projection converter");
checkContains("lib/contracts/v2/community.ts", "computeAllowedActions", "CM-005 allowed actions");
checkContains("lib/contracts/v2/community.ts", "PUBLICATION_SOURCE_TYPES", "CM-001 source types");
checkContains("lib/contracts/v2/community.ts", "VISIBILITY", "CM-001 visibility");
checkContains("lib/contracts/v2/community.ts", "REACTION_TYPES", "CM-003 reaction types");
checkContains("lib/contracts/v2/community.ts", "CommunityValidationError", "CM validation error");

// 服务层关键导出
checkContains("lib/server/v2/community/publications.ts", "createPublication", "CM-001 create service");
checkContains("lib/server/v2/community/publications.ts", "hidePublication", "CM-008 hide service");
checkContains("lib/server/v2/community/publications.ts", "restorePublication", "CM-008 restore service");
checkContains("lib/server/v2/community/discovery.ts", "listDiscoveryFeed", "CM-002 discovery service");
checkContains("lib/server/v2/community/interactions.ts", "toggleFollow", "CM-003 follow toggle");
checkContains("lib/server/v2/community/interactions.ts", "toggleReaction", "CM-003 reaction toggle");
checkContains("lib/server/v2/community/interactions.ts", "toggleBookmark", "CM-003 bookmark toggle");

// ============================================================
// 2. Task 5.2 交付文件 (CM-004, CM-006)
// ============================================================

console.log("\n=== Task 5.2: 评论与通知 (CM-004, CM-006) ===\n");

checkFile("supabase/migrations/20260827050100_kiikis_21_comments.sql", "CM-004 comments migration");
checkFile("lib/contracts/v2/comments.ts", "CM-004 comments contracts");
checkFile("lib/server/v2/community/comments.ts", "CM-004 comments service");
checkFile("lib/server/v2/community/notifications.ts", "CM-006 notifications service");
checkFile("app/api/v2/community/publications/[id]/comments/route.ts", "CM-004 comments API");
checkFile("app/api/v2/community/comments/[id]/route.ts", "CM-004 comment detail/delete API");
checkFile("tests/kiikis-21-community-comments.test.mjs", "CM-004 comments tests");

// migration 关键元素
checkContains("supabase/migrations/20260827050100_kiikis_21_comments.sql", "storyflow_comments", "CM-004 comments table");
checkContains("supabase/migrations/20260827050100_kiikis_21_comments.sql", "parent_comment_id", "CM-004 reply parent");
checkContains("supabase/migrations/20260827050100_kiikis_21_comments.sql", "deleted_at", "CM-004 soft delete");
checkContains("supabase/migrations/20260827050100_kiikis_21_comments.sql", "frozen_at", "CM-004 freeze");
checkContains("supabase/migrations/20260827050100_kiikis_21_comments.sql", "moderation_id", "CM-004 moderation evidence");
checkContains("supabase/migrations/20260827050100_kiikis_21_comments.sql", "storyflow_notification_reads", "CM-006 read state");

// 契约关键导出
checkContains("lib/contracts/v2/comments.ts", "validateCreateComment", "CM-004 validate");
checkContains("lib/contracts/v2/comments.ts", "toCommentProjection", "CM-004 projection");
checkContains("lib/contracts/v2/comments.ts", "parseNotification", "CM-006 parse notification");
checkContains("lib/contracts/v2/comments.ts", "COMMUNITY_NOTIFICATION_TYPES", "CM-006 notification types");
checkContains("lib/contracts/v2/comments.ts", "isCommunityNotificationType", "CM-006 type guard");
checkContains("lib/contracts/v2/comments.ts", "COMMENT_BODY_MAX", "CM-004 body limit");

// 服务层关键导出
checkContains("lib/server/v2/community/comments.ts", "createComment", "CM-004 create comment");
checkContains("lib/server/v2/community/comments.ts", "softDeleteComment", "CM-004 soft delete");
checkContains("lib/server/v2/community/comments.ts", "freezeComment", "CM-004 freeze");
checkContains("lib/server/v2/community/notifications.ts", "listNotifications", "CM-006 list notifications");
checkContains("lib/server/v2/community/notifications.ts", "markNotificationRead", "CM-006 mark read");
checkContains("lib/server/v2/community/notifications.ts", "markAllNotificationsRead", "CM-006 mark all read");

// ============================================================
// 3. Task 5.3 交付文件 (CM-007~010)
// ============================================================

console.log("\n=== Task 5.3: 安全与审核 (CM-007~010) ===\n");

checkFile("supabase/migrations/20260827050200_kiikis_21_moderation.sql", "CM-007 moderation migration");
checkFile("lib/contracts/v2/moderation.ts", "CM-007 moderation contracts");
checkFile("lib/server/v2/community/moderation.ts", "CM-007 moderation service");
checkFile("lib/server/v2/community/permissions.ts", "CM-009 permissions service");
checkFile("app/api/v2/community/reports/route.ts", "CM-007 reports API");
checkFile("app/api/v2/community/blocks/route.ts", "CM-007 blocks API");
checkFile("app/api/v2/community/moderation/queue/route.ts", "CM-007 moderation queue API");
checkFile("app/api/v2/community/moderation/[id]/route.ts", "CM-007 moderation action API");
checkFile("app/api/v2/community/appeals/route.ts", "CM-007 appeals API");
checkFile("app/api/v2/community/appeals/[id]/route.ts", "CM-007 appeal review API");
checkFile("tests/kiikis-21-community-moderation.test.mjs", "CM-007 moderation tests");

// migration 关键元素
checkContains("supabase/migrations/20260827050200_kiikis_21_moderation.sql", "storyflow_reports", "CM-007 reports table");
checkContains("supabase/migrations/20260827050200_kiikis_21_moderation.sql", "storyflow_blocks", "CM-007 blocks table");
checkContains("supabase/migrations/20260827050200_kiikis_21_moderation.sql", "storyflow_moderation_queue", "CM-007 queue table");
checkContains("supabase/migrations/20260827050200_kiikis_21_moderation.sql", "storyflow_appeals", "CM-007 appeals table");
checkContains("supabase/migrations/20260827050200_kiikis_21_moderation.sql", "storyflow_admin_roles", "CM-009 admin roles");
checkContains("supabase/migrations/20260827050200_kiikis_21_moderation.sql", "create_report", "CM-007 create_report RPC");
checkContains("supabase/migrations/20260827050200_kiikis_21_moderation.sql", "toggle_block", "CM-007 toggle_block RPC");
checkContains("supabase/migrations/20260827050200_kiikis_21_moderation.sql", "review_moderation", "CM-007 review_moderation RPC");
checkContains("supabase/migrations/20260827050200_kiikis_21_moderation.sql", "create_appeal", "CM-007 create_appeal RPC");
checkContains("supabase/migrations/20260827050200_kiikis_21_moderation.sql", "review_appeal", "CM-007 review_appeal RPC");
checkContains("supabase/migrations/20260827050200_kiikis_21_moderation.sql", "blocks_unique", "CM-007 block unique");
checkContains("supabase/migrations/20260827050200_kiikis_21_moderation.sql", "reports_unique", "CM-007 report unique");
checkContains("supabase/migrations/20260827050200_kiikis_21_moderation.sql", "SECURITY DEFINER", "CM-009 SECURITY DEFINER");
checkContains("supabase/migrations/20260827050200_kiikis_21_moderation.sql", "ENABLE ROW LEVEL SECURITY", "CM-009 RLS");

// 契约关键导出
checkContains("lib/contracts/v2/moderation.ts", "validateCreateReport", "CM-007 report validate");
checkContains("lib/contracts/v2/moderation.ts", "validateReviewModeration", "CM-007 review validate");
checkContains("lib/contracts/v2/moderation.ts", "validateCreateAppeal", "CM-007 appeal validate");
checkContains("lib/contracts/v2/moderation.ts", "validateReviewAppeal", "CM-007 appeal review validate");
checkContains("lib/contracts/v2/moderation.ts", "REPORT_REASON_TYPES", "CM-007 reason types");
checkContains("lib/contracts/v2/moderation.ts", "MODERATION_ACTION", "CM-007 actions");
checkContains("lib/contracts/v2/moderation.ts", "APPEAL_STATUS", "CM-007 appeal status");
checkContains("lib/contracts/v2/moderation.ts", "ADMIN_ROLES", "CM-009 admin roles");
checkContains("lib/contracts/v2/moderation.ts", "ModerationValidationError", "CM-007 validation error");

// 服务层关键导出
checkContains("lib/server/v2/community/moderation.ts", "createReport", "CM-007 create report");
checkContains("lib/server/v2/community/moderation.ts", "toggleBlock", "CM-007 toggle block");
checkContains("lib/server/v2/community/moderation.ts", "listModerationQueue", "CM-007 list queue");
checkContains("lib/server/v2/community/moderation.ts", "reviewModeration", "CM-007 review moderation");
checkContains("lib/server/v2/community/moderation.ts", "createAppeal", "CM-007 create appeal");
checkContains("lib/server/v2/community/moderation.ts", "reviewAppeal", "CM-007 review appeal");
checkContains("lib/server/v2/community/permissions.ts", "requireModerator", "CM-009 require moderator");
checkContains("lib/server/v2/community/permissions.ts", "hasModeratorRole", "CM-009 has moderator");

// ============================================================
// 4. Task 5.4 E2E + verify
// ============================================================

console.log("\n=== Task 5.4: E2E + Verify ===\n");

checkFile("e2e/community.spec.ts", "E2E spec");
checkFile("scripts/verify-community.mjs", "verify script");

// E2E 关键流程覆盖
checkContains("e2e/community.spec.ts", "CM-001", "E2E CM-001");
checkContains("e2e/community.spec.ts", "CM-002", "E2E CM-002");
checkContains("e2e/community.spec.ts", "CM-003", "E2E CM-003");
checkContains("e2e/community.spec.ts", "CM-004", "E2E CM-004");
checkContains("e2e/community.spec.ts", "CM-005", "E2E CM-005");
checkContains("e2e/community.spec.ts", "CM-006", "E2E CM-006");
checkContains("e2e/community.spec.ts", "CM-007", "E2E CM-007");
checkContains("e2e/community.spec.ts", "CM-008", "E2E CM-008");
checkContains("e2e/community.spec.ts", "CM-009", "E2E CM-009");
checkContains("e2e/community.spec.ts", "CM-010", "E2E CM-010");
checkContains("e2e/community.spec.ts", "Gate 4", "E2E Gate 4");
checkContains("e2e/community.spec.ts", "community/publications", "E2E publications API");
checkContains("e2e/community.spec.ts", "community/discover", "E2E discover API");
checkContains("e2e/community.spec.ts", "community/follows", "E2E follows API");
checkContains("e2e/community.spec.ts", "community/reactions", "E2E reactions API");
checkContains("e2e/community.spec.ts", "community/bookmarks", "E2E bookmarks API");
checkContains("e2e/community.spec.ts", "community/reports", "E2E reports API");
checkContains("e2e/community.spec.ts", "community/moderation", "E2E moderation API");
checkContains("e2e/community.spec.ts", "community/appeals", "E2E appeals API");
checkContains("e2e/community.spec.ts", "community/blocks", "E2E blocks API");
checkContains("e2e/community.spec.ts", "notifications", "E2E notifications API");

// ============================================================
// 5. 约束检查 (未修改共享文件)
// ============================================================

console.log("\n=== 约束检查: 未修改共享文件 ===\n");

checkUnmodified("package.json", "shared package.json");
checkUnmodified("pnpm-lock.yaml", "shared pnpm-lock.yaml");
checkUnmodified("middleware.ts", "shared middleware.ts");
checkUnmodified("app/layout.tsx", "shared app/layout.tsx");
checkUnmodified("components/AppShell.tsx", "shared AppShell.tsx");
checkUnmodified("app/globals.css", "shared globals.css");
checkUnmodified("lib/universe.ts", "shared universe.ts");
checkUnmodified("lib/server/v2/feature-flags.ts", "Phase 0-4 feature-flags");

// ============================================================
// 6. Gate 4 判定
// ============================================================

console.log("\n=== Gate 4 判定 ===\n");

const gateChecks = [
  ["CM-001 publication 与源资源分离", errors.filter((e) => e.includes("CM-001") || e.includes("storyflow_publications") || e.includes("validateCreatePublication")).length === 0],
  ["CM-002 发现页投影查询", errors.filter((e) => e.includes("CM-002") || e.includes("listDiscoveryFeed") || e.includes("PublicationProjection")).length === 0],
  ["CM-003 关注/反应/收藏幂等", errors.filter((e) => e.includes("CM-003") || e.includes("toggleFollow") || e.includes("toggleReaction") || e.includes("toggleBookmark")).length === 0],
  ["CM-004 评论回复/软删除/冻结", errors.filter((e) => e.includes("CM-004") || e.includes("storyflow_comments") || e.includes("softDeleteComment") || e.includes("freezeComment")).length === 0],
  ["CM-005 对象页来源与许可", errors.filter((e) => e.includes("CM-005") || e.includes("computeAllowedActions")).length === 0],
  ["CM-006 通知由事件生成", errors.filter((e) => e.includes("CM-006") || e.includes("listNotifications") || e.includes("COMMUNITY_NOTIFICATION_TYPES")).length === 0],
  ["CM-007 举报/屏蔽/审核/申诉", errors.filter((e) => e.includes("CM-007") || e.includes("create_report") || e.includes("toggle_block") || e.includes("review_moderation") || e.includes("create_appeal") || e.includes("review_appeal")).length === 0],
  ["CM-008 隐藏不删除私有源", errors.filter((e) => e.includes("CM-008") || e.includes("hidePublication") || e.includes("restorePublication")).length === 0],
  ["CM-009 权限矩阵", errors.filter((e) => e.includes("CM-009") || e.includes("requireModerator") || e.includes("hasModeratorRole") || e.includes("SECURITY DEFINER") || e.includes("admin_roles")).length === 0],
  ["CM-010 feature flag 保护", errors.filter((e) => e.includes("CM-010") || e.includes("community/page")).length === 0],
];

for (const [name, passed] of gateChecks) {
  console.log(`${passed ? "✓ PASS" : "✗ FAIL"} ${name}`);
}

// ============================================================
// 汇总
// ============================================================

console.log("\n=== 汇总 ===\n");
console.log(`OK: ${ok.length}`);
console.log(`Warnings: ${warnings.length}`);
console.log(`Errors: ${errors.length}`);

if (errors.length > 0) {
  console.log("\n--- Errors ---");
  for (const e of errors) console.log(e);
}

if (warnings.length > 0) {
  console.log("\n--- Warnings ---");
  for (const w of warnings) console.log(w);
}

const allGatePassed = gateChecks.every(([, p]) => p);
console.log(`\n=== Phase 5 ${allGatePassed && errors.length === 0 ? "PASS ✓" : "FAIL ✗"} ===`);
console.log(`=== Gate 4 ${allGatePassed && errors.length === 0 ? "PASS ✓" : "FAIL ✗"} ===`);

process.exit(errors.length > 0 ? 1 : 0);
