/**
 * KIIKIS 2.1 Phase 0 — 统一目标解析器
 *
 * PRD K21-P0-NAV-004：Dashboard 与 Task Center 不再各自硬编码路由。
 *
 * 规则（PRD §4.2）：
 * 1. 详情优先进入可信同源业务路由
 * 2. 否则按 projectId + workbenchType 回退
 * 3. 外部 CDN/Provider URL 不得作为详情路由（K21-P0-NAV-005）
 * 4. 没有 projectId、sourceUnitId 或合法结果时不伪造目标（返回 null）
 * 5. 外部 URL 只用于"查看结果"，且需同源验证防开放重定向
 */

// ============================================================
// 类型定义
// ============================================================

/** 可导航的任务目标信息 */
export interface NavigableTaskTarget {
  projectId?: string | null;
  sourceUnitId?: string | null;
  workbenchType?: string | null;
  resultUrl?: string | null;
}

// ============================================================
// 常量
// ============================================================

/**
 * 工作台类型到路由的映射表。
 * 同源业务路由：始终以 / 开头，不含外部域名。
 */
const WORKBENCH_ROUTES: Record<string, (projectId: string) => string> = {
  song: (id) => `/song-workbench?projectId=${encodeURIComponent(id)}`,
  viral: (id) => `/viral-workbench?projectId=${encodeURIComponent(id)}`,
  storyboard: (id) => `/storyboard-workbench?projectId=${encodeURIComponent(id)}`,
  video: (id) => `/video-workbench?projectId=${encodeURIComponent(id)}`,
  novel: (id) => `/novel-workbench?projectId=${encodeURIComponent(id)}&mode=screenplay`,
  creation: (id) => `/novel-workbench?projectId=${encodeURIComponent(id)}&mode=screenplay`,
  continuation: (id) => `/novel-workbench?projectId=${encodeURIComponent(id)}&mode=screenplay`,
  script: (id) => `/script-workbench?projectId=${encodeURIComponent(id)}`,
  art: (id) => `/art-workbench?projectId=${encodeURIComponent(id)}`,
  production: (id) => `/production-workbench?projectId=${encodeURIComponent(id)}`,
  analysis: (id) => `/projects/${encodeURIComponent(id)}/analysis`,
  assembly: (id) => `/assembly?projectId=${encodeURIComponent(id)}`,
  export: (id) => `/assembly?projectId=${encodeURIComponent(id)}`,
  short_drama: (id) => `/projects/${encodeURIComponent(id)}`,
};

/**
 * Dashboard workflowType 到工作台类型的映射。
 * Dashboard 用 workflowType 字段，Task Center 用 workbenchType 字段，
 * 两者值域有重叠但不同，需要统一映射。
 */
const DASHBOARD_WORKFLOW_TO_WORKBENCH: Record<string, string> = {
  creation: "creation",
  continuation: "continuation",
  novel: "novel",
  song: "song",
  viral: "viral",
  storyboard: "storyboard",
  video: "video",
  drama: "short_drama",
  short_drama: "short_drama",
};

// ============================================================
// 工具函数
// ============================================================

/**
 * 判断 URL 是否为同源路由（以 / 开头，不含协议头）。
 * 外部 URL（http://, https://）不是同源路由。
 */
export function isSameOriginRoute(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

/**
 * 判断 URL 是否为外部链接。
 * 用于"查看结果"场景，外部 URL 只用于查看，不作为详情路由。
 */
export function isExternalUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("//");
}

/**
 * 安全编码 projectId，防止 URL 注入。
 * 只允许字母、数字、连字符、下划线。
 */
