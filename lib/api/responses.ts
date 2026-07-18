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
  // 约定：所有 *_NOT_FOUND 后缀的业务错误（PROJECT_/UNIVERSE_/ACTOR_/VERSION_/TASK_…）一律映射 404
  const notFound = message.includes("_NOT_FOUND");
  const serviceError = message.includes("SUPABASE_SERVICE_ERROR");
  // PRD §7.1：PGRST204 / 42703 / 42P01 / PGRST205（未知列/未知表）不得被掩盖成"云端服务不可用"伪降级，
  // 必须暴露真实 schema 错误，便于排查迁移缺失。返回 500（服务端 schema 问题）。
  const unknownColumn =
    message.includes("PGRST204") ||
    message.includes("42703") ||
    message.includes("42P01") ||
    message.includes("PGRST205") ||
    message.includes("Could not find the column") ||
    message.includes("Could not find the table");
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
            : unknownColumn && serviceError
              ? `数据库 schema 缺失列或表，请联系管理员核对迁移：${message.slice(0, 200)}`
              : serviceError
                ? "云端数据服务暂时不可用，请检查 Supabase 表结构和权限。"
                : fallback,
    },
    { status: authError ? 401 : forbidden ? 403 : notFound ? 404 : unknownColumn && serviceError ? 500 : status },
  );
}
