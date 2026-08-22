// Kiikis 2.0 Dashboard API 适配器
// 正常模式渲染真实项目库（ProjectManagement）；fixture 仅服务显式预览。

import { loadDashboardFixture, type FixtureName } from "./fixtures.ts";
import type { DashboardData } from "./types.ts";

// P0-02：fixture 不再是默认数据源（PRD §2.6 禁止演示数据冒充真实）。
// 仅显式 NEXT_PUBLIC_USE_DASHBOARD_FIXTURE=true 时启用（本地预览）。
export const USE_FIXTURE = process.env.NEXT_PUBLIC_USE_DASHBOARD_FIXTURE === "true";

// 真实 API 路径（预留）。
const API_PATH = "/api/v2/dashboard";

export interface FetchDashboardOptions {
  // fixture 预览模式：指定用哪份 fixture，默认 "dashboard"。
  fixture?: FixtureName;
  // 自定义 fetch（测试注入用）。
  fetchImpl?: typeof fetch;
}

// 拉取 Dashboard 数据：启用 fixture 时走演示数据，否则走真实 API。
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
