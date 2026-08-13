/**
 * KIIKIS 2.1 Phase 1 — Feature Flags (K21-FF-001..003)
 *
 * 规则：
 * 1. production/staging 未显式启用时 fail closed (默认 false) — K21-FF-001
 * 2. 开发环境默认启用所有 flag，便于本地验证
 * 3. 单个 flag 通过 KIIKIS21_FF_<NAME>_ENABLED=true|false 覆盖
 *
 * 这是纯函数模块，可被 audit 脚本和测试直接 import。
 */

export type Kiikis21Flags = {
  kkRealtime: boolean;
  kkAppearance: boolean;
  resourceGrants: boolean;
  communityBeta: boolean;
  billingLifecycle: boolean;
};

/** 所有 flag 默认 false (fail closed)。 */
export const DEFAULT_KIIKIS21_FLAGS: Kiikis21Flags = {
  kkRealtime: false,
  kkAppearance: false,
  resourceGrants: false,
  communityBeta: false,
  billingLifecycle: false,
};

/** flag 名到环境变量后缀的映射。 */
const FLAG_TO_ENV: Record<keyof Kiikis21Flags, string> = {
  kkRealtime: "KK_REALTIME",
  kkAppearance: "KK_APPEARANCE",
  resourceGrants: "RESOURCE_GRANTS",
  communityBeta: "COMMUNITY_BETA",
  billingLifecycle: "BILLING_LIFECYCLE",
};

type EnvLike = Record<string, string | undefined> | NodeJS.ProcessEnv;

/** 判断是否为 production-like 环境 (production + staging/preview)。 */
export function isProductionLike(env: EnvLike): boolean {
  const nodeEnv = String(env.NODE_ENV ?? "").toLowerCase();
  if (nodeEnv === "production") return true;
  // Vercel preview 部署也视为 production-like (fail closed)
  const vercelEnv = String(env.VERCEL_ENV ?? "").toLowerCase();
  return vercelEnv === "production" || vercelEnv === "preview";
}

function isDevelopment(env: EnvLike): boolean {
  return String(env.NODE_ENV ?? "").toLowerCase() === "development";
}

function parseBool(value: string | undefined): boolean | null {
  if (value === undefined || value === null || value === "") return null;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

/**
 * 解析 feature flags。
 * - production/staging: 默认全 false，显式 KIIKIS21_FF_*_ENABLED=true 启用
 * - development: 默认全 true，显式 =false 关闭
 * - 其他 (test/未设置): 默认全 false (fail closed)
 */
export function parseKiikis21Flags(env: EnvLike): Kiikis21Flags {
  const dev = isDevelopment(env);
  const base: Kiikis21Flags = dev
    ? { ...DEFAULT_KIIKIS21_FLAGS, kkRealtime: true, kkAppearance: true, resourceGrants: true, communityBeta: true, billingLifecycle: true }
    : { ...DEFAULT_KIIKIS21_FLAGS };

  const result: Kiikis21Flags = { ...base };
  for (const key of Object.keys(FLAG_TO_ENV) as (keyof Kiikis21Flags)[]) {
    const envName = `KIIKIS21_FF_${FLAG_TO_ENV[key]}_ENABLED`;
    const parsed = parseBool(env[envName] as string | undefined);
    if (parsed !== null) {
      result[key] = parsed;
    }
  }
  return result;
}

/**
 * 别名：解析 feature flags。等价于 parseKiikis21Flags。
 * 保留 resolveKiikis21Flags 名称以兼容现有 API 路由调用方。
 */
export const resolveKiikis21Flags = parseKiikis21Flags;
