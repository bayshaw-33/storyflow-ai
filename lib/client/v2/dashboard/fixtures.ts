// Kiikis 2.0 Dashboard fixture 加载器
// 统一从 fixture-data.ts 读取内联数据，Node 与浏览器环境通用。
// 不再用 dynamic import 加载 tests/ 目录的 JSON（tests/ 默认不进 webpack 客户端 bundle，
// 会导致浏览器端 fixture 加载抛错，Dashboard 进入 error 状态显示"首页数据加载失败"）。
// tests/fixtures/kiikis-v2/*.json 保留作为 K2-I-01 集成时一致性校验依据，
// 单测会断言 TS 内联数据与 JSON 文件数据一致以防数据漂移。
// error fixture 会抛 DashboardFixtureError，由上层捕获后渲染错误状态。

import { assertContractVersion, type DashboardData } from "./types.ts";
import {
  dashboardEmptyFixture,
  dashboardErrorFixture,
  dashboardFixture,
} from "./fixture-data.ts";

export type FixtureName = "dashboard" | "dashboard-empty" | "dashboard-error";

export class DashboardFixtureError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DashboardFixtureError";
    this.code = code;
  }
}

// 解析 fixture 数据：处理 error fixture 与 contract_version 校验。
function parseFixture(
  data: DashboardData | { contractVersion: string; error: { code: string; message: string } },
): DashboardData {
  const error = (data as { error?: { code?: string; message?: string } }).error;
  if (error) {
    throw new DashboardFixtureError(
      error.code || "DASHBOARD_FIXTURE_ERROR",
      error.message || "fixture error",
    );
  }
  const contractVersion = (data as { contractVersion: unknown }).contractVersion;
  if (typeof contractVersion !== "string") {
    throw new DashboardFixtureError(
      "DASHBOARD_CONTRACT_MISSING",
      "fixture 缺少 contractVersion 字段",
    );
  }
  assertContractVersion(contractVersion);
  return data as DashboardData;
}

// 加载 fixture：统一从 TS 模块读取，Node 与浏览器通用。
export async function loadDashboardFixture(name: FixtureName): Promise<DashboardData> {
  const data =
    name === "dashboard" ? dashboardFixture
      : name === "dashboard-empty" ? dashboardEmptyFixture
      : name === "dashboard-error" ? dashboardErrorFixture
      : null;
  if (!data) {
    throw new DashboardFixtureError(
      "DASHBOARD_FIXTURE_NOT_FOUND",
      `未知 fixture: ${name}`,
    );
  }
  return parseFixture(data);
}

// 判断 fixture 是否为 error fixture（不抛错，供预览模式探测）。
export function isFixtureError(
  data: unknown,
): data is { error: { code: string; message: string }; contractVersion: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "object"
  );
}
