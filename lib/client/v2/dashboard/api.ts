// Kiikis 2.0 Dashboard API 适配器
// 当前 K2-C-01 后端契约尚未冻结，默认走 fixture 兜底，便于 UI 独立预览。
// 真实 API 上线后把 USE_FIXTURE 切到 false 即可。

import { loadDashboardFixture, type FixtureName } from "./fixtures.ts";
import type { DashboardData } from "./types.ts";

// 全局开关：true 走 fixture，false 走真实 API。
export const USE_FIXTURE = true;

// 真实 API 路径（预留）。
const API_PATH = "/api/v2/dashboard";

export interface FetchDashboardOptions {
  // fixture 预览模式：指定用哪份 fixture，默认 "dashboard"。
  fixture?: FixtureName;
  // 自定义 fetch（测试注入用）。
  fetchImpl?: typeof fetch;
}

// 拉取 Dashboard 数据：USE_FIXTURE=true 时走 fixture，否则走真实 API。
export async function fetchDashboard(
  accessToken: string | null,
  options: FetchDashboardOptions = {},
): Promise<DashboardData> {
  if (USE_FIXTURE) {
    const fixtureName = options.fixture || "dashboard";
    return loadDashboardFixture(fixtureName);
  }
  return fetchDashboardFromApi(accessToken, options);
}

// 真实 API 调用（预留实现，未登录时抛错由上层处理）。
async function fetchDashboardFromApi(
  accessToken: string | null,
  options: FetchDashboardOptions,
): Promise<DashboardData> {
  if (!accessToken) {
    throw new DashboardApiError("UNAUTHENTICATED", "未登录，请先登录后再查看首页。");
  }
  const fetchImpl = options.fetchImpl || fetch;
  const res = await fetchImpl(API_PATH, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    credentials: "same-origin",
  });
  if (res.status === 401) {
    throw new DashboardApiError("UNAUTHENTICATED", "登录已过期，请重新登录。");
  }
  if (!res.ok) {
    throw new DashboardApiError(
      "DASHBOARD_FETCH_FAILED",
      `首页数据加载失败（${res.status}）。`,
    );
  }
  const data = (await res.json()) as DashboardData;
  if (data.contractVersion !== "2.0.0-alpha.1") {
    throw new DashboardApiError(
      "DASHBOARD_CONTRACT_MISMATCH",
      `契约版本不匹配：${data.contractVersion}`,
    );
  }
  return data;
}

export class DashboardApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DashboardApiError";
    this.code = code;
  }
}

// 判断是否未登录错误。
export function isUnauthenticatedError(err: unknown): boolean {
  return err instanceof DashboardApiError && err.code === "UNAUTHENTICATED";
}
