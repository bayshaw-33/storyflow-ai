"use client";

// K2-T-03 项目创建 API 适配器 · 浏览器端
// USE_FIXTURE 默认为 true，使用 fixture 数据；后续接入真实 API 时切换即可。

import fixtureData from "@/tests/fixtures/kiikis-v2/project-start.json";

import { CONTRACT_VERSION, type ProjectStartFixture, type ProjectStartRequest, type ProjectStartResponse, type UniverseOption } from "./types.ts";
import { resolveWorkbenchRoute } from "./helpers.ts";

const USE_FIXTURE =
  process.env.NEXT_PUBLIC_USE_PROJECT_START_FIXTURE !== "false";

const fixture = fixtureData as ProjectStartFixture;

/** 拉取可绑定的 Universe 列表 */
export async function fetchUniverseOptions(signal?: AbortSignal): Promise<UniverseOption[]> {
  if (USE_FIXTURE) {
    // 模拟网络延迟，方便展示加载态
    await delay(300);
    return fixture.universeOptions;
  }
  // 真实 API 适配器预留位
  const res = await fetch("/api/v2/project-start/universes", { signal });
  if (!res.ok) {
    throw new Error(`failed to load universes: ${res.status}`);
  }
  const data = (await res.json()) as { universes: UniverseOption[] };
  return data.universes;
}

/** 提交项目创建请求，返回新项目 ID 与工作台路由 */
export async function createProject(
  request: ProjectStartRequest,
  signal?: AbortSignal,
): Promise<ProjectStartResponse> {
  if (!request.contractVersion || request.contractVersion !== CONTRACT_VERSION) {
    throw new Error(`contract version mismatch: expected ${CONTRACT_VERSION}`);
  }

  if (USE_FIXTURE) {
    await delay(200);
    const projectId = `fixture-${Date.now().toString(36)}`;
    return {
      projectId,
      workbenchRoute: `${resolveWorkbenchRoute(request.contentType)}?projectId=${encodeURIComponent(projectId)}`,
      universeId:
        request.universeAction === "bind_existing"
          ? request.universeId
          : request.universeAction === "create_new"
            ? `universe-${projectId}`
            : undefined,
    };
  }

  // 真实 API 适配器预留位
  const res = await fetch("/api/v2/project-start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!res.ok) {
    throw new Error(`failed to create project: ${res.status}`);
  }
  return (await res.json()) as ProjectStartResponse;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
