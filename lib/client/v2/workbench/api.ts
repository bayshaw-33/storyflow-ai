// 工作台外壳 API 适配器。
// 当前 K2-T-02 阶段走 fixture 兜底，便于外壳独立预览。
// 真实场景下各工作台通过 WorkbenchAdapter 直接注入外壳，无需走此 API；
// 此 API 主要供外壳独立预览页（fixture 模式）使用。

import { loadWorkbenchFixture, type WorkbenchFixtureName } from "./fixtures.ts";
import { assertContractVersion, type WorkbenchData } from "./types.ts";

// 全局开关：true 走 fixture，false 走真实 API。
export const USE_FIXTURE = true;

// 真实 API 路径（预留）。
const API_PATH = "/api/v2/workbench";

export interface FetchWorkbenchOptions {
  // fixture 预览模式：指定用哪份 fixture，默认 "workbench"。
  fixture?: WorkbenchFixtureName;
  // 自定义 fetch（测试注入用）。
  fetchImpl?: typeof fetch;
}

// 拉取工作台数据：USE_FIXTURE=true 时走 fixture，否则走真实 API。
export async function fetchWorkbench(
  accessToken: string | null,
  options: FetchWorkbenchOptions = {},
): Promise<WorkbenchData> {
  if (USE_FIXTURE) {
    return loadWorkbenchFixture(options.fixture || "workbench");
  }
  return fetchWorkbenchFromApi(accessToken, options);
}

// 真实 API 调用（预留实现，未登录时抛错由上层处理）。
async function fetchWorkbenchFromApi(
  accessToken: string | null,
  options: FetchWorkbenchOptions,
): Promise<WorkbenchData> {
  if (!accessToken) {
    throw new WorkbenchApiError("UNAUTHENTICATED", "未登录，请先登录后再查看工作台。");
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
    throw new WorkbenchApiError("UNAUTHENTICATED", "登录已过期，请重新登录。");
  }
  if (!res.ok) {
    throw new WorkbenchApiError(
      "WORKBENCH_FETCH_FAILED",
      `工作台数据加载失败（${res.status}）。`,
    );
  }
  const data = (await res.json()) as WorkbenchData;
  assertContractVersion(data.contractVersion);
  return data;
}

export class WorkbenchApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkbenchApiError";
    this.code = code;
  }
}

// 判断是否未登录错误。
export function isUnauthenticatedError(err: unknown): boolean {
  return err instanceof WorkbenchApiError && err.code === "UNAUTHENTICATED";
}
