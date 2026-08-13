/**
 * tests/kiikis-21-runtime-mode.test.mjs
 * K21-FF-001..003: feature flag fail-closed、fixture 防泄漏、release audit
 */
import assert from "node:assert/strict";
import test from "node:test";

const {
  parseKiikis21Flags,
  isProductionLike,
  DEFAULT_KIIKIS21_FLAGS,
} = await import("../lib/server/v2/feature-flags.ts");

const {
  detectRuntimeMode,
  isFixtureAllowed,
  shouldShowFixtureBadge,
} = await import("../lib/client/v2/runtime-mode.ts");

const {
  auditRuntime,
  AUDIT_RULES,
} = await import("../scripts/audit-kiikis-21-runtime.mjs");

// ============================================================
// K21-FF-001: feature flag 默认 fail closed
// ============================================================

test("K21-FF-001: 所有 flag 默认 false (fail closed)", () => {
  assert.equal(DEFAULT_KIIKIS21_FLAGS.kkRealtime, false);
  assert.equal(DEFAULT_KIIKIS21_FLAGS.kkAppearance, false);
  assert.equal(DEFAULT_KIIKIS21_FLAGS.resourceGrants, false);
  assert.equal(DEFAULT_KIIKIS21_FLAGS.communityBeta, false);
  assert.equal(DEFAULT_KIIKIS21_FLAGS.billingLifecycle, false);
});

test("K21-FF-001: production 环境未显式启用时全部 false (fail closed)", () => {
  const flags = parseKiikis21Flags({
    NODE_ENV: "production",
    NEXT_PUBLIC_SITE_URL: "https://kiikis.com",
  });
  assert.equal(flags.kkRealtime, false);
  assert.equal(flags.kkAppearance, false);
  assert.equal(flags.resourceGrants, false);
  assert.equal(flags.communityBeta, false);
  assert.equal(flags.billingLifecycle, false);
});

test("K21-FF-001: staging 环境同样 fail closed", () => {
  const flags = parseKiikis21Flags({
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
  });
  // staging (VERCEL_ENV=preview) 同样默认关闭
  assert.equal(flags.kkRealtime, false);
  assert.equal(flags.billingLifecycle, false);
});

test("K21-FF-001: 显式 KIIKIS21_FF_*_ENABLED=true 才启用 (production)", () => {
  const flags = parseKiikis21Flags({
    NODE_ENV: "production",
    KIIKIS21_FF_KK_REALTIME_ENABLED: "true",
    KIIKIS21_FF_BILLING_LIFECYCLE_ENABLED: "true",
  });
  assert.equal(flags.kkRealtime, true);
  assert.equal(flags.billingLifecycle, true);
  // 未显式启用的仍 false
  assert.equal(flags.kkAppearance, false);
  assert.equal(flags.resourceGrants, false);
  assert.equal(flags.communityBeta, false);
});

test("K21-FF-001: 显式 KIIKIS21_FF_*_ENABLED=false 即使 production 也关闭", () => {
  const flags = parseKiikis21Flags({
    NODE_ENV: "production",
    KIIKIS21_FF_KK_REALTIME_ENABLED: "false",
  });
  assert.equal(flags.kkRealtime, false);
});

test("K21-FF-001: 开发环境默认全部启用 (便于本地验证)", () => {
  const flags = parseKiikis21Flags({
    NODE_ENV: "development",
  });
  assert.equal(flags.kkRealtime, true);
  assert.equal(flags.kkAppearance, true);
  assert.equal(flags.resourceGrants, true);
  assert.equal(flags.communityBeta, true);
  assert.equal(flags.billingLifecycle, true);
});

test("K21-FF-001: 开发环境显式 false 可关闭单个 flag", () => {
  const flags = parseKiikis21Flags({
    NODE_ENV: "development",
    KIIKIS21_FF_BILLING_LIFECYCLE_ENABLED: "false",
  });
  assert.equal(flags.billingLifecycle, false);
  assert.equal(flags.kkRealtime, true);
});

test("isProductionLike: production 和 staging 都视为 production-like", () => {
  assert.equal(isProductionLike({ NODE_ENV: "production" }), true);
  assert.equal(isProductionLike({ NODE_ENV: "production", VERCEL_ENV: "preview" }), true);
  assert.equal(isProductionLike({ NODE_ENV: "development" }), false);
  assert.equal(isProductionLike({ NODE_ENV: "test" }), false);
});

// ============================================================
// K21-FF-002: fixture 只能在开发/预览显式启用并标记
// ============================================================

test("K21-FF-002: detectRuntimeMode 返回 development/preview/production", () => {
  assert.equal(detectRuntimeMode({ NODE_ENV: "development" }), "development");
  assert.equal(
    detectRuntimeMode({ NODE_ENV: "production", VERCEL_ENV: "preview" }),
    "preview"
  );
  assert.equal(
    detectRuntimeMode({ NODE_ENV: "production", VERCEL_ENV: "production" }),
    "production"
  );
});

