#!/usr/bin/env node
/**
 * scripts/audit-kiikis-21-runtime.mjs
 * KIIKIS 2.1 Phase 1 Runtime Audit (K21-FF-003)
 *
 * 检查：
 * 1. production 环境是否泄漏 fixture (NEXT_PUBLIC_USE_*_FIXTURE=true)
 * 2. production 环境是否缺少必需配置 (Supabase URL/keys)
 * 3. 是否在 NEXT_PUBLIC_* 中暴露 service_role key
 * 4. 是否在公开变量中暴露任何敏感密钥模式
 *
 * 用法：
 *   node scripts/audit-kiikis-21-runtime.mjs           # 读 process.env
 *
 * 退出码：0 = 通过, 1 = 有 violation
 */

// ============================================================
// AUDIT_RULES: 供文档与测试枚举
// ============================================================

export const AUDIT_RULES = [
  {
    id: "FF-PROD-001",
    description:
      "production 环境禁止 NEXT_PUBLIC_USE_FIXTURE=true (K21-FF-003)",
  },
  {
    id: "FF-PROD-002",
    description:
      "production 环境禁止 NEXT_PUBLIC_USE_DASHBOARD_FIXTURE=true 等任一 fixture flag",
  },
  {
    id: "CFG-PROD-001",
    description:
      "production 环境必须有 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY",
  },
  {
    id: "CFG-PROD-002",
    description:
      "production 环境必须有 SUPABASE_SERVICE_ROLE_KEY (服务端，非公开)",
  },
  {
    id: "SEC-EXPOSED-001",
    description:
      "NEXT_PUBLIC_SERVICE_ROLE_KEY 不得存在 (service_role 不得进客户端 bundle)",
  },
  {
    id: "SEC-EXPOSED-002",
    description:
      "NEXT_PUBLIC_* 变量值不得包含 'service_role' 字样或服务端密钥模式",
  },
  {
    id: "SEC-EXPOSED-003",
    description:
      "NEXT_PUBLIC_* 不得复用 SUPABASE_SERVICE_ROLE_KEY 的值 (避免密钥复用泄漏)",
  },
];

// ============================================================
// 核心审计函数
// ============================================================

const FIXTURE_FLAG_PATTERNS = [
  "NEXT_PUBLIC_USE_FIXTURE",
  "NEXT_PUBLIC_USE_DASHBOARD_FIXTURE",
  "NEXT_PUBLIC_USE_JOBS_FIXTURE",
  "NEXT_PUBLIC_USE_KK_FIXTURE",
  "NEXT_PUBLIC_USE_UNIVERSE_FIXTURE",
  "NEXT_PUBLIC_USE_MARKETPLACE_FIXTURE",
  "NEXT_PUBLIC_USE_LICENSING_FIXTURE",
  "NEXT_PUBLIC_USE_CREATOR_CENTER_FIXTURE",
  "NEXT_PUBLIC_USE_SHORT_DRAMA_FIXTURE",
  "NEXT_PUBLIC_USE_PROJECT_START_FIXTURE",
  "NEXT_PUBLIC_USE_WORKBENCH_FIXTURE",
  "NEXT_PUBLIC_USE_MODEL_ROUTER_FIXTURE",
  "NEXT_PUBLIC_USE_TASK_CENTER_FIXTURE",
];

function isProductionLike(env) {
  const nodeEnv = String(env.NODE_ENV ?? "").toLowerCase();
  if (nodeEnv === "production") return true;
  const vercelEnv = String(env.VERCEL_ENV ?? "").toLowerCase();
  return vercelEnv === "production" || vercelEnv === "preview";
}

