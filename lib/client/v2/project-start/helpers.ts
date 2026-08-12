// K2-T-03 纯函数辅助 · 浏览器安全（无 Node.js 内置模块依赖）
// fixtures.ts 会 re-export 这些函数，供 Node.js 测试使用。

import {
  CONTRACT_VERSION,
  type ContentType,
  type ProjectStartRequest,
  type StartMode,
  type UniverseAction,
  type UniverseOption,
} from "./types.ts";

/** 按关键词过滤 Universe 列表（名称 + 摘要，大小写不敏感） */
export function filterUniverseOptions(
  options: UniverseOption[],
  query: string,
): UniverseOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((opt) => {
    return (
      opt.name.toLowerCase().includes(q) ||
      opt.summary.toLowerCase().includes(q)
    );
  });
}

/** 校验 contract_version 是否匹配当前领域契约 */
export function validateContractVersion(version: string): boolean {
  return version === CONTRACT_VERSION;
}

/** 组装项目创建请求，附带业务规则校验 */
export function buildProjectStartRequest(params: {
  contentType: ContentType;
  startMode: StartMode;
  title: string;
  universeAction: UniverseAction;
  universeId?: string;
}): ProjectStartRequest {
  const title = params.title.trim();
  if (!title) {
    throw new Error("title is required");
  }
  if (params.universeAction === "bind_existing" && !params.universeId) {
    throw new Error("universeId is required when universeAction is bind_existing");
  }
  return {
    contentType: params.contentType,
    startMode: params.startMode,
    title,
    universeAction: params.universeAction,
    universeId:
      params.universeAction === "bind_existing" ? params.universeId : undefined,
    contractVersion: CONTRACT_VERSION,
  };
}

/** 根据 contentType 决定创建后跳转的工作台路由 */
export function resolveWorkbenchRoute(contentType: ContentType): string {
  switch (contentType) {
    case "drama":
    case "novel":
      return "/novel-workbench";
    case "storyboard":
      return "/production?mode=planning";
    case "video":
      return "/production?mode=editor";
    case "song":
      return "/song-workbench";
  }
}
