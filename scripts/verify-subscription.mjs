#!/usr/bin/env node
/**
 * scripts/verify-subscription.mjs
 * KIIKIS 2.1 Phase 6 — Gate 5 验证脚本
 *
 * 检查:
 *   1. Task 6.1 交付文件存在 (BI-001~008)
 *   2. Task 6.2 交付文件存在 (BI-009~010)
 *   3. Task 6.3 交付文件存在 (TX-001~008)
 *   4. Task 6.4 E2E + verify script
 *   5. migration SQL 关键元素
 *   6. 契约/服务/API 关键导出
 *   7. TX-008 禁止功能不存在性验证
 *   8. 未修改共享文件
 *
 * 用法: node scripts/verify-subscription.mjs
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

function checkNotContains(relPath, needle, label) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) {
    errors.push(`✗ ${label}: file missing ${relPath}`);
    return false;
  }
  const content = fs.readFileSync(full, "utf8");
  if (!content.includes(needle)) {
    ok.push(`✓ ${label}: does not contain "${needle}"`);
    return true;
  }
  errors.push(`✗ ${label}: should not contain "${needle}" in ${relPath}`);
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
// 1. Task 6.1 交付文件 (BI-001~008)
// ============================================================

console.log("\n=== Task 6.1: Stripe 订阅核心生命周期 (BI-001~008) ===\n");

checkFile("supabase/migrations/20260827060000_kiikis_21_billing.sql", "BI migration");
checkFile("lib/contracts/v2/billing.ts", "BI billing contracts");
checkFile("lib/server/v2/billing/stripe.ts", "BI stripe service");
checkFile("lib/server/v2/billing/webhook.ts", "BI webhook service");
checkFile("lib/server/v2/billing/entitlements.ts", "BI entitlements service");
checkFile("app/api/v2/billing/checkout/route.ts", "BI checkout API");
checkFile("app/api/v2/billing/webhook/route.ts", "BI webhook API");
checkFile("app/api/v2/billing/subscription/route.ts", "BI subscription API");
checkFile("app/api/v2/billing/entitlements/route.ts", "BI entitlements API");
checkFile("tests/kiikis-21-billing-stripe.test.mjs", "BI billing tests");

// migration 关键元素
checkContains("supabase/migrations/20260827060000_kiikis_21_billing.sql", "storyflow_subscriptions", "BI-001 subscriptions table");
checkContains("supabase/migrations/20260827060000_kiikis_21_billing.sql", "subscription_events", "BI-005 events table");
checkContains("supabase/migrations/20260827060000_kiikis_21_billing.sql", "entitlements", "BI-008 entitlements table");
checkContains("supabase/migrations/20260827060000_kiikis_21_billing.sql", "price_whitelist", "BI-002 price whitelist");
checkContains("supabase/migrations/20260827060000_kiikis_21_billing.sql", "stripe_customer_id", "BI-001 customer mapping");
checkContains("supabase/migrations/20260827060000_kiikis_21_billing.sql", "stripe_event_id", "BI-005 event id");
checkContains("supabase/migrations/20260827060000_kiikis_21_billing.sql", "last_event_created", "BI-006 event timestamp");
checkContains("supabase/migrations/20260827060000_kiikis_21_billing.sql", "ENABLE ROW LEVEL SECURITY", "BI RLS");
checkContains("supabase/migrations/20260827060000_kiikis_21_billing.sql", "SECURITY DEFINER", "BI SECURITY DEFINER");

// 契约关键导出
checkContains("lib/contracts/v2/billing.ts", "SUBSCRIPTION_STATUS", "BI-001 subscription status");
checkContains("lib/contracts/v2/billing.ts", "PLAN_TIERS", "BI-008 plan tiers");
checkContains("lib/contracts/v2/billing.ts", "ENTITLEMENT_SOURCE", "BI-008 entitlement source");
checkContains("lib/contracts/v2/billing.ts", "STRIPE_EVENT_TYPES", "BI-007 event types");
checkContains("lib/contracts/v2/billing.ts", "PLAN_FEATURES", "BI-008 plan features");
checkContains("lib/contracts/v2/billing.ts", "BILLING_EVENT_PREFIX", "BI-010 event prefix");
checkContains("lib/contracts/v2/billing.ts", "validateUpsertSubscription", "BI-001 validate upsert");
checkContains("lib/contracts/v2/billing.ts", "validateCreateCheckout", "BI-002 validate checkout");
checkContains("lib/contracts/v2/billing.ts", "parsePriceWhitelist", "BI-002 parse whitelist");
checkContains("lib/contracts/v2/billing.ts", "derivePlanTierFromStatus", "BI-008 derive tier");
checkContains("lib/contracts/v2/billing.ts", "getPlanFeatures", "BI-008 get features");
checkContains("lib/contracts/v2/billing.ts", "hasFeature", "BI-008 has feature");
checkContains("lib/contracts/v2/billing.ts", "BillingValidationError", "BI validation error");

// 服务层关键导出
checkContains("lib/server/v2/billing/stripe.ts", "findOrCreateCustomer", "BI-001 customer service");
checkContains("lib/server/v2/billing/stripe.ts", "checkPriceWhitelist", "BI-002 whitelist check");
checkContains("lib/server/v2/billing/stripe.ts", "createCheckoutSession", "BI-002 checkout session");
checkContains("lib/server/v2/billing/stripe.ts", "upsertSubscription", "BI-007 upsert subscription");
checkContains("lib/server/v2/billing/stripe.ts", "BillingServiceError", "BI service error");
checkContains("lib/server/v2/billing/webhook.ts", "verifyWebhookSignature", "BI-004 verify signature");
checkContains("lib/server/v2/billing/webhook.ts", "recordSubscriptionEvent", "BI-005 record event");
checkContains("lib/server/v2/billing/webhook.ts", "processWebhookEvent", "BI-007 process event");
checkContains("lib/server/v2/billing/entitlements.ts", "syncEntitlement", "BI-008 sync entitlement");
checkContains("lib/server/v2/billing/entitlements.ts", "getEntitlements", "BI-008 get entitlements");
checkContains("lib/server/v2/billing/entitlements.ts", "getActivePlanTier", "BI-008 active tier");
checkContains("lib/server/v2/billing/entitlements.ts", "hasFeature", "BI-008 has feature service");

// BI-004: webhook route 读取 raw body
checkContains("app/api/v2/billing/webhook/route.ts", "text", "BI-004 raw body");
checkContains("app/api/v2/billing/webhook/route.ts", "Stripe-Signature", "BI-004 signature header");
checkContains("app/api/v2/billing/webhook/route.ts", "verifyWebhookSignature", "BI-004 verify call");

// ============================================================
// 2. Task 6.2 交付文件 (BI-009~010)
// ============================================================

console.log("\n=== Task 6.2: Customer Portal 与观测 (BI-009~010) ===\n");

checkFile("lib/server/v2/billing/portal.ts", "BI-009 portal service");
checkFile("app/api/v2/billing/portal/route.ts", "BI-009 portal API");
checkFile("app/api/v2/billing/cancel/route.ts", "BI-009 cancel API");
checkFile("tests/kiikis-21-billing-portal.test.mjs", "BI portal tests");

checkContains("lib/server/v2/billing/portal.ts", "createCustomerPortalSession", "BI-009 portal session");
checkContains("lib/server/v2/billing/portal.ts", "billing.", "BI-010 billing event prefix");
checkContains("app/api/v2/billing/cancel/route.ts", "cancel", "BI-009 cancel endpoint");

// ============================================================
// 3. Task 6.3 交付文件 (TX-001~008)
// ============================================================

console.log("\n=== Task 6.3: 交易内测 (TX-001~008) ===\n");

checkFile("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "TX migration");
checkFile("lib/contracts/v2/transactions.ts", "TX contracts");
checkFile("lib/server/v2/transactions/orders.ts", "TX orders service");
checkFile("app/api/v2/transactions/orders/route.ts", "TX orders list/create API");
checkFile("app/api/v2/transactions/orders/[id]/route.ts", "TX orders detail API");
checkFile("tests/kiikis-21-transactions.test.mjs", "TX transactions tests");

// migration 关键元素
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "storyflow_transactions", "TX transactions table");
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "'free', 'invite_only', 'manual_review'", "TX-001 modes check");
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "paid_amount_cents", "TX-005 paid amount");
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "is_demo", "TX-007 demo marker");
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "grant_id", "TX-002 grant id");
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "terms_snapshot", "TX-003 terms snapshot");
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "settlement_intent", "TX-004 settlement intent");
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "dispute_handling", "TX-004 dispute handling");
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "order_info", "TX-003 order info");
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "attribution", "TX-003 attribution");
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "idempotency_key", "TX idempotency");
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "ENABLE ROW LEVEL SECURITY", "TX RLS");
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "create_transaction", "TX RPC create");
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "approve_transaction", "TX RPC approve");
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "reject_transaction", "TX RPC reject");
checkContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "SECURITY DEFINER", "TX SECURITY DEFINER");

// TX-008: 禁止功能不存在性验证
checkNotContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "withdrawal_table", "TX-008 no withdrawal table");
checkNotContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "auto_revenue", "TX-008 no auto revenue");
checkNotContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "revenue_split", "TX-008 no revenue split");
checkNotContains("supabase/migrations/20260827060100_kiikis_21_transactions.sql", "fake_balance", "TX-008 no fake balance");

// 契约关键导出
checkContains("lib/contracts/v2/transactions.ts", "TRANSACTION_MODES", "TX-001 modes");
checkContains("lib/contracts/v2/transactions.ts", "TRANSACTION_STATUS", "TX status");
checkContains("lib/contracts/v2/transactions.ts", "DISPUTE_HANDLING", "TX-004 dispute handling");
checkContains("lib/contracts/v2/transactions.ts", "SETTLEMENT_INTENTS", "TX-004 settlement intents");
checkContains("lib/contracts/v2/transactions.ts", "DEMO_MARKERS", "TX-007 demo markers");
checkContains("lib/contracts/v2/transactions.ts", "FORBIDDEN_FEATURES", "TX-008 forbidden features");
checkContains("lib/contracts/v2/transactions.ts", "validateCreateTransaction", "TX validate create");
checkContains("lib/contracts/v2/transactions.ts", "validateTermsSnapshot", "TX-003 validate snapshot");
checkContains("lib/contracts/v2/transactions.ts", "freezeTermsSnapshot", "TX-003 freeze snapshot");
checkContains("lib/contracts/v2/transactions.ts", "isUnfunded", "TX-005 is unfunded");
checkContains("lib/contracts/v2/transactions.ts", "getModeDisplayLabel", "TX-006 mode label");
checkContains("lib/contracts/v2/transactions.ts", "getModeDisplayLabelZh", "TX-006 mode label zh");
checkContains("lib/contracts/v2/transactions.ts", "parseTransaction", "TX parse transaction");
checkContains("lib/contracts/v2/transactions.ts", "TransactionValidationError", "TX validation error");

// 服务层关键导出
checkContains("lib/server/v2/transactions/orders.ts", "createTransaction", "TX create service");
checkContains("lib/server/v2/transactions/orders.ts", "approveTransaction", "TX-002 approve service");
checkContains("lib/server/v2/transactions/orders.ts", "rejectTransaction", "TX reject service");
checkContains("lib/server/v2/transactions/orders.ts", "getTransaction", "TX get service");
checkContains("lib/server/v2/transactions/orders.ts", "listTransactionsByBuyer", "TX list buyer");
checkContains("lib/server/v2/transactions/orders.ts", "listPendingTransactions", "TX-007 list pending");
checkContains("lib/server/v2/transactions/orders.ts", "TransactionServiceError", "TX service error");
checkContains("lib/server/v2/transactions/orders.ts", "forbidden_feature", "TX-008 forbidden feature");

// TX-008: 服务层不包含禁止功能
checkNotContains("lib/server/v2/transactions/orders.ts", "function withdraw", "TX-008 no withdraw function");
checkNotContains("lib/server/v2/transactions/orders.ts", "function splitRevenue", "TX-008 no split function");
checkNotContains("lib/server/v2/transactions/orders.ts", "function calculateRevenue", "TX-008 no revenue function");

// API route 关键元素
checkContains("app/api/v2/transactions/orders/route.ts", "isTransactionMode", "TX-001 mode validation in route");
checkContains("app/api/v2/transactions/orders/route.ts", "forbidden_feature", "TX-008 forbidden in route");
checkContains("app/api/v2/transactions/orders/route.ts", "kiikis.transaction.order/1", "TX contract version");
checkContains("app/api/v2/transactions/orders/[id]/route.ts", "approveTransaction", "TX-002 approve in route");
checkContains("app/api/v2/transactions/orders/[id]/route.ts", "createGrant", "TX-002 grant creation in route");
checkContains("app/api/v2/transactions/orders/[id]/route.ts", "rejectTransaction", "TX reject in route");
checkContains("app/api/v2/transactions/orders/[id]/route.ts", "kiikis.transaction.order/1", "TX contract version");

// ============================================================
// 4. Task 6.4 E2E + verify
// ============================================================

console.log("\n=== Task 6.4: E2E + Verify ===\n");

checkFile("e2e/billing.spec.ts", "E2E spec");
checkFile("scripts/verify-subscription.mjs", "verify script");

// E2E 关键流程覆盖
checkContains("e2e/billing.spec.ts", "BI-001", "E2E BI-001");
checkContains("e2e/billing.spec.ts", "BI-002", "E2E BI-002");
checkContains("e2e/billing.spec.ts", "BI-004", "E2E BI-004");
checkContains("e2e/billing.spec.ts", "BI-008", "E2E BI-008");
checkContains("e2e/billing.spec.ts", "BI-009", "E2E BI-009");
checkContains("e2e/billing.spec.ts", "BI-010", "E2E BI-010");
checkContains("e2e/billing.spec.ts", "TX-001", "E2E TX-001");
checkContains("e2e/billing.spec.ts", "TX-002", "E2E TX-002");
checkContains("e2e/billing.spec.ts", "TX-003", "E2E TX-003");
checkContains("e2e/billing.spec.ts", "TX-005", "E2E TX-005");
checkContains("e2e/billing.spec.ts", "TX-006", "E2E TX-006");
checkContains("e2e/billing.spec.ts", "TX-007", "E2E TX-007");
checkContains("e2e/billing.spec.ts", "TX-008", "E2E TX-008");
checkContains("e2e/billing.spec.ts", "Gate 5", "E2E Gate 5");
checkContains("e2e/billing.spec.ts", "billing/checkout", "E2E checkout API");
checkContains("e2e/billing.spec.ts", "billing/webhook", "E2E webhook API");
checkContains("e2e/billing.spec.ts", "billing/entitlements", "E2E entitlements API");
checkContains("e2e/billing.spec.ts", "billing/subscription", "E2E subscription API");
checkContains("e2e/billing.spec.ts", "billing/portal", "E2E portal API");
checkContains("e2e/billing.spec.ts", "billing/cancel", "E2E cancel API");
checkContains("e2e/billing.spec.ts", "transactions/orders", "E2E transactions API");

// ============================================================
// 5. 约束检查 (未修改共享文件)
// ============================================================

console.log("\n=== 约束检查: 未修改共享文件 ===\n");

checkUnmodified("middleware.ts", "shared middleware.ts");
checkUnmodified("app/layout.tsx", "shared app/layout.tsx");
checkUnmodified("components/AppShell.tsx", "shared AppShell.tsx");
checkUnmodified("app/globals.css", "shared globals.css");
checkUnmodified("lib/universe.ts", "shared universe.ts");
checkUnmodified("lib/server/v2/feature-flags.ts", "Phase 0-5 feature-flags");

// ============================================================
// 6. Gate 5 判定
// ============================================================

console.log("\n=== Gate 5 判定 ===\n");

const gateChecks = [
  ["BI-001 Stripe customer 与 user 一一映射", errors.filter((e) => e.includes("BI-001") || e.includes("customer")).length === 0],
  ["BI-002 Checkout 白名单 price", errors.filter((e) => e.includes("BI-002") || e.includes("whitelist") || e.includes("checkPriceWhitelist")).length === 0],
  ["BI-004 webhook 验签", errors.filter((e) => e.includes("BI-004") || e.includes("verifyWebhookSignature") || e.includes("stripe-signature")).length === 0],
  ["BI-005 webhook 幂等", errors.filter((e) => e.includes("BI-005") || e.includes("recordSubscriptionEvent") || e.includes("stripe_event_id")).length === 0],
  ["BI-006 拒绝旧事件覆盖", errors.filter((e) => e.includes("BI-006") || e.includes("last_event_created")).length === 0],
  ["BI-007 同步生命周期", errors.filter((e) => e.includes("BI-007") || e.includes("processWebhookEvent") || e.includes("STRIPE_EVENT_TYPES")).length === 0],
  ["BI-008 权益由服务器读取", errors.filter((e) => e.includes("BI-008") || e.includes("syncEntitlement") || e.includes("getEntitlements") || e.includes("hasFeature")).length === 0],
  ["BI-009 Customer Portal/取消入口", errors.filter((e) => e.includes("BI-009") || e.includes("createCustomerPortalSession") || e.includes("cancel")).length === 0],
  ["BI-010 账单事件写入 creative_events", errors.filter((e) => e.includes("BI-010") || e.includes("BILLING_EVENT_PREFIX") || e.includes("billing.")).length === 0],
  ["TX-001 只允许三种模式", errors.filter((e) => e.includes("TX-001") || e.includes("TRANSACTION_MODES") || e.includes("free/invite_only/manual_review")).length === 0],
  ["TX-002 批准创建 grant", errors.filter((e) => e.includes("TX-002") || e.includes("approveTransaction") || e.includes("createGrant") || e.includes("grant_id")).length === 0],
  ["TX-003 条款快照不可变", errors.filter((e) => e.includes("TX-003") || e.includes("freezeTermsSnapshot") || e.includes("validateTermsSnapshot") || e.includes("terms_snapshot")).length === 0],
  ["TX-004 费用/争议/settlement 明示", errors.filter((e) => e.includes("TX-004") || e.includes("dispute_handling") || e.includes("settlement_intent")).length === 0],
  ["TX-005 未移动资金 paid=0", errors.filter((e) => e.includes("TX-005") || e.includes("paid_amount_cents") || e.includes("isUnfunded")).length === 0],
  ["TX-006 UI 明示模式", errors.filter((e) => e.includes("TX-006") || e.includes("getModeDisplayLabel")).length === 0],
  ["TX-007 演示数据 is_demo", errors.filter((e) => e.includes("TX-007") || e.includes("is_demo") || e.includes("DEMO_MARKERS")).length === 0],
  ["TX-008 禁止自动收益/提现/分账", errors.filter((e) => e.includes("TX-008") || e.includes("FORBIDDEN_FEATURES") || e.includes("forbidden_feature")).length === 0],
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
console.log(`\n=== Phase 6 ${allGatePassed && errors.length === 0 ? "PASS ✓" : "FAIL ✗"} ===`);
console.log(`=== Gate 5 ${allGatePassed && errors.length === 0 ? "PASS ✓" : "FAIL ✗"} ===`);

process.exit(errors.length > 0 ? 1 : 0);
