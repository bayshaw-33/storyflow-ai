// Kiikis 2.0 Dashboard fixture 加载器
// - Node 环境（测试）：用 fs 直接读 tests/fixtures/kiikis-v2/{name}.json
// - 浏览器环境（UI 预览）：用 dynamic import，webpack 5 会创建 context module 打包该目录下 JSON
// error fixture 会抛错，由上层捕获后渲染错误状态。

import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertContractVersion, type DashboardData } from "./types.ts";

export type FixtureName = "dashboard" | "dashboard-empty" | "dashboard-error";

// fixture 文件相对项目根的目录。
const FIXTURE_DIR = "tests/fixtures/kiikis-v2";

// 浏览器端 fixture 文件相对本模块的目录（用于 dynamic import）。
const BROWSER_FIXTURE_RELATIVE = "../../../tests/fixtures/kiikis-v2/";

export class DashboardFixtureError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DashboardFixtureError";
    this.code = code;
  }
}

// 解析 fixture 原始文本，处理 error fixture 与 contract_version 校验。
function parseFixture(raw: string): DashboardData {
  const data = JSON.parse(raw) as Record<string, unknown>;
  const error = data.error as { code?: string; message?: string } | undefined;
  if (error) {
    throw new DashboardFixtureError(
      error.code || "DASHBOARD_FIXTURE_ERROR",
      error.message || "fixture error",
    );
  }
  const contractVersion = data.contractVersion;
  if (typeof contractVersion !== "string") {
    throw new DashboardFixtureError(
      "DASHBOARD_CONTRACT_MISSING",
      "fixture 缺少 contractVersion 字段",
    );
  }
  assertContractVersion(contractVersion);
  return data as unknown as DashboardData;
}

// 浏览器端：用变量路径 dynamic import，让 tsc 不静态解析；
// webpack 5 会基于模板字符串前缀创建 context module，打包目录下所有 JSON。
async function loadBrowserFixture(name: FixtureName): Promise<DashboardData> {
  const modulePath = `${BROWSER_FIXTURE_RELATIVE}${name}.json`;
  const mod = (await import(modulePath)) as { default?: unknown };
  return parseFixture(JSON.stringify(mod.default ?? mod));
}

// 加载 fixture：Node 走 fs，浏览器走 dynamic import。
export async function loadDashboardFixture(name: FixtureName): Promise<DashboardData> {
  if (typeof window === "undefined") {
    const filePath = path.join(process.cwd(), FIXTURE_DIR, `${name}.json`);
    const raw = await readFile(filePath, "utf-8");
    return parseFixture(raw);
  }
  return loadBrowserFixture(name);
}

// 判断 fixture 是否为 error fixture（不抛错，供预览模式探测）。
export function isFixtureError(data: unknown): data is { error: { code: string; message: string }; contractVersion: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "object"
  );
}
