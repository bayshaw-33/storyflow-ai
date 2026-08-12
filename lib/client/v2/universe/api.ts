// Kiikis 2.0 Universe API 适配器
// 当前 K2 v2 后端 API 尚未上线，默认走 fixture 兜底，UI 可独立预览全部 9 个交付物。
// 真实 API 上线后把 USE_FIXTURE 切到 false 即可。

import { loadUniverseFixture, type UniverseFixtureName } from "./fixtures.ts";
import type { UniverseBundleV2 } from "./types.ts";

// 全局开关：true 走 fixture，false 走真实 API。
export const USE_FIXTURE = true;

// 真实 API 路径（预留）。
const API_PATH = "/api/v2/universes";

export interface FetchUniverseBundleOptions {
  // fixture 预览模式：指定用哪份 fixture，默认 "universe"。
  fixture?: UniverseFixtureName;
  // 自定义 fetch（测试注入用）。
  fetchImpl?: typeof fetch;
}

// 拉取 Universe bundle：USE_FIXTURE=true 时走 fixture，否则走真实 API。
export async function fetchUniverseBundle(
  universeId: string,
  accessToken: string | null,
  options: FetchUniverseBundleOptions = {},
): Promise<UniverseBundleV2> {
  if (USE_FIXTURE) {
    const fixtureName = options.fixture || "universe";
    return loadUniverseFixture(fixtureName);
  }
  return fetchUniverseBundleFromApi(universeId, accessToken, options);
}

// 真实 API 调用（预留实现，未登录时抛错由上层处理）。
async function fetchUniverseBundleFromApi(
  universeId: string,
  accessToken: string | null,
  options: FetchUniverseBundleOptions,
): Promise<UniverseBundleV2> {
  if (!accessToken) {
    throw new UniverseApiError("UNAUTHENTICATED", "未登录，请先登录后再查看宇宙。");
  }
  const fetchImpl = options.fetchImpl || fetch;
  const res = await fetchImpl(`${API_PATH}/${encodeURIComponent(universeId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    credentials: "same-origin",
  });
  if (res.status === 401) {
    throw new UniverseApiError("UNAUTHENTICATED", "登录已过期，请重新登录。");
  }
  if (res.status === 404) {
    throw new UniverseApiError("NOT_FOUND", "宇宙不存在或无访问权限。");
  }
  if (!res.ok) {
    throw new UniverseApiError(
      "UNIVERSE_FETCH_FAILED",
      `宇宙数据加载失败（${res.status}）。`,
    );
  }
  const data = (await res.json()) as UniverseBundleV2;
  if (data.contractVersion !== "2.0.0-alpha.1") {
    throw new UniverseApiError(
      "UNIVERSE_CONTRACT_MISMATCH",
      `契约版本不匹配：${data.contractVersion}`,
    );
  }
  return data;
}

// Inbox 写入操作的状态反馈类型（组件层用）。
export type InboxActionKind =
  | "accept"
  | "edit_and_accept"
  | "reject"
  | "defer";

export interface InboxActionResult {
  proposalId: string;
  action: InboxActionKind;
  success: boolean;
  message: string;
}

// Inbox 操作的本地模拟（fixture 模式下不真正写后端，仅返回成功状态）。
// 真实 API 上线后替换为 PATCH /api/v2/universes/:id/proposals/:proposalId。
export async function applyInboxAction(
  universeId: string,
  proposalId: string,
  action: InboxActionKind,
  _editedPayload?: Record<string, unknown>,
  options: FetchUniverseBundleOptions = {},
): Promise<InboxActionResult> {
  if (USE_FIXTURE) {
    // fixture 模式：模拟 200ms 网络延迟，返回成功。
    await new Promise((resolve) => setTimeout(resolve, 200));
    return {
      proposalId,
      action,
      success: true,
      message: "操作已提交（fixture 预览模式，不会真正写入）。",
    };
  }
  // 真实 API 预留。
  const fetchImpl = options.fetchImpl || fetch;
  const res = await fetchImpl(
    `${API_PATH}/${encodeURIComponent(universeId)}/proposals/${encodeURIComponent(proposalId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    },
  );
  if (!res.ok) {
    return {
      proposalId,
      action,
      success: false,
      message: `操作失败（${res.status}）`,
    };
  }
  return {
    proposalId,
    action,
    success: true,
    message: "操作成功。",
  };
}

// Canon Fact 锁定/解锁操作的本地模拟。
export async function toggleCanonFactLock(
  universeId: string,
  canonFactId: string,
  locked: boolean,
  options: FetchUniverseBundleOptions = {},
): Promise<{ success: boolean; message: string }> {
  if (USE_FIXTURE) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return {
      success: true,
      message: locked
        ? "Canon Fact 已锁定（fixture 预览模式）。"
        : "Canon Fact 已解锁（fixture 预览模式）。",
    };
  }
  const fetchImpl = options.fetchImpl || fetch;
  const res = await fetchImpl(
    `${API_PATH}/${encodeURIComponent(universeId)}/canon-facts/${encodeURIComponent(canonFactId)}/lock`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked }),
    },
  );
  return {
    success: res.ok,
    message: res.ok ? "操作成功。" : `操作失败（${res.status}）`,
  };
}

export class UniverseApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "UniverseApiError";
    this.code = code;
  }
}

// 判断是否未登录错误。
export function isUnauthenticatedError(err: unknown): boolean {
  return err instanceof UniverseApiError && err.code === "UNAUTHENTICATED";
}
