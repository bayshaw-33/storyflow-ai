import { NextResponse } from "next/server";

export function ok<T>(payload: T) {
  return NextResponse.json({ success: true, ...payload });
}

export function apiError(error: unknown, fallback = "请求失败。", status = 400) {
  const message = error instanceof Error ? error.message : "";
  const authError = message.includes("MISSING_AUTH_TOKEN") || message.includes("INVALID_AUTH_TOKEN");
  const projectForbidden = message.includes("PROJECT_FORBIDDEN");
  // 约定：所有 *_FORBIDDEN 后缀的业务错误（PROJECT_/TEAM_/ACTOR_…）一律映射 403
  const forbidden = projectForbidden || message.includes("_FORBIDDEN");
  const notFound = message.includes("PROJECT_NOT_FOUND") || message.includes("VERSION_NOT_FOUND") || message.includes("TASK_NOT_FOUND");
  return NextResponse.json(
    {
      success: false,
      error: authError
        ? "请先登录。"
        : forbidden
          ? projectForbidden
            ? "无权访问该项目。"
            : "没有执行该操作的权限。"
          : notFound
            ? "没有找到对应数据。"
            : message.includes("SUPABASE_SERVICE_ERROR")
              ? "云端数据服务暂时不可用，请检查 Supabase 表结构和权限。"
              : fallback,
    },
    { status: authError ? 401 : forbidden ? 403 : notFound ? 404 : status },
  );
}