function parseBoolTrue(value) {
  if (!value) return false;
  const v = String(value).trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

/**
 * 执行运行时审计。可被 CLI 和测试调用。
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: boolean, violations: Array, warnings: Array }}
 */
export function auditRuntime(env) {
  const violations = [];
  const warnings = [];

  const prodLike = isProductionLike(env);
  const nodeEnv = String(env.NODE_ENV ?? "").toLowerCase();
  const dev = nodeEnv === "development" || nodeEnv === "test";

  if (prodLike) {
    // FF-PROD-001: NEXT_PUBLIC_USE_FIXTURE
    if (parseBoolTrue(env.NEXT_PUBLIC_USE_FIXTURE)) {
      violations.push({
        rule: "FF-PROD-001",
        severity: "violation",
        message: `NEXT_PUBLIC_USE_FIXTURE=true is forbidden in production-like environment`,
      });
    }

    // FF-PROD-002: 其他 NEXT_PUBLIC_USE_*_FIXTURE
    for (const flag of FIXTURE_FLAG_PATTERNS) {
      if (flag === "NEXT_PUBLIC_USE_FIXTURE") continue;
      if (parseBoolTrue(env[flag])) {
        violations.push({
          rule: "FF-PROD-002",
          severity: "violation",
          message: `${flag}=true is forbidden in production-like environment`,
        });
      }
    }

    // CFG-PROD-001: Supabase 公开配置
    const supabaseUrl = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
    const supabaseAnon = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
    if (!supabaseUrl || supabaseUrl.includes("your-staging-project")) {
      violations.push({
        rule: "CFG-PROD-001",
        severity: "violation",
        message: "NEXT_PUBLIC_SUPABASE_URL is missing or still placeholder in production",
      });
    }
    if (!supabaseAnon || supabaseAnon.includes("your_staging_anon_key")) {
      violations.push({
        rule: "CFG-PROD-001",
        severity: "violation",
        message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or still placeholder in production",
      });
    }

    // CFG-PROD-002: 服务端 service role key
    const serviceRole = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
    if (!serviceRole || serviceRole.includes("your_staging_service_role_key")) {
      violations.push({
        rule: "CFG-PROD-002",
        severity: "violation",
        message: "SUPABASE_SERVICE_ROLE_KEY is missing or still placeholder in production",
      });
    }
  }

  // SEC-EXPOSED-001: NEXT_PUBLIC_SERVICE_ROLE_KEY 不得存在
  if (env.NEXT_PUBLIC_SERVICE_ROLE_KEY) {
    violations.push({
      rule: "SEC-EXPOSED-001",
      severity: "violation",
      message: "NEXT_PUBLIC_SERVICE_ROLE_KEY must not exist; service_role must not enter client bundle",
    });
  }

  // SEC-EXPOSED-002: NEXT_PUBLIC_* 值含 service_role 字样
  for (const key of Object.keys(env)) {
    if (!key.startsWith("NEXT_PUBLIC_")) continue;
    const value = String(env[key] ?? "");
    if (/service_role/i.test(value)) {
      violations.push({
        rule: "SEC-EXPOSED-002",
        severity: "violation",
        message: `${key} value contains 'service_role' — service_role must not be exposed in NEXT_PUBLIC_*`,
      });
    }
  }

  // SEC-EXPOSED-003: NEXT_PUBLIC_* 复用 SUPABASE_SERVICE_ROLE_KEY 的值
  const serviceRoleValue = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (serviceRoleValue.length >= 20) {
    for (const key of Object.keys(env)) {
      if (!key.startsWith("NEXT_PUBLIC_")) continue;
      if (key === "NEXT_PUBLIC_SUPABASE_ANON_KEY") continue;
      const value = String(env[key] ?? "").trim();
      if (value && value === serviceRoleValue) {
        violations.push({
          rule: "SEC-EXPOSED-003",
          severity: "violation",
          message: `${key} reuses SUPABASE_SERVICE_ROLE_KEY value — must use separate secret`,
        });
      }
    }
  }

  // development 环境的 fixture 用法只警告
  if (dev) {
    for (const flag of FIXTURE_FLAG_PATTERNS) {
      if (parseBoolTrue(env[flag])) {
        warnings.push({
          rule: "FF-DEV-INFO",
          severity: "warning",
          message: `${flag}=true is allowed in development but ensure UI shows fixture badge`,
        });
      }
    }
  }

  const ok = violations.length === 0;
  return { ok, violations, warnings };
}

// ============================================================
// CLI 入口
// ============================================================

function printReport(result) {
  const lines = [];
  lines.push("=== KIIKIS 2.1 Runtime Audit ===");
  lines.push(`NODE_ENV=${process.env.NODE_ENV ?? "(unset)"}`);
  lines.push(`VERCEL_ENV=${process.env.VERCEL_ENV ?? "(unset)"}`);
  lines.push("");
  lines.push(`Violations: ${result.violations.length}`);
  for (const v of result.violations) {
    lines.push(`  [${v.rule}] ${v.message}`);
  }
  lines.push("");
  lines.push(`Warnings: ${result.warnings.length}`);
  for (const w of result.warnings) {
    lines.push(`  [${w.rule}] ${w.message}`);
  }
  lines.push("");
  lines.push(result.ok ? "PASS" : "FAIL");
  console.log(lines.join("\n"));
}

// 仅在直接执行时运行 CLI
const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMain) {
  const result = auditRuntime(process.env);
  printReport(result);
  if (!result.ok) {
    process.exit(1);
  }
}
