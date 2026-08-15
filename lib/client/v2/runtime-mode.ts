/**
 * KIIKIS 2.1 Phase 1 — 客户端 Runtime Mode (K21-FF-002)
 *
 * 控制 fixture 启用与"演示数据"标记显示。
 * 这是纯函数模块，可在客户端组件中直接 import。
 */

export type RuntimeMode = "development" | "preview" | "production";

type EnvLike = Record<string, string | undefined> | NodeJS.ProcessEnv;

/**
 * 检测当前 runtime mode。
 * - development: NODE_ENV=development
 * - preview: Vercel preview 部署 (VERCEL_ENV=preview)
 * - production: 其他
 */
export function detectRuntimeMode(env: EnvLike): RuntimeMode {
  const nodeEnv = String(env.NODE_ENV ?? "").toLowerCase();
  if (nodeEnv === "development") return "development";
  const vercelEnv = String(env.VERCEL_ENV ?? "").toLowerCase();
  if (vercelEnv === "preview") return "preview";
  return "production";
}

/**
 * 判断是否允许使用 fixture。
 * - development: 默认允许
 * - preview: 必须显式 NEXT_PUBLIC_USE_FIXTURE=true
 * - production: 永远不允许 (K21-FF-002)
 */
export function isFixtureAllowed(env: EnvLike): boolean {
  return isFixtureEnabled("NEXT_PUBLIC_USE_FIXTURE", env);
}

/**
 * Phase 6 Task 6.2 — 通用 fixture 开关（fail-closed）。
 * 各模块开关（如 NEXT_PUBLIC_USE_KK_FIXTURE）统一走此函数：
 *   - production/preview：未显式 true/1 一律关闭（生产永远关闭）
 *   - development：显式 true/1 才开启（开发默认关闭，避免误用 fixture 冒充真实）
 */
export function isFixtureEnabled(envName: string, env: EnvLike): boolean {
  const mode = detectRuntimeMode(env);
  if (mode === "production") return false;
  const explicit = String(env[envName] ?? "").toLowerCase();
  return explicit === "true" || explicit === "1";
}

/**
 * 判断是否应显示"演示数据"标记。
 * 与 isFixtureAllowed 一致；UI 在 fixture 启用时必须显示此标记 (K21-FF-002)。
 */
export function shouldShowFixtureBadge(env: EnvLike): boolean {
  return isFixtureAllowed(env);
}