function safeProjectId(id: string): string | null {
  if (!id || typeof id !== "string") return null;
  const trimmed = id.trim();
  if (trimmed.length === 0) return null;
  // 只允许安全字符
  if (!/^[\w-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * 根据 workbenchType 和 projectId 解析工作台路由。
 */
function resolveWorkbenchRoute(workbenchType: string | null | undefined, projectId: string): string | null {
  if (!workbenchType) return null;
  const routeFn = WORKBENCH_ROUTES[workbenchType];
  if (!routeFn) return null;
  return routeFn(projectId);
}

// ============================================================
// 核心解析函数（PRD 契约）
// ============================================================

/**
 * 解析项目/工作台目标路由。
 *
 * 优先级：
 * 1. 如果有 projectId + workbenchType → 直接映射到工作台
 * 2. 如果有 projectId → 回退到项目详情页
 * 3. 否则返回 null（不伪造目标）
 *
 * @returns 同源路由字符串，或 null（无合法目标）
 */
export function resolveProjectTarget(target: NavigableTaskTarget): string | null {
  const projectId = target.projectId ? safeProjectId(target.projectId) : null;
  if (!projectId) return null;

  // 优先使用 workbenchType 映射到具体工作台
  const workbenchType = target.workbenchType ?? null;
  if (workbenchType) {
    const route = resolveWorkbenchRoute(workbenchType, projectId);
    if (route) return route;
  }

  // 回退到项目详情页
  return `/projects/${encodeURIComponent(projectId)}`;
}

/**
 * 解析任务结果查看目标。
 *
 * 优先级：
 * 1. 如果 resultUrl 是同源路由 → 直接使用
 * 2. 如果 resultUrl 是外部 URL → 返回（仅用于"查看结果"，UI 应标注"外部链接"）
 * 3. 如果有 projectId + workbenchType → 回退到工作台
 * 4. 如果有 projectId → 回退到项目详情页
 * 5. 否则返回 null（不伪造目标，UI 禁用并解释）
 *
 * @returns 同源路由、外部 URL、或 null
 */
export function resolveResultTarget(target: NavigableTaskTarget): string | null {
  // 1. 优先检查 resultUrl
  if (target.resultUrl) {
    const url = target.resultUrl.trim();
    if (url.length > 0) {
      if (isSameOriginRoute(url)) {
        return url;
      }
      // 外部 URL 也返回，但调用方需区分处理
      // TaskCard 应标注"外部链接"并用 window.open
      if (isExternalUrl(url)) {
        return url;
      }
    }
  }

  // 2. 回退到工作台
  const projectRoute = resolveProjectTarget(target);
  if (projectRoute) return projectRoute;

  // 3. 无合法目标
  return null;
}

/**
 * 判断目标是否有可导航的项目入口。
 * 用于 UI 决定是否启用"进入项目"按钮。
 */
export function hasProjectTarget(target: NavigableTaskTarget): boolean {
  return resolveProjectTarget(target) !== null;
}

/**
 * 判断目标是否有可查看的结果。
 * 用于 UI 决定是否启用"查看详情"按钮。
 */
export function hasResultTarget(target: NavigableTaskTarget): boolean {
  return resolveResultTarget(target) !== null;
}

/**
 * 判断结果目标是外部链接还是同源路由。
 * 调用 resolveResultTarget 后可用此函数区分处理。
 */
export function isResultExternal(target: NavigableTaskTarget): boolean {
  const resolved = resolveResultTarget(target);
  if (!resolved) return false;
  return isExternalUrl(resolved);
}

/**
 * 将 Dashboard 的 workflowType 转换为 workbenchType。
 * 用于 Dashboard 卡片导航到工作台。
 */
export function workflowToWorkbench(workflowType: string): string | null {
  return DASHBOARD_WORKFLOW_TO_WORKBENCH[workflowType] ?? null;
}

/**
 * 从 RunningJob 构建 NavigableTaskTarget。
 * Dashboard 运行中任务卡需要用 job 的 projectId 和 workbenchType 导航。
 */
export function fromDashboardJob(job: {
  id: string;
  projectId?: string;
  workbenchType?: string;
  resultUrl?: string;
}): NavigableTaskTarget {
  return {
    projectId: job.projectId ?? null,
    workbenchType: job.workbenchType ?? null,
    resultUrl: job.resultUrl ?? null,
  };
}

/**
 * 从 UnifiedJob 构建 NavigableTaskTarget。
 * Task Center 的任务卡需要用 job 的 projectId、workbenchType 和 resultUrl 导航。
 */
export function fromUnifiedJob(job: {
  id: string;
  projectId: string;
  workbenchType: string;
  resultUrl?: string;
}): NavigableTaskTarget {
  return {
    projectId: job.projectId,
    workbenchType: job.workbenchType,
    resultUrl: job.resultUrl ?? null,
  };
}

/**
 * 从 RecentProject 构建 NavigableTaskTarget。
 * Dashboard "继续创作"卡需要用 project 的 id 和 workflowType 导航。
 */
export function fromRecentProject(project: {
  id: string;
  workflowType: string;
}): NavigableTaskTarget {
  return {
    projectId: project.id,
    workbenchType: workflowToWorkbench(project.workflowType),
  };
}