test("K21-FF-002: isFixtureAllowed 仅在 development/preview 为 true (需显式 env)", () => {
  // development 默认允许
  assert.equal(isFixtureAllowed({ NODE_ENV: "development" }), true);
  // preview 需显式启用
  assert.equal(
    isFixtureAllowed({ NODE_ENV: "production", VERCEL_ENV: "preview" }),
    false
  );
  assert.equal(
    isFixtureAllowed({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_USE_FIXTURE: "true",
    }),
    true
  );
  // production 永远不允许
  assert.equal(
    isFixtureAllowed({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      NEXT_PUBLIC_USE_FIXTURE: "true",
    }),
    false
  );
});

test("K21-FF-002: shouldShowFixtureBadge 在 fixture 启用时返回 true", () => {
  assert.equal(
    shouldShowFixtureBadge({ NODE_ENV: "development" }),
    true
  );
  assert.equal(
    shouldShowFixtureBadge({ NODE_ENV: "production", VERCEL_ENV: "production" }),
    false
  );
  assert.equal(
    shouldShowFixtureBadge({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_USE_FIXTURE: "true",
    }),
    true
  );
});

// ============================================================
// K21-FF-003: release audit 阻止 fixture、缺配置和公开密钥
// ============================================================

test("K21-FF-003: production build 中 NEXT_PUBLIC_USE_FIXTURE=true 触发 violation", () => {
  const result = auditRuntime({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    NEXT_PUBLIC_USE_FIXTURE: "true",
  });
  assert.ok(result.violations.length > 0);
  assert.ok(
    result.violations.some((v) => /fixture/i.test(v.message)),
    "should flag fixture usage in production"
  );
  assert.equal(result.ok, false);
});

test("K21-FF-003: production build 中 NEXT_PUBLIC_USE_DASHBOARD_FIXTURE=true 触发 violation", () => {
  const result = auditRuntime({
    NODE_ENV: "production",
    NEXT_PUBLIC_USE_DASHBOARD_FIXTURE: "true",
  });
  assert.ok(result.violations.some((v) => /fixture/i.test(v.message)));
  assert.equal(result.ok, false);
});

test("K21-FF-003: production build 缺 SUPABASE_URL 触发 violation", () => {
  const result = auditRuntime({
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "fake-key",
  });
  assert.ok(
    result.violations.some((v) => /missing.*supabase/i.test(v.message) || /supabase.*missing/i.test(v.message)),
    "should flag missing supabase config"
  );
  assert.equal(result.ok, false);
});

test("K21-FF-003: SUPABASE_SERVICE_ROLE_KEY 出现在 NEXT_PUBLIC_* 中触发 violation (公开密钥)", () => {
  const result = auditRuntime({
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon",
    NEXT_PUBLIC_SERVICE_ROLE_KEY: "fake-service-role",
  });
  assert.ok(
    result.violations.some((v) => /service_role|public.*key|exposed/i.test(v.rule)),
    "should flag exposed service role key"
  );
});

test("K21-FF-003: production build 缺 KIIKIS21 required flags 时只警告不阻塞 (flag 本身 fail closed)", () => {
  const result = auditRuntime({
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role",
  });
  // 应该 ok (无 fixture、无公开密钥、配置齐全)
  assert.equal(result.ok, true);
  // 不应报警缺少 KIIKIS21_FF_* (因为 fail closed 已保证安全)
  assert.ok(
    !result.violations.some((v) => /KIIKIS21_FF_.*_ENABLED/i.test(v.rule))
  );
});

test("K21-FF-003: development 环境不报 fixture violation", () => {
  const result = auditRuntime({
    NODE_ENV: "development",
    NEXT_PUBLIC_USE_FIXTURE: "true",
  });
  assert.ok(
    !result.violations.some((v) => /fixture.*production/i.test(v.rule)),
    "dev fixture usage is allowed"
  );
});

test("K21-FF-003: auditRuntime 返回结构包含 violations 和 ok", () => {
  const result = auditRuntime({ NODE_ENV: "production" });
  assert.ok(Array.isArray(result.violations));
  assert.equal(typeof result.ok, "boolean");
  assert.ok(Array.isArray(result.warnings));
});

test("AUDIT_RULES: 列出所有规则 (可枚举供文档同步)", () => {
  assert.ok(Array.isArray(AUDIT_RULES));
  assert.ok(AUDIT_RULES.length >= 3);
  for (const rule of AUDIT_RULES) {
    assert.ok(rule.id, "rule should have id");
    assert.ok(rule.description, "rule should have description");
  }
});
